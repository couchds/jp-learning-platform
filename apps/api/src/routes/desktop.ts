import fs from "node:fs";
import { spawn } from "node:child_process";
import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler, HttpError } from "../lib/http.js";

export const desktopRouter = Router();

desktopRouter.get(
  "/overlay/status",
  asyncHandler((_req, res) => {
    res.json({
      available: fs.existsSync(config.overlayScriptPath),
      scriptPath: config.overlayScriptPath,
      apiUrl: `http://${config.host}:${config.port}`
    });
  })
);

desktopRouter.post(
  "/overlay/launch",
  asyncHandler((_req, res) => {
    if (!fs.existsSync(config.overlayScriptPath)) {
      throw new HttpError(404, "Desktop overlay script is not installed");
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

    child.unref();
    res.status(202).json({
      launched: true,
      pid: child.pid,
      scriptPath: config.overlayScriptPath
    });
  })
);
