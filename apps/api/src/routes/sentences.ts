import { Router } from "express";
import { getDb } from "../db/index.js";
import { mapSentenceExample, type SentenceExampleRow } from "../db/mappers.js";
import { asyncHandler, HttpError, parseLimitOffset } from "../lib/http.js";
import { buildFtsQuery } from "../services/search.js";

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

    if (req.query.search) {
      const query = buildFtsQuery([String(req.query.search)]);
      const normalized = String(req.query.search).normalize("NFKC").trim().toLocaleLowerCase();
      const prefix = `${normalized}%`;
      const db = getDb();
      const searchWhere = `WHERE sentence_search MATCH ?${clauses.length ? ` AND ${clauses.join(" AND ")}` : ""}`;
      const searchParams = [query, ...params];
      const matches = db
        .prepare(
          `SELECT se.id FROM sentence_search JOIN sentence_examples se ON se.id = CAST(sentence_search.sentence_id AS INTEGER)
           ${searchWhere} ORDER BY CASE
             WHEN lower(sentence_search.japanese) = ? OR lower(sentence_search.reading) = ? OR lower(sentence_search.english) = ? THEN 0
             WHEN lower(sentence_search.japanese) LIKE ? OR lower(sentence_search.reading) LIKE ? OR lower(sentence_search.english) LIKE ? THEN 1
             ELSE 2 END,
           bm25(sentence_search), se.id DESC LIMIT ? OFFSET ?`
        )
        .all(...searchParams, normalized, normalized, normalized, prefix, prefix, prefix, limit, offset) as Array<{ id: number }>;
      const total = db
        .prepare(`SELECT COUNT(DISTINCT se.id) AS count FROM sentence_search JOIN sentence_examples se ON se.id = CAST(sentence_search.sentence_id AS INTEGER) ${searchWhere}`)
        .get(...searchParams) as { count: number };
      const ids = matches.map((match) => match.id);
      const rows = ids.length
        ? db.prepare(`${sentenceSelectSql} WHERE se.id IN (${ids.map(() => "?").join(",")})`).all(...ids) as SentenceExampleRow[]
        : [];
      const byId = new Map(rows.map((row) => [row.id, row]));
      res.json({ items: ids.map((id) => byId.get(id)).filter((row): row is SentenceExampleRow => Boolean(row)).map(mapSentenceExample), page: { limit, offset, total: total.count } });
      return;
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
