import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServiceDefinitions } from "../src/serviceDefinitions.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

describe("createServiceDefinitions", () => {
  it("marks absent packaged workers unavailable", () => {
    const definitions = createServiceDefinitions({
      resourceRoot: path.resolve("missing"),
      isPackaged: true,
      platform: "win32"
    });
    expect(definitions).toHaveLength(2);
    expect(definitions.every((definition) => !definition.available)).toBe(true);
    expect(definitions.map((definition) => definition.id)).toEqual(["ocr", "recognition"]);
  });

  it("prefers a service virtual environment during development", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "yomunami-services-"));
    roots.push(root);
    const serviceRoot = path.join(root, "services", "recognize");
    const pythonPath = path.join(serviceRoot, ".venv", "Scripts", "python.exe");
    await fs.mkdir(path.dirname(pythonPath), { recursive: true });
    await fs.writeFile(pythonPath, "");
    await fs.writeFile(path.join(serviceRoot, "app.py"), "print('ok')");
    const definitions = createServiceDefinitions({
      resourceRoot: root,
      isPackaged: false,
      platform: "win32"
    });
    const recognition = definitions.find((definition) => definition.id === "recognition");
    expect(recognition?.available).toBe(true);
    expect(recognition?.command).toBe(pythonPath);
  });
});
