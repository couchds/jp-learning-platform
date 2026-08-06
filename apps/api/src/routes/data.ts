import { Router } from "express";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../lib/http.js";
import { createBackup, listBackups, restoreBackup } from "../services/backups.js";
import { findOrphanUploads, removeOrphanUploads } from "../services/uploadLifecycle.js";

export const dataRouter = Router();

dataRouter.get(
  "/backups",
  asyncHandler(async (_req, res) => {
    res.json({ items: await listBackups() });
  })
);

dataRouter.post(
  "/backups",
  asyncHandler(async (_req, res) => {
    res.status(201).json({ backup: await createBackup() });
  })
);

dataRouter.post(
  "/backups/:name/restore",
  asyncHandler(async (req, res) => {
    res.json(await restoreBackup(String(req.params.name)));
  })
);

dataRouter.get(
  "/uploads/orphans",
  asyncHandler(async (_req, res) => {
    res.json({ items: await findOrphanUploads() });
  })
);

dataRouter.delete(
  "/uploads/orphans",
  asyncHandler(async (_req, res) => {
    const removed = await removeOrphanUploads();
    res.json({ removed, count: removed.length });
  })
);

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
