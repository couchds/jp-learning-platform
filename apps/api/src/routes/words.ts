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
      const searchTerms = wordSearchTerms(String(req.query.search));
      const searchClauses = searchTerms
        .map(
          () => "ek2.kanji LIKE ? OR er2.reading LIKE ? OR sg2.gloss LIKE ?"
        )
        .join(" OR ");
      where = `
        WHERE d.id IN (
          SELECT d2.id
          FROM dictionary_entries d2
          LEFT JOIN entry_kanji ek2 ON ek2.entry_id = d2.id
          LEFT JOIN entry_readings er2 ON er2.entry_id = d2.id
          LEFT JOIN entry_senses es2 ON es2.entry_id = d2.id
          LEFT JOIN sense_glosses sg2 ON sg2.sense_id = es2.id
          WHERE ${searchClauses}
        )
      `;
      for (const term of searchTerms) {
        const search = `%${term}%`;
        params.push(search, search, search);
      }
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

function wordSearchTerms(raw: string) {
  const terms = new Set<string>();
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  terms.add(trimmed);
  for (const token of trimmed.split(/\s+/)) {
    const kana = romajiToHiragana(token);
    if (kana) {
      terms.add(kana);
    }
  }

  const wholeKana = romajiToHiragana(trimmed);
  if (wholeKana) {
    terms.add(wholeKana);
  }

  return Array.from(terms);
}

function normalizeRomaji(value: string) {
  return value
    .toLowerCase()
    .replace(/ā/g, "aa")
    .replace(/ī/g, "ii")
    .replace(/ū/g, "uu")
    .replace(/ē/g, "ee")
    .replace(/ō/g, "ou")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z']/g, "");
}

function romajiToHiragana(value: string) {
  const romaji = normalizeRomaji(value);
  if (!romaji || !/^[a-z']+$/.test(romaji)) {
    return null;
  }

  const kanaMap: Record<string, string> = {
    a: "あ",
    i: "い",
    u: "う",
    e: "え",
    o: "お",
    ka: "か",
    ki: "き",
    ku: "く",
    ke: "け",
    ko: "こ",
    kya: "きゃ",
    kyu: "きゅ",
    kyo: "きょ",
    ga: "が",
    gi: "ぎ",
    gu: "ぐ",
    ge: "げ",
    go: "ご",
    gya: "ぎゃ",
    gyu: "ぎゅ",
    gyo: "ぎょ",
    sa: "さ",
    shi: "し",
    si: "し",
    su: "す",
    se: "せ",
    so: "そ",
    sha: "しゃ",
    shu: "しゅ",
    sho: "しょ",
    za: "ざ",
    ji: "じ",
    zi: "じ",
    zu: "ず",
    ze: "ぜ",
    zo: "ぞ",
    ja: "じゃ",
    ju: "じゅ",
    jo: "じょ",
    ta: "た",
    chi: "ち",
    ti: "ち",
    tsu: "つ",
    tu: "つ",
    te: "て",
    to: "と",
    cha: "ちゃ",
    chu: "ちゅ",
    cho: "ちょ",
    da: "だ",
    di: "ぢ",
    du: "づ",
    de: "で",
    do: "ど",
    na: "な",
    ni: "に",
    nu: "ぬ",
    ne: "ね",
    no: "の",
    nya: "にゃ",
    nyu: "にゅ",
    nyo: "にょ",
    ha: "は",
    hi: "ひ",
    fu: "ふ",
    hu: "ふ",
    he: "へ",
    ho: "ほ",
    hya: "ひゃ",
    hyu: "ひゅ",
    hyo: "ひょ",
    ba: "ば",
    bi: "び",
    bu: "ぶ",
    be: "べ",
    bo: "ぼ",
    bya: "びゃ",
    byu: "びゅ",
    byo: "びょ",
    pa: "ぱ",
    pi: "ぴ",
    pu: "ぷ",
    pe: "ぺ",
    po: "ぽ",
    pya: "ぴゃ",
    pyu: "ぴゅ",
    pyo: "ぴょ",
    ma: "ま",
    mi: "み",
    mu: "む",
    me: "め",
    mo: "も",
    mya: "みゃ",
    myu: "みゅ",
    myo: "みょ",
    ya: "や",
    yu: "ゆ",
    yo: "よ",
    ra: "ら",
    ri: "り",
    ru: "る",
    re: "れ",
    ro: "ろ",
    rya: "りゃ",
    ryu: "りゅ",
    ryo: "りょ",
    wa: "わ",
    wo: "を"
  };
  const vowels = new Set(["a", "i", "u", "e", "o"]);
  const consonants = new Set("bcdfghjklmnpqrstvwxyz".split(""));
  let kana = "";
  let index = 0;

  while (index < romaji.length) {
    const char = romaji[index];
    const next = romaji[index + 1];
    if (char === "'") {
      index += 1;
      continue;
    }

    if (char && next && char === next && consonants.has(char) && char !== "n") {
      kana += "っ";
      index += 1;
      continue;
    }

    if (char === "n") {
      const after = romaji[index + 1];
      if (!after) {
        kana += "ん";
        index += 1;
        continue;
      }
      if (after === "'") {
        kana += "ん";
        index += 2;
        continue;
      }
      if (after === "n") {
        kana += "ん";
        index += 1;
        continue;
      }
      if (!vowels.has(after) && after !== "y") {
        kana += "ん";
        index += 1;
        continue;
      }
    }

    let matched = "";
    for (const length of [3, 2, 1]) {
      const part = romaji.slice(index, index + length);
      if (kanaMap[part]) {
        matched = part;
        break;
      }
    }

    if (!matched) {
      return null;
    }

    kana += kanaMap[matched];
    index += matched.length;
  }

  return kana;
}

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
