# Web Rebuild Notes

## Current Screens

- Dashboard: local counts, recent resources, API status.
- Resources: create and list local study resources.
- Lookup: query local kanji and dictionary endpoints.
- OCR: upload an image to the local OCR proxy.
- Draw: sketch kanji strokes and send them to KanjiDraw recognition.
- Speech: inspect/export/train against the local speech-model service.

## Validation So Far

- `npm run check`
- `npm run build`
- Browser smoke test at `http://127.0.0.1:5173`
- Created a local sample resource through the UI and confirmed it appeared in the library.
- Browser console had no warnings/errors during the smoke test.

The sample resource lives only in the ignored local SQLite database.
