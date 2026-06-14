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
  asyncHandler((_req, res) => {
    res.json({
      available: fs.existsSync(config.overlayScriptPath),
      overlay: "desktop-overlay",
      apiUrl: `http://${config.host}:${config.port}`
    });
  })
);

desktopRouter.post(
  "/overlay/launch",
  asyncHandler(async (_req, res) => {
    if (!fs.existsSync(config.overlayScriptPath)) {
      throw new HttpError(404, "Desktop overlay script is not installed");
    }

    const now = Date.now();
    if (lastOverlayLaunch && now - lastOverlayLaunch.launchedAt < OVERLAY_LAUNCH_COOLDOWN_MS) {
      res.status(202).json({
        launched: false,
        alreadyRequested: true,
        pid: lastOverlayLaunch.pid,
        overlay: "desktop-overlay"
      });
      return;
    }

    const child = spawn("python3", [config.overlayScriptPath], {
      cwd: config.repoRoot,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        YOMUNAMI_API_URL: `http://${config.host}:${config.port}`
      }
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.off("exit", onExit);
        resolve();
      }, 600);

      function onError(error: Error) {
        clearTimeout(timer);
        child.off("exit", onExit);
        reject(error);
      }

      function onExit(code: number | null, signal: NodeJS.Signals | null) {
        clearTimeout(timer);
        child.off("error", onError);
        reject(new Error(`process exited during startup with ${signal ?? `code ${code ?? "unknown"}`}`));
      }

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
      overlay: "desktop-overlay"
    });
  })
);
