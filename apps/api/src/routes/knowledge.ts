import { Router } from "express";
import { z } from "zod";
import { getDb, touchNow } from "../db/index.js";
import { asyncHandler } from "../lib/http.js";

const knowledgeSchema = z.object({
  itemType: z.enum(["kanji", "word", "custom_vocabulary"]),
  itemKey: z.string().trim().min(1).max(255),
  stage: z.number().int().min(0).max(12).default(0),
  lastSeenAt: z.string().datetime().nullable().optional(),
  nextReviewAt: z.string().datetime().nullable().optional(),
  lapses: z.number().int().min(0).default(0),
  notes: z.string().trim().max(2000).nullable().optional()
});

export const knowledgeRouter = Router();

knowledgeRouter.get(
  "/",
  asyncHandler((req, res) => {
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (req.query.itemType) {
      clauses.push("item_type = ?");
      params.push(String(req.query.itemType));
    }

    if (req.query.due === "true") {
      clauses.push("next_review_at IS NOT NULL AND next_review_at <= CURRENT_TIMESTAMP");
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = getDb()
      .prepare(`SELECT * FROM user_knowledge ${where} ORDER BY COALESCE(next_review_at, updated_at) ASC`)
      .all(...params);

    res.json({ items: rows });
  })
);

knowledgeRouter.put(
  "/",
  asyncHandler((req, res) => {
    const body = knowledgeSchema.parse(req.body);
    const now = touchNow();

    getDb()
      .prepare(
        `INSERT INTO user_knowledge
         (item_type, item_key, stage, last_seen_at, next_review_at, lapses, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(item_type, item_key) DO UPDATE SET
           stage = excluded.stage,
           last_seen_at = excluded.last_seen_at,
           next_review_at = excluded.next_review_at,
           lapses = excluded.lapses,
           notes = excluded.notes,
           updated_at = excluded.updated_at`
      )
      .run(
        body.itemType,
        body.itemKey,
        body.stage,
        body.lastSeenAt ?? null,
        body.nextReviewAt ?? null,
        body.lapses,
        body.notes ?? null,
        now
      );

    const item = getDb()
      .prepare("SELECT * FROM user_knowledge WHERE item_type = ? AND item_key = ?")
      .get(body.itemType, body.itemKey);

    res.json({ item });
  })
);
