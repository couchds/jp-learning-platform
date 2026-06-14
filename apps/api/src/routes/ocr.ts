import { Router } from "express";
import { config } from "../config.js";
import { getDb, readJson, touchNow, writeJson } from "../db/index.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { imageUpload, relativeUploadPath } from "../services/localUpload.js";
import { getJson, postFile } from "../services/serviceProxy.js";

type OcrResponse = {
  success?: boolean;
  raw_text?: string;
  rawText?: string;
  elements?: unknown[];
  error?: string;
};

export const ocrRouter = Router();

ocrRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    try {
      const health = await getJson<unknown>(`${config.ocrServiceUrl}/health`);
      res.json({ service: "ocr", url: config.ocrServiceUrl, health });
    } catch (error) {
      res.status(503).json({
        service: "ocr",
        url: config.ocrServiceUrl,
        available: false,
        error: error instanceof Error ? error.message : "OCR service unavailable"
      });
    }
  })
);

ocrRouter.post(
  "/image",
  imageUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing image file");
    }

    const result = await runOcr(req.file.path, req.file.originalname, req.file.mimetype);
    res.json(result);
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

    res.status(201).json({
      image: mapImage(image),
      ocr: result
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
    elements: response.elements ?? []
  };
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
