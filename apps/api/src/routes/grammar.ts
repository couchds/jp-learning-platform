import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { grammarConcepts } from "../services/grammar.js";
import { listResourceGrammar, saveResourceGrammar } from "../services/grammarStore.js";

const sightingsSchema = z.object({
  matches: z.array(z.object({
    conceptId: z.string().trim().min(1).max(80),
    matchedText: z.string().trim().min(1).max(255),
    sentence: z.string().trim().min(1).max(2000),
    sourceImageId: z.number().int().positive(),
    confidence: z.number().min(0).max(1)
  })).min(1).max(200)
});

export const grammarRouter = Router();

grammarRouter.get("/concepts", (_req, res) => {
  res.json({ concepts: grammarConcepts });
});

grammarRouter.get(
  "/resources/:resourceId",
  asyncHandler((req, res) => {
    const resourceId = parseResourceId(req.params.resourceId);
    requireResource(resourceId);
    res.json({ items: listResourceGrammar(resourceId) });
  })
);

grammarRouter.post(
  "/resources/:resourceId",
  asyncHandler((req, res) => {
    const resourceId = parseResourceId(req.params.resourceId);
    requireResource(resourceId);
    const body = sightingsSchema.parse(req.body);
    validateConcepts(body.matches.map((match) => match.conceptId));
    validateImageSources(resourceId, body.matches.map((match) => match.sourceImageId));
    res.status(201).json({ items: saveResourceGrammar(resourceId, body.matches) });
  })
);

function parseResourceId(value: string | string[]) {
  const resourceId = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isInteger(resourceId) || resourceId <= 0) {
    throw new HttpError(400, "Invalid resource id");
  }
  return resourceId;
}

function requireResource(resourceId: number) {
  const resource = getDb().prepare("SELECT id FROM resources WHERE id = ?").get(resourceId);
  if (!resource) {
    throw new HttpError(404, "Resource not found");
  }
}

function validateConcepts(conceptIds: string[]) {
  const known = new Set(grammarConcepts.map((concept) => concept.id));
  const unknown = conceptIds.find((conceptId) => !known.has(conceptId));
  if (unknown) {
    throw new HttpError(400, `Unknown grammar concept: ${unknown}`);
  }
}

function validateImageSources(resourceId: number, sourceImageIds: number[]) {
  const imageIds = [...new Set(sourceImageIds)];
  const placeholders = imageIds.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(`SELECT id FROM resource_images WHERE resource_id = ? AND id IN (${placeholders})`)
    .all(resourceId, ...imageIds) as Array<{ id: number }>;
  if (rows.length !== imageIds.length) {
    throw new HttpError(400, "Grammar source image does not belong to this resource");
  }
}
