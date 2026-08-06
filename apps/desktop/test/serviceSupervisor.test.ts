import { describe, expect, it } from "vitest";
import { ServiceSupervisor, type ManagedServiceSpec } from "../src/serviceSupervisor.js";

const longRunningNode: ManagedServiceSpec = {
  id: "worker",
  label: "Worker",
  command: process.execPath,
  args: ["-e", "setInterval(() => {}, 1000)"],
  available: true,
  startupTimeoutMs: 200
};

describe("ServiceSupervisor", () => {
  it("reports missing bundled services without spawning", async () => {
    const supervisor = new ServiceSupervisor([{
      ...longRunningNode,
      available: false,
      unavailableReason: "Not bundled"
    }]);
    expect((await supervisor.start("worker")).status).toBe("unavailable");
    expect(supervisor.statuses()[0].detail).toBe("Not bundled");
  });

  it("starts idempotently and owns child shutdown", async () => {
    const supervisor = new ServiceSupervisor([longRunningNode], { startupPollMs: 10 });
    const first = await supervisor.start("worker");
    const second = await supervisor.start("worker");
    expect(first.status).toBe("running");
    expect(first.pid).toBeTypeOf("number");
    expect(second.pid).toBe(first.pid);
    await supervisor.stopAll();
    expect(supervisor.statuses()[0].status).toBe("stopped");
  });

  it("adopts an already healthy local service", async () => {
    const supervisor = new ServiceSupervisor([{
      ...longRunningNode,
      healthUrl: "http://127.0.0.1:5000/health"
    }], {
      fetchHealth: async () => new Response(null, { status: 200 })
    });
    const state = await supervisor.start("worker");
    expect(state.status).toBe("running");
    expect(state.managed).toBe(false);
    expect(state.pid).toBeUndefined();
  });

  it("fails and terminates a worker that never becomes healthy", async () => {
    const supervisor = new ServiceSupervisor([{
      ...longRunningNode,
      healthUrl: "http://127.0.0.1:5000/health",
      startupTimeoutMs: 30
    }], {
      fetchHealth: async () => { throw new Error("offline"); },
      startupPollMs: 5
    });
    const state = await supervisor.start("worker");
    expect(state.status).toBe("failed");
    await supervisor.stopAll();
  });
});
