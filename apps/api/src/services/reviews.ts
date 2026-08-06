import type Database from "better-sqlite3";
import type { KnowledgeItemType } from "./knowledge.js";

const reviewIntervalsDays = [1, 3, 7, 14, 30, 60, 120, 240, 365];

export function recordReviewResult(
  db: Database.Database,
  input: { itemType: KnowledgeItemType; itemKey: string; correct: boolean; source?: string },
  reviewedAt = new Date()
) {
  const existing = db
    .prepare("SELECT stage, lapses FROM user_knowledge WHERE item_type = ? AND item_key = ?")
    .get(input.itemType, input.itemKey) as { stage: number; lapses: number } | undefined;
  const stage = input.correct ? Math.min((existing?.stage ?? 0) + 1, 12) : Math.max((existing?.stage ?? 0) - 1, 0);
  const nextReview = new Date(reviewedAt);
  if (input.correct) {
    nextReview.setUTCDate(nextReview.getUTCDate() + reviewIntervalsDays[Math.min(stage - 1, reviewIntervalsDays.length - 1)]);
  } else {
    nextReview.setUTCMinutes(nextReview.getUTCMinutes() + 10);
  }
  const now = reviewedAt.toISOString();
  const xp = input.correct ? 5 : 0;

  db.prepare(
    `INSERT INTO user_knowledge
     (item_type, item_key, stage, last_seen_at, next_review_at, lapses, xp, seen_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(item_type, item_key) DO UPDATE SET
       stage = excluded.stage,
       last_seen_at = excluded.last_seen_at,
       next_review_at = excluded.next_review_at,
       lapses = excluded.lapses,
       xp = user_knowledge.xp + excluded.xp,
       seen_count = user_knowledge.seen_count + 1,
       updated_at = excluded.updated_at`
  ).run(input.itemType, input.itemKey, stage, now, nextReview.toISOString(), (existing?.lapses ?? 0) + (input.correct ? 0 : 1), xp, now);
  db.prepare(
    `INSERT INTO knowledge_events (item_type, item_key, event_type, xp_delta, source, occurred_at)
     VALUES (?, ?, 'quiz', ?, ?, ?)`
  ).run(input.itemType, input.itemKey, xp, input.source ?? "review", now);
  return db.prepare("SELECT * FROM user_knowledge WHERE item_type = ? AND item_key = ?").get(input.itemType, input.itemKey);
}
