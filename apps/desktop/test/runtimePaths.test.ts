import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDesktopRuntimePaths } from "../src/runtimePaths.js";

describe("resolveDesktopRuntimePaths", () => {
  it("keeps user data outside application resources", () => {
    const result = resolveDesktopRuntimePaths({
      appPath: path.join("repo", "apps", "desktop"),
      userDataPath: path.join("home", "Yomunami"),
      resourcesPath: path.join("installed", "resources"),
      isPackaged: true
    });
    expect(result.resourceRoot).toBe(path.normalize(path.join("installed", "resources")));
    expect(result.databasePath).toBe(path.normalize(path.join("home", "Yomunami", "data", "app.sqlite")));
    expect(result.uploadDir.startsWith(result.resourceRoot)).toBe(false);
  });

  it("finds the repository root during development", () => {
    const appPath = path.resolve("repo", "apps", "desktop");
    const result = resolveDesktopRuntimePaths({
      appPath,
      userDataPath: path.resolve("tmp", "Yomunami"),
      resourcesPath: path.resolve("installed", "resources"),
      isPackaged: false
    });
    expect(result.resourceRoot).toBe(path.resolve(appPath, "../.."));
  });
});
