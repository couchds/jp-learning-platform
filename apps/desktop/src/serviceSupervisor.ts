import { spawn, type ChildProcess } from "node:child_process";

export type ServiceStatus = "stopped" | "starting" | "running" | "unavailable" | "failed";

export type ManagedServiceSpec = {
  id: string;
  label: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  available: boolean;
  unavailableReason?: string;
  healthUrl?: string;
  startOnLaunch?: boolean;
  autoRestart?: boolean;
  startupTimeoutMs?: number;
};

export type ManagedServiceState = {
  id: string;
  label: string;
  status: ServiceStatus;
  detail: string;
  pid?: number;
  managed: boolean;
};

type SupervisorOptions = {
  spawnProcess?: typeof spawn;
  fetchHealth?: typeof fetch;
  onStatus?: (state: ManagedServiceState[]) => void;
  onLog?: (serviceId: string, stream: "stdout" | "stderr", value: string) => void;
  startupPollMs?: number;
};

type ServiceRecord = {
  spec: ManagedServiceSpec;
  state: ManagedServiceState;
  child?: ChildProcess;
  startPromise?: Promise<ManagedServiceState>;
  stopping: boolean;
  restartCount: number;
  restartTimer?: NodeJS.Timeout;
};

export class ServiceSupervisor {
  private readonly records = new Map<string, ServiceRecord>();
  private readonly spawnProcess: typeof spawn;
  private readonly fetchHealth: typeof fetch;
  private readonly onStatus?: SupervisorOptions["onStatus"];
  private readonly onLog?: SupervisorOptions["onLog"];
  private readonly startupPollMs: number;
  private shuttingDown = false;

  constructor(specs: ManagedServiceSpec[], options: SupervisorOptions = {}) {
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.fetchHealth = options.fetchHealth ?? fetch;
    this.onStatus = options.onStatus;
    this.onLog = options.onLog;
    this.startupPollMs = options.startupPollMs ?? 200;
    for (const spec of specs) {
      this.records.set(spec.id, {
        spec,
        state: initialState(spec),
        stopping: false,
        restartCount: 0
      });
    }
  }

  statuses() {
    return Array.from(this.records.values(), ({ state }) => ({ ...state }));
  }

  async startOnLaunch() {
    await Promise.all(Array.from(this.records.values())
      .filter(({ spec }) => spec.startOnLaunch)
      .map(({ spec }) => this.start(spec.id)));
    return this.statuses();
  }

  async start(id: string): Promise<ManagedServiceState> {
    const record = this.requireRecord(id);
    if (record.state.status === "running") return { ...record.state };
    if (record.startPromise) return record.startPromise;
    if (!record.spec.available) {
      this.update(record, "unavailable", record.spec.unavailableReason ?? "This service is not bundled.");
      return { ...record.state };
    }

    record.stopping = false;
    record.startPromise = this.startRecord(record).finally(() => {
      record.startPromise = undefined;
    });
    return record.startPromise;
  }

  async stop(id: string) {
    const record = this.requireRecord(id);
    record.stopping = true;
    if (record.restartTimer) clearTimeout(record.restartTimer);
    record.restartTimer = undefined;
    const child = record.child;
    record.child = undefined;
    if (child && child.exitCode === null) child.kill();
    this.update(record, "stopped", "Stopped");
  }

  async restartAll() {
    for (const id of this.records.keys()) await this.stop(id);
    return this.startOnLaunch();
  }

  async stopAll() {
    this.shuttingDown = true;
    await Promise.all(Array.from(this.records.keys(), (id) => this.stop(id)));
  }

  private async startRecord(record: ServiceRecord) {
    if (record.spec.healthUrl && await this.isHealthy(record.spec.healthUrl)) {
      record.restartCount = 0;
      this.update(record, "running", "Already running", undefined, false);
      return { ...record.state };
    }

    this.update(record, "starting", "Starting...");
    let child: ChildProcess;
    try {
      child = this.spawnProcess(record.spec.command, record.spec.args ?? [], {
        cwd: record.spec.cwd,
        env: { ...process.env, ...record.spec.env },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      this.update(record, "failed", describeError(error));
      return { ...record.state };
    }

    record.child = child;
    child.stdout?.on("data", (chunk) => this.onLog?.(record.spec.id, "stdout", String(chunk)));
    child.stderr?.on("data", (chunk) => this.onLog?.(record.spec.id, "stderr", String(chunk)));
    child.once("error", (error) => {
      if (!record.stopping) this.update(record, "failed", error.message);
    });
    child.once("exit", (code, signal) => this.handleExit(record, child, code, signal));

    const ready = record.spec.healthUrl
      ? await this.waitForHealth(record, record.spec.healthUrl, record.spec.startupTimeoutMs ?? 30_000)
      : await this.waitForSpawn(record, child);
    if (!ready) {
      if (record.child === child && child.exitCode === null) child.kill();
      this.update(record, "failed", `Did not become ready within ${record.spec.startupTimeoutMs ?? 30_000}ms`);
      return { ...record.state };
    }

    record.restartCount = 0;
    this.update(record, "running", "Ready", child.pid, true);
    return { ...record.state };
  }

  private async waitForSpawn(record: ServiceRecord, child: ChildProcess) {
    await delay(Math.max(this.startupPollMs, 25));
    return record.child === child && child.exitCode === null && !record.stopping;
  }

  private async waitForHealth(record: ServiceRecord, url: string, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && record.child && !record.stopping) {
      if (await this.isHealthy(url)) return true;
      await delay(this.startupPollMs);
    }
    return false;
  }

  private async isHealthy(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_000);
    try {
      const response = await this.fetchHealth(url, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleExit(record: ServiceRecord, child: ChildProcess, code: number | null, signal: NodeJS.Signals | null) {
    if (record.child !== child) return;
    record.child = undefined;
    if (record.stopping || this.shuttingDown) return;
    const detail = `Exited with ${signal ?? `code ${code ?? "unknown"}`}`;
    this.update(record, "failed", detail);
    if (record.spec.autoRestart && record.restartCount < 3) {
      record.restartCount += 1;
      record.restartTimer = setTimeout(() => void this.start(record.spec.id), record.restartCount * 1_000);
    }
  }

  private requireRecord(id: string) {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown managed service: ${id}`);
    return record;
  }

  private update(record: ServiceRecord, status: ServiceStatus, detail: string, pid?: number, managed = Boolean(record.child)) {
    record.state = { id: record.spec.id, label: record.spec.label, status, detail, pid, managed };
    this.onStatus?.(this.statuses());
  }
}

function initialState(spec: ManagedServiceSpec): ManagedServiceState {
  return {
    id: spec.id,
    label: spec.label,
    status: spec.available ? "stopped" : "unavailable",
    detail: spec.available ? "Not started" : spec.unavailableReason ?? "Not bundled",
    managed: false
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "Could not start service";
}
