import { Router } from "express";
import { config } from "../config.js";
import { getDb, touchNow } from "../db/index.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { audioUpload, relativeUploadPath } from "../services/localUpload.js";
import { getJson, postFile, postJson } from "../services/serviceProxy.js";

export const speechRouter = Router();

speechRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    try {
      const health = await getJson<unknown>(`${config.speechServiceUrl}/health`);
      res.json({ service: "speech", url: config.speechServiceUrl, health });
    } catch (error) {
      res.status(503).json({
        service: "speech",
        url: config.speechServiceUrl,
        available: false,
        error: error instanceof Error ? error.message : "Speech service unavailable"
      });
    }
  })
);

speechRouter.get(
  "/info",
  asyncHandler(async (_req, res) => {
    const info = await getJson<unknown>(`${config.speechServiceUrl}/info`);
    res.json(info);
  })
);

speechRouter.post(
  "/export-data",
  asyncHandler(async (req, res) => {
    const result = await postJson<unknown>(`${config.speechServiceUrl}/export-data`, req.body);
    res.json(result);
  })
);

speechRouter.post(
  "/train",
  asyncHandler(async (req, res) => {
    const result = await postJson<unknown>(`${config.speechServiceUrl}/train`, req.body);
    res.json(result);
  })
);

speechRouter.post(
  "/predict",
  audioUpload.single("audio"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing audio file");
    }

    const result = await postFile<unknown>(
      `${config.speechServiceUrl}/predict`,
      "audio",
      req.file.path,
      req.file.originalname,
      req.file.mimetype,
      { top_k: String(req.body.top_k ?? "5") }
    );

    res.json(result);
  })
);

speechRouter.post(
  "/recordings",
  audioUpload.single("audio"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing audio file");
    }

    const now = touchNow();
    const result = getDb()
      .prepare(
        `INSERT INTO pronunciation_recordings
         (entry_id, word, audio_path, duration_ms, is_reference, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.body.entryId ? Number(req.body.entryId) : null,
        req.body.word ?? null,
        relativeUploadPath(req.file.path),
        req.body.durationMs ? Number(req.body.durationMs) : null,
        req.body.isReference === "true" ? 1 : 0,
        req.body.notes ?? null,
        now
      );

    const recording = getDb()
      .prepare("SELECT * FROM pronunciation_recordings WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json({ recording });
  })
);
