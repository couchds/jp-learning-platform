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
  desktop-overlay/ Hotkey screen-capture OCR overlay
  ocr/       Local Japanese OCR service
  recognize/ KanjiDraw handwriting recognition service
  speech-model/ Local pronunciation model training and prediction
docs/
  decisions/ Architecture decision records
  context/   Notes useful to future Codex or human maintainers
data/local/  Ignored local runtime data
```

## Local Development

Install Node dependencies:

```bash
npm install
```

Run the local API:

```bash
npm run dev --workspace @jp-learning-platform/api
```

The API listens on `http://127.0.0.1:3001` by default, creates a SQLite database at `data/local/app.sqlite`, and stores uploads under `uploads/`.

Run the web app and API together:

```bash
npm run dev
```

Python services will each have their own virtual environment and `requirements.txt`. Heavy OCR and speech model dependencies are kept out of Node installation so the app can boot even when those optional services are not running.

Run optional companion services in separate terminals:

```bash
cd services/desktop-overlay
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python overlay.py
```

```bash
cd services/recognize
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

```bash
cd services/ocr
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install manga-ocr
python app.py
```

```bash
cd services/speech-model
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python api.py
```

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

## Local API Surface

- `GET /health`
- `GET /api/desktop/overlay/status`
- `POST /api/desktop/overlay/launch`
- `GET|PUT /api/local/profile`
- `GET /api/dashboard`
- `GET /api/kanji`
- `GET /api/kanji/:idOrLiteral`
- `GET /api/words`
- `GET /api/words/:id`
- `GET|POST /api/resources`
- `GET|PUT|DELETE /api/resources/:id`
- `POST /api/resources/:id/kanji/:kanjiId`
- `POST /api/resources/:id/words/:wordId`
- `POST /api/resources/:id/custom-vocabulary`
- `GET /api/resources/:id/terms`
- `POST /api/resources/:id/terms`
- `POST /api/resources/:id/terms/bulk`
- `GET /api/resources/:id/quiz/deck`
- `GET /api/resources/:id/quiz/sessions`
- `POST /api/resources/:id/quiz/sessions`
- `GET|PUT /api/knowledge`
- `GET /api/ocr/health`
- `POST /api/ocr/image`
- `POST /api/ocr/resources/:resourceId/images`
- `GET /api/recognize/health`
- `POST /api/recognize`
- `GET /api/speech/health`
- `GET /api/speech/info`
- `POST /api/speech/export-data`
- `POST /api/speech/train`
- `POST /api/speech/predict`
- `POST /api/speech/recordings`

## Local Companion Services

- Desktop OCR overlay: `services/desktop-overlay`, default hotkey `ctrl+shift+o`.
- OCR: `services/ocr`, default `http://127.0.0.1:5100`, local `manga-ocr` or `easyocr`.
- KanjiDraw recognition: `services/recognize`, default `http://127.0.0.1:5000`.
- Speech model: `services/speech-model`, default `http://127.0.0.1:5200`.

## Desktop OCR Overlay

The desktop overlay is the intended game/browser workflow:

1. Start the API, web app, and OCR service.
2. Launch the overlay from the web control panel or run `python services/desktop-overlay/overlay.py`.
3. Select a resource.
4. Press `ctrl+shift+o`.
5. Drag over any visible game, browser tab, emulator, or document text.
6. Review OCR terms and add selected words/kanji to the resource tracker.

macOS may require Screen Recording and Accessibility permissions for the terminal or Python executable.

## Versioning

This project follows semver.

- Patch: bug fixes and documentation-only changes.
- Minor: new local features, new local APIs, additive schema changes.
- Major: incompatible API, schema, or workflow changes after `1.0.0`.

See [CHANGELOG.md](CHANGELOG.md) for release notes.
