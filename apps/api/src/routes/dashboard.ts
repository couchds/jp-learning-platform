import { Router } from "express";
import { getDb } from "../db/index.js";
import { asyncHandler } from "../lib/http.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/",
  asyncHandler((_req, res) => {
    const db = getDb();
    const counts = {
      resources: count("resources"),
      kanji: count("kanji"),
      words: count("dictionary_entries"),
      images: count("resource_images"),
      pronunciationRecordings: count("pronunciation_recordings"),
      dueReviews: (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM user_knowledge WHERE next_review_at IS NOT NULL AND next_review_at <= CURRENT_TIMESTAMP"
          )
          .get() as { count: number }
      ).count
    };

    const recentResources = db
      .prepare("SELECT id, name, type, status, updated_at FROM resources ORDER BY updated_at DESC LIMIT 5")
      .all();

    res.json({
      counts,
      recentResources
    });
  })
);

function count(table: string) {
  return (getDb().prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}
