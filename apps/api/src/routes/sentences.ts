import { Router } from "express";
import { getDb } from "../db/index.js";
import { mapSentenceExample, type SentenceExampleRow } from "../db/mappers.js";
import { asyncHandler, HttpError, parseLimitOffset } from "../lib/http.js";

export const sentencesRouter = Router();

const sentenceSelectSql = `
  SELECT se.*,
         (
           SELECT GROUP_CONCAT(term_text, '|||')
           FROM (
             SELECT DISTINCT term_text, term_order
             FROM sentence_example_terms
             WHERE sentence_id = se.id
             ORDER BY term_order, term_text
           )
         ) AS terms
  FROM sentence_examples se
`;

sentencesRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { limit, offset } = parseLimitOffset(req.query);
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (req.query.search) {
      const search = `%${String(req.query.search)}%`;
      clauses.push("(se.japanese LIKE ? OR se.reading LIKE ? OR se.english LIKE ?)");
      params.push(search, search, search);
    }

    if (req.query.term) {
      clauses.push(
        `se.id IN (
          SELECT sentence_id
          FROM sentence_example_terms
          WHERE term_text = ?
        )`
      );
      params.push(String(req.query.term));
    }

    if (req.query.source) {
      clauses.push("se.source = ?");
      params.push(String(req.query.source));
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = getDb()
      .prepare(
        `${sentenceSelectSql}
         ${where}
         ORDER BY se.updated_at DESC, se.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as SentenceExampleRow[];

    const total = getDb()
      .prepare(`SELECT COUNT(DISTINCT se.id) AS count FROM sentence_examples se ${where}`)
      .get(...params) as { count: number };

    res.json({
      items: rows.map(mapSentenceExample),
      page: { limit, offset, total: total.count }
    });
  })
);

sentencesRouter.get(
  "/:id",
  asyncHandler((req, res) => {
    const id = Number(req.params.id);
    const row = getDb()
      .prepare(`${sentenceSelectSql} WHERE se.id = ?`)
      .get(id) as SentenceExampleRow | undefined;

    if (!row) {
      throw new HttpError(404, "Sentence example not found");
    }

    res.json({ sentence: mapSentenceExample(row) });
  })
);
