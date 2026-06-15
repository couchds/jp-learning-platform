import type Database from "better-sqlite3";
import { touchNow } from "../db/index.js";

export type KnowledgeItemType = "kanji" | "word" | "custom_vocabulary";

export type KnowledgeEventOptions = {
  itemType: KnowledgeItemType;
  itemKey: string;
  xpDelta?: number;
  source?: string;
  eventType?: "seen" | "known" | "manual";
  markKnown?: boolean;
};

export function recordKnowledgeEvent(db: Database.Database, options: KnowledgeEventOptions) {
  const now = touchNow();
  const xpDelta = Math.max(0, Math.floor(options.xpDelta ?? 1));
  const source = options.source ?? "manual";
  const eventType = options.eventType ?? "seen";
  const markKnown = options.markKnown === true;

  db.prepare(
    `INSERT INTO user_knowledge
     (item_type, item_key, stage, last_seen_at, xp, seen_count, is_known, known_at, updated_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_type, item_key) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       xp = user_knowledge.xp + excluded.xp,
       seen_count = user_knowledge.seen_count + excluded.seen_count,
       is_known = CASE WHEN excluded.is_known = 1 THEN 1 ELSE user_knowledge.is_known END,
       known_at = CASE
         WHEN excluded.is_known = 1 AND user_knowledge.known_at IS NULL THEN excluded.known_at
         ELSE user_knowledge.known_at
       END,
       updated_at = excluded.updated_at`
  ).run(
    options.itemType,
    options.itemKey,
    now,
    xpDelta,
    eventType === "seen" ? 1 : 0,
    markKnown ? 1 : 0,
    markKnown ? now : null,
    now
  );

  if (xpDelta > 0 || markKnown) {
    db.prepare(
      `INSERT INTO knowledge_events
       (item_type, item_key, event_type, xp_delta, source, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(options.itemType, options.itemKey, eventType, xpDelta, source, now);
  }

  return db
    .prepare("SELECT * FROM user_knowledge WHERE item_type = ? AND item_key = ?")
    .get(options.itemType, options.itemKey);
}

export function setKnowledgeKnown(
  db: Database.Database,
  itemType: KnowledgeItemType,
  itemKey: string,
  isKnown: boolean,
  source = "manual"
) {
  if (isKnown) {
    return recordKnowledgeEvent(db, {
      itemType,
      itemKey,
      xpDelta: 0,
      source,
      eventType: "known",
      markKnown: true
    });
  }

  const now = touchNow();
  db.prepare(
    `INSERT INTO user_knowledge
     (item_type, item_key, stage, is_known, known_at, updated_at)
     VALUES (?, ?, 0, 0, NULL, ?)
     ON CONFLICT(item_type, item_key) DO UPDATE SET
       is_known = 0,
       known_at = NULL,
       updated_at = excluded.updated_at`
  ).run(itemType, itemKey, now);

  return db.prepare("SELECT * FROM user_knowledge WHERE item_type = ? AND item_key = ?").get(itemType, itemKey);
}
