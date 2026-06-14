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

## Flow

1. Start the API and OCR service.
2. Start the overlay.
3. Select a resource.
4. Press the hotkey, default `ctrl+shift+o`.
5. Drag a screen region.
6. Review OCR terms.
7. Add selected terms to the resource tracker.

macOS may ask for Screen Recording and Accessibility permissions for terminal or Python before global hotkeys and capture can work.
