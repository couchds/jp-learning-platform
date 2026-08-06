import { Router } from "express";
import { config } from "../config.js";
import { getDb, touchNow } from "../db/index.js";
import { asyncHandler, HttpError, requestAbortSignal } from "../lib/http.js";
import { audioUpload, relativeUploadPath } from "../services/localUpload.js";
import { getJson, postFile, postJson } from "../services/serviceProxy.js";
import { removeUploadedFile, stageUploadedFiles } from "../services/uploadLifecycle.js";

export const speechRouter = Router();

speechRouter.get(
  "/health",
  asyncHandler(async (req, res) => {
    try {
      const health = await getJson<unknown>(`${config.speechServiceUrl}/health`, { signal: requestAbortSignal(req) });
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
  asyncHandler(async (req, res) => {
    const info = await getJson<unknown>(`${config.speechServiceUrl}/info`, { signal: requestAbortSignal(req) });
    res.json(info);
  })
);

speechRouter.post(
  "/export-data",
  asyncHandler(async (req, res) => {
    const result = await postJson<unknown>(`${config.speechServiceUrl}/export-data`, req.body, { signal: requestAbortSignal(req) });
    res.json(result);
  })
);

speechRouter.post(
  "/train",
  asyncHandler(async (req, res) => {
    const result = await postJson<unknown>(`${config.speechServiceUrl}/train`, req.body, { signal: requestAbortSignal(req) });
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

    try {
      const result = await postFile<unknown>(
        `${config.speechServiceUrl}/predict`,
        "audio",
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        { top_k: String(req.body.top_k ?? "5") },
        { signal: requestAbortSignal(req) }
      );
      res.json(result);
    } finally {
      await removeUploadedFile(req.file.path);
    }
  })
);

speechRouter.post(
  "/recordings",
  audioUpload.single("audio"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing audio file");
    }

    try {
      const entryId = req.body.entryId ? Number(req.body.entryId) : null;
      const durationMs = req.body.durationMs ? Number(req.body.durationMs) : null;
      if ((entryId !== null && (!Number.isInteger(entryId) || entryId <= 0)) ||
          (durationMs !== null && (!Number.isFinite(durationMs) || durationMs < 0))) {
        throw new HttpError(400, "Invalid recording metadata");
      }

      const now = touchNow();
      const db = getDb();
      const result = db
        .prepare(
          `INSERT INTO pronunciation_recordings
           (entry_id, word, audio_path, duration_ms, is_reference, notes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entryId,
          req.body.word ?? null,
          relativeUploadPath(req.file.path),
          durationMs,
          req.body.isReference === "true" ? 1 : 0,
          req.body.notes ?? null,
          now
        );
      const recording = db.prepare("SELECT * FROM pronunciation_recordings WHERE id = ?").get(result.lastInsertRowid);
      res.status(201).json({ recording });
    } catch (error) {
      await removeUploadedFile(req.file.path);
      throw error;
    }
  })
);

speechRouter.delete(
  "/recordings/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const db = getDb();
    const recording = db.prepare("SELECT audio_path FROM pronunciation_recordings WHERE id = ?").get(id) as { audio_path: string } | undefined;
    if (!recording) throw new HttpError(404, "Recording not found");
    const staged = await stageUploadedFiles([recording.audio_path]);
    try {
      db.prepare("DELETE FROM pronunciation_recordings WHERE id = ?").run(id);
      await staged.commit();
    } catch (error) {
      await staged.rollback();
      throw error;
    }
    res.status(204).send();
  })
);
