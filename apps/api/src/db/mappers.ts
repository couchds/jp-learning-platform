import { readJson } from "./index.js";

export type KanjiRow = {
  id: number;
  literal: string;
  unicode_codepoint: string | null;
  classical_radical: number | null;
  stroke_count: number | null;
  grade: number | null;
  frequency_rank: number | null;
  jlpt_level: number | null;
  on_readings_json: string;
  kun_readings_json: string;
  nanori_readings_json: string;
  meanings_json: string;
};

export function mapKanji(row: KanjiRow) {
  return {
    id: row.id,
    literal: row.literal,
    unicodeCodepoint: row.unicode_codepoint,
    classicalRadical: row.classical_radical,
    strokeCount: row.stroke_count,
    grade: row.grade,
    frequencyRank: row.frequency_rank,
    jlptLevel: row.jlpt_level,
    onReadings: readJson<string[]>(row.on_readings_json, []),
    kunReadings: readJson<string[]>(row.kun_readings_json, []),
    nanoriReadings: readJson<string[]>(row.nanori_readings_json, []),
    meanings: readJson<string[]>(row.meanings_json, [])
  };
}

export type ResourceRow = {
  id: number;
  name: string;
  type: string;
  status: string;
  description: string | null;
  cover_image_path: string | null;
  difficulty_level: string | null;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

export function mapResource(row: ResourceRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    description: row.description,
    coverImagePath: row.cover_image_path,
    difficultyLevel: row.difficulty_level,
    tags: readJson<string[]>(row.tags_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export type ResourceTermRow = {
  id: number;
  resource_id: number;
  term_type: string;
  text: string;
  reading: string | null;
  meaning: string | null;
  source: string;
  source_image_id: number | null;
  frequency: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function mapResourceTerm(row: ResourceTermRow) {
  return {
    id: row.id,
    resourceId: row.resource_id,
    termType: row.term_type,
    text: row.text,
    reading: row.reading,
    meaning: row.meaning,
    source: row.source,
    sourceImageId: row.source_image_id,
    frequency: row.frequency,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export type WordSummaryRow = {
  id: number;
  entry_id: number;
  kanji_forms: string | null;
  readings: string | null;
  glosses: string | null;
  parts_of_speech: string | null;
};

function splitConcat(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return Array.from(new Set(value.split("|||").filter(Boolean)));
}

export function mapWordSummary(row: WordSummaryRow) {
  return {
    id: row.id,
    entryId: row.entry_id,
    kanjiForms: splitConcat(row.kanji_forms),
    readings: splitConcat(row.readings),
    glosses: splitConcat(row.glosses),
    partsOfSpeech: Array.from(
      new Set(splitConcat(row.parts_of_speech).flatMap((value) => readJson<string[]>(value, [])))
    )
  };
}
