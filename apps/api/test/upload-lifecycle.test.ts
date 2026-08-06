import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { findOrphanUploads, removeOrphanUploads, resolveUploadPath, stageUploadedFiles } from "../src/services/uploadLifecycle.js";

test("upload lifecycle reports orphans and stages deletion with rollback", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jp-uploads-"));
  const db = new Database(":memory:");
  db.exec("CREATE TABLE resource_images (file_path TEXT); CREATE TABLE pronunciation_recordings (audio_path TEXT);");
  await fs.writeFile(path.join(root, "kept.png"), "kept");
  await fs.writeFile(path.join(root, "orphan.png"), "orphan");
  db.prepare("INSERT INTO resource_images VALUES ('kept.png')").run();
  assert.deepEqual(await findOrphanUploads(db, root), ["orphan.png"]);
  assert.throws(() => resolveUploadPath("../outside.txt", root), /inside/);

  const staged = await stageUploadedFiles(["kept.png"], root);
  await assert.rejects(fs.access(path.join(root, "kept.png")));
  await staged.rollback();
  await fs.access(path.join(root, "kept.png"));
  assert.deepEqual(await removeOrphanUploads(db, root), ["orphan.png"]);
  await assert.rejects(fs.access(path.join(root, "orphan.png")));
  db.close();
  await fs.rm(root, { recursive: true, force: true });
});
