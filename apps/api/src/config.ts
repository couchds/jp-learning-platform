import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(apiDir, "../../..");
const overlayRoot = path.join(repoRoot, "services/desktop-overlay");
const ocrRoot = path.join(repoRoot, "services/ocr");
const defaultOverlayScriptPath = path.join(overlayRoot, "overlay.py");
const defaultOverlayPythonPath = path.join(overlayRoot, ".venv/bin/python");
const defaultOverlayAppPath = path.join(overlayRoot, "dist/Yomunami OCR Overlay.app");
const defaultOverlayAppExecutablePath = path.join(defaultOverlayAppPath, "Contents/MacOS/Yomunami OCR Overlay");
const defaultOcrScriptPath = path.join(ocrRoot, "app.py");
const defaultOcrPythonPath = path.join(ocrRoot, ".venv/bin/python");

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

function serviceScriptPathFromEnv(value: string | undefined, fallback: string, serviceRoot: string, envName: string): string {
  const resolved = path.resolve(value ?? fallback);
  const relative = path.relative(serviceRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${envName} must point inside ${path.relative(repoRoot, serviceRoot)}`);
  }

  return resolved;
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
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://127.0.0.1:4173",
    "http://localhost:4173"
  ]),
  enableRequestLogging: boolFromEnv(process.env.API_REQUEST_LOGGING, true),
  ocrServiceUrl: process.env.OCR_SERVICE_URL ?? "http://127.0.0.1:5100",
  recognitionServiceUrl: process.env.RECOGNITION_SERVICE_URL ?? "http://127.0.0.1:5000",
  speechServiceUrl: process.env.SPEECH_SERVICE_URL ?? "http://127.0.0.1:5200",
  ocrServiceRoot: ocrRoot,
  ocrScriptPath: serviceScriptPathFromEnv(process.env.OCR_SCRIPT_PATH, defaultOcrScriptPath, ocrRoot, "OCR_SCRIPT_PATH"),
  ocrPythonPath: process.env.OCR_PYTHON_PATH ?? defaultOcrPythonPath,
  overlayScriptPath: serviceScriptPathFromEnv(
    process.env.OVERLAY_SCRIPT_PATH,
    defaultOverlayScriptPath,
    overlayRoot,
    "OVERLAY_SCRIPT_PATH"
  ),
  overlayPythonPath: process.env.OVERLAY_PYTHON_PATH ?? defaultOverlayPythonPath,
  overlayAppPath: process.env.OVERLAY_APP_PATH ?? defaultOverlayAppPath,
  overlayAppExecutablePath: process.env.OVERLAY_APP_EXECUTABLE_PATH ?? defaultOverlayAppExecutablePath,
  webAppUrl: process.env.WEB_APP_URL ?? "http://127.0.0.1:5173"
};

export type AppConfig = typeof config;
