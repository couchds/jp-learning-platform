# Local OCR Service

Flask service for extracting Japanese text from uploaded images.

## Setup

```bash
cd services/ocr
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install manga-ocr
python app.py
```

Default URL: `http://127.0.0.1:5100`.

After the virtual environment and OCR engine are installed, the browser Capture page can start this service through the local API. The launcher prefers `services/ocr/.venv/bin/python` and surfaces startup errors if dependencies are missing.

Set `OCR_BACKEND=easyocr` to use EasyOCR instead. This service intentionally excludes hosted OCR backends during the local-first phase.
