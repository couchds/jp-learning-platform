import fs from "node:fs";
import { constants } from "node:fs";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler } from "../lib/http.js";
import { venvSetupHint } from "../services/pythonRuntime.js";

type DoctorStatus = "ok" | "warn" | "error";

type DoctorCheck = {
  id: string;
  label: string;
  status: DoctorStatus;
  detail: string;
  action?: string;
};

export const runtimeRouter = Router();

runtimeRouter.get(
  "/doctor",
  asyncHandler(async (_req, res) => {
    const checks: DoctorCheck[] = [
      writablePathCheck("data", config.databasePath),
      writablePathCheck("uploads", config.uploadDir),
      screenPermissionCheck()
    ];
    checks.push(
      ...(await Promise.all([
        serviceCheck("ocr", config.ocrServiceUrl),
        serviceCheck("recognition", config.recognitionServiceUrl),
        serviceCheck("speech", config.speechServiceUrl)
      ]))
    );

    res.json({
      summary: summarize(checks),
      checks
    });
  })
);

function writablePathCheck(id: string, targetPath: string): DoctorCheck {
  const directory = id === "data" ? path.dirname(targetPath) : targetPath;

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, constants.W_OK);
    return {
      id: `${id}-writable`,
      label: `${id === "data" ? "Data" : "Upload"} directory`,
      status: "ok",
      detail: "Writable"
    };
  } catch (error) {
    return {
      id: `${id}-writable`,
      label: `${id === "data" ? "Data" : "Upload"} directory`,
      status: "error",
      detail: error instanceof Error ? error.message : "Not writable",
      action: "Check local filesystem permissions."
    };
  }
}

async function serviceCheck(service: string, baseUrl: string): Promise<DoctorCheck> {
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    const payload = await safeJson(response);
    const expectedService = isExpectedServicePayload(service, payload);
    if (response.ok && !expectedService) {
      return {
        id: `${service}-service`,
        label: serviceLabel(service),
        status: "warn",
        detail: `Unexpected service response from ${healthUrl}`,
        action: serviceStartHint(service)
      };
    }

    if (!response.ok) {
      return {
        id: `${service}-service`,
        label: serviceLabel(service),
        status: "warn",
        detail: describeServiceHealthFailure(payload, response.status, healthUrl),
        action: serviceStartHint(service)
      };
    }

    return {
      id: `${service}-service`,
      label: serviceLabel(service),
      status: "ok",
      detail: `Reachable at ${baseUrl}`
    };
  } catch (error) {
    return {
      id: `${service}-service`,
      label: serviceLabel(service),
      status: "warn",
      detail: describeServiceFailure(error, healthUrl),
      action: serviceStartHint(service)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function screenPermissionCheck(platform: NodeJS.Platform = process.platform): DoctorCheck {
  if (platform !== "darwin") {
    return {
      id: "screen-permissions",
      label: "Screen capture permissions",
      status: "ok",
      detail: platform === "win32"
        ? "Screen capture is provided by the Yomunami desktop app."
        : "Screen capture permission is managed by the desktop session."
    };
  }

  return {
    id: "screen-permissions",
    label: "macOS screen permissions",
    status: "warn",
    detail: "macOS may require Screen Recording permission for Yomunami.",
    action: "Open System Settings > Privacy & Security > Screen Recording and allow Yomunami."
  };
}

function serviceStartHint(service: string) {
  if (service === "ocr") {
    return `${venvSetupHint("services/ocr")}. Then start services/ocr/app.py.`;
  }
  if (service === "recognition") {
    return `${venvSetupHint("services/recognize")}. Then start services/recognize/app.py.`;
  }
  return `${venvSetupHint("services/speech-model")}. Then start services/speech-model/api.py.`;
}

function serviceLabel(service: string) {
  if (service === "ocr") {
    return "OCR service";
  }
  if (service === "recognition") {
    return "Recognition service";
  }
  return "Speech service";
}

function describeServiceFailure(error: unknown, healthUrl: string) {
  if (error instanceof Error && error.name === "AbortError") {
    return `Timed out connecting to ${healthUrl}`;
  }
  if (error instanceof Error && error.message.startsWith("HTTP ")) {
    return `${error.message} from ${healthUrl}`;
  }
  return `Not reachable at ${healthUrl}`;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function describeServiceHealthFailure(payload: unknown, status: number, healthUrl: string) {
  if (payload && typeof payload === "object" && "reason" in payload) {
    const reason = (payload as { reason?: unknown }).reason;
    if (typeof reason === "string") {
      return reason;
    }
  }
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") {
      return error;
    }
  }
  return `HTTP ${status} from ${healthUrl}`;
}

function isExpectedServicePayload(service: string, payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const health = payload as { service?: unknown; local_only?: unknown };
  if (service === "ocr") {
    return health.service === "ocr" && health.local_only === true;
  }
  return health.service === service;
}

function summarize(checks: DoctorCheck[]) {
  if (checks.some((check) => check.status === "error")) {
    return "error";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "ok";
}
