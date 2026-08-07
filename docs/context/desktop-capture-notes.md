# Desktop Capture Notes

- Electron captures the display under the pointer and briefly hides the main window so Yomunami is not included in its own screenshot.
- `Ctrl/Cmd+Shift+O` sends the captured image to the shared React renderer and opens the Capture page.
- Closing the main window hides it to the system tray so the global shortcut and managed OCR workers remain available. The tray menu can open Yomunami, start a capture, or quit the app and its services.
- The learner crops the screenshot in the main window, runs OCR, reviews suggested terms, and bulk-saves only checked items.
- The browser client supports image uploads but does not expose native screen capture or service lifecycle controls.
- The Electron main process supervises OCR and handwriting recognition workers. The shared API has no service-launch endpoints.
- macOS may require Screen Recording permission for Yomunami. Windows and Linux use the platform desktop capture implementation.
- `OCR_BACKEND=auto` prefers EasyOCR for box-aware results and falls back to MangaOCR when available.
