# Service Rebuild Notes

## Ports

- OCR: `5100`
- KanjiDraw recognition: `5000`
- Speech model: `5200`

## Source Carry-Over

- Speech CNN architecture, preprocessing, prediction, and training scripts were carried forward from the source app.
- The speech API wrapper was rewritten around this repository's paths and port conventions.
- The export script now reads SQLite and local upload paths instead of PostgreSQL.
- OCR was rewritten to remove hosted backend support while keeping the Japanese OCR plus token-classification behavior.
- Recognition was rewritten from the source KanjiDraw service with less request logging and local-only host defaults.

## Validation So Far

- `python3 -m compileall services/ocr services/recognize services/speech-model`

Runtime Flask checks require installing each service's Python dependencies in a virtual environment.
