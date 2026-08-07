import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import supertest from "supertest";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "jp-grammar-api-"));
process.env.DATABASE_PATH = path.join(root, "app.sqlite");
process.env.UPLOAD_DIR = path.join(root, "uploads");
process.env.BACKUP_DIR = path.join(root, "backups");
process.env.API_REQUEST_LOGGING = "false";

const { createApp } = await import("../src/app.js");
const database = await import("../src/db/index.js");

test("stores validated grammar sightings for a resource without duplicate rows", async () => {
  const request = supertest(createApp());
  const created = await request
    .post("/api/resources")
    .send({ name: "Grammar source", type: "video", status: "in_progress", tags: [] })
    .expect(201);
  const resourceId = created.body.resource.id as number;
  const image = database.getDb().prepare(
    `INSERT INTO resource_images (resource_id, file_path, original_name, mime_type, size_bytes)
     VALUES (?, 'capture.png', 'capture.png', 'image/png', 100)`
  ).run(resourceId);
  const sourceImageId = Number(image.lastInsertRowid);
  const sighting = {
    conceptId: "te-iru",
    matchedText: "ています",
    sentence: "日本語を勉強しています。",
    sourceImageId,
    confidence: 0.94
  };

  const saved = await request.post(`/api/grammar/resources/${resourceId}`).send({ matches: [sighting] }).expect(201);
  assert.equal(saved.body.items.length, 1);
  assert.equal(saved.body.items[0].title, "Ongoing action or state");
  assert.equal(saved.body.items[0].jlptLevel, "N5");

  await request.post(`/api/grammar/resources/${resourceId}`).send({
    matches: [{ ...sighting, confidence: 0.97 }]
  }).expect(201);
  const listed = await request.get(`/api/grammar/resources/${resourceId}`).expect(200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].confidence, 0.97);
  assert.equal(listed.body.items[0].frequency, 1);
});

test("rejects unknown concepts and images from another resource", async () => {
  const request = supertest(createApp());
  const first = await request
    .post("/api/resources")
    .send({ name: "First", type: "book", status: "not_started", tags: [] })
    .expect(201);
  const second = await request
    .post("/api/resources")
    .send({ name: "Second", type: "book", status: "not_started", tags: [] })
    .expect(201);
  const image = database.getDb().prepare(
    `INSERT INTO resource_images (resource_id, file_path, original_name, mime_type, size_bytes)
     VALUES (?, 'other.png', 'other.png', 'image/png', 100)`
  ).run(second.body.resource.id);
  const base = {
    matchedText: "ています",
    sentence: "勉強しています。",
    sourceImageId: Number(image.lastInsertRowid),
    confidence: 0.9
  };

  await request.post(`/api/grammar/resources/${first.body.resource.id}`).send({
    matches: [{ ...base, conceptId: "not-real" }]
  }).expect(400);
  await request.post(`/api/grammar/resources/${first.body.resource.id}`).send({
    matches: [{ ...base, conceptId: "te-iru" }]
  }).expect(400);
});

test("exposes the supported grammar catalog", async () => {
  const response = await supertest(createApp()).get("/api/grammar/concepts").expect(200);
  assert.ok(response.body.concepts.length >= 20);
  assert.equal(response.body.concepts.some((concept: { id: string }) => concept.id === "te-kudasai"), true);
  assert.equal(response.body.concepts.some((concept: { id: string }) => concept.id === "noun-no-noun"), true);
});

test.after(async () => {
  database.closeDb();
  await fs.rm(root, { recursive: true, force: true });
});
