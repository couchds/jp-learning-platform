import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "jp-imports-"));
process.env.DATABASE_PATH = path.join(root, "app.sqlite");
process.env.UPLOAD_DIR = path.join(root, "uploads");
const jobs = await import("../src/services/importJobs.js");
const database = await import("../src/db/index.js");

test("import jobs reject duplicates, cancel idempotently, reconcile restarts, and isolate download paths", async () => {
  const first = jobs.createImportJob({ jobType: "starter_data" });
  assert.throws(() => jobs.createImportJob({ jobType: "starter_data" }), (error: unknown) => Boolean(error && typeof error === "object" && "status" in error && error.status === 409));
  assert.equal(jobs.cancelImportJob(first.id)?.status, "cancelled");
  assert.throws(() => jobs.cancelImportJob(first.id), (error: unknown) => Boolean(error && typeof error === "object" && "status" in error && error.status === 409));
  assert.notEqual(jobs.importDownloadTempPath("dataset.gz", 1), jobs.importDownloadTempPath("dataset.gz", 2));

  const db = database.getDb();
  db.prepare("INSERT INTO import_jobs (job_type, status) VALUES ('jmdict', 'running')").run();
  assert.equal(jobs.reconcileImportJobs(), 1);
  const interrupted = db.prepare("SELECT status FROM import_jobs WHERE job_type='jmdict' ORDER BY id DESC LIMIT 1").get() as { status: string };
  assert.equal(interrupted.status, "interrupted");

  const originalPath = process.env.PATH;
  process.env.PATH = "";
  const spawnFailure = jobs.createImportJob({ jobType: "kanji_graph", limit: 1 });
  await new Promise<void>((resolve) => setImmediate(resolve));
  process.env.PATH = originalPath;
  let failed = jobs.getImportJob(spawnFailure.id);
  for (let attempt = 0; attempt < 30 && failed?.status === "running"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    failed = jobs.getImportJob(spawnFailure.id);
  }
  assert.equal(failed?.status, "failed");
});

test.after(async () => {
  database.closeDb();
  await fs.rm(root, { recursive: true, force: true });
});
