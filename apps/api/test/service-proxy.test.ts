import assert from "node:assert/strict";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { config } from "../src/config.js";
import { getJson, postFile } from "../src/services/serviceProxy.js";

test("companion requests time out and reject oversized responses", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/slow") {
      setTimeout(() => { res.end('{"ok":true}'); }, 100);
      return;
    }
    if (req.url === "/slow-valid") {
      setTimeout(() => { res.end('{"ok":true}'); }, 30);
      return;
    }
    if (req.url === "/text-error") {
      res.statusCode = 503;
      res.end("model unavailable");
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ value: "x".repeat(config.serviceResponseLimitBytes) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  await assert.rejects(getJson(`${base}/slow`, { timeoutMs: 20 }), /Timed out/);
  assert.deepEqual(await getJson(`${base}/slow-valid`, { timeoutMs: 200 }), { ok: true });
  await assert.rejects(getJson(`${base}/large`), /exceeded/);
  await assert.rejects(getJson(`${base}/text-error`), /Local service request failed/);
  await assert.rejects(getJson("http://127.0.0.1:1", { timeoutMs: 200 }));

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jp-proxy-"));
  const oversized = path.join(tempDir, "oversized.bin");
  await fs.writeFile(oversized, Buffer.alloc(1));
  await fs.truncate(oversized, config.proxyFileLimitBytes + 1);
  await assert.rejects(postFile(base, "file", oversized, "oversized.bin", "application/octet-stream"), /proxy limit/);
  await fs.rm(tempDir, { recursive: true, force: true });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
