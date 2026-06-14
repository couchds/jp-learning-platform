# 0002: SQLite Local API

Date: 2026-06-14

## Status

Accepted

## Context

The source backend used PostgreSQL, Prisma, authentication middleware, GCS-aware uploads, and public-deployment concerns. The rebuild needs a backend that works offline first and can hold dictionary, kanji, resource, OCR, and pronunciation data without requiring a server database.

## Decision

Use an Express TypeScript API with `better-sqlite3` and code-based migrations.

- SQLite database path defaults to `data/local/app.sqlite`.
- Uploaded images and audio default to `uploads/`.
- Auth is not part of the local-first phase; the API assumes a single local learner profile.
- OCR, KanjiDraw recognition, and speech prediction are proxied to optional localhost services.
- JSON columns are used for small list fields that were PostgreSQL arrays in the source app.

## Consequences

- Local setup is a single Node install for the core API.
- Data is easy to back up as local files.
- Future public deployment can add auth and hosted persistence behind a separate design decision.
- Large dictionary imports need batching and careful transaction use, which should be handled in importer scripts.
