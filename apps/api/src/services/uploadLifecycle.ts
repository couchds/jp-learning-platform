import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { getDb } from "../db/index.js";

export function resolveUploadPath(uploadPath: string, uploadDir = config.uploadDir) {
  const resolved = path.resolve(path.isAbsolute(uploadPath) ? uploadPath : path.join(uploadDir, uploadPath));
  const relative = path.relative(path.resolve(uploadDir), resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Upload path must point to a file inside the configured upload directory");
  }
  return resolved;
}

export async function removeUploadedFile(uploadPath: string | undefined | null, uploadDir = config.uploadDir) {
  if (!uploadPath) {
    return;
  }
  const resolved = resolveUploadPath(uploadPath, uploadDir);
  await fs.rm(resolved, { force: true });
}

export async function stageUploadedFiles(uploadPaths: Array<string | null | undefined>, uploadDir = config.uploadDir) {
  const uniquePaths = Array.from(new Set(uploadPaths.filter((value): value is string => Boolean(value))));
  const stageDir = path.join(uploadDir, ".trash", randomUUID());
  const staged: Array<{ source: string; destination: string }> = [];

  try {
    await fs.mkdir(stageDir, { recursive: true });
    for (const [index, uploadPath] of uniquePaths.entries()) {
      const source = resolveUploadPath(uploadPath, uploadDir);
      try {
        await fs.access(source);
      } catch {
        continue;
      }
      const destination = path.join(stageDir, `${index}-${path.basename(source)}`);
      await fs.rename(source, destination);
      staged.push({ source, destination });
    }
  } catch (error) {
    await restoreStagedFiles(staged);
    await fs.rm(stageDir, { recursive: true, force: true });
    throw error;
  }

  return {
    async commit() {
      await fs.rm(stageDir, { recursive: true, force: true });
    },
    async rollback() {
      await restoreStagedFiles(staged);
      await fs.rm(stageDir, { recursive: true, force: true });
    }
  };
}

export async function findOrphanUploads(db = getDb(), uploadDir = config.uploadDir) {
  await fs.mkdir(uploadDir, { recursive: true });
  const referenced = new Set<string>();
  for (const row of db.prepare("SELECT file_path AS path FROM resource_images").all() as Array<{ path: string }>) {
    referenced.add(normalizeRelative(row.path));
  }
  for (const row of db.prepare("SELECT audio_path AS path FROM pronunciation_recordings").all() as Array<{ path: string }>) {
    referenced.add(normalizeRelative(row.path));
  }

  const entries = await fs.readdir(uploadDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== ".gitkeep")
    .map((entry) => entry.name)
    .filter((entry) => !referenced.has(normalizeRelative(entry)))
    .sort();
}

export async function removeOrphanUploads(db = getDb(), uploadDir = config.uploadDir) {
  const orphans = await findOrphanUploads(db, uploadDir);
  for (const orphan of orphans) {
    await removeUploadedFile(orphan, uploadDir);
  }
  return orphans;
}

function normalizeRelative(value: string) {
  return value.replaceAll("\\", "/");
}

async function restoreStagedFiles(staged: Array<{ source: string; destination: string }>) {
  for (const item of [...staged].reverse()) {
    await fs.mkdir(path.dirname(item.source), { recursive: true });
    await fs.rename(item.destination, item.source);
  }
}
