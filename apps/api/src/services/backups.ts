import path from "node:path";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { config } from "../config.js";
import { closeDb, getDb } from "../db/index.js";
import { resolveUploadPath } from "./uploadLifecycle.js";

type BackupFile = { path: string; size: number; sha256: string };
type BackupManifest = {
  version: 1;
  productVersion: string;
  createdAt: string;
  schemaVersion: number;
  database: BackupFile;
  uploads: BackupFile[];
};

export async function createBackup() {
  await fs.mkdir(config.backupDir, { recursive: true });
  const createdAt = new Date().toISOString();
  const name = `${createdAt.replaceAll(":", "-").replace(".", "-")}-${randomUUID().slice(0, 8)}`;
  const destination = path.join(config.backupDir, name);
  const uploadsDestination = path.join(destination, "uploads");
  await fs.mkdir(uploadsDestination, { recursive: true });

  try {
    const databasePath = path.join(destination, "app.sqlite");
    const db = getDb();
    await db.backup(databasePath);
    const schemaVersion = (db.prepare("SELECT COALESCE(MAX(id), 0) AS version FROM schema_migrations").get() as { version: number }).version;
    const uploadPaths = new Set<string>();
    for (const row of db.prepare("SELECT file_path AS path FROM resource_images").all() as Array<{ path: string }>) {
      uploadPaths.add(normalizeRelative(row.path));
    }
    for (const row of db.prepare("SELECT audio_path AS path FROM pronunciation_recordings").all() as Array<{ path: string }>) {
      uploadPaths.add(normalizeRelative(row.path));
    }

    const uploads: BackupFile[] = [];
    for (const relativePath of [...uploadPaths].sort()) {
      const source = resolveUploadPath(relativePath);
      const target = safeChildPath(uploadsDestination, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
      uploads.push({ path: relativePath, ...(await fileMetadata(target)) });
    }
    const manifest: BackupManifest = {
      version: 1,
      productVersion: config.productVersion,
      createdAt,
      schemaVersion,
      database: { path: "app.sqlite", ...(await fileMetadata(databasePath)) },
      uploads
    };
    await fs.writeFile(path.join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return { name, ...manifest };
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function listBackups() {
  await fs.mkdir(config.backupDir, { recursive: true });
  const entries = await fs.readdir(config.backupDir, { withFileTypes: true });
  const backups = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    try {
      const manifest = await readManifest(entry.name);
      backups.push({ name: entry.name, ...manifest });
    } catch {
      // Incomplete backup directories are intentionally hidden from the restore list.
    }
  }
  return backups;
}

export async function restoreBackup(name: string) {
  const manifest = await readManifest(name);
  const supportedSchema = (getDb().prepare("SELECT COALESCE(MAX(id), 0) AS version FROM schema_migrations").get() as { version: number }).version;
  if (manifest.schemaVersion > supportedSchema) {
    throw new Error(`Backup schema ${manifest.schemaVersion} is newer than supported schema ${supportedSchema}`);
  }
  const sourceRoot = backupPath(name);
  await verifyFile(safeChildPath(sourceRoot, manifest.database.path), manifest.database);
  for (const upload of manifest.uploads) {
    await verifyFile(safeChildPath(path.join(sourceRoot, "uploads"), upload.path), upload);
  }

  const safetyBackup = await createBackup();
  const token = randomUUID();
  const databaseStage = `${config.databasePath}.restore-${token}`;
  const databasePrevious = `${config.databasePath}.previous-${token}`;
  const uploadsParent = path.dirname(config.uploadDir);
  const uploadsStage = path.join(uploadsParent, `.uploads-restore-${token}`);
  const uploadsPrevious = path.join(uploadsParent, `.uploads-previous-${token}`);
  await fs.copyFile(safeChildPath(sourceRoot, manifest.database.path), databaseStage);
  await fs.mkdir(uploadsStage, { recursive: true });
  for (const upload of manifest.uploads) {
    const target = safeChildPath(uploadsStage, upload.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(safeChildPath(path.join(sourceRoot, "uploads"), upload.path), target);
  }

  let databaseMoved = false;
  let uploadsMoved = false;
  try {
    closeDb();
    if (await exists(config.databasePath)) {
      await fs.rename(config.databasePath, databasePrevious);
      databaseMoved = true;
    }
    await fs.rename(databaseStage, config.databasePath);
    await fs.mkdir(uploadsParent, { recursive: true });
    if (await exists(config.uploadDir)) {
      await fs.rename(config.uploadDir, uploadsPrevious);
      uploadsMoved = true;
    }
    await fs.rename(uploadsStage, config.uploadDir);
    const integrity = getDb().prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (integrity.integrity_check !== "ok") throw new Error(`Restored database failed integrity check: ${integrity.integrity_check}`);
    await fs.rm(databasePrevious, { force: true });
    await fs.rm(`${databasePrevious}-wal`, { force: true });
    await fs.rm(`${databasePrevious}-shm`, { force: true });
    await fs.rm(uploadsPrevious, { recursive: true, force: true });
    return { restored: name, safetyBackup: safetyBackup.name, manifest };
  } catch (error) {
    closeDb();
    await fs.rm(config.databasePath, { force: true });
    if (databaseMoved) await fs.rename(databasePrevious, config.databasePath);
    await fs.rm(config.uploadDir, { recursive: true, force: true });
    if (uploadsMoved) await fs.rename(uploadsPrevious, config.uploadDir);
    getDb();
    throw error;
  } finally {
    await fs.rm(databaseStage, { force: true });
    await fs.rm(uploadsStage, { recursive: true, force: true });
  }
}

async function readManifest(name: string) {
  const raw = JSON.parse(await fs.readFile(path.join(backupPath(name), "manifest.json"), "utf8")) as Partial<BackupManifest>;
  if (raw.version !== 1 || typeof raw.productVersion !== "string" || !raw.createdAt || !Number.isInteger(raw.schemaVersion) || !isBackupFile(raw.database) || !Array.isArray(raw.uploads) || !raw.uploads.every(isBackupFile)) {
    throw new Error("Backup manifest is invalid or unsupported");
  }
  return raw as BackupManifest;
}

function backupPath(name: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("Invalid backup name");
  return safeChildPath(config.backupDir, name);
}

function safeChildPath(root: string, child: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, child);
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Backup path escapes its root");
  return resolved;
}

function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<BackupFile>;
  return typeof file.path === "string" && file.path.length > 0 && typeof file.size === "number" && typeof file.sha256 === "string" && /^[a-f0-9]{64}$/.test(file.sha256);
}

async function fileMetadata(filePath: string) {
  const stat = await fs.stat(filePath);
  return { size: stat.size, sha256: await sha256(filePath) };
}

async function verifyFile(filePath: string, expected: BackupFile) {
  const actual = await fileMetadata(filePath);
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error(`Backup checksum failed for ${expected.path}`);
}

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function exists(target: string) {
  try { await fs.access(target); return true; } catch { return false; }
}

function normalizeRelative(value: string) {
  return value.replaceAll("\\", "/");
}
