import assert from "node:assert/strict";
import test from "node:test";
import { screenPermissionCheck } from "../src/routes/runtime.js";

test("runtime doctor attributes screen capture to Electron", () => {
  const windows = screenPermissionCheck("win32");
  assert.equal(windows.status, "ok");
  assert.match(windows.detail, /desktop app/i);

  const macos = screenPermissionCheck("darwin");
  assert.equal(macos.status, "warn");
  assert.match(macos.action ?? "", /Kakomu/);
});
