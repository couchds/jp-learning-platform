import { Router } from "express";
import { getDb } from "../db/index.js";
import { type KanjiRow, mapKanji } from "../db/mappers.js";
import { asyncHandler, HttpError, parseLimitOffset } from "../lib/http.js";
import { buildFtsQuery } from "../services/search.js";

export const kanjiRouter = Router();

kanjiRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { limit, offset } = parseLimitOffset(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (req.query.jlpt) {
      clauses.push("k.jlpt_level = ?");
      params.push(Number(req.query.jlpt));
    }

    if (req.query.grade) {
      clauses.push("k.grade = ?");
      params.push(Number(req.query.grade));
    }

    if (req.query.search) {
      const query = buildFtsQuery([String(req.query.search)]);
      const normalized = String(req.query.search).normalize("NFKC").trim().toLocaleLowerCase();
      const db = getDb();
      const searchClauses = ["kanji_search MATCH ?", ...clauses];
      const searchParams = [query, ...params];
      const where = `WHERE ${searchClauses.join(" AND ")}`;
      const matches = db
        .prepare(
          `SELECT k.id FROM kanji_search JOIN kanji k ON k.id = CAST(kanji_search.kanji_id AS INTEGER)
           ${where} ORDER BY CASE WHEN lower(kanji_search.literal) = ? THEN 0 WHEN lower(kanji_search.literal) LIKE ? THEN 1 ELSE 2 END,
           bm25(kanji_search), COALESCE(k.frequency_rank, 999999), k.literal LIMIT ? OFFSET ?`
        )
        .all(...searchParams, normalized, `${normalized}%`, limit, offset) as Array<{ id: number }>;
      const total = db
        .prepare(`SELECT COUNT(*) AS count FROM kanji_search JOIN kanji k ON k.id = CAST(kanji_search.kanji_id AS INTEGER) ${where}`)
        .get(...searchParams) as { count: number };
      const ids = matches.map((match) => match.id);
      const rows = ids.length
        ? db.prepare(`SELECT * FROM kanji WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as KanjiRow[]
        : [];
      const byId = new Map(rows.map((row) => [row.id, row]));
      res.json({ items: ids.map((id) => byId.get(id)).filter((row): row is KanjiRow => Boolean(row)).map(mapKanji), page: { limit, offset, total: total.count } });
      return;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.map((clause) => clause.replaceAll("k.", "")).join(" AND ")}` : "";
    const rows = getDb()
      .prepare(
        `SELECT * FROM kanji ${where}
         ORDER BY COALESCE(frequency_rank, 999999), literal
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as KanjiRow[];

    const total = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM kanji ${where}`)
      .get(...params) as { count: number };

    res.json({
      items: rows.map(mapKanji),
      page: { limit, offset, total: total.count }
    });
  })
);

kanjiRouter.get(
  "/:idOrLiteral",
  asyncHandler((req, res) => {
    const idOrLiteral = String(req.params.idOrLiteral);
    const row = /^\d+$/.test(idOrLiteral)
      ? getDb().prepare("SELECT * FROM kanji WHERE id = ?").get(Number(idOrLiteral))
      : getDb().prepare("SELECT * FROM kanji WHERE literal = ?").get(idOrLiteral);

    if (!row) {
      throw new HttpError(404, "Kanji not found");
    }

    res.json({ kanji: mapKanji(row as KanjiRow) });
  })
);
