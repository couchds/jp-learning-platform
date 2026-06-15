import { Router } from "express";
import { z } from "zod";
import { getDb, readJson, touchNow } from "../db/index.js";
import { asyncHandler } from "../lib/http.js";
import { recordKnowledgeEvent, setKnowledgeKnown } from "../services/knowledge.js";

const knowledgeSchema = z.object({
  itemType: z.enum(["kanji", "word", "custom_vocabulary"]),
  itemKey: z.string().trim().min(1).max(255),
  stage: z.number().int().min(0).max(12).default(0),
  lastSeenAt: z.string().datetime().nullable().optional(),
  nextReviewAt: z.string().datetime().nullable().optional(),
  lapses: z.number().int().min(0).default(0),
  xp: z.number().int().min(0).default(0),
  seenCount: z.number().int().min(0).default(0),
  isKnown: z.boolean().default(false),
  knownAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
});

const seenSchema = z.object({
  itemType: z.enum(["kanji", "word", "custom_vocabulary"]),
  itemKey: z.string().trim().min(1).max(255),
  xpDelta: z.number().int().min(0).max(100).default(1),
  source: z.string().trim().min(1).max(80).default("manual")
});

const knownSchema = z.object({
  itemType: z.enum(["kanji", "word", "custom_vocabulary"]),
  itemKey: z.string().trim().min(1).max(255),
  isKnown: z.boolean().default(true),
  source: z.string().trim().min(1).max(80).default("manual")
});

export const knowledgeRouter = Router();

knowledgeRouter.get(
  "/summary",
  asyncHandler((req, res) => {
    const days = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 7), 180);
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    start.setUTCHours(0, 0, 0, 0);
    const startIso = start.toISOString();

    const db = getDb();
    const kanjiTotals = totalsFor("kanji");
    const wordTotals = totalsFor("word");
    const customTotals = totalsFor("custom_vocabulary");
    const historyRows = db
      .prepare(
        `SELECT substr(occurred_at, 1, 10) AS date,
                COALESCE(SUM(xp_delta), 0) AS xp_gained,
                COUNT(*) AS events
         FROM knowledge_events
         WHERE item_type = 'kanji' AND occurred_at >= ?
         GROUP BY substr(occurred_at, 1, 10)
         ORDER BY date ASC`
      )
      .all(startIso) as Array<{ date: string; xp_gained: number; events: number }>;
    const priorKanjiXp = (
      db
        .prepare("SELECT COALESCE(SUM(xp_delta), 0) AS total FROM knowledge_events WHERE item_type = 'kanji' AND occurred_at < ?")
        .get(startIso) as { total: number }
    ).total;
    const historyByDate = new Map(historyRows.map((row) => [row.date, row]));
    let cumulativeXp = priorKanjiXp;
    const kanjiXpHistory = Array.from({ length: days }, (_value, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const row = historyByDate.get(key);
      const xpGained = row?.xp_gained ?? 0;
      cumulativeXp += xpGained;
      return {
        date: key,
        xpGained,
        events: row?.events ?? 0,
        cumulativeXp
      };
    });

    const topKanjiRows = db
      .prepare(
        `SELECT item_key, xp, seen_count, is_known, last_seen_at
         FROM user_knowledge
         WHERE item_type = 'kanji'
         ORDER BY xp DESC, seen_count DESC, item_key ASC
         LIMIT 12`
      )
      .all() as Array<{
        item_key: string;
        xp: number;
        seen_count: number;
        is_known: number;
        last_seen_at: string | null;
      }>;
    const topKanji = topKanjiRows.map((item) => ({
      itemKey: item.item_key,
      xp: item.xp,
      seenCount: item.seen_count,
      isKnown: item.is_known === 1,
      lastSeenAt: item.last_seen_at
    }));
    const eventSourceRows = db
      .prepare(
        `SELECT source,
                item_type,
                COALESCE(SUM(xp_delta), 0) AS xp,
                COUNT(*) AS events
         FROM knowledge_events
         WHERE occurred_at >= ?
         GROUP BY source, item_type
         ORDER BY xp DESC, events DESC, source ASC
         LIMIT 16`
      )
      .all(startIso) as Array<{
        source: string;
        item_type: string;
        xp: number;
        events: number;
      }>;

    res.json({
      totals: {
        kanji: kanjiTotals,
        words: wordTotals,
        customVocabulary: customTotals
      },
      kanjiXpHistory,
      topKanji,
      eventSourceBreakdown: eventSourceRows.map((row) => ({
        source: row.source,
        itemType: row.item_type,
        xp: row.xp,
        events: row.events
      })),
      kanjiNetwork: buildKanjiKnowledgeNetwork()
    });
  })
);

knowledgeRouter.get(
  "/",
  asyncHandler((req, res) => {
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (req.query.itemType) {
      clauses.push("item_type = ?");
      params.push(String(req.query.itemType));
    }

    if (req.query.due === "true") {
      clauses.push("next_review_at IS NOT NULL AND next_review_at <= CURRENT_TIMESTAMP");
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = getDb()
      .prepare(`SELECT * FROM user_knowledge ${where} ORDER BY COALESCE(next_review_at, updated_at) ASC`)
      .all(...params);

    res.json({ items: rows.map(mapKnowledgeRow) });
  })
);

knowledgeRouter.post(
  "/seen",
  asyncHandler((req, res) => {
    const body = seenSchema.parse(req.body);
    const item = recordKnowledgeEvent(getDb(), {
      itemType: body.itemType,
      itemKey: body.itemKey,
      xpDelta: body.xpDelta,
      source: body.source,
      eventType: "seen"
    });

    res.status(201).json({ item: mapKnowledgeRow(item) });
  })
);

knowledgeRouter.post(
  "/known",
  asyncHandler((req, res) => {
    const body = knownSchema.parse(req.body);
    const item = setKnowledgeKnown(getDb(), body.itemType, body.itemKey, body.isKnown, body.source);
    res.json({ item: mapKnowledgeRow(item) });
  })
);

knowledgeRouter.put(
  "/",
  asyncHandler((req, res) => {
    const body = knowledgeSchema.parse(req.body);
    const now = touchNow();

    getDb()
      .prepare(
        `INSERT INTO user_knowledge
         (item_type, item_key, stage, last_seen_at, next_review_at, lapses, xp, seen_count, is_known, known_at, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(item_type, item_key) DO UPDATE SET
           stage = excluded.stage,
           last_seen_at = excluded.last_seen_at,
           next_review_at = excluded.next_review_at,
           lapses = excluded.lapses,
           xp = excluded.xp,
           seen_count = excluded.seen_count,
           is_known = excluded.is_known,
           known_at = excluded.known_at,
           notes = excluded.notes,
           updated_at = excluded.updated_at`
      )
      .run(
        body.itemType,
        body.itemKey,
        body.stage,
        body.lastSeenAt ?? null,
        body.nextReviewAt ?? null,
        body.lapses,
        body.xp,
        body.seenCount,
        body.isKnown ? 1 : 0,
        body.knownAt ?? (body.isKnown ? now : null),
        body.notes ?? null,
        now
      );

    const item = getDb()
      .prepare("SELECT * FROM user_knowledge WHERE item_type = ? AND item_key = ?")
      .get(body.itemType, body.itemKey);

    res.json({ item: mapKnowledgeRow(item) });
  })
);

function totalsFor(itemType: string) {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS tracked,
              COALESCE(SUM(CASE WHEN is_known = 1 THEN 1 ELSE 0 END), 0) AS known,
              COALESCE(SUM(xp), 0) AS xp,
              COALESCE(SUM(seen_count), 0) AS seen
       FROM user_knowledge
       WHERE item_type = ?`
    )
    .get(itemType) as { tracked: number; known: number; xp: number; seen: number };
}

function buildKanjiKnowledgeNetwork() {
  const db = getDb();
  const trackedRows = db
    .prepare(
      `SELECT uk.item_key,
              uk.xp,
              uk.seen_count,
              uk.is_known,
              k.meanings_json,
              k.jlpt_level,
              k.frequency_rank
       FROM user_knowledge uk
       LEFT JOIN kanji k ON k.literal = uk.item_key
       WHERE uk.item_type = 'kanji'
       ORDER BY uk.is_known DESC, uk.xp DESC, uk.seen_count DESC, uk.item_key ASC
       LIMIT 36`
    )
    .all() as Array<{
      item_key: string;
      xp: number;
      seen_count: number;
      is_known: number;
      meanings_json: string | null;
      jlpt_level: number | null;
      frequency_rank: number | null;
    }>;

  if (trackedRows.length === 0) {
    return { nodes: [], links: [] };
  }

  const trackedKeys = trackedRows.map((row) => row.item_key);
  const trackedSet = new Set(trackedKeys);
  const nodes = new Map<string, {
    literal: string;
    status: "known" | "learning" | "related";
    xp: number;
    seenCount: number;
    meanings: string[];
    jlptLevel: number | null;
    frequencyRank: number | null;
  }>();

  for (const row of trackedRows) {
    nodes.set(row.item_key, {
      literal: row.item_key,
      status: row.is_known === 1 ? "known" : "learning",
      xp: row.xp,
      seenCount: row.seen_count,
      meanings: readJson<string[]>(row.meanings_json, []),
      jlptLevel: row.jlpt_level,
      frequencyRank: row.frequency_rank
    });
  }

  const placeholders = trackedKeys.map(() => "?").join(", ");
  const relationRows = db
    .prepare(
      `SELECT kr.source_literal,
              kr.target_literal,
              kr.relation_type,
              kr.score,
              kr.reasons_json,
              k.meanings_json AS target_meanings_json,
              k.jlpt_level AS target_jlpt_level,
              k.frequency_rank AS target_frequency_rank
       FROM kanji_relations kr
       LEFT JOIN kanji k ON k.literal = kr.target_literal
       WHERE kr.source_literal IN (${placeholders})
       ORDER BY CASE WHEN kr.target_literal IN (${placeholders}) THEN 0 ELSE 1 END,
                kr.score DESC,
                kr.target_literal ASC
       LIMIT 90`
    )
    .all(...trackedKeys, ...trackedKeys) as Array<{
      source_literal: string;
      target_literal: string;
      relation_type: string;
      score: number;
      reasons_json: string;
      target_meanings_json: string | null;
      target_jlpt_level: number | null;
      target_frequency_rank: number | null;
    }>;

  const links = [];
  for (const row of relationRows) {
    if (!nodes.has(row.target_literal) && nodes.size < 64) {
      nodes.set(row.target_literal, {
        literal: row.target_literal,
        status: trackedSet.has(row.target_literal) ? "learning" : "related",
        xp: 0,
        seenCount: 0,
        meanings: readJson<string[]>(row.target_meanings_json, []),
        jlptLevel: row.target_jlpt_level,
        frequencyRank: row.target_frequency_rank
      });
    }

    if (nodes.has(row.source_literal) && nodes.has(row.target_literal)) {
      links.push({
        source: row.source_literal,
        target: row.target_literal,
        relationType: row.relation_type,
        score: row.score,
        reasons: readJson<Array<{ type: string; detail: string; score: number }>>(row.reasons_json, [])
      });
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    links
  };
}

function mapKnowledgeRow(row: unknown) {
  const item = row as {
    id: number;
    item_type: string;
    item_key: string;
    stage: number;
    last_seen_at: string | null;
    next_review_at: string | null;
    lapses: number;
    xp: number;
    seen_count: number;
    is_known: number;
    known_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };

  return {
    id: item.id,
    itemType: item.item_type,
    itemKey: item.item_key,
    stage: item.stage,
    lastSeenAt: item.last_seen_at,
    nextReviewAt: item.next_review_at,
    lapses: item.lapses,
    xp: item.xp,
    seenCount: item.seen_count,
    isKnown: item.is_known === 1,
    knownAt: item.known_at,
    notes: item.notes,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}
