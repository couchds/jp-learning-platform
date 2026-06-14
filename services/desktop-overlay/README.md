# Desktop OCR Overlay

Local desktop companion for capturing Japanese text from any visible window: games, browser tabs, emulators, video players, or documents.

## Setup

```bash
cd services/desktop-overlay
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python overlay.py
```

The overlay talks to the local API at `http://127.0.0.1:3001` by default. The API can also launch it from the web app control panel through `POST /api/desktop/overlay/launch`.

The browser launcher prefers `services/desktop-overlay/.venv/bin/python` when that virtual environment exists. If it is missing, the launcher falls back to the system `python3`, which must have the packages from `requirements.txt` installed.

When launched from the browser, the API passes `YOMUNAMI_WEB_URL` so the overlay's Open Web App button returns to the active Vite port. Manual launches default to `http://127.0.0.1:5173`.

## Flow

1. Start the API and OCR service.
2. Start the overlay.
3. Select a resource.
4. Press the hotkey, default `ctrl+shift+o`, to scan the monitor under your mouse pointer.
5. Review the full-screen screenshot overlay, OCR highlights, OCR text, and terms to save.
6. Use **Save checked terms** to add checked terms to the resource tracker.
7. Use **Select precise region** or **Select tighter region** when a game or dense page needs a tighter crop. The selector shows a dimmed screenshot with a visible capture box; drag around the Japanese text and release to scan that exact region.

macOS may ask for Screen Recording and Accessibility permissions for terminal or Python before global hotkeys and capture can work.
If the overlay shows a blank capture warning, grant Screen Recording permission to Python, Terminal, or the launcher, then quit and relaunch the overlay. Runtime diagnostics are written to `~/.yomunami-overlay.log`.
