# 0008 Browser-Started Local OCR Service

## Status

Accepted

## Context

The desktop overlay can run while the OCR service is offline, which makes captures appear to fail even though the overlay itself is healthy. Users need a control-center workflow that can start OCR locally and explain missing OCR dependencies without requiring terminal context.

## Decision

Add `POST /api/ocr/service/launch` to start `services/ocr/app.py` from the local API. The launcher prefers `services/ocr/.venv/bin/python` when present, falls back to `python3`, passes local host/port/origin environment, and reports immediate startup stderr when the service exits.

The browser Capture and Runtime pages call this endpoint. The launcher does not install Python packages or model dependencies automatically.

## Consequences

- Users can start OCR from the web app before using overlay or screenshot OCR.
- Missing `flask`, `manga-ocr`, `easyocr`, or tokenizer dependencies surface as actionable startup or health errors.
- Heavy OCR installation remains an explicit local setup step.
- Future local service launchers should reuse this explicit-start, no-auto-install pattern.
