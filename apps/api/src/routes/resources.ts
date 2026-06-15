import { Router } from "express";
import { z } from "zod";
import { getDb, readJson, touchNow, writeJson } from "../db/index.js";
import {
  mapKanji,
  type KanjiRow,
  mapResource,
  type ResourceRow,
  mapResourceTerm,
  type ResourceTermRow,
  mapWordSummary,
  type WordSummaryRow
} from "../db/mappers.js";
import { asyncHandler, HttpError, parseLimitOffset } from "../lib/http.js";
import { type SuggestedTerm, upsertResourceTerms } from "../services/ocrTerms.js";

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

const resourceTermSchema = z.object({
  termType: z.enum(["kanji", "word", "phrase", "kana", "unknown"]),
  text: z.string().trim().min(1).max(255),
  reading: z.string().trim().max(255).nullable().optional(),
  meaning: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().max(80).default("manual"),
  sourceImageId: z.number().int().positive().nullable().optional(),
  frequency: z.number().int().min(1).default(1),
  notes: z.string().trim().max(2000).nullable().optional()
});

const bulkTermsSchema = z.object({
  terms: z.array(resourceTermSchema).min(1).max(200)
});

const quizSessionSchema = z.object({
  mode: z.string().trim().min(1).max(80).default("resource"),
  answers: z.array(
    z.object({
      prompt: z.string().trim().min(1).max(1000),
      answer: z.string().trim().max(1000).nullable().optional(),
      expectedAnswer: z.string().trim().max(1000).nullable().optional(),
      correct: z.boolean(),
      sourceType: z.string().trim().max(80).nullable().optional(),
      sourceKey: z.string().trim().max(255).nullable().optional()
    })
  )
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
    const terms = getDb()
      .prepare("SELECT * FROM resource_terms WHERE resource_id = ? ORDER BY frequency DESC, updated_at DESC")
      .all(id) as ResourceTermRow[];

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
      terms: terms.map(mapResourceTerm),
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

resourcesRouter.get(
  "/:id/terms",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    getResourceOrThrow(resourceId);
    const { limit, offset } = parseLimitOffset(req.query);
    const rows = getDb()
      .prepare(
        `SELECT * FROM resource_terms
         WHERE resource_id = ?
         ORDER BY frequency DESC, updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(resourceId, limit, offset) as ResourceTermRow[];
    const total = getDb()
      .prepare("SELECT COUNT(*) AS count FROM resource_terms WHERE resource_id = ?")
      .get(resourceId) as { count: number };

    res.json({
      items: rows.map(mapResourceTerm),
      page: { limit, offset, total: total.count }
    });
  })
);

resourcesRouter.post(
  "/:id/terms",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    getResourceOrThrow(resourceId);
    const term = resourceTermSchema.parse(req.body);
    validateTermImageSources(resourceId, [term]);
    const terms = upsertResourceTerms(resourceId, [term]);
    res.status(201).json({ terms });
  })
);

resourcesRouter.post(
  "/:id/terms/bulk",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    getResourceOrThrow(resourceId);
    const body = bulkTermsSchema.parse(req.body);
    validateTermImageSources(resourceId, body.terms);
    const terms = upsertResourceTerms(resourceId, body.terms);
    res.status(201).json({ terms });
  })
);

resourcesRouter.get(
  "/:id/quiz/deck",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    getResourceOrThrow(resourceId);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 50);

    const terms = getDb()
      .prepare(
        `SELECT id, term_type, text, reading, meaning, frequency
         FROM resource_terms
         WHERE resource_id = ?
         ORDER BY updated_at DESC, frequency DESC
         LIMIT ?`
      )
      .all(resourceId, limit) as Array<{
        id: number;
        term_type: string;
        text: string;
        reading: string | null;
        meaning: string | null;
        frequency: number;
      }>;

    const customVocabulary = getDb()
      .prepare(
        `SELECT id, word, reading, meaning, frequency
         FROM custom_vocabulary
         WHERE resource_id = ?
         ORDER BY updated_at DESC, frequency DESC
         LIMIT ?`
      )
      .all(resourceId, limit) as Array<{
        id: number;
        word: string;
        reading: string | null;
        meaning: string | null;
        frequency: number;
      }>;

    const dictionaryWords = getDb()
      .prepare(
        `SELECT
          d.id,
          d.entry_id,
          GROUP_CONCAT(ek.kanji, '|||') AS kanji_forms,
          GROUP_CONCAT(er.reading, '|||') AS readings,
          GROUP_CONCAT(sg.gloss, '|||') AS glosses,
          GROUP_CONCAT(es.parts_of_speech_json, '|||') AS parts_of_speech,
          rw.frequency
         FROM resource_words rw
         JOIN dictionary_entries d ON d.id = rw.entry_id
         LEFT JOIN entry_kanji ek ON ek.entry_id = d.id
         LEFT JOIN entry_readings er ON er.entry_id = d.id
         LEFT JOIN entry_senses es ON es.entry_id = d.id
         LEFT JOIN sense_glosses sg ON sg.sense_id = es.id
         WHERE rw.resource_id = ?
         GROUP BY d.id
         ORDER BY rw.updated_at DESC, rw.frequency DESC
         LIMIT ?`
      )
      .all(resourceId, limit) as Array<WordSummaryRow & { frequency: number }>;

    const questions = [
      ...terms.map((term) => ({
        id: `term:${term.id}`,
        sourceType: term.term_type,
        sourceKey: term.text,
        prompt: term.text,
        expectedAnswer: term.meaning || term.reading || term.text,
        promptType: term.term_type,
        frequency: term.frequency
      })),
      ...dictionaryWords.map((row) => {
        const word = mapWordSummary(row);
        const prompt = word.kanjiForms[0] ?? word.readings[0] ?? `#${word.entryId}`;
        return {
          id: `dictionary:${word.id}`,
          sourceType: "word",
          sourceKey: prompt,
          prompt,
          expectedAnswer: word.glosses.slice(0, 2).join("; ") || word.readings[0] || prompt,
          promptType: "word",
          frequency: row.frequency
        };
      }),
      ...customVocabulary.map((term) => ({
        id: `custom:${term.id}`,
        sourceType: "custom_vocabulary",
        sourceKey: term.word,
        prompt: term.word,
        expectedAnswer: term.meaning || term.reading || term.word,
        promptType: "word",
        frequency: term.frequency
      }))
    ]
      .filter((question) => question.expectedAnswer)
      .slice(0, limit);

    res.json({ questions });
  })
);

resourcesRouter.post(
  "/:id/quiz/sessions",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    getResourceOrThrow(resourceId);
    const body = quizSessionSchema.parse(req.body);
    const correct = body.answers.filter((answer) => answer.correct).length;
    const now = touchNow();
    const db = getDb();

    const createSession = db.transaction(() => {
      const session = db
        .prepare(
          `INSERT INTO quiz_sessions
           (resource_id, mode, status, total_questions, correct_answers, completed_at)
           VALUES (?, ?, 'completed', ?, ?, ?)`
        )
        .run(resourceId, body.mode, body.answers.length, correct, now);

      const answerStatement = db.prepare(
        `INSERT INTO quiz_answers
         (session_id, prompt, answer, expected_answer, correct, source_type, source_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const answer of body.answers) {
        answerStatement.run(
          session.lastInsertRowid,
          answer.prompt,
          answer.answer ?? null,
          answer.expectedAnswer ?? null,
          answer.correct ? 1 : 0,
          answer.sourceType ?? null,
          answer.sourceKey ?? null
        );
      }

      return session.lastInsertRowid;
    });

    const sessionId = createSession();
    const session = db.prepare("SELECT * FROM quiz_sessions WHERE id = ?").get(sessionId);
    res.status(201).json({ session });
  })
);

resourcesRouter.get(
  "/:id/quiz/sessions",
  asyncHandler((req, res) => {
    const resourceId = Number(req.params.id);
    getResourceOrThrow(resourceId);
    const { limit, offset } = parseLimitOffset(req.query);
    const sessions = getDb()
      .prepare(
        `SELECT * FROM quiz_sessions
         WHERE resource_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(resourceId, limit, offset);
    const total = getDb()
      .prepare("SELECT COUNT(*) AS count FROM quiz_sessions WHERE resource_id = ?")
      .get(resourceId) as { count: number };

    res.json({ items: sessions, page: { limit, offset, total: total.count } });
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

function validateTermImageSources(resourceId: number, terms: Pick<SuggestedTerm, "sourceImageId">[]) {
  const imageIds = Array.from(
    new Set(terms.map((term) => term.sourceImageId).filter((id): id is number => Number.isInteger(id)))
  );

  if (imageIds.length === 0) {
    return;
  }

  const placeholders = imageIds.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(`SELECT id FROM resource_images WHERE resource_id = ? AND id IN (${placeholders})`)
    .all(resourceId, ...imageIds) as Array<{ id: number }>;

  if (rows.length !== imageIds.length) {
    throw new HttpError(400, "sourceImageId must belong to the target resource");
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
