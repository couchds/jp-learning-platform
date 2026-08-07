import fs from "node:fs";
import path from "node:path";

export type UserDataPathResolution = {
  path: string;
  source: "current" | "explicit" | "migrated" | "legacy-fallback";
};

export function resolveUserDataPath(options: {
  currentPath: string;
  explicitPath?: string;
  legacyProductName: string;
}): UserDataPathResolution {
  if (options.explicitPath) {
    return { path: path.resolve(options.explicitPath), source: "explicit" };
  }

  const currentPath = path.resolve(options.currentPath);
  const legacyPath = path.join(path.dirname(currentPath), options.legacyProductName);
  if (pathsMatch(currentPath, legacyPath) || !isDirectory(legacyPath)) {
    return { path: currentPath, source: "current" };
  }

  if (fs.existsSync(currentPath) && !isEmptyDirectory(currentPath)) {
    return { path: currentPath, source: "current" };
  }

  try {
    if (fs.existsSync(currentPath)) fs.rmdirSync(currentPath);
    fs.renameSync(legacyPath, currentPath);
    return { path: currentPath, source: "migrated" };
  } catch {
    return { path: legacyPath, source: "legacy-fallback" };
  }
}

function isDirectory(targetPath: string) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function isEmptyDirectory(targetPath: string) {
  try {
    return fs.statSync(targetPath).isDirectory() && fs.readdirSync(targetPath).length === 0;
  } catch {
    return false;
  }
}

function pathsMatch(left: string, right: string) {
  return process.platform === "win32"
    ? left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0
    : left === right;
}
