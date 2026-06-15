import { Router } from "express";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../lib/http.js";

export const dataRouter = Router();

dataRouter.get(
  "/summary",
  asyncHandler((_req, res) => {
    const db = getDb();
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
    const latest = db
      .prepare(
        `SELECT MAX(updated_at) AS updatedAt
         FROM (
           SELECT updated_at FROM kanji
           UNION ALL SELECT updated_at FROM dictionary_entries
           UNION ALL SELECT updated_at FROM sentence_examples
           UNION ALL SELECT updated_at FROM kanji_relations
         )`
      )
      .get() as { updatedAt: string | null };

    res.json({
      counts: {
        kanji: count("kanji"),
        words: count("dictionary_entries"),
        sentences: count("sentence_examples"),
        sentenceTerms: count("sentence_example_terms"),
        kanjiRelations: count("kanji_relations"),
        knowledgeItems: count("user_knowledge"),
        resources: count("resources")
      },
      latestUpdatedAt: latest.updatedAt
    });
  })
);
