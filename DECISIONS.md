# Design Decisions

## Local Japanese Data Pipeline

- Keep public dataset files outside git and import them into `data/local/app.sqlite`.
- Store JMdict, KANJIDIC2, sentence examples, and derived kanji graph edges in SQLite so the web app remains offline-first.
- Prefer explicit importer scripts over automatic runtime downloads. This keeps startup fast, avoids surprise network use, and lets users choose dataset versions.
- Treat importers as idempotent upserts where possible so the user can rerun them after downloading newer data.
- Launch imports through persisted local jobs when initiated from the web app. Long-running imports should report stdout, stderr, status, and exit code through SQLite instead of blocking the HTTP request.
- Provide a tiny starter dataset as a demo/onboarding path, separate from full public datasets. Starter data should be clearly labeled and safe to overwrite by rerunning the seed.
- Keep database search state independent by tab and expose quick filters. Words, kanji, sentences, and graph exploration have different query shapes, so a single shared query makes cross-tab browsing feel noisy.
- Use D3-generated SVG geometry for analytics instead of hand-scaled SVG primitives. Charts should keep a stable viewBox and avoid `preserveAspectRatio="none"` so labels, lines, and marks do not distort on wide screens.

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
