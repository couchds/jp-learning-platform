import path from "node:path";
import { spawn } from "node:child_process";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { getDb, readJson, touchNow, writeJson } from "../db/index.js";

export type ImportJobType = "kanjidic2" | "jmdict" | "sentence_examples" | "kanji_graph";

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
  status: "queued" | "running" | "completed" | "failed";
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

const outputLimit = 30000;

export function mapImportJob(row: ImportJobRow) {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    inputPath: row.input_path,
    args: readJson<Record<string, unknown>>(row.args_json, {}),
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

export function createImportJob(options: ImportJobOptions) {
  const db = getDb();
  const jobArgs = buildJobArgs(options);
  const now = touchNow();
  const result = db
    .prepare(
      `INSERT INTO import_jobs
       (job_type, status, input_path, args_json, updated_at)
       VALUES (?, 'queued', ?, ?, ?)`
    )
    .run(options.jobType, options.inputPath ?? null, writeJson(jobArgs), now);
  const job = db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(result.lastInsertRowid) as ImportJobRow;

  startImportJob(job, jobArgs);
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

function startImportJob(job: ImportJobRow, jobArgs: string[]) {
  const db = getDb();
  const python = pythonCommand();
  const startedAt = touchNow();
  db.prepare("UPDATE import_jobs SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?").run(
    startedAt,
    startedAt,
    job.id
  );

  const child = spawn(python.command, [...python.prefixArgs, ...jobArgs], {
    cwd: config.repoRoot,
    windowsHide: true
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout = trimOutput(stdout + chunk.toString("utf8"));
    updateOutput(db, job.id, stdout, stderr);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr = trimOutput(stderr + chunk.toString("utf8"));
    updateOutput(db, job.id, stdout, stderr);
  });

  child.on("error", (error) => {
    const now = touchNow();
    db.prepare(
      `UPDATE import_jobs
       SET status = 'failed', error = ?, stdout = ?, stderr = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(error.message, stdout, stderr, now, now, job.id);
  });

  child.on("close", (code) => {
    const now = touchNow();
    db.prepare(
      `UPDATE import_jobs
       SET status = ?, exit_code = ?, stdout = ?, stderr = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(code === 0 ? "completed" : "failed", code, stdout, stderr, now, now, job.id);
  });
}

function buildJobArgs(options: ImportJobOptions) {
  const script = scriptFor(options.jobType);
  const args = [script];

  if (options.inputPath) {
    args.push(options.inputPath);
  }

  if (options.jobType === "sentence_examples" && options.source) {
    args.push("--source", options.source);
  }

  if ((options.jobType === "jmdict" || options.jobType === "kanji_graph") && options.limit) {
    args.push("--limit", String(options.limit));
  }

  if (options.jobType === "kanji_graph") {
    if (options.maxEdges) {
      args.push("--max-edges", String(options.maxEdges));
    }
    if (options.maxGroupSize) {
      args.push("--max-group-size", String(options.maxGroupSize));
    }
  }

  return args;
}

function scriptFor(jobType: ImportJobType) {
  const scripts: Record<ImportJobType, string> = {
    kanjidic2: "scripts/import_kanjidic2.py",
    jmdict: "scripts/import_jmdict.py",
    sentence_examples: "scripts/import_sentence_examples.py",
    kanji_graph: "scripts/build_kanji_graph.py"
  };
  return path.join(config.repoRoot, scripts[jobType]);
}

function pythonCommand() {
  if (process.platform === "win32") {
    return { command: "py", prefixArgs: ["-3"] };
  }

  return { command: "python3", prefixArgs: [] };
}

function updateOutput(db: Database.Database, id: number, stdout: string, stderr: string) {
  const now = touchNow();
  db.prepare("UPDATE import_jobs SET stdout = ?, stderr = ?, updated_at = ? WHERE id = ?").run(
    stdout,
    stderr,
    now,
    id
  );
}

function trimOutput(value: string) {
  if (value.length <= outputLimit) {
    return value;
  }

  return value.slice(value.length - outputLimit);
}
