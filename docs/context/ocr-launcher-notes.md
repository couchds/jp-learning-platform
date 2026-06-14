# OCR Launcher Notes

- `POST /api/ocr/service/launch` starts `services/ocr/app.py` only when `OCR_SERVICE_URL` points at `localhost` or `127.0.0.1`.
- The launcher uses `services/ocr/.venv/bin/python` when available and otherwise falls back to `python3`.
- The browser control starts the service but intentionally does not install `manga-ocr` or `easyocr`; missing packages should stay visible in health/runtime diagnostics.
- Capture should show the OCR engine status near overlay controls because the overlay depends on the OCR service even when the overlay process itself is healthy.
