# 0003: Local Companion Services

Date: 2026-06-14

## Status

Accepted

## Context

The source app had useful OCR, KanjiDraw recognition, and pronunciation model code. It also included hosted OCR options and service assumptions that do not fit the local-first phase.

## Decision

Keep ML and OCR as optional local Python services:

- `services/ocr` uses local OCR engines only: `manga-ocr` or `easyocr`.
- `services/recognize` wraps KanjiDraw for hand-drawn kanji stroke recognition.
- `services/speech-model` carries forward the CNN keyword-spotting model and adapts training-data export to SQLite and local uploads.
- Services bind to `127.0.0.1` by default.
- Heavy model files, exported audio, and trained checkpoints stay ignored.

## Consequences

- The Node API remains lightweight and can run without Python ML dependencies.
- Developers can install only the services they need.
- Public deployment of OCR or ML endpoints will require a future security and scaling decision.
