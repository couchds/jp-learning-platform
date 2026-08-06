import path from "node:path";
import fs, { createWriteStream } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { getDb, readJson, touchNow, writeJson } from "../db/index.js";
import { HttpError } from "../lib/http.js";

export type ImportJobType = "starter_data" | "kanjidic2" | "jmdict" | "sentence_examples" | "kanji_graph";
export type ImportJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export type ImportJobOptions = {
  jobType: ImportJobType;
  inputPath?: string | null;
  source?: string | null;
  limit?: number | null;
  maxEdges?: number | null;
  maxGroupSize?: number | null;
};

export type ImportJobRow = {
  id: number;
  job_type: ImportJobType;
  status: ImportJobStatus;
  input_path: string | null;
  args_json: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const outputLimit = 30_000;
const importDataRoot = config.importDir;
const activeJobs = new Map<number, { controller: AbortController; child?: ChildProcess }>();

type ResolvedImportJobOptions = ImportJobOptions & { inputPath?: string | null };

const defaultDatasetSources: Partial<Record<ImportJobType, { inputPath: string; url?: string; label: string }>> = {
  kanjidic2: {
    inputPath: path.join(importDataRoot, "kanjidic2.xml.gz"),
    url: "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
    label: "KANJIDIC2"
  },
  jmdict: {
    inputPath: path.join(importDataRoot, "JMdict_e.gz"),
    url: "https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz",
    label: "JMdict"
  },
  sentence_examples: {
    inputPath: path.join(importDataRoot, "sentence_examples.tsv"),
    label: "sentence examples TSV"
  }
};

export function mapImportJob(row: ImportJobRow) {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    inputPath: row.input_path,
    args: readJson<unknown>(row.args_json, {}),
    stdout: row.stdout,
    stderr: row.stderr,
    exitCode: row.exit_code,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function reconcileImportJobs() {
  const now = touchNow();
  return getDb()
    .prepare(
      `UPDATE import_jobs
       SET status = 'interrupted', error = 'API stopped before this import completed', completed_at = ?, updated_at = ?
       WHERE status IN ('queued', 'running')`
    )
    .run(now, now).changes;
}

export function createImportJob(options: ImportJobOptions) {
  const db = getDb();
  const resolvedOptions = resolveImportJobOptions(options);
  const jobArgs = buildJobArgs(resolvedOptions);
  const job = db.transaction(() => {
    const active = db
      .prepare("SELECT id FROM import_jobs WHERE status IN ('queued', 'running') LIMIT 1")
      .get() as { id: number } | undefined;
    if (active) {
      throw new HttpError(409, `Import job ${active.id} is already active`);
    }

    const now = touchNow();
    const result = db
      .prepare(
        `INSERT INTO import_jobs (job_type, status, input_path, args_json, updated_at)
         VALUES (?, 'queued', ?, ?, ?)`
      )
      .run(resolvedOptions.jobType, resolvedOptions.inputPath ?? null, writeJson(jobArgs), now);
    return db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(result.lastInsertRowid) as ImportJobRow;
  })();

  const controller = new AbortController();
  activeJobs.set(job.id, { controller });
  void runImportJob(job, resolvedOptions, controller);
  return mapImportJob(job);
}

export function listImportJobs(limit = 20) {
  return (getDb()
    .prepare("SELECT * FROM import_jobs ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit) as ImportJobRow[]).map(mapImportJob);
}

export function getImportJob(id: number) {
  const row = getDb().prepare("SELECT * FROM import_jobs WHERE id = ?").get(id) as ImportJobRow | undefined;
  return row ? mapImportJob(row) : null;
}

export function cancelImportJob(id: number) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(id) as ImportJobRow | undefined;
  if (!row) {
    throw new HttpError(404, "Import job not found");
  }
  if (!['queued', 'running'].includes(row.status)) {
    throw new HttpError(409, `Import job is already ${row.status}`);
  }

  const now = touchNow();
  db.prepare(
    `UPDATE import_jobs SET status = 'cancelled', error = 'Cancelled by user', completed_at = ?, updated_at = ?
     WHERE id = ? AND status IN ('queued', 'running')`
  ).run(now, now, id);
  const active = activeJobs.get(id);
  active?.controller.abort();
  active?.child?.kill();
  return getImportJob(id);
}

async function runImportJob(job: ImportJobRow, options: ResolvedImportJobOptions, controller: AbortController) {
  const db = getDb();
  const startedAt = touchNow();
  db.prepare(
    "UPDATE import_jobs SET status = 'running', started_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'"
  ).run(startedAt, startedAt, job.id);

  let stdout = "";
  let stderr = "";
  const updateStdout = (chunk: string) => {
    stdout = trimOutput(stdout + chunk);
    updateOutput(db, job.id, stdout, stderr);
  };
  const updateStderr = (chunk: string) => {
    stderr = trimOutput(stderr + chunk);
    updateOutput(db, job.id, stdout, stderr);
  };

  try {
    await ensureImportInput(job.id, options, updateStdout, controller.signal);
    if (controller.signal.aborted) {
      return;
    }

    const python = pythonCommand();
    const child = spawn(python.command, [...python.prefixArgs, ...buildJobArgs(options)], {
      cwd: config.resourceRoot,
      windowsHide: true
    });
    const active = activeJobs.get(job.id);
    if (active) {
      active.child = child;
    }
    child.stdout?.on("data", (chunk: Buffer) => updateStdout(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => updateStderr(chunk.toString("utf8")));

    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    finishIfActive(db, job.id, code === 0 ? "completed" : "failed", {
      exitCode: code,
      stdout,
      stderr,
      error: code === 0 ? null : `Import process exited with code ${code ?? "unknown"}`
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      const message = error instanceof Error ? error.message : "Import failed";
      finishIfActive(db, job.id, "failed", { stdout, stderr: trimOutput(stderr + message), error: message });
    }
  } finally {
    activeJobs.delete(job.id);
  }
}

function finishIfActive(
  db: Database.Database,
  id: number,
  status: "completed" | "failed",
  output: { exitCode?: number | null; stdout: string; stderr: string; error: string | null }
) {
  const now = touchNow();
  db.prepare(
    `UPDATE import_jobs
     SET status = ?, exit_code = ?, stdout = ?, stderr = ?, error = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND status = 'running'`
  ).run(status, output.exitCode ?? null, output.stdout, output.stderr, output.error, now, now, id);
}

function resolveImportJobOptions(options: ImportJobOptions): ResolvedImportJobOptions {
  if (options.inputPath || options.jobType === "starter_data" || options.jobType === "kanji_graph") {
    return options;
  }
  const source = defaultDatasetSources[options.jobType];
  return source ? { ...options, inputPath: source.inputPath } : options;
}

async function ensureImportInput(
  jobId: number,
  options: ResolvedImportJobOptions,
  updateStdout: (chunk: string) => void,
  signal: AbortSignal
) {
  if (options.jobType === "starter_data" || options.jobType === "kanji_graph") {
    return;
  }
  if (!options.inputPath) {
    throw new Error("No import file was configured for this job.");
  }

  const source = defaultDatasetSources[options.jobType];
  const isDefaultInput = source && path.resolve(options.inputPath) === source.inputPath;
  if (isDefaultInput && source.url && !fs.existsSync(source.inputPath)) {
    await downloadDefaultDataset(jobId, source, updateStdout, signal);
  }
  if (!fs.existsSync(options.inputPath)) {
    const relativePath = path.relative(config.importDir, options.inputPath);
    throw new Error(`Missing ${source?.label ?? "import file"}. Save it at ${relativePath} and start the import again.`);
  }
}

async function downloadDefaultDataset(
  jobId: number,
  source: { inputPath: string; url?: string; label: string },
  updateStdout: (chunk: string) => void,
  signal: AbortSignal
) {
  if (!source.url) return;
  await mkdir(path.dirname(source.inputPath), { recursive: true });
  const relativePath = path.relative(config.importDir, source.inputPath);
  updateStdout(`Downloading ${source.label} to ${relativePath}\n`);

  const timeoutController = new AbortController();
  const onAbort = () => timeoutController.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => timeoutController.abort(), config.importDownloadTimeoutMs);
  const tempPath = importDownloadTempPath(source.inputPath, jobId);
  try {
    const response = await fetch(source.url, { signal: timeoutController.signal });
    if (!response.ok || !response.body) {
      throw new Error(`Could not download ${source.label}: HTTP ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tempPath));
    await rename(tempPath, source.inputPath);
    updateStdout(`Saved ${source.label} to ${relativePath}\n`);
  } catch (error) {
    await rm(tempPath, { force: true });
    if (timeoutController.signal.aborted && !signal.aborted) {
      throw new Error(`Downloading ${source.label} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
  }
}

export function importDownloadTempPath(inputPath: string, jobId: number) {
  return `${inputPath}.${jobId}.download`;
}

function buildJobArgs(options: ResolvedImportJobOptions) {
  const args = [scriptFor(options.jobType)];
  if (options.inputPath) args.push(options.inputPath);
  if (options.jobType === "sentence_examples" && options.source) args.push("--source", options.source);
  if ((options.jobType === "jmdict" || options.jobType === "kanji_graph") && options.limit) {
    args.push("--limit", String(options.limit));
  }
  if (options.jobType === "kanji_graph") {
    if (options.maxEdges) args.push("--max-edges", String(options.maxEdges));
    if (options.maxGroupSize) args.push("--max-group-size", String(options.maxGroupSize));
  }
  return args;
}

function scriptFor(jobType: ImportJobType) {
  const scripts: Record<ImportJobType, string> = {
    starter_data: "scripts/seed_starter_data.py",
    kanjidic2: "scripts/import_kanjidic2.py",
    jmdict: "scripts/import_jmdict.py",
    sentence_examples: "scripts/import_sentence_examples.py",
    kanji_graph: "scripts/build_kanji_graph.py"
  };
  return path.join(config.scriptDir, path.basename(scripts[jobType]));
}

function pythonCommand() {
  return process.platform === "win32"
    ? { command: "py", prefixArgs: ["-3"] }
    : { command: "python3", prefixArgs: [] };
}

function updateOutput(db: Database.Database, id: number, stdout: string, stderr: string) {
  const now = touchNow();
  db.prepare(
    "UPDATE import_jobs SET stdout = ?, stderr = ?, updated_at = ? WHERE id = ? AND status = 'running'"
  ).run(stdout, stderr, now, id);
}

function trimOutput(value: string) {
  return value.length <= outputLimit ? value : value.slice(value.length - outputLimit);
}
