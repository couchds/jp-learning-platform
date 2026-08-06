import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { recordReviewResult } from "../src/services/reviews.js";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE user_knowledge (
      id INTEGER PRIMARY KEY, item_type TEXT NOT NULL, item_key TEXT NOT NULL,
      stage INTEGER NOT NULL DEFAULT 0, last_seen_at TEXT, next_review_at TEXT,
      lapses INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0,
      seen_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT,
      UNIQUE(item_type, item_key)
    );
    CREATE TABLE knowledge_events (
      id INTEGER PRIMARY KEY, item_type TEXT, item_key TEXT, event_type TEXT,
      xp_delta INTEGER, source TEXT, occurred_at TEXT
    );
  `);
  return db;
}

test("correct reviews advance stages and incorrect reviews lapse with a short retry", () => {
  const db = database();
  const now = new Date("2026-08-06T12:00:00.000Z");
  recordReviewResult(db, { itemType: "kanji", itemKey: "日", correct: true }, now);
  let row = db.prepare("SELECT * FROM user_knowledge").get() as Record<string, number | string>;
  assert.equal(row.stage, 1);
  assert.equal(row.next_review_at, "2026-08-07T12:00:00.000Z");
  recordReviewResult(db, { itemType: "kanji", itemKey: "日", correct: false }, now);
  row = db.prepare("SELECT * FROM user_knowledge").get() as Record<string, number | string>;
  assert.equal(row.stage, 0);
  assert.equal(row.lapses, 1);
  assert.equal(row.next_review_at, "2026-08-06T12:10:00.000Z");
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM knowledge_events").get() as { count: number }).count, 2);
  db.close();
});
