import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(apiDir, "../../..");

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

export const config = {
  env: process.env.NODE_ENV ?? "development",
  repoRoot,
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.API_PORT ?? "3001", 10),
  databasePath: process.env.DATABASE_PATH ?? path.join(repoRoot, "data/local/app.sqlite"),
  uploadDir: process.env.UPLOAD_DIR ?? path.join(repoRoot, "uploads"),
  allowedOrigins: listFromEnv(process.env.API_ALLOWED_ORIGINS, [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173"
  ]),
  enableRequestLogging: boolFromEnv(process.env.API_REQUEST_LOGGING, true),
  ocrServiceUrl: process.env.OCR_SERVICE_URL ?? "http://127.0.0.1:5100",
  recognitionServiceUrl: process.env.RECOGNITION_SERVICE_URL ?? "http://127.0.0.1:5000",
  speechServiceUrl: process.env.SPEECH_SERVICE_URL ?? "http://127.0.0.1:5200",
  overlayScriptPath: process.env.OVERLAY_SCRIPT_PATH ?? path.join(repoRoot, "services/desktop-overlay/overlay.py")
};

export type AppConfig = typeof config;
