# Design Decisions

## Local Japanese Data Pipeline

- Keep public dataset files outside git and import them into `data/local/app.sqlite`.
- Store JMdict, KANJIDIC2, sentence examples, and derived kanji graph edges in SQLite so the web app remains offline-first.
- Prefer explicit importer scripts over automatic runtime downloads. This keeps startup fast, avoids surprise network use, and lets users choose dataset versions.
- Treat importers as idempotent upserts where possible so the user can rerun them after downloading newer data.

## Dictionary Explorer Direction

- Build the app toward a Jisho-like local explorer rather than a plain lookup box.
- Search surfaces should eventually share one database viewer with tabs for words, kanji, sentence examples, and graph relations.
- Empty local datasets should be presented as an import/setup state, not as a broken search experience.

## Sentence Examples

- Store sentence examples in first-class tables instead of burying them in dictionary gloss metadata.
- Link examples to searchable terms in a side table. The first importer extracts kanji character terms conservatively; richer token linking can be added after a morphological tokenizer is available in the API layer.
- Keep `source` and `source_id` fields so Tatoeba, Tanaka Corpus, user examples, and future generated examples can coexist.

## Kanji Graph

- Use a precomputed SQLite edge table rather than an external graph database for now.
- Edges are derived from common radicals, shared readings, overlapping English meaning tokens, and stroke-count proximity.
- Store relation reasons as JSON so the UI can explain why two kanji are connected.
- Keep this as a derivation that can be rebuilt from kanji metadata. The graph should not be hand-edited.
