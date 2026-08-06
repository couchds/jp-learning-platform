import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import supertest from "supertest";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "jp-study-loop-"));
process.env.DATABASE_PATH = path.join(root, "app.sqlite");
process.env.UPLOAD_DIR = path.join(root, "uploads");
process.env.BACKUP_DIR = path.join(root, "backups");
process.env.API_REQUEST_LOGGING = "false";
const { createApp } = await import("../src/app.js");
const database = await import("../src/db/index.js");

test("local API study loop creates a resource, builds a quiz, and saves scheduling", async () => {
  const request = supertest(createApp());
  await request.get("/health").expect(200);
  const db = database.getDb();
  db.prepare("INSERT INTO kanji (literal, meanings_json) VALUES ('日', '[\"sun\"]')").run();
  db.prepare("INSERT INTO sentence_examples (source, source_id, japanese, english) VALUES ('test', '1', '日本です', 'It is Japan')").run();
  const entry = db.prepare("INSERT INTO dictionary_entries (entry_id) VALUES (9001)").run();
  db.prepare("INSERT INTO entry_kanji (entry_id, kanji, kanji_order) VALUES (?, '日本', 0)").run(entry.lastInsertRowid);
  db.prepare("INSERT INTO entry_readings (entry_id, reading, reading_order) VALUES (?, 'にほん', 0)").run(entry.lastInsertRowid);
  const sense = db.prepare("INSERT INTO entry_senses (entry_id, sense_order) VALUES (?, 0)").run(entry.lastInsertRowid);
  db.prepare("INSERT INTO sense_glosses (sense_id, gloss, gloss_order) VALUES (?, 'Japan', 0)").run(sense.lastInsertRowid);
  assert.equal((await request.get("/api/kanji?search=sun").expect(200)).body.page.total, 1);
  assert.equal((await request.get("/api/words?search=Japan").expect(200)).body.page.total, 1);
  assert.equal((await request.get("/api/sentences?search=Japan").expect(200)).body.page.total, 1);
  const created = await request.post("/api/resources").send({ name: "Test book", type: "book", status: "in_progress", tags: [] }).expect(201);
  const resourceId = created.body.resource.id as number;
  await request.post(`/api/resources/${resourceId}/terms`).send({ termType: "word", text: "日本", meaning: "Japan", source: "test" }).expect(201);
  const deck = await request.get(`/api/resources/${resourceId}/quiz/deck?limit=20&seed=test`).expect(200);
  assert.equal(deck.body.questions.length, 1);
  await request.post(`/api/resources/${resourceId}/quiz/sessions`).send({ mode: "resource", answers: [{ prompt: "日本", expectedAnswer: "Japan", correct: false, sourceType: "word", sourceKey: "日本" }] }).expect(201);
  const knowledge = await request.get("/api/knowledge?itemType=word").expect(200);
  assert.equal(knowledge.body.items[0].lapses, 1);
  assert.ok(knowledge.body.items[0].nextReviewAt);
  await request.post("/api/knowledge/reviews/actions").send({ itemType: "word", itemKey: "日本", action: "reset" }).expect(200);
  assert.equal((await request.get("/api/knowledge/reviews/due").expect(200)).body.page.total, 1);
  await request.post("/api/knowledge/reviews/actions").send({ itemType: "word", itemKey: "日本", action: "suspend" }).expect(200);
  assert.equal((await request.get("/api/knowledge/reviews/due").expect(200)).body.page.total, 0);

  const backup = await request.post("/api/data/backups").send({}).expect(201);
  await request.post(`/api/data/backups/${backup.body.backup.name}/restore`).send({}).expect(200);
  const restored = await request.get(`/api/resources/${resourceId}`).expect(200);
  assert.equal(restored.body.resource.name, "Test book");

  const corrupt = await request.post("/api/data/backups").send({}).expect(201);
  await fs.appendFile(path.join(root, "backups", corrupt.body.backup.name, "app.sqlite"), "corrupt");
  await request.post(`/api/data/backups/${corrupt.body.backup.name}/restore`).send({}).expect(500);
});

test.after(async () => {
  database.closeDb();
  await fs.rm(root, { recursive: true, force: true });
});
