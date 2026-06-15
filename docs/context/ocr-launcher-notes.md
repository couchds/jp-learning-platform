# OCR Launcher Notes

- `POST /api/ocr/service/launch` starts `services/ocr/app.py` only when `OCR_SERVICE_URL` points at `localhost` or `127.0.0.1`.
- The launcher uses the platform virtual environment Python path when available (`.venv/Scripts/python.exe` on Windows, `.venv/bin/python` on macOS/Linux), then falls back to a system Python command (`py -3`/`python` on Windows, `python3`/`python` on macOS/Linux).
- The browser control starts the service but intentionally does not install `manga-ocr` or `easyocr`; missing packages should stay visible in health/runtime diagnostics.
- Capture should show the OCR engine status near overlay controls because the overlay depends on the OCR service even when the overlay process itself is healthy.
