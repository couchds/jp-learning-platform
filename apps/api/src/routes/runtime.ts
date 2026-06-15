import fs from "node:fs";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler } from "../lib/http.js";
import { resolvePythonRuntime, venvSetupHint } from "../services/pythonRuntime.js";

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
      ...(process.platform === "darwin" ? [overlayAppBundleCheck()] : []),
      overlayScriptCheck(),
      overlayPythonCheck(),
      overlayImportCheck(),
      writablePathCheck("data", config.databasePath),
      writablePathCheck("uploads", config.uploadDir),
      macPermissionHint()
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

function overlayAppBundleCheck(): DoctorCheck {
  const exists = fs.existsSync(config.overlayAppExecutablePath);
  return {
    id: "overlay-app-bundle",
    label: "Desktop overlay macOS app",
    status: exists ? "ok" : "warn",
    detail: exists ? "Installed as Yomunami OCR Overlay.app" : "Not built; browser launcher will use Python fallback",
    action: exists ? undefined : "Run: npm run build:overlay:macos"
  };
}

function overlayScriptCheck(): DoctorCheck {
  const exists = fs.existsSync(config.overlayScriptPath);
  return {
    id: "overlay-script",
    label: "Desktop overlay script",
    status: exists ? "ok" : "error",
    detail: exists ? "Installed" : "Missing services/desktop-overlay/overlay.py",
    action: exists ? undefined : "Restore the desktop overlay files."
  };
}

function overlayPythonCheck(): DoctorCheck {
  const hasAppBundle = fs.existsSync(config.overlayAppExecutablePath);
  const python = resolvePythonRuntime(config.overlayPythonPath);
  return {
    id: "overlay-python",
    label: "Overlay Python runtime",
    status: python.available || hasAppBundle ? "ok" : "warn",
    detail: hasAppBundle
      ? "Packaged app bundle is available"
      : python.label === "venv"
        ? "Using services/desktop-overlay/.venv"
        : python.available
          ? `Using system Python fallback: ${python.detail}`
          : `System Python fallback was not found: ${python.detail}`,
    action: python.available || hasAppBundle
      ? undefined
      : `Install Python 3 or create the overlay venv. ${venvSetupHint("services/desktop-overlay")}`
  };
}

function overlayImportCheck(): DoctorCheck {
  if (fs.existsSync(config.overlayAppExecutablePath)) {
    return {
      id: "overlay-imports",
      label: "Overlay Python packages",
      status: "ok",
      detail: "Packaged app bundle includes overlay runtime dependencies"
    };
  }

  const python = resolvePythonRuntime(config.overlayPythonPath);
  if (!python.available) {
    return {
      id: "overlay-imports",
      label: "Overlay Python packages",
      status: "error",
      detail: `Python was not found (${python.detail})`,
      action: `Install Python 3 or create the overlay venv. ${venvSetupHint("services/desktop-overlay")}`
    };
  }

  const result = spawnSync(
    python.command,
    [...python.argsPrefix, "-c", "import requests, tkinter, PIL, pynput, mss; print('ok')"],
    { encoding: "utf8", timeout: 7000, windowsHide: true }
  );

  if (result.status === 0) {
    return {
      id: "overlay-imports",
      label: "Overlay Python packages",
      status: "ok",
      detail: "requests, tkinter, Pillow, pynput, and mss import successfully"
    };
  }

  return {
    id: "overlay-imports",
    label: "Overlay Python packages",
    status: "error",
    detail: summarizeProcessFailure(result.stderr || result.stdout || result.error?.message || "Import check failed"),
    action: venvSetupHint("services/desktop-overlay")
  };
}

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

function macPermissionHint(): DoctorCheck {
  const permissionTarget = fs.existsSync(config.overlayAppExecutablePath)
    ? "Yomunami OCR Overlay.app"
    : "Terminal or Python";
  if (process.platform !== "darwin") {
    return {
      id: "screen-permissions",
      label: "Screen capture permissions",
      status: "ok",
      detail:
        process.platform === "win32"
          ? "Windows does not require macOS Screen Recording permissions for the overlay."
          : "No macOS Screen Recording permissions needed on this platform."
    };
  }

  return {
    id: "screen-permissions",
    label: "macOS screen permissions",
    status: "warn",
    detail: `macOS may require Accessibility and Screen Recording permissions for ${permissionTarget}.`,
    action: `Open System Settings > Privacy & Security and allow Accessibility and Screen Recording for ${permissionTarget}.`
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

function summarizeProcessFailure(output: string) {
  return (
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? "Import check failed"
  );
}
