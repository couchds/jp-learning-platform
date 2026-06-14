import { Router } from "express";
import { getDb } from "../db/index.js";
import { type KanjiRow, mapKanji } from "../db/mappers.js";
import { asyncHandler, HttpError, parseLimitOffset } from "../lib/http.js";

export const kanjiRouter = Router();

kanjiRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { limit, offset } = parseLimitOffset(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (req.query.search) {
      const search = `%${String(req.query.search)}%`;
      clauses.push(
        "(literal LIKE ? OR meanings_json LIKE ? OR on_readings_json LIKE ? OR kun_readings_json LIKE ?)"
      );
      params.push(search, search, search, search);
    }

    if (req.query.jlpt) {
      clauses.push("jlpt_level = ?");
      params.push(Number(req.query.jlpt));
    }

    if (req.query.grade) {
      clauses.push("grade = ?");
      params.push(Number(req.query.grade));
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
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
