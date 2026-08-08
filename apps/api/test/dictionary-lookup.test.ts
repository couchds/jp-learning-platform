import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { enrichTerms } from "../src/services/dictionaryLookup.js";

const preparation = "\u6e96\u5099";
const preparationReading = "\u3058\u3085\u3093\u3073";
const temporarily = "\u66ab\u304f";
const forAWhile = "\u3057\u3070\u3089\u304f";
const preparationKanji = "\u6e96";

test("enriches exact words, kana forms, lemmas, and kanji from the offline bundle", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kakomu-dictionary-lookup-"));
  const databasePath = path.join(root, "dictionary.sqlite");
  const dictionary = new Database(databasePath);
  dictionary.exec(`
    CREATE TABLE word_entries (
      entry_id INTEGER PRIMARY KEY,
      reading TEXT,
      meanings_json TEXT NOT NULL,
      common INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE word_forms (
      form TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      form_kind TEXT NOT NULL,
      common INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (form, entry_id, form_kind)
    ) WITHOUT ROWID;
    CREATE TABLE kanji_entries (
      literal TEXT PRIMARY KEY,
      readings_json TEXT NOT NULL,
      meanings_json TEXT NOT NULL
    ) WITHOUT ROWID;
  `);
  dictionary.prepare(
    "INSERT INTO word_entries (entry_id, reading, meanings_json, common) VALUES (?, ?, ?, ?)"
  ).run(1, preparationReading, JSON.stringify(["preparation", "arrangements"]), 1);
  dictionary.prepare(
    "INSERT INTO word_entries (entry_id, reading, meanings_json, common) VALUES (?, ?, ?, ?)"
  ).run(2, forAWhile, JSON.stringify(["for a moment", "for a while"]), 1);
  const insertForm = dictionary.prepare(
    "INSERT INTO word_forms (form, entry_id, form_kind, common) VALUES (?, ?, ?, 1)"
  );
  insertForm.run(preparation, 1, "kanji");
  insertForm.run(preparationReading, 1, "reading");
  insertForm.run(temporarily, 2, "kanji");
  insertForm.run(forAWhile, 2, "reading");
  dictionary.prepare(
    "INSERT INTO kanji_entries (literal, readings_json, meanings_json) VALUES (?, ?, ?)"
  ).run(preparationKanji, JSON.stringify(["\u30b8\u30e5\u30f3"]), JSON.stringify(["semi-", "correspond to"]));

  const enriched = enrichTerms([
    { termType: "word", text: preparation, reading: null, meaning: null },
    { termType: "kana", text: forAWhile, reading: forAWhile, meaning: null },
    { termType: "word", text: forAWhile, reading: null, meaning: null, notes: `Lemma: ${temporarily}` },
    { termType: "kanji", text: preparationKanji, reading: null, meaning: null },
    { termType: "word", text: "Kakomu", reading: null, meaning: "existing meaning" },
    { termType: "unknown", text: "?", reading: null, meaning: null }
  ], { dictionaryDb: dictionary, localDb: null });

  assert.deepEqual(enriched[0], {
    termType: "word",
    text: preparation,
    reading: preparationReading,
    meaning: "preparation; arrangements"
  });
  assert.equal(enriched[1].meaning, "for a moment; for a while");
  assert.equal(enriched[2].reading, forAWhile);
  assert.equal(enriched[2].meaning, "for a moment; for a while");
  assert.equal(enriched[3].reading, "\u30b8\u30e5\u30f3");
  assert.equal(enriched[3].meaning, "semi-; correspond to");
  assert.equal(enriched[4].meaning, "existing meaning");
  assert.equal(enriched[5].meaning, null);

  dictionary.close();
  await fs.rm(root, { recursive: true, force: true });
});
