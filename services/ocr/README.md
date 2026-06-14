# Local OCR Service

Flask service for extracting Japanese text from uploaded images.

## Setup

```bash
cd services/ocr
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Default URL: `http://127.0.0.1:5100`.

After the virtual environment and OCR engine are installed, the browser Capture page can start this service through the local API. The launcher prefers `services/ocr/.venv/bin/python` and surfaces startup errors if dependencies are missing.

The service defaults to `OCR_BACKEND=auto`, which prefers EasyOCR for box-aware overlay highlights and falls back to MangaOCR for text-only recognition. Set `OCR_BACKEND=manga-ocr` or `OCR_BACKEND=easyocr` to force a specific local backend.

EasyOCR detections below `OCR_EASYOCR_MIN_CONFIDENCE=0.05` are filtered to avoid noisy full-window highlights. Lower it for difficult game fonts; raise it if screenshots produce too many false positives.

This service intentionally excludes hosted OCR backends during the local-first phase.
