# Changelog

All notable changes to this project will be documented here.

This project follows semantic versioning.

## 0.6.0 - 2026-06-14

- Add a PyInstaller build path for `Yomunami OCR Overlay.app` on macOS.
- Make the browser launcher prefer the named app bundle when present, falling back to the Python runtime for development.
- Add Runtime Doctor visibility for the packaged desktop overlay app.
- Document the macOS permission flow around the named overlay app.

## 0.5.0 - 2026-06-14

- Make the desktop overlay hotkey scan the current screen immediately instead of opening region selection.
- Add a full-screen OCR review overlay with screenshot-backed highlights, OCR text, selectable term candidates, and add-to-tracker controls.
- Keep precise region capture available for noisy pages, stylized game fonts, and dense layouts.

## 0.4.1 - 2026-06-14

- Preserve EasyOCR bounding boxes through the local OCR API.
- Add captured-image preview and OCR highlight boxes to the desktop overlay.
- Report OCR model warmup state in the browser and avoid duplicate OCR model/process starts while warming.
- Default OCR to `auto`, preferring EasyOCR highlights when installed and falling back to MangaOCR text recognition.
- Document the box-aware OCR overlay workflow and reproducible OCR engine dependencies.

## 0.4.0 - 2026-06-14

- Add a local OCR service launcher endpoint for starting `services/ocr/app.py` from the API.
- Add Capture and Runtime controls for starting and refreshing the OCR engine from the browser.
- Improve OCR service diagnostics so missing engine dependencies are surfaced in Runtime Doctor.

## 0.3.0 - 2026-06-14

- Add Runtime Doctor API checks for overlay dependencies, writable local paths, macOS permission hints, and companion service health.
- Add a Runtime page in the browser control center with actionable local setup diagnostics.
- Improve the desktop OCR overlay first paint and responsiveness by moving resource, OCR, and term-save requests off the UI thread.

## 0.2.0 - 2026-06-14

- Add the browser landing page and polished local control-center navigation.
- Add Capture controls for desktop overlay status, overlay launch, and resource-linked screenshot OCR.
- Add resource tracker UI for OCR-derived and manual terms.
- Add resource quiz UI with local quiz-session persistence.
- Harden desktop overlay launch, OCR term frequency tracking, and source-image validation.

## 0.1.0 - 2026-06-14

- Start local-first rebuild from an empty repository.
- Define repository layout, privacy constraints, and documentation conventions.
- Add the local TypeScript API with SQLite persistence, local upload storage, and localhost OCR/recognition/speech service proxies.
- Add local Python OCR, KanjiDraw recognition, and speech-model services.
- Add the Vite/React local-first web app shell for resources, lookup, OCR, drawing recognition, and speech controls.
- Add desktop overlay launch API, OCR-derived resource terms, quiz session persistence, and a local hotkey screen-capture OCR overlay client.
