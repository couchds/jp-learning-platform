import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import supertest from "supertest";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "jp-resource-images-"));
process.env.DATABASE_PATH = path.join(root, "app.sqlite");
process.env.UPLOAD_DIR = path.join(root, "uploads");
process.env.BACKUP_DIR = path.join(root, "backups");
process.env.API_REQUEST_LOGGING = "false";

const { createApp } = await import("../src/app.js");
const database = await import("../src/db/index.js");

test("returns browsable per-image OCR terms, grammar, and saved state", async () => {
  const request = supertest(createApp());
  const created = await request
    .post("/api/resources")
    .send({ name: "Image source", type: "game", status: "in_progress", tags: [] })
    .expect(201);
  const resourceId = created.body.resource.id as number;
  const elements = [
    token("木立", "名詞", 0),
    token("の", "助詞", 0),
    token("間", "名詞", 0),
    token("に", "助詞", 1),
    token("家", "名詞", 1),
    token("が", "助詞", 1),
    token("見える", "動詞", 1)
  ];
  const inserted = database.getDb().prepare(
    `INSERT INTO resource_images
     (resource_id, file_path, original_name, mime_type, size_bytes, ocr_text, ocr_elements_json)
     VALUES (?, 'capture.png', 'capture.png', 'image/png', 100, ?, ?)`
  ).run(resourceId, "木立の間\nに家が見える。", JSON.stringify(elements));
  const imageId = Number(inserted.lastInsertRowid);

  const resource = await request.get(`/api/resources/${resourceId}`).expect(200);
  assert.equal(resource.body.images.length, 1);
  assert.equal(resource.body.images[0].imageUrl, "/uploads/capture.png");
  assert.ok(resource.body.images[0].termCount >= 4);
  assert.equal(resource.body.images[0].grammarCount, 3);
  assert.equal("ocrElements" in resource.body.images[0], false);

  const detail = await request.get(`/api/resources/${resourceId}/images/${imageId}`).expect(200);
  assert.equal(detail.body.image.id, imageId);
  assert.equal(detail.body.terms.every((term: { sourceImageId: number }) => term.sourceImageId === imageId), true);
  assert.deepEqual(
    detail.body.grammarMatches.map((match: { conceptId: string }) => match.conceptId),
    ["noun-no-noun", "particle-ni", "particle-ga"]
  );
  assert.deepEqual(detail.body.savedTerms, []);
  assert.deepEqual(detail.body.savedGrammar, []);

  const term = detail.body.terms.find((item: { text: string }) => item.text === "木立");
  await request.post(`/api/resources/${resourceId}/terms`).send(term).expect(201);
  await request.post(`/api/grammar/resources/${resourceId}`).send({
    matches: [detail.body.grammarMatches[0]]
  }).expect(201);

  const saved = await request.get(`/api/resources/${resourceId}/images/${imageId}`).expect(200);
  assert.equal(saved.body.savedTerms.length, 1);
  assert.equal(saved.body.savedGrammar.length, 1);
});

test("does not expose an image through another resource", async () => {
  const request = supertest(createApp());
  const other = await request
    .post("/api/resources")
    .send({ name: "Other source", type: "book", status: "in_progress", tags: [] })
    .expect(201);
  const imageId = (database.getDb().prepare("SELECT id FROM resource_images LIMIT 1").get() as { id: number }).id;

  await request.get(`/api/resources/${other.body.resource.id}/images/${imageId}`).expect(404);
});

test.after(async () => {
  database.closeDb();
  await fs.rm(root, { recursive: true, force: true });
});

function token(text: string, pos1: string, detectionIndex: number) {
  return {
    text,
    confidence: 0.96,
    detection_index: detectionIndex,
    element_type: pos1 === "助詞" ? "hiragana" : "vocabulary",
    features: { pos1 },
    bbox: { x: 0, y: 0, width: 20, height: 20 }
  };
}
