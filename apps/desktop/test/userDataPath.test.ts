import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveUserDataPath } from "../src/userDataPath.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("desktop user data path", () => {
  it("moves legacy user data into the renamed product directory", () => {
    const root = temporaryRoot();
    const legacyPath = path.join(root, "Yomunami");
    const currentPath = path.join(root, "Kakomu");
    fs.mkdirSync(path.join(legacyPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(legacyPath, "data", "app.sqlite"), "existing library");

    const result = resolveUserDataPath({ currentPath, legacyProductName: "Yomunami" });

    expect(result).toEqual({ path: currentPath, source: "migrated" });
    expect(fs.readFileSync(path.join(currentPath, "data", "app.sqlite"), "utf8")).toBe("existing library");
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it("replaces an empty product directory during migration", () => {
    const root = temporaryRoot();
    const legacyPath = path.join(root, "Yomunami");
    const currentPath = path.join(root, "Kakomu");
    fs.mkdirSync(legacyPath);
    fs.mkdirSync(currentPath);
    fs.writeFileSync(path.join(legacyPath, "settings.json"), "{}\n");

    const result = resolveUserDataPath({ currentPath, legacyProductName: "Yomunami" });

    expect(result.source).toBe("migrated");
    expect(fs.existsSync(path.join(currentPath, "settings.json"))).toBe(true);
  });

  it("does not overwrite an existing product directory", () => {
    const root = temporaryRoot();
    const legacyPath = path.join(root, "Yomunami");
    const currentPath = path.join(root, "Kakomu");
    fs.mkdirSync(legacyPath);
    fs.mkdirSync(currentPath);
    fs.writeFileSync(path.join(legacyPath, "legacy.txt"), "legacy");
    fs.writeFileSync(path.join(currentPath, "current.txt"), "current");

    const result = resolveUserDataPath({ currentPath, legacyProductName: "Yomunami" });

    expect(result).toEqual({ path: currentPath, source: "current" });
    expect(fs.existsSync(path.join(legacyPath, "legacy.txt"))).toBe(true);
  });

  it("honors an explicit data-directory override", () => {
    const root = temporaryRoot();
    const explicitPath = path.join(root, "portable-data");

    const result = resolveUserDataPath({
      currentPath: path.join(root, "Kakomu"),
      explicitPath,
      legacyProductName: "Yomunami"
    });

    expect(result).toEqual({ path: explicitPath, source: "explicit" });
  });
});

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kakomu-user-data-"));
  roots.push(root);
  return root;
}
