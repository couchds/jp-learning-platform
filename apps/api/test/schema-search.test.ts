import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { migrate } from "../src/db/schema.js";
import { buildFtsQuery } from "../src/services/search.js";

test("FTS migration indexes existing data and keeps search rows current", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  assert.equal((db.prepare("SELECT MAX(id) AS version FROM schema_migrations").get() as { version: number }).version, 8);

  db.prepare("INSERT INTO kanji (literal, meanings_json) VALUES (?, ?)").run("日", '["sun","day"]');
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM kanji_search WHERE kanji_search MATCH ?").get(buildFtsQuery(["sun"])) as { count: number }).count, 1);

  const entry = db.prepare("INSERT INTO dictionary_entries (entry_id) VALUES (100)").run();
  db.prepare("INSERT INTO entry_kanji (entry_id, kanji, kanji_order) VALUES (?, '日本', 0)").run(entry.lastInsertRowid);
  db.prepare("INSERT INTO entry_readings (entry_id, reading, reading_order) VALUES (?, 'にほん', 0)").run(entry.lastInsertRowid);
  const sense = db.prepare("INSERT INTO entry_senses (entry_id, sense_order) VALUES (?, 0)").run(entry.lastInsertRowid);
  db.prepare("INSERT INTO sense_glosses (sense_id, gloss, gloss_order) VALUES (?, 'Japan', 0)").run(sense.lastInsertRowid);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM dictionary_search WHERE dictionary_search MATCH ?").get(buildFtsQuery(["Japan"])) as { count: number }).count, 1);
  db.prepare("UPDATE sense_glosses SET gloss = 'Japanese nation' WHERE id = ?").run(sense.lastInsertRowid);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM dictionary_search WHERE dictionary_search MATCH ?").get(buildFtsQuery(["nation"])) as { count: number }).count, 1);

  db.prepare("INSERT INTO sentence_examples (source, source_id, japanese, english) VALUES ('test', '1', '日本です', 'It is Japan')").run();
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM sentence_search WHERE sentence_search MATCH ?").get(buildFtsQuery(["Japan"])) as { count: number }).count, 1);
  db.close();
});

test("FTS query builder escapes quotes and ignores blank terms", () => {
  assert.equal(buildFtsQuery(["", 'say "hello"']), '"say ""hello"""*');
});

test("FTS lookup stays within the local full-library latency target", () => {
  const db = new Database(":memory:");
  migrate(db);
  const insert = db.prepare("INSERT INTO kanji (literal, meanings_json) VALUES (?, ?)");
  db.transaction(() => {
    for (let index = 0; index < 5000; index += 1) {
      insert.run(String.fromCodePoint(0x4e00 + index), index === 4999 ? '["needleterm"]' : `["meaning${index}"]`);
    }
  })();
  const started = performance.now();
  const row = db.prepare("SELECT kanji_id FROM kanji_search WHERE kanji_search MATCH ? LIMIT 1").get(buildFtsQuery(["needleterm"]));
  const elapsed = performance.now() - started;
  assert.ok(row);
  assert.ok(elapsed < 500, `FTS query took ${elapsed.toFixed(1)}ms; target is below 500ms`);
  db.close();
});
