# Desktop Overlay Notes

## Product Flow

- Resource selected in overlay.
- Hotkey opens a translucent drag-to-select overlay.
- Selected region is captured with `mss`.
- Image posts to `POST /api/ocr/image` for recognition only.
- OCR candidates are displayed as checkboxes.
- Selected terms post to `POST /api/resources/:resourceId/terms/bulk`.
- Screenshot persistence should remain explicit; the overlay does not save captures before term confirmation.

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
