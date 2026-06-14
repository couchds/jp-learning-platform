# Japanese Learning Platform

Local-first rebuild of a Japanese study app for tracking media resources, vocabulary, kanji, OCR captures, handwriting recognition, and pronunciation practice.

This repository is intentionally starting fresh. The previous app's public-facing deployment configuration, hosted image references, and cloud-specific defaults are not carried over. Local data lives under ignored paths, and services should run on the developer's machine by default.

## Current Direction

- **Local-first:** SQLite and local file storage are the default persistence layer.
- **No bundled secrets:** `.env` files, API keys, service account material, trained models, uploads, and local databases are ignored.
- **Composable services:** the web app, API, OCR service, kanji handwriting recognition service, and speech model service are separate local processes.
- **Semver:** the rebuild starts at `0.1.0`; user-facing or API-contract changes should update the root package version and changelog.

## Repository Layout

```text
apps/
  api/       Local TypeScript API
  web/       React frontend
services/
  ocr/       Local Japanese OCR service
  recognize/ KanjiDraw handwriting recognition service
  speech-model/ Local pronunciation model training and prediction
docs/
  decisions/ Architecture decision records
  context/   Notes useful to future Codex or human maintainers
data/local/  Ignored local runtime data
```

## Local Development

The implementation is being rebuilt in slices. Once the API and web app land, the expected local workflow will be:

```bash
npm install
npm run dev
```

Python services will each have their own virtual environment and `requirements.txt`. Heavy OCR and speech model dependencies are kept out of Node installation so the app can boot even when those optional services are not running.

## Data Sources

The app is designed to import local copies of public Japanese learning datasets rather than downloading them at runtime:

- KANJIDIC2 for kanji metadata.
- JMdict for dictionary entries.
- User-created resources, notes, OCR captures, and audio recordings in local storage.

Downloaded dictionary files should stay outside git. Import scripts will document their expected file paths when they are added.

## Security And Privacy

- Do not commit `.env`, database files, uploaded images, audio recordings, or trained model artifacts.
- Prefer local service URLs such as `http://127.0.0.1:5000` and `http://127.0.0.1:5100`.
- Cloud deployment, hosted object storage, hosted auth, and public internet exposure are explicitly out of scope for this rebuild phase.

## Versioning

This project follows semver.

- Patch: bug fixes and documentation-only changes.
- Minor: new local features, new local APIs, additive schema changes.
- Major: incompatible API, schema, or workflow changes after `1.0.0`.

See [CHANGELOG.md](CHANGELOG.md) for release notes.
