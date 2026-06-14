# API Rebuild Notes

## Current API Defaults

- Host: `127.0.0.1`
- Port: `3001`
- Database: `data/local/app.sqlite`
- Uploads: `uploads/`
- OCR service: `http://127.0.0.1:5100`
- KanjiDraw recognition service: `http://127.0.0.1:5000`
- Speech model service: `http://127.0.0.1:5200`

## Intentional Differences From The Source Backend

- No JWT, signup, email verification, two-factor code, or hosted email service.
- No GCS adapter or bucket default.
- No OpenAI service dependency in the local API.
- No Prisma/PostgreSQL requirement for the default developer loop.

## Next Useful Backend Work

- Add import scripts for KANJIDIC2 and JMdict into the SQLite schema.
- Add richer resource training endpoints once the web training flow is rebuilt.
- Add export/backup commands for local data.
