# Desktop Overlay Notes

## Product Flow

- Resource selected in overlay.
- Hotkey opens a translucent drag-to-select overlay.
- Selected region is captured with `mss`.
- Image posts to `POST /api/ocr/resources/:resourceId/images`.
- OCR candidates are displayed as checkboxes.
- Selected terms post to `POST /api/resources/:resourceId/terms/bulk`.

## API Additions

- `GET /api/desktop/overlay/status`
- `POST /api/desktop/overlay/launch`
- `GET /api/resources/:id/terms`
- `POST /api/resources/:id/terms`
- `POST /api/resources/:id/terms/bulk`
- `GET /api/resources/:id/quiz/deck`
- `POST /api/resources/:id/quiz/sessions`
- `GET /api/resources/:id/quiz/sessions`

## Packaging Notes

The script is intentionally plain Python for now. A later product pass can add PyInstaller packaging, app signing, auto-start options, and system-tray controls.
