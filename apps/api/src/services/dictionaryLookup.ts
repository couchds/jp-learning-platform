import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { getDb, readJson } from "../db/index.js";

type EnrichableTerm = {
  termType: string;
  text: string;
  reading?: string | null;
  meaning?: string | null;
  notes?: string | null;
};

type Definition = {
  reading: string | null;
  meaning: string | null;
};

type LookupOptions = {
  dictionaryDb?: Database.Database | null;
  localDb?: Database.Database | null;
};

type BundledWordRow = {
  reading: string | null;
  meanings_json: string;
};

type BundledKanjiRow = {
  readings_json: string;
  meanings_json: string;
};

let bundledDictionary: Database.Database | null | undefined;

export function enrichTerms<T extends EnrichableTerm>(terms: T[], options: LookupOptions = {}): T[] {
  const dictionaryDb = options.dictionaryDb === undefined ? getBundledDictionary() : options.dictionaryDb;
  const localDb = options.localDb === undefined ? getDb() : options.localDb;

  return terms.map((term) => {
    if (hasText(term.reading) && hasText(term.meaning)) {
      return term;
    }

    const definition = lookupDefinition(term, dictionaryDb, localDb);
    if (!definition) {
      return term;
    }

    return {
      ...term,
      reading: hasText(term.reading) ? term.reading : definition.reading,
      meaning: hasText(term.meaning) ? term.meaning : definition.meaning
    };
  });
}

export function closeDictionaryDb() {
  bundledDictionary?.close();
  bundledDictionary = undefined;
}

function getBundledDictionary() {
  if (bundledDictionary !== undefined) {
    return bundledDictionary;
  }

  if (!fs.existsSync(config.dictionaryPath)) {
    bundledDictionary = null;
    return bundledDictionary;
  }

  try {
    bundledDictionary = new Database(config.dictionaryPath, { readonly: true, fileMustExist: true });
  } catch (error) {
    console.warn(`Could not open bundled dictionary at ${config.dictionaryPath}`, error);
    bundledDictionary = null;
  }
  return bundledDictionary;
}

function lookupDefinition(
  term: EnrichableTerm,
  dictionaryDb: Database.Database | null,
  localDb: Database.Database | null
): Definition | null {
  if (term.termType === "kanji") {
    return lookupBundledKanji(dictionaryDb, term.text) ?? lookupLocalKanji(localDb, term.text);
  }

  for (const form of lookupForms(term)) {
    const definition = lookupBundledWord(dictionaryDb, form) ?? lookupLocalWord(localDb, form);
    if (definition) {
      return definition;
    }
  }
  return null;
}

function lookupForms(term: EnrichableTerm) {
  const lemma = term.notes?.match(/(?:^|\n)Lemma:\s*([^\n]+)/)?.[1]?.trim();
  return Array.from(new Set([lemma, term.text.trim()].filter((value): value is string => Boolean(value))));
}

function lookupBundledWord(db: Database.Database | null, form: string): Definition | null {
  if (!db) return null;
  const row = db.prepare(
    `SELECT entry.reading, entry.meanings_json
     FROM word_forms form
     JOIN word_entries entry ON entry.entry_id = form.entry_id
     WHERE form.form = ?
     ORDER BY entry.common DESC, form.common DESC, entry.entry_id
     LIMIT 1`
  ).get(form) as BundledWordRow | undefined;
  if (!row) return null;
  return definition(row.reading, readJson<string[]>(row.meanings_json, []));
}

function lookupBundledKanji(db: Database.Database | null, literal: string): Definition | null {
  if (!db) return null;
  const row = db.prepare(
    "SELECT readings_json, meanings_json FROM kanji_entries WHERE literal = ?"
  ).get(literal) as BundledKanjiRow | undefined;
  if (!row) return null;
  const readings = readJson<string[]>(row.readings_json, []);
  return definition(readings.slice(0, 4).join(" / "), readJson<string[]>(row.meanings_json, []));
}

function lookupLocalWord(db: Database.Database | null, form: string): Definition | null {
  if (!db) return null;
  const entry = db.prepare(
    `SELECT dictionary.id,
       (SELECT reading FROM entry_readings
        WHERE entry_id = dictionary.id
        ORDER BY is_common DESC, reading_order
        LIMIT 1) AS reading
     FROM dictionary_entries dictionary
     WHERE EXISTS (SELECT 1 FROM entry_kanji WHERE entry_id = dictionary.id AND kanji = ?)
        OR EXISTS (SELECT 1 FROM entry_readings WHERE entry_id = dictionary.id AND reading = ?)
     ORDER BY
       (SELECT MAX(is_common) FROM entry_kanji WHERE entry_id = dictionary.id) DESC,
       (SELECT MAX(is_common) FROM entry_readings WHERE entry_id = dictionary.id) DESC,
       dictionary.entry_id
     LIMIT 1`
  ).get(form, form) as { id: number; reading: string | null } | undefined;
  if (!entry) return null;
  const meanings = db.prepare(
    `SELECT gloss
     FROM entry_senses sense
     JOIN sense_glosses gloss ON gloss.sense_id = sense.id
     WHERE sense.entry_id = ?
     ORDER BY sense.sense_order, gloss.gloss_order
     LIMIT 3`
  ).all(entry.id).map((row) => (row as { gloss: string }).gloss);
  return definition(entry.reading, meanings);
}

function lookupLocalKanji(db: Database.Database | null, literal: string): Definition | null {
  if (!db) return null;
  const row = db.prepare(
    "SELECT on_readings_json, kun_readings_json, meanings_json FROM kanji WHERE literal = ?"
  ).get(literal) as {
    on_readings_json: string;
    kun_readings_json: string;
    meanings_json: string;
  } | undefined;
  if (!row) return null;
  const readings = [
    ...readJson<string[]>(row.on_readings_json, []),
    ...readJson<string[]>(row.kun_readings_json, [])
  ];
  return definition(readings.slice(0, 4).join(" / "), readJson<string[]>(row.meanings_json, []));
}

function definition(reading: string | null, meanings: string[]): Definition | null {
  const meaning = meanings.filter(Boolean).slice(0, 3).join("; ") || null;
  const normalizedReading = reading?.trim() || null;
  return normalizedReading || meaning ? { reading: normalizedReading, meaning } : null;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
