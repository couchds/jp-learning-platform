import assert from "node:assert/strict";
import test from "node:test";
import { runProcess } from "../src/routes/runtime.js";

test("runtime probes do not block unrelated event-loop work", async () => {
  let timerRan = false;
  const probe = runProcess(process.execPath, ["-e", "setTimeout(() => process.exit(0), 120)"], 1000);
  await new Promise<void>((resolve) => setTimeout(() => { timerRan = true; resolve(); }, 10));
  assert.equal(timerRan, true);
  assert.equal((await probe).code, 0);
});
