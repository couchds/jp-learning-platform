import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/index.js";
import {
  mapKanji,
  mapKanjiRelation,
  type KanjiRelationRow,
  type KanjiRow
} from "../db/mappers.js";
import { asyncHandler, HttpError } from "../lib/http.js";

const kanjiGraphQuerySchema = z.object({
  literal: z.string().trim().min(1).max(8),
  limit: z.coerce.number().int().min(1).max(80).default(24),
  relationType: z.string().trim().min(1).max(80).optional()
});

export const graphRouter = Router();

graphRouter.get(
  "/kanji",
  asyncHandler((req, res) => {
    const query = kanjiGraphQuerySchema.parse(req.query);
    const db = getDb();
    const center = db
      .prepare("SELECT * FROM kanji WHERE literal = ?")
      .get(query.literal) as KanjiRow | undefined;

    if (!center) {
      throw new HttpError(404, "Kanji not found. Import KANJIDIC2 before exploring the graph.");
    }

    const params: unknown[] = [query.literal];
    const relationTypeClause = query.relationType ? "AND kr.relation_type = ?" : "";
    if (query.relationType) {
      params.push(query.relationType);
    }
    params.push(query.limit);

    const rows = db
      .prepare(
        `SELECT kr.*,
                k.id AS target_id,
                k.meanings_json AS target_meanings_json,
                k.on_readings_json AS target_on_readings_json,
                k.kun_readings_json AS target_kun_readings_json,
                k.stroke_count AS target_stroke_count,
                k.jlpt_level AS target_jlpt_level,
                k.frequency_rank AS target_frequency_rank
         FROM kanji_relations kr
         LEFT JOIN kanji k ON k.literal = kr.target_literal
         WHERE kr.source_literal = ?
         ${relationTypeClause}
         ORDER BY kr.score DESC, kr.target_literal ASC
         LIMIT ?`
      )
      .all(...params) as KanjiRelationRow[];

    const relations = rows.map(mapKanjiRelation);
    res.json({
      center: mapKanji(center),
      nodes: [
        { literal: center.literal, kind: "center" },
        ...relations.map((relation) => ({
          literal: relation.targetLiteral,
          kind: "related",
          score: relation.score,
          meanings: relation.target.meanings
        }))
      ],
      edges: relations.map((relation) => ({
        source: relation.sourceLiteral,
        target: relation.targetLiteral,
        relationType: relation.relationType,
        score: relation.score,
        reasons: relation.reasons
      })),
      relations
    });
  })
);
