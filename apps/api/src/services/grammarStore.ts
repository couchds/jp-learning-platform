import { getDb, touchNow } from "../db/index.js";
import { findGrammarConcept } from "./grammar.js";

export type GrammarSightingInput = {
  conceptId: string;
  matchedText: string;
  sentence: string;
  sourceImageId: number;
  confidence: number;
};

type GrammarRow = {
  id: number;
  resource_id: number;
  concept_id: string;
  title: string;
  pattern: string;
  explanation: string;
  jlpt_level: string;
  matched_text: string;
  source_sentence: string;
  source_image_id: number;
  confidence: number;
  frequency: number;
  created_at: string;
  updated_at: string;
};

export function saveResourceGrammar(resourceId: number, sightings: GrammarSightingInput[]) {
  const db = getDb();
  const now = touchNow();
  const insert = db.prepare(
    `INSERT INTO resource_grammar
     (resource_id, concept_id, title, pattern, explanation, jlpt_level, matched_text,
      source_sentence, source_image_id, confidence, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(resource_id, concept_id, source_image_id, matched_text, source_sentence) DO UPDATE SET
       confidence = MAX(resource_grammar.confidence, excluded.confidence),
       updated_at = excluded.updated_at`
  );

  const save = db.transaction(() => {
    const ids: number[] = [];
    for (const sighting of sightings) {
      const concept = findGrammarConcept(sighting.conceptId);
      if (!concept) {
        throw new Error(`Unknown grammar concept: ${sighting.conceptId}`);
      }
      insert.run(
        resourceId,
        concept.id,
        concept.title,
        concept.pattern,
        concept.explanation,
        concept.jlptLevel,
        sighting.matchedText,
        sighting.sentence,
        sighting.sourceImageId,
        sighting.confidence,
        now
      );
      const row = db.prepare(
        `SELECT id FROM resource_grammar
         WHERE resource_id = ? AND concept_id = ? AND source_image_id = ?
           AND matched_text = ? AND source_sentence = ?`
      ).get(
        resourceId,
        concept.id,
        sighting.sourceImageId,
        sighting.matchedText,
        sighting.sentence
      ) as { id: number };
      ids.push(row.id);
    }
    return ids;
  });

  return rowsByIds(save()).map(mapGrammarSighting);
}

export function listResourceGrammar(resourceId: number) {
  return (getDb()
    .prepare(
      `SELECT * FROM resource_grammar
       WHERE resource_id = ?
       ORDER BY jlpt_level DESC, title, created_at DESC`
    )
    .all(resourceId) as GrammarRow[]).map(mapGrammarSighting);
}

function rowsByIds(ids: number[]) {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => "?").join(", ");
  return getDb()
    .prepare(`SELECT * FROM resource_grammar WHERE id IN (${placeholders}) ORDER BY id`)
    .all(...ids) as GrammarRow[];
}

function mapGrammarSighting(row: GrammarRow) {
  return {
    id: row.id,
    resourceId: row.resource_id,
    conceptId: row.concept_id,
    title: row.title,
    pattern: row.pattern,
    explanation: row.explanation,
    jlptLevel: row.jlpt_level,
    matchedText: row.matched_text,
    sentence: row.source_sentence,
    sourceImageId: row.source_image_id,
    confidence: row.confidence,
    frequency: row.frequency,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
