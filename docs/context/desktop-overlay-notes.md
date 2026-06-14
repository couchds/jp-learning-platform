# Desktop Overlay Notes

## Product Flow

- Resource selected in overlay.
- Hotkey scans the monitor under the pointer and opens a full-screen screenshot review overlay.
- Select tighter region opens a screenshot-backed region selector for snug crops.
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

- `npm run build:overlay:macos` builds `services/desktop-overlay/dist/Yomunami OCR Overlay.app`.
- The app bundle uses `com.yomunami.ocr-overlay` so macOS Screen Recording and Accessibility permissions attach to a recognizable Yomunami identity.
- The API launcher prefers the app bundle executable when present and falls back to the Python development runtime when it is missing.
- Future product passes can add a custom icon, notarization, auto-start options, and system-tray controls.
