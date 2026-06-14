# Source App Inventory

Source repository inspected: `../japanese-learning-platform`.

## Useful Product Concepts To Preserve

- Resource library for books, manga, games, anime, podcasts, websites, and other study material.
- Linking resources to dictionary entries and kanji.
- Kanji browsing and searching with readings, meanings, grade, JLPT, frequency, radical, and stroke count.
- Dictionary lookup backed by JMdict-style entries.
- Drawing-based kanji recognition through KanjiDraw.
- Image OCR for Japanese text, tokenization, and extracting kanji/vocabulary candidates.
- Pronunciation recording, local speech-model training, and prediction.
- Training workflows over a resource's linked words and kanji.

## Source Areas To Avoid Carrying Over Directly

- Terraform and Google Cloud deployment configuration.
- GCS upload defaults and bucket names.
- Hosted auth/email flows.
- Placeholder secrets such as default JWT secret strings.
- README-hosted screenshots or external image references.
- Local databases, uploads, trained models, and downloaded dictionary assets.

## Source Files Worth Re-implementing Carefully

- `backend/prisma/schema.prisma` for the domain model.
- `backend/src/routes/ocr.ts` and `backend/src/services/ocrService.ts` for API shape.
- `recognition_service/app.py` for KanjiDraw stroke recognition.
- `ocr-service/app.py` for local OCR/tokenization flow.
- `speech-model/api.py` and `speech-model/src/*` for local model training and prediction.
- `scripts/setup_db.py`, `scripts/setup_jmdict.py`, and `scripts/setup_local.py` for importer behavior.

## Rebuild Bias

Prefer smaller local primitives over direct source copying:

- SQLite schema instead of PostgreSQL-specific arrays and indexes.
- A single local profile instead of account registration.
- Local upload paths instead of object storage adapters.
- Optional local model endpoints instead of mandatory external API keys.
