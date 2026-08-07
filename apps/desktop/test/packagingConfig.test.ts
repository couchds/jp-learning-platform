import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("desktop packaging identity", () => {
  it("uses a path-safe Linux executable and matching desktop identity", () => {
    const config = fs.readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8")) as {
      desktopName?: string;
      homepage?: string;
      scripts?: { make?: string };
    };

    expect(config).toMatch(/linux:\s+[\s\S]*?executableName:\s+yomunami/);
    expect(config).toMatch(/linux:\s+[\s\S]*?maintainer:\s+Yomunami/);
    expect(config).toMatch(/linux:\s+[\s\S]*?syncDesktopName:\s+true/);
    expect(packageJson.desktopName).toBe("Yomunami");
    expect(packageJson.homepage).toBe("https://github.com/couchds/jp-learning-platform");
    expect(packageJson.scripts?.make).toContain("--publish never");
  });
});
