import fs from "node:fs";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler } from "../lib/http.js";

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
  const hasVenv = fs.existsSync(config.overlayPythonPath);
  return {
    id: "overlay-python",
    label: "Overlay Python runtime",
    status: hasVenv ? "ok" : "warn",
    detail: hasVenv ? "Using services/desktop-overlay/.venv" : "Falling back to system python3",
    action: hasVenv ? undefined : "Create the overlay venv and install services/desktop-overlay/requirements.txt."
  };
}

function overlayImportCheck(): DoctorCheck {
  const python = fs.existsSync(config.overlayPythonPath) ? config.overlayPythonPath : "python3";
  const result = spawnSync(
    python,
    ["-c", "import requests, tkinter, PIL, pynput, mss; print('ok')"],
    { encoding: "utf8", timeout: 7000 }
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
    action: "Run: cd services/desktop-overlay && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
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
  return {
    id: "mac-permissions",
    label: "macOS screen permissions",
    status: process.platform === "darwin" ? "warn" : "ok",
    detail:
      process.platform === "darwin"
        ? "macOS may require Accessibility and Screen Recording permissions for the Python or Terminal process."
        : "No macOS permissions needed on this platform.",
    action:
      process.platform === "darwin"
        ? "Open System Settings > Privacy & Security and allow Accessibility and Screen Recording for Terminal or Python."
        : undefined
  };
}

function serviceStartHint(service: string) {
  if (service === "ocr") {
    return "Start services/ocr/app.py after installing its requirements.";
  }
  if (service === "recognition") {
    return "Start services/recognize/app.py after installing its requirements.";
  }
  return "Start services/speech-model/api.py after installing its requirements.";
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
