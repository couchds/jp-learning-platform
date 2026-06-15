import fs from "node:fs";
import { spawn } from "node:child_process";
import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { resolvePythonRuntime } from "../services/pythonRuntime.js";

export const desktopRouter = Router();

const OVERLAY_LAUNCH_COOLDOWN_MS = 10_000;
let lastOverlayLaunch: { pid: number | undefined; launchedAt: number } | null = null;

type OverlayLaunchTarget = {
  command: string;
  args: string[];
  label: "app-bundle" | "python";
  detail: string;
  pythonLabel?: "venv" | "system";
};

desktopRouter.get(
  "/overlay/status",
  asyncHandler((req, res) => {
    const webUrl = req.get("origin") ?? config.webAppUrl;
    const launchTarget = overlayLaunchTarget();
    const hasScript = fs.existsSync(config.overlayScriptPath);
    const hasAppBundle = fs.existsSync(config.overlayAppExecutablePath);
    res.json({
      available: hasScript || hasAppBundle,
      overlay: "desktop-overlay",
      appBundle: hasAppBundle ? "installed" : "missing",
      platform: process.platform,
      launchTarget: launchTarget.label,
      launchTargetDetail: launchTarget.detail,
      python: launchTarget.pythonLabel ?? (fs.existsSync(config.overlayPythonPath) ? "venv" : "system"),
      pythonDetail: launchTarget.label === "python" ? launchTarget.detail : undefined,
      apiUrl: `http://${config.host}:${config.port}`,
      webUrl
    });
  })
);

desktopRouter.post(
  "/overlay/launch",
  asyncHandler(async (req, res) => {
    if (!fs.existsSync(config.overlayScriptPath) && !fs.existsSync(config.overlayAppExecutablePath)) {
      throw new HttpError(404, "Desktop overlay is not installed");
    }

    const now = Date.now();
    if (lastOverlayLaunch && now - lastOverlayLaunch.launchedAt < OVERLAY_LAUNCH_COOLDOWN_MS) {
      res.status(202).json({
        launched: false,
        alreadyRequested: true,
        pid: lastOverlayLaunch.pid,
        overlay: "desktop-overlay",
        webUrl: req.get("origin") ?? config.webAppUrl
      });
      return;
    }

    const launchTarget = overlayLaunchTarget();
    const python = resolvePythonRuntime(config.overlayPythonPath);
    if (launchTarget.label === "python" && launchTarget.pythonLabel === "system" && !python.available) {
      throw new HttpError(500, `Could not launch desktop overlay: Python was not found (${launchTarget.detail}).`);
    }

    const webUrl = req.get("origin") ?? config.webAppUrl;
    const child = spawn(launchTarget.command, launchTarget.args, {
      cwd: config.repoRoot,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        YOMUNAMI_API_URL: `http://${config.host}:${config.port}`,
        YOMUNAMI_WEB_URL: webUrl
      }
    });

    const startupErrors: string[] = [];
    const appendStartupError = (chunk: Buffer | string) => {
      startupErrors.push(String(chunk));
      if (startupErrors.join("").length > 4096) {
        startupErrors.splice(0, startupErrors.length - 1);
      }
    };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, 600);

      function cleanup() {
        clearTimeout(timer);
        child.off("error", onError);
        child.off("exit", onExit);
        child.stderr?.off("data", appendStartupError);
        (child.stderr as (typeof child.stderr & { unref?: () => void }) | null)?.unref?.();
      }

      function onError(error: Error) {
        cleanup();
        reject(error);
      }

      function onExit(code: number | null, signal: NodeJS.Signals | null) {
        cleanup();
        const detail = summarizeStartupError(startupErrors.join(""));
        reject(
          new Error(
            `process exited during startup with ${signal ?? `code ${code ?? "unknown"}`}${
              detail ? `: ${detail}` : ""
            }`
          )
        );
      }

      child.stderr?.on("data", appendStartupError);
      child.once("error", onError);
      child.once("exit", onExit);
    }).catch((error: unknown) => {
      throw new HttpError(
        500,
        error instanceof Error ? `Could not launch desktop overlay: ${error.message}` : "Could not launch desktop overlay"
      );
    });

    child.on("error", (error) => {
      console.error(`Desktop overlay process error: ${error.message}`);
    });
    child.unref();
    lastOverlayLaunch = { pid: child.pid, launchedAt: now };
    res.status(202).json({
      launched: true,
      pid: child.pid,
      overlay: "desktop-overlay",
      launchTarget: launchTarget.label,
      launchTargetDetail: launchTarget.detail,
      python: launchTarget.pythonLabel ?? (fs.existsSync(config.overlayPythonPath) ? "venv" : "system"),
      pythonDetail: launchTarget.label === "python" ? launchTarget.detail : undefined,
      webUrl
    });
  })
);

function summarizeStartupError(stderr: string) {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.at(-1) ?? "";
}

function overlayLaunchTarget(): OverlayLaunchTarget {
  if (process.platform === "darwin" && fs.existsSync(config.overlayAppExecutablePath)) {
    return {
      command: config.overlayAppExecutablePath,
      args: [],
      label: "app-bundle",
      detail: config.overlayAppPath
    };
  }

  const python = resolvePythonRuntime(config.overlayPythonPath);
  return {
    command: python.command,
    args: [...python.argsPrefix, config.overlayScriptPath],
    label: "python",
    detail: python.detail,
    pythonLabel: python.label
  };
}
