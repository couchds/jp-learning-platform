import { Router } from "express";
import { getDb, readJson } from "../db/index.js";
import { mapWordSummary, type WordSummaryRow } from "../db/mappers.js";
import { asyncHandler, HttpError, parseLimitOffset } from "../lib/http.js";

export const wordsRouter = Router();

const wordSummarySql = `
  SELECT
    d.id,
    d.entry_id,
    (
      SELECT GROUP_CONCAT(kanji, '|||')
      FROM (
        SELECT DISTINCT kanji, kanji_order
        FROM entry_kanji
        WHERE entry_id = d.id
        ORDER BY kanji_order
      )
    ) AS kanji_forms,
    (
      SELECT GROUP_CONCAT(reading, '|||')
      FROM (
        SELECT DISTINCT reading, reading_order
        FROM entry_readings
        WHERE entry_id = d.id
        ORDER BY reading_order
      )
    ) AS readings,
    (
      SELECT GROUP_CONCAT(gloss, '|||')
      FROM (
        SELECT DISTINCT sg.gloss, es.sense_order, sg.gloss_order
        FROM entry_senses es
        JOIN sense_glosses sg ON sg.sense_id = es.id
        WHERE es.entry_id = d.id
        ORDER BY es.sense_order, sg.gloss_order
      )
    ) AS glosses,
    (
      SELECT GROUP_CONCAT(parts_of_speech_json, '|||')
      FROM (
        SELECT DISTINCT parts_of_speech_json, sense_order
        FROM entry_senses
        WHERE entry_id = d.id
        ORDER BY sense_order
      )
    ) AS parts_of_speech
  FROM dictionary_entries d
`;

wordsRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { limit, offset } = parseLimitOffset(req.query);
    const params: unknown[] = [];
    let where = "";

    if (req.query.search) {
      const search = `%${String(req.query.search)}%`;
      where = `
        WHERE d.id IN (
          SELECT d2.id
          FROM dictionary_entries d2
          LEFT JOIN entry_kanji ek2 ON ek2.entry_id = d2.id
          LEFT JOIN entry_readings er2 ON er2.entry_id = d2.id
          LEFT JOIN entry_senses es2 ON es2.entry_id = d2.id
          LEFT JOIN sense_glosses sg2 ON sg2.sense_id = es2.id
          WHERE ek2.kanji LIKE ? OR er2.reading LIKE ? OR sg2.gloss LIKE ?
        )
      `;
      params.push(search, search, search);
    }

    const rows = getDb()
      .prepare(
        `${wordSummarySql}
         ${where}
         GROUP BY d.id
         ORDER BY d.entry_id
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as WordSummaryRow[];

    const total = getDb()
      .prepare(
        `SELECT COUNT(DISTINCT d.id) AS count
         FROM dictionary_entries d
         ${where}`
      )
      .get(...params) as { count: number };

    res.json({
      items: rows.map(mapWordSummary),
      page: { limit, offset, total: total.count }
    });
  })
);

wordsRouter.get(
  "/:id",
  asyncHandler((req, res) => {
    const id = Number(req.params.id);
    const row = getDb()
      .prepare(`${wordSummarySql} WHERE d.id = ? GROUP BY d.id`)
      .get(id) as WordSummaryRow | undefined;

    if (!row) {
      throw new HttpError(404, "Word not found");
    }

    const senses = getDb()
      .prepare(
        `SELECT es.*, GROUP_CONCAT(sg.gloss, '|||') AS glosses
         FROM entry_senses es
         LEFT JOIN sense_glosses sg ON sg.sense_id = es.id
         WHERE es.entry_id = ?
         GROUP BY es.id
         ORDER BY es.sense_order`
      )
      .all(id) as Array<{
        id: number;
        sense_order: number;
        parts_of_speech_json: string;
        fields_json: string;
        misc_json: string;
        dialects_json: string;
        glosses: string | null;
      }>;

    res.json({
      word: {
        ...mapWordSummary(row),
        senses: senses.map((sense) => ({
          id: sense.id,
          order: sense.sense_order,
          partsOfSpeech: readJson<string[]>(sense.parts_of_speech_json, []),
          fields: readJson<string[]>(sense.fields_json, []),
          misc: readJson<string[]>(sense.misc_json, []),
          dialects: readJson<string[]>(sense.dialects_json, []),
          glosses: sense.glosses ? sense.glosses.split("|||") : []
        }))
      }
    });
  })
);
