# OCR Overlay Highlight Notes

- `services/ocr/app.py` defaults to `OCR_BACKEND=auto`.
- `auto` chooses EasyOCR when installed so the overlay can receive bounding boxes.
- MangaOCR is still available with `OCR_BACKEND=manga-ocr`, but it returns text only and cannot draw character highlights.
- EasyOCR boxes are relative to the captured crop, not the full desktop.
- Token and kanji boxes are estimated slices inside an EasyOCR detection line, marked with `bbox_source=estimated_line_slice`.
- EasyOCR filters detections below `OCR_EASYOCR_MIN_CONFIDENCE=0.05` by default to reduce noisy full-window highlights.
- `/health` reports `status=warming` until the selected OCR model is actually loaded.
- The desktop hotkey scans the monitor under the mouse pointer immediately and renders a full-screen screenshot review overlay with highlights and selectable terms.
- The manual Capture Region and review-overlay Precise Region controls open a screenshot-backed selector. It dims the screenshot, keeps the selected crop bright, and scans when the mouse is released.
- The desktop overlay renders the captured image first; this helps diagnose macOS Screen Recording permission issues because blocked captures often appear blank.
- Blank captures now stop before OCR and show a permission-focused message instead of an empty review or region-selector window.
- Runtime overlay diagnostics are written to `~/.yomunami-overlay.log`.
- If a user sees text but no boxes, check `/api/ocr/health` for `active_backend` and `boxes_available`.
