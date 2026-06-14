# 0009 Box-Aware OCR Overlay

## Status

Accepted

## Context

The desktop overlay needs to make captures feel trustworthy during games, browser reading, and other arbitrary-window workflows. A text-only OCR result can populate the tracker, but it cannot show which on-screen characters were recognized. `manga-ocr` is strong for focused Japanese text crops, but it does not return bounding boxes.

## Decision

Use `OCR_BACKEND=auto` by default. The OCR service will prefer EasyOCR when it is installed because it returns text geometry, and will fall back to MangaOCR when EasyOCR is unavailable. The API will preserve OCR box metadata, image dimensions, and the active backend. The desktop overlay will render the captured crop and draw OCR highlights when boxes are available.

EasyOCR detections are filtered with `OCR_EASYOCR_MIN_CONFIDENCE`, defaulting to `0.05`, so full-window captures do not flood the overlay with near-zero-confidence boxes.

Token and kanji highlights are estimated by slicing the EasyOCR detection line. This is good enough to make captures reviewable, but it is not exact glyph geometry and will need a richer detector for vertical text, ruby-heavy text, or rotated UI.

## Consequences

- Overlay users can see whether the selected region was captured correctly and which terms were detected.
- EasyOCR becomes part of the reproducible OCR requirements for local setup.
- MangaOCR remains supported for focused text recognition, but it remains a text-only path without highlights.
- Future browser-side screenshot review can reuse the same box-aware API result shape.
