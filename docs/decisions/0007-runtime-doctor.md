# 0007 Runtime Doctor For Local Companion Setup

## Status

Accepted

## Context

Yomunami depends on several local pieces that can fail independently: the TypeScript API, SQLite and upload paths, Python overlay dependencies, macOS screen permissions, OCR, handwriting recognition, and speech services. A local-first product should make those failures visible in the app instead of relying on terminal inspection.

## Decision

Add a local Runtime Doctor endpoint at `GET /api/runtime/doctor` and expose it through a Runtime page in the web control center. The doctor reports required overlay files, preferred overlay virtual environment, Python imports, writable local paths, macOS permission hints, and best-effort companion service health.

Checks are intentionally diagnostic only. They do not install packages, change OS permissions, or start heavyweight OCR/model services.

## Consequences

- Users can troubleshoot overlay and service setup without leaving the browser app.
- The API owns local runtime knowledge and the frontend renders actionable status.
- Optional services report warnings instead of blocking the product shell.
- Future checks should stay local-only and avoid requiring public internet access.
