import fs from "node:fs";
import { spawn } from "node:child_process";
import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler, HttpError } from "../lib/http.js";

export const desktopRouter = Router();

const OVERLAY_LAUNCH_COOLDOWN_MS = 10_000;
let lastOverlayLaunch: { pid: number | undefined; launchedAt: number } | null = null;

desktopRouter.get(
  "/overlay/status",
  asyncHandler((req, res) => {
    const webUrl = req.get("origin") ?? config.webAppUrl;
    res.json({
      available: fs.existsSync(config.overlayScriptPath),
      overlay: "desktop-overlay",
      python: fs.existsSync(config.overlayPythonPath) ? "venv" : "system",
      apiUrl: `http://${config.host}:${config.port}`,
      webUrl
    });
  })
);

desktopRouter.post(
  "/overlay/launch",
  asyncHandler(async (req, res) => {
    if (!fs.existsSync(config.overlayScriptPath)) {
      throw new HttpError(404, "Desktop overlay script is not installed");
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

    const pythonCommand = fs.existsSync(config.overlayPythonPath) ? config.overlayPythonPath : "python3";
    const webUrl = req.get("origin") ?? config.webAppUrl;
    const child = spawn(pythonCommand, [config.overlayScriptPath], {
      cwd: config.repoRoot,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
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
      python: fs.existsSync(config.overlayPythonPath) ? "venv" : "system",
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
