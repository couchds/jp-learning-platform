import fsSync from "node:fs";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { Router } from "express";
import { config } from "../config.js";
import { getDb, readJson, touchNow, writeJson } from "../db/index.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { imageUpload, relativeUploadPath } from "../services/localUpload.js";
import { termsFromOcrElements, upsertResourceTerms } from "../services/ocrTerms.js";
import { postFile } from "../services/serviceProxy.js";
import { resolvePythonRuntime } from "../services/pythonRuntime.js";

type OcrResponse = {
  success?: boolean;
  raw_text?: string;
  rawText?: string;
  elements?: unknown[];
  backend?: string;
  active_backend?: string;
  boxes_available?: boolean;
  image_width?: number;
  image_height?: number;
  error?: string;
};

export const ocrRouter = Router();

const OCR_LAUNCH_COOLDOWN_MS = 10_000;
let lastOcrLaunch: { pid: number | undefined; launchedAt: number } | null = null;

ocrRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const health = await getOcrHealth();

    if (!health.reachable) {
      res.status(503).json({
        service: "ocr",
        url: config.ocrServiceUrl,
        available: false,
        error: health.error
      });
      return;
    }

    res.status(health.available ? 200 : 503).json({
      service: "ocr",
      url: config.ocrServiceUrl,
      available: health.available,
      health: health.payload,
      error: health.available ? undefined : health.reason
    });
  })
);

ocrRouter.post(
  "/service/launch",
  asyncHandler(async (_req, res) => {
    if (!fsSync.existsSync(config.ocrScriptPath)) {
      throw new HttpError(404, "OCR service script is not installed");
    }

    const currentHealth = await getOcrHealth();
    if (currentHealth.available || (currentHealth.reachable && currentHealth.expectedService)) {
      const python = resolvePythonRuntime(config.ocrPythonPath);
      res.status(currentHealth.available ? 200 : 202).json({
        launched: false,
        alreadyRunning: true,
        service: "ocr",
        url: config.ocrServiceUrl,
        python: python.label,
        pythonDetail: python.detail,
        health: currentHealth.payload,
        available: currentHealth.available,
        error: currentHealth.available ? undefined : currentHealth.reason
      });
      return;
    }

    const now = Date.now();
    if (lastOcrLaunch && now - lastOcrLaunch.launchedAt < OCR_LAUNCH_COOLDOWN_MS) {
      res.status(202).json({
        launched: false,
        alreadyRequested: true,
        pid: lastOcrLaunch.pid,
        service: "ocr",
        url: config.ocrServiceUrl
      });
      return;
    }

    const launchTarget = ocrLaunchTarget();
    const python = resolvePythonRuntime(config.ocrPythonPath);
    if (!python.available) {
      throw new HttpError(500, `Could not launch OCR service: Python was not found (${python.detail}).`);
    }

    const child = spawn(python.command, [...python.argsPrefix, config.ocrScriptPath], {
      cwd: config.ocrServiceRoot,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        OCR_HOST: launchTarget.hostname,
        OCR_PORT: launchTarget.port,
        OCR_BACKEND: process.env.OCR_BACKEND ?? "auto",
        HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET ?? (process.platform === "win32" ? "1" : undefined),
        LOCAL_ALLOWED_ORIGINS: config.allowedOrigins.join(",")
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
      }, 900);

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
        error instanceof Error ? `Could not launch OCR service: ${error.message}` : "Could not launch OCR service"
      );
    });

    child.on("error", (error) => {
      console.error(`OCR service process error: ${error.message}`);
    });
    child.unref();
    lastOcrLaunch = { pid: child.pid, launchedAt: now };

    res.status(202).json({
      launched: true,
      pid: child.pid,
      service: "ocr",
      url: config.ocrServiceUrl,
      python: python.label,
      pythonDetail: python.detail
    });
  })
);

ocrRouter.post(
  "/image",
  imageUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing image file");
    }

    try {
      const result = await runOcr(req.file.path, req.file.originalname, req.file.mimetype);
      res.json({
        ...result,
        terms: termsFromOcrElements(result.elements)
      });
    } finally {
      await fs.rm(req.file.path, { force: true });
    }
  })
);

ocrRouter.post(
  "/resources/:resourceId/images",
  imageUpload.single("image"),
  asyncHandler(async (req, res) => {
    const resourceId = Number(req.params.resourceId);
    const resource = getDb().prepare("SELECT id FROM resources WHERE id = ?").get(resourceId);

    if (!resource) {
      throw new HttpError(404, "Resource not found");
    }

    if (!req.file) {
      throw new HttpError(400, "Missing image file");
    }

    const shouldOcr = req.query.ocr !== "false";
    const result = shouldOcr
      ? await runOcr(req.file.path, req.file.originalname, req.file.mimetype)
      : { rawText: "", elements: [] };

    const now = touchNow();
    const saved = getDb()
      .prepare(
        `INSERT INTO resource_images
         (resource_id, file_path, original_name, mime_type, size_bytes, ocr_text, ocr_elements_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        resourceId,
        relativeUploadPath(req.file.path),
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        result.rawText,
        writeJson(result.elements),
        now
      );

    const image = getDb()
      .prepare("SELECT * FROM resource_images WHERE id = ?")
      .get(saved.lastInsertRowid);
    const suggestedTerms = termsFromOcrElements(result.elements).map((term) => ({
      ...term,
      sourceImageId: Number(saved.lastInsertRowid)
    }));
    const trackedTerms =
      req.query.track === "true" ? upsertResourceTerms(resourceId, suggestedTerms) : [];

    res.status(201).json({
      image: mapImage(image),
      ocr: {
        ...result,
        terms: suggestedTerms
      },
      trackedTerms
    });
  })
);

async function runOcr(filePath: string, filename: string, mimeType: string) {
  const response = await postFile<OcrResponse>(
    `${config.ocrServiceUrl}/ocr`,
    "image",
    filePath,
    filename,
    mimeType
  );

  if (response.success === false) {
    throw new HttpError(502, response.error ?? "OCR service failed", response);
  }

  return {
    rawText: response.rawText ?? response.raw_text ?? "",
    elements: response.elements ?? [],
    backend: response.backend,
    activeBackend: response.active_backend,
    boxesAvailable: response.boxes_available,
    imageWidth: response.image_width,
    imageHeight: response.image_height
  };
}

async function getOcrHealth(timeoutMs = 1500) {
  const healthUrl = `${config.ocrServiceUrl.replace(/\/$/, "")}/health`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    const payload = await safeJson(response);
    const expectedService = isExpectedOcrService(payload);
    return {
      reachable: true,
      available: response.ok && expectedService,
      status: response.status,
      payload,
      expectedService,
      reason: expectedService
        ? describeOcrHealthFailure(payload, response.status)
        : `Unexpected service response from ${healthUrl}`
    };
  } catch (error) {
    return {
      reachable: false,
      available: false,
      status: 0,
      payload: null,
      error:
        error instanceof Error && error.name === "AbortError"
          ? `Timed out connecting to ${healthUrl}`
          : `Not reachable at ${healthUrl}`
    };
  } finally {
    clearTimeout(timeout);
  }
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

function describeOcrHealthFailure(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "reason" in payload) {
    const reason = (payload as { reason?: unknown }).reason;
    if (typeof reason === "string") {
      return reason;
    }
  }
  return `OCR service returned HTTP ${status}`;
}

function isExpectedOcrService(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const health = payload as { service?: unknown; local_only?: unknown };
  return health.service === "ocr" && health.local_only === true;
}

function ocrLaunchTarget() {
  const url = new URL(config.ocrServiceUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new HttpError(400, "OCR_SERVICE_URL must point to localhost before it can be launched from the app");
  }

  return {
    hostname: url.hostname,
    port: url.port || "5100"
  };
}

function summarizeStartupError(stderr: string) {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.at(-1) ?? "";
}

function mapImage(row: unknown) {
  const image = row as {
    id: number;
    resource_id: number | null;
    file_path: string;
    original_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    ocr_text: string | null;
    ocr_elements_json: string;
    created_at: string;
    updated_at: string;
  };

  return {
    id: image.id,
    resourceId: image.resource_id,
    filePath: image.file_path,
    originalName: image.original_name,
    mimeType: image.mime_type,
    sizeBytes: image.size_bytes,
    ocrText: image.ocr_text,
    ocrElements: readJson<unknown[]>(image.ocr_elements_json, []),
    createdAt: image.created_at,
    updatedAt: image.updated_at
  };
}
