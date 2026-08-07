import fs from "node:fs/promises";
import { Router } from "express";
import { config } from "../config.js";
import { getDb, readJson, touchNow, writeJson } from "../db/index.js";
import { asyncHandler, HttpError, requestAbortSignal } from "../lib/http.js";
import { imageUpload, relativeUploadPath } from "../services/localUpload.js";
import { termsFromOcrElements, upsertResourceTerms } from "../services/ocrTerms.js";
import { postFile } from "../services/serviceProxy.js";
import { removeUploadedFile } from "../services/uploadLifecycle.js";

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
  "/image",
  imageUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing image file");
    }

    try {
      const result = await runOcr(req.file.path, req.file.originalname, req.file.mimetype, requestAbortSignal(req));
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
    if (!req.file) {
      throw new HttpError(400, "Missing image file");
    }
    try {
      const resourceId = Number(req.params.resourceId);
      const db = getDb();
      const resource = db.prepare("SELECT id FROM resources WHERE id = ?").get(resourceId);
      if (!resource) {
        throw new HttpError(404, "Resource not found");
      }

      const shouldOcr = req.query.ocr !== "false";
      const result = shouldOcr
        ? await runOcr(req.file.path, req.file.originalname, req.file.mimetype, requestAbortSignal(req))
        : { rawText: "", elements: [] };
      const now = touchNow();
      const persist = db.transaction(() => {
        const saved = db
          .prepare(
            `INSERT INTO resource_images
             (resource_id, file_path, original_name, mime_type, size_bytes, ocr_text, ocr_elements_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            resourceId,
            relativeUploadPath(req.file!.path),
            req.file!.originalname,
            req.file!.mimetype,
            req.file!.size,
            result.rawText,
            writeJson(result.elements),
            now
          );
        const suggestedTerms = termsFromOcrElements(result.elements).map((term) => ({
          ...term,
          sourceImageId: Number(saved.lastInsertRowid)
        }));
        const trackedTerms = req.query.track === "true" ? upsertResourceTerms(resourceId, suggestedTerms) : [];
        const image = db.prepare("SELECT * FROM resource_images WHERE id = ?").get(saved.lastInsertRowid);
        return { image, suggestedTerms, trackedTerms };
      });
      const saved = persist();

      res.status(201).json({
        image: mapImage(saved.image),
        ocr: { ...result, terms: saved.suggestedTerms },
        trackedTerms: saved.trackedTerms
      });
    } catch (error) {
      await removeUploadedFile(req.file.path);
      throw error;
    }
  })
);

async function runOcr(filePath: string, filename: string, mimeType: string, signal?: AbortSignal) {
  const response = await postFile<OcrResponse>(
    `${config.ocrServiceUrl}/ocr`,
    "image",
    filePath,
    filename,
    mimeType,
    {},
    { signal }
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
