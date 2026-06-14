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

export const config = {
  env: process.env.NODE_ENV ?? "development",
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.API_PORT ?? "3001", 10),
  databasePath: process.env.DATABASE_PATH ?? path.join(repoRoot, "data/local/app.sqlite"),
  uploadDir: process.env.UPLOAD_DIR ?? path.join(repoRoot, "uploads"),
  enableRequestLogging: boolFromEnv(process.env.API_REQUEST_LOGGING, true),
  ocrServiceUrl: process.env.OCR_SERVICE_URL ?? "http://127.0.0.1:5100",
  recognitionServiceUrl: process.env.RECOGNITION_SERVICE_URL ?? "http://127.0.0.1:5000",
  speechServiceUrl: process.env.SPEECH_SERVICE_URL ?? "http://127.0.0.1:5200"
};

export type AppConfig = typeof config;
