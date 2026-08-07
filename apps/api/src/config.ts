import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRepoRoot = path.resolve(apiDir, "../../..");
const resourceRoot = path.resolve(process.env.YOMUNAMI_RESOURCE_ROOT ?? sourceRepoRoot);
const dataRoot = path.resolve(process.env.YOMUNAMI_DATA_ROOT ?? path.join(resourceRoot, "data/local"));

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function listFromEnv(value: string | undefined, fallback: string[]): string[] {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  productVersion: "0.7.0",
  env: process.env.NODE_ENV ?? "development",
  repoRoot: resourceRoot,
  resourceRoot,
  dataRoot,
  importDir: path.resolve(process.env.IMPORT_DIR ?? path.join(dataRoot, "imports")),
  scriptDir: path.join(resourceRoot, "scripts"),
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.API_PORT ?? "3001", 10),
  databasePath: process.env.DATABASE_PATH ?? path.join(dataRoot, "app.sqlite"),
  uploadDir: process.env.UPLOAD_DIR ?? path.join(resourceRoot, "uploads"),
  backupDir: process.env.BACKUP_DIR ?? path.join(dataRoot, "backups"),
  desktopAuthToken: process.env.YOMUNAMI_DESKTOP_AUTH_TOKEN?.trim() || null,
  allowedOrigins: listFromEnv(process.env.API_ALLOWED_ORIGINS, [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://127.0.0.1:4173",
    "http://localhost:4173"
  ]),
  enableRequestLogging: boolFromEnv(process.env.API_REQUEST_LOGGING, true),
  ocrServiceUrl: process.env.OCR_SERVICE_URL ?? "http://127.0.0.1:5100",
  recognitionServiceUrl: process.env.RECOGNITION_SERVICE_URL ?? "http://127.0.0.1:5000",
  speechServiceUrl: process.env.SPEECH_SERVICE_URL ?? "http://127.0.0.1:5200",
  serviceRequestTimeoutMs: numberFromEnv(process.env.SERVICE_REQUEST_TIMEOUT_MS, 15_000),
  serviceUploadTimeoutMs: numberFromEnv(process.env.SERVICE_UPLOAD_TIMEOUT_MS, 120_000),
  serviceResponseLimitBytes: numberFromEnv(process.env.SERVICE_RESPONSE_LIMIT_BYTES, 2 * 1024 * 1024),
  proxyFileLimitBytes: numberFromEnv(process.env.PROXY_FILE_LIMIT_BYTES, 30 * 1024 * 1024),
  importDownloadTimeoutMs: numberFromEnv(process.env.IMPORT_DOWNLOAD_TIMEOUT_MS, 120_000)
};

export type AppConfig = typeof config;
