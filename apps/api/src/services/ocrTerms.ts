import { getDb, touchNow } from "../db/index.js";
import { type ResourceTermRow, mapResourceTerm } from "../db/mappers.js";

export type SuggestedTerm = {
  termType: "kanji" | "word" | "phrase" | "kana" | "unknown";
  text: string;
  reading?: string | null;
  meaning?: string | null;
  source?: string;
  sourceImageId?: number | null;
  frequency?: number;
  notes?: string | null;
};

type OcrElement = {
  text?: unknown;
  element_type?: unknown;
  elementType?: unknown;
  features?: {
    lemma?: unknown;
  };
};

export function termsFromOcrElements(elements: unknown[]): SuggestedTerm[] {
  const seen = new Set<string>();
  const terms: SuggestedTerm[] = [];

  for (const raw of elements) {
    const element = raw as OcrElement;
    const text = typeof element.text === "string" ? element.text.trim() : "";
    if (!text) {
      continue;
    }

    const elementType = String(element.element_type ?? element.elementType ?? "unknown");
    const termType = normalizeTermType(elementType, text);
    const key = `${termType}:${text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const lemma = element.features && typeof element.features.lemma === "string" ? element.features.lemma : null;
    terms.push({
      termType,
      text,
      reading: termType === "kana" ? text : null,
      meaning: null,
      source: "ocr",
      notes: lemma && lemma !== text ? `Lemma: ${lemma}` : null
    });
  }

  return terms;
}

export function upsertResourceTerms(resourceId: number, terms: SuggestedTerm[]) {
  const db = getDb();
  const now = touchNow();
  const statement = db.prepare(
    `INSERT INTO resource_terms
     (resource_id, term_type, text, reading, meaning, source, source_image_id, frequency, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(resource_id, term_type, text) DO UPDATE SET
       reading = COALESCE(excluded.reading, resource_terms.reading),
       meaning = COALESCE(excluded.meaning, resource_terms.meaning),
       source_image_id = COALESCE(excluded.source_image_id, resource_terms.source_image_id),
       frequency = resource_terms.frequency + excluded.frequency,
       notes = COALESCE(excluded.notes, resource_terms.notes),
       updated_at = excluded.updated_at`
  );

  const upsert = db.transaction(() => {
    for (const term of terms) {
      statement.run(
        resourceId,
        term.termType,
        term.text,
        term.reading ?? null,
        term.meaning ?? null,
        term.source ?? "manual",
        term.sourceImageId ?? null,
        term.frequency ?? 1,
        term.notes ?? null,
        now
      );

      db.prepare(
        `INSERT INTO user_knowledge (item_type, item_key, stage, last_seen_at, updated_at)
         VALUES (?, ?, 0, ?, ?)
         ON CONFLICT(item_type, item_key) DO UPDATE SET
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`
      ).run(term.termType, term.text, now, now);
    }
  });

  upsert();

  if (terms.length === 0) {
    return [];
  }

  const filters = terms.map(() => "(term_type = ? AND text = ?)").join(" OR ");
  const params = terms.flatMap((term) => [term.termType, term.text]);
  const rows = db
    .prepare(`SELECT * FROM resource_terms WHERE resource_id = ? AND (${filters}) ORDER BY updated_at DESC`)
    .all(resourceId, ...params) as ResourceTermRow[];

  return rows.map(mapResourceTerm);
}

function normalizeTermType(elementType: string, text: string): SuggestedTerm["termType"] {
  if (elementType === "kanji" || isSingleKanji(text)) {
    return "kanji";
  }

  if (elementType === "hiragana" || elementType === "katakana") {
    return "kana";
  }

  if (elementType === "vocabulary") {
    return "word";
  }

  if (text.length > 1) {
    return "phrase";
  }

  return "unknown";
}

function isSingleKanji(text: string) {
  if ([...text].length !== 1) {
    return false;
  }

  const code = text.codePointAt(0) ?? 0;
  return code >= 0x4e00 && code <= 0x9fff;
}
