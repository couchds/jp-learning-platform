import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "jp-server-"));
process.env.KAKOMU_DATA_ROOT = root;
process.env.DATABASE_PATH = path.join(root, "app.sqlite");
process.env.UPLOAD_DIR = path.join(root, "uploads");
process.env.BACKUP_DIR = path.join(root, "backups");
process.env.KAKOMU_DESKTOP_AUTH_TOKEN = "desktop-test-token";
process.env.API_REQUEST_LOGGING = "false";

const { startApiServer } = await import("../src/server.js");
const { config } = await import("../src/config.js");

test("embedded API uses an ephemeral port and enforces desktop authentication", async () => {
  const running = await startApiServer({ port: 0 });
  try {
    assert.ok(running.port > 0);
    assert.equal(config.port, running.port);
    assert.equal((await fetch(`${running.url}/health`)).status, 200);
    assert.equal((await fetch(`${running.url}/api/dashboard`)).status, 401);
    assert.equal((await fetch(`${running.url}/api/dashboard`, {
      headers: { "x-kakomu-token": "wrong" }
    })).status, 401);
    assert.equal((await fetch(`${running.url}/api/dashboard`, {
      headers: { "x-kakomu-token": "desktop-test-token" }
    })).status, 200);
    assert.equal((await fetch(`${running.url}/api/dashboard`, {
      headers: { "x-yomunami-token": "desktop-test-token" }
    })).status, 200);
  } finally {
    await running.close();
  }
});

test.after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
