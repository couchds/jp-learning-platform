import { Router } from "express";
import { z } from "zod";
import { getDb, readJson, touchNow, writeJson } from "../db/index.js";
import { mapKanji, type KanjiRow, mapResource, type ResourceRow, mapWordSummary, type WordSummaryRow } from "../db/mappers.js";
import { asyncHandler, HttpError, parseLimitOffset } from "../lib/http.js";

const resourceSchema = z.object({
  name: z.string().trim().min(1).max(500),
  type: z.string().trim().min(1).max(80),
  status: z.string().trim().min(1).max(80).default("not_started"),
  description: z.string().trim().max(5000).nullable().optional(),
  coverImagePath: z.string().trim().max(1000).nullable().optional(),
  difficultyLevel: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).default([])
});

const linkSchema = z.object({
  frequency: z.number().int().min(0).default(0),
  notes: z.string().trim().max(2000).nullable().optional()
});

const customVocabularySchema = linkSchema.extend({
  word: z.string().trim().min(1).max(255),
  reading: z.string().trim().max(255).nullable().optional(),
  meaning: z.string().trim().max(2000).nullable().optional()
});

export const resourcesRouter = Router();

resourcesRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { limit, offset } = parseLimitOffset(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (req.query.status) {
      clauses.push("status = ?");
      params.push(String(req.query.status));
    }

    if (req.query.type) {
      clauses.push("type = ?");
      params.push(String(req.query.type));
    }

    if (req.query.search) {
      const search = `%${String(req.query.search)}%`;
      clauses.push("(name LIKE ? OR description LIKE ? OR tags_json LIKE ?)");
      params.push(search, search, search);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = getDb()
      .prepare(`SELECT * FROM resources ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as ResourceRow[];
    const total = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM resources ${where}`)
      .get(...params) as { count: number };

    res.json({
      items: rows.map(mapResource),
      page: { limit, offset, total: total.count }
    });
  })
);

resourcesRouter.post(
  "/",
  asyncHandler((req, res) => {
    const body = resourceSchema.parse(req.body);
    const result = getDb()
      .prepare(
        `INSERT INTO resources
         (name, type, status, description, cover_image_path, difficulty_level, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.name,
        body.type,
        body.status,
        body.description ?? null,
        body.coverImagePath ?? null,
        body.difficultyLevel ?? null,
        writeJson(body.tags)
      );

    const row = getDb().prepare("SELECT * FROM resources WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ resource: mapResource(row as ResourceRow) });
  })
);

resourcesRouter.get(
  "/:id",
  asyncHandler((req, res) => {
    const id = Number(req.params.id);
    const resource = getResourceOrThrow(id);

    const kanji = getDb()
      .prepare(
        `SELECT k.*, rk.frequency, rk.notes
         FROM resource_kanji rk
         JOIN kanji k ON k.id = rk.kanji_id
         WHERE rk.resource_id = ?
         ORDER BY rk.frequency DESC, k.literal`
      )
      .all(id) as Array<KanjiRow & { frequency: number; notes: string | null }>;

    const words = getDb()
      .prepare(
        `SELECT
          d.id,
          d.entry_id,
          GROUP_CONCAT(ek.kanji, '|||') AS kanji_forms,
          GROUP_CONCAT(er.reading, '|||') AS readings,
          GROUP_CONCAT(sg.gloss, '|||') AS glosses,
          GROUP_CONCAT(es.parts_of_speech_json, '|||') AS parts_of_speech,
          rw.frequency,
          rw.notes
         FROM resource_words rw
         JOIN dictionary_entries d ON d.id = rw.entry_id
         LEFT JOIN entry_kanji ek ON ek.entry_id = d.id
         LEFT JOIN entry_readings er ON er.entry_id = d.id
         LEFT JOIN entry_senses es ON es.entry_id = d.id
         LEFT JOIN sense_glosses sg ON sg.sense_id = es.id
         WHERE rw.resource_id = ?
         GROUP BY d.id
         ORDER BY rw.frequency DESC, d.entry_id`
      )
      .all(id) as Array<WordSummaryRow & { frequency: number; notes: string | null }>;

    const customVocabulary = getDb()
      .prepare("SELECT * FROM custom_vocabulary WHERE resource_id = ? ORDER BY frequency DESC, word")
      .all(id);

    const images = getDb()
      .prepare("SELECT * FROM resource_images WHERE resource_id = ? ORDER BY created_at DESC")
      .all(id)
      .map(mapResourceImage);

    res.json({
      resource,
      kanji: kanji.map((row) => ({
        ...mapKanji(row),
        resource: { frequency: row.frequency, notes: row.notes }
      })),
      words: words.map((row) => ({
        ...mapWordSummary(row),
        resource: { frequency: row.frequency, notes: row.notes }
      })),
      customVocabulary,
      images
    });
  })
);

resourcesRouter.put(
  "/:id",
  asyncHandler((req, res) => {
    const id = Number(req.params.id);
    getResourceOrThrow(id);
    const body = resourceSchema.partial().parse(req.body);
    const current = getResourceOrThrow(id);
    const updated = { ...current, ...body };
    const updatedAt = touchNow();

    getDb()
      .prepare(
        `UPDATE resources
         SET name = ?, type = ?, status = ?, description = ?, cover_image_path = ?,
             difficulty_level = ?, tags_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        updated.name,
        updated.type,
        updated.status,
        updated.description ?? null,
        updated.coverImagePath ?? null,
        updated.difficultyLevel ?? null,
        writeJson(updated.tags),
        updatedAt,
        id
      );

    res.json({ resource: getResourceOrThrow(id) });
  })
);

resourcesRouter.delete(
  "/:id",
  asyncHandler((req, res) => {
    const id = Number(req.params.id);
    getResourceOrThrow(id);
    getDb().prepare("DELETE FROM resources WHERE id = ?").run(id);
    res.status(204).send();
  })
);

resourcesRouter.post(
  "/:id/kanji/:kanjiId",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    const kanjiId = Number(req.params.kanjiId);
    getResourceOrThrow(resourceId);
    ensureExists("kanji", kanjiId, "Kanji not found");
    const body = linkSchema.parse(req.body);
    const now = touchNow();

    getDb()
      .prepare(
        `INSERT INTO resource_kanji (resource_id, kanji_id, frequency, notes, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(resource_id, kanji_id) DO UPDATE SET
           frequency = excluded.frequency,
           notes = excluded.notes,
           updated_at = excluded.updated_at`
      )
      .run(resourceId, kanjiId, body.frequency, body.notes ?? null, now);

    res.status(204).send();
  })
);

resourcesRouter.post(
  "/:id/words/:wordId",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    const wordId = Number(req.params.wordId);
    getResourceOrThrow(resourceId);
    ensureExists("dictionary_entries", wordId, "Word not found");
    const body = linkSchema.parse(req.body);
    const now = touchNow();

    getDb()
      .prepare(
        `INSERT INTO resource_words (resource_id, entry_id, frequency, notes, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(resource_id, entry_id) DO UPDATE SET
           frequency = excluded.frequency,
           notes = excluded.notes,
           updated_at = excluded.updated_at`
      )
      .run(resourceId, wordId, body.frequency, body.notes ?? null, now);

    res.status(204).send();
  })
);

resourcesRouter.post(
  "/:id/custom-vocabulary",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    getResourceOrThrow(resourceId);
    const body = customVocabularySchema.parse(req.body);
    const now = touchNow();

    getDb()
      .prepare(
        `INSERT INTO custom_vocabulary
         (resource_id, word, reading, meaning, frequency, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(resource_id, word) DO UPDATE SET
           reading = excluded.reading,
           meaning = excluded.meaning,
           frequency = excluded.frequency,
           notes = excluded.notes,
           updated_at = excluded.updated_at`
      )
      .run(
        resourceId,
        body.word,
        body.reading ?? null,
        body.meaning ?? null,
        body.frequency,
        body.notes ?? null,
        now
      );

    res.status(204).send();
  })
);

function getResourceOrThrow(id: number) {
  const row = getDb().prepare("SELECT * FROM resources WHERE id = ?").get(id) as ResourceRow | undefined;
  if (!row) {
    throw new HttpError(404, "Resource not found");
  }

  return mapResource(row);
}

function ensureExists(table: "kanji" | "dictionary_entries", id: number, message: string) {
  const row = getDb().prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
  if (!row) {
    throw new HttpError(404, message);
  }
}

function mapResourceImage(row: unknown) {
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
