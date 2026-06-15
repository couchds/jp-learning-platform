import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { getDb, readJson, touchNow, writeJson } from "../db/index.js";

export type ImportJobType = "starter_data" | "kanjidic2" | "jmdict" | "sentence_examples" | "kanji_graph";

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
const importDataRoot = path.join(config.repoRoot, "data/local/imports");

type ResolvedImportJobOptions = ImportJobOptions & {
  inputPath?: string | null;
};

const defaultDatasetSources: Partial<Record<ImportJobType, { inputPath: string; url?: string; label: string }>> = {
  kanjidic2: {
    inputPath: path.join(importDataRoot, "kanjidic2.xml.gz"),
    url: "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
    label: "KANJIDIC2"
  },
  jmdict: {
    inputPath: path.join(importDataRoot, "JMdict_e.gz"),
    url: "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz",
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

export function createImportJob(options: ImportJobOptions) {
  const db = getDb();
  const resolvedOptions = resolveImportJobOptions(options);
  const jobArgs = buildJobArgs(resolvedOptions);
  const now = touchNow();
  const result = db
    .prepare(
      `INSERT INTO import_jobs
       (job_type, status, input_path, args_json, updated_at)
       VALUES (?, 'queued', ?, ?, ?)`
    )
    .run(resolvedOptions.jobType, resolvedOptions.inputPath ?? null, writeJson(jobArgs), now);
  const job = db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(result.lastInsertRowid) as ImportJobRow;

  startImportJob(job, resolvedOptions);
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

function startImportJob(job: ImportJobRow, options: ResolvedImportJobOptions) {
  void runImportJob(job, options);
}

async function runImportJob(job: ImportJobRow, options: ResolvedImportJobOptions) {
  const db = getDb();
  const python = pythonCommand();
  const startedAt = touchNow();
  db.prepare("UPDATE import_jobs SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?").run(
    startedAt,
    startedAt,
    job.id
  );

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
    await ensureImportInput(options, updateStdout);
  } catch (error) {
    const now = touchNow();
    const message = error instanceof Error ? error.message : "Could not prepare import input";
    db.prepare(
      `UPDATE import_jobs
       SET status = 'failed', error = ?, stdout = ?, stderr = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(message, stdout, trimOutput(stderr + message), now, now, job.id);
    return;
  }

  const jobArgs = buildJobArgs(options);
  const child = spawn(python.command, [...python.prefixArgs, ...jobArgs], {
    cwd: config.repoRoot,
    windowsHide: true
  });

  child.stdout.on("data", (chunk: Buffer) => {
    updateStdout(chunk.toString("utf8"));
  });

  child.stderr.on("data", (chunk: Buffer) => {
    updateStderr(chunk.toString("utf8"));
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

function resolveImportJobOptions(options: ImportJobOptions): ResolvedImportJobOptions {
  if (options.inputPath || options.jobType === "starter_data" || options.jobType === "kanji_graph") {
    return options;
  }

  const defaultSource = defaultDatasetSources[options.jobType];
  return defaultSource
    ? {
        ...options,
        inputPath: defaultSource.inputPath
      }
    : options;
}

async function ensureImportInput(options: ResolvedImportJobOptions, updateStdout: (chunk: string) => void) {
  if (options.jobType === "starter_data" || options.jobType === "kanji_graph") {
    return;
  }

  if (!options.inputPath) {
    throw new Error("No import file was configured for this job.");
  }

  const defaultSource = defaultDatasetSources[options.jobType];
  const isDefaultInput = defaultSource && path.resolve(options.inputPath) === defaultSource.inputPath;

  if (isDefaultInput && defaultSource.url && !fs.existsSync(defaultSource.inputPath)) {
    await downloadDefaultDataset(defaultSource, updateStdout);
  }

  if (!fs.existsSync(options.inputPath)) {
    const relativePath = path.relative(config.repoRoot, options.inputPath);
    throw new Error(`Missing ${defaultSource?.label ?? "import file"}. Save it at ${relativePath} and start the import again.`);
  }
}

async function downloadDefaultDataset(
  source: { inputPath: string; url?: string; label: string },
  updateStdout: (chunk: string) => void
) {
  if (!source.url) {
    return;
  }

  await mkdir(path.dirname(source.inputPath), { recursive: true });
  const relativePath = path.relative(config.repoRoot, source.inputPath);
  updateStdout(`Downloading ${source.label} to ${relativePath}\n`);

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`Could not download ${source.label}: HTTP ${response.status}`);
  }

  const tempPath = `${source.inputPath}.download`;
  try {
    await writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
    await rename(tempPath, source.inputPath);
    updateStdout(`Saved ${source.label} to ${relativePath}\n`);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

function buildJobArgs(options: ResolvedImportJobOptions) {
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
    starter_data: "scripts/seed_starter_data.py",
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
