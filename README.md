# Kakomu

Kakomu is a local-first Japanese learning app for collecting words, kanji, and grammar from games, manga, videos, books, and websites. It combines screen capture, OCR, grammar detection, a study library, dictionary lookup, handwriting recognition, quizzes, and spaced review.

## Apps

- **Desktop app:** the primary experience. It starts its private API and managed OCR and handwriting workers automatically. Screen capture is built into Electron.
- **Web app:** a client for an already-running Kakomu backend. It never starts or stops local services.
- **Local API:** the shared backend used by both apps, with SQLite and local file storage.

Desktop data is stored under the operating system's Kakomu user-data directory. On first launch after upgrading, Kakomu moves an existing Yomunami profile into that directory without replacing any existing Kakomu profile. Web development defaults to `data/local/app.sqlite` and `uploads/`. Databases, uploads, models, `.env` files, and service credentials are ignored by git.

## Requirements

- Node.js 24 or newer
- Python 3.12 when developing or packaging companion services

Install JavaScript dependencies:

```bash
npm install
```

## Desktop Development

Create a virtual environment in each service directory when you want the managed development workers available:

```powershell
py -3 -m venv services/ocr/.venv
services/ocr/.venv/Scripts/python -m pip install -r services/ocr/requirements.txt

py -3 -m venv services/recognize/.venv
services/recognize/.venv/Scripts/python -m pip install -r services/recognize/requirements.txt
```

On macOS/Linux, use `.venv/bin/python` in the same commands.

Start the complete desktop app:

```bash
npm run dev:desktop
```

The desktop main process chooses a private API port, stores data outside the repository, supervises available workers, and owns native screen capture. Press `Ctrl/Cmd+Shift+O` from any application to capture the display under the pointer. Closing the window keeps Kakomu and OCR available in the system tray; use the tray's Quit command to stop the app and its services. Captures return to the main window for cropping, OCR and grammar review, and selective term saving.

## Web Development

Start the standalone API and web client:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. The browser can use capture uploads and backend features, but service lifecycle remains external to the web client.

## Testing

```bash
npm run check
npm test
npm run test:desktop:e2e
```

The Electron suite launches the real main process with isolated user data and verifies the preload bridge, embedded API, SQLite creation, file-safe navigation, desktop controls, and narrow-window layout. CI runs it on Windows, macOS, and Linux.

## Packaging

Build the native Python sidecars, then create the installer for the current platform:

```bash
npm run build:desktop-sidecars
npm run make:desktop
```

Installers are written to `apps/desktop/release/`. Tag pushes matching `v*` build Windows, macOS, and Linux artifacts and publish a GitHub release. Production signing credentials can be supplied through the standard electron-builder environment variables.

## Repository Layout

```text
apps/
  api/       Shared local TypeScript backend
  desktop/   Electron main process, preload, packaging, and E2E tests
  web/       Shared React renderer and browser client
services/
  ocr/             Japanese OCR worker
  recognize/       KanjiDraw handwriting worker
scripts/           Data import and desktop packaging tools
tests/             Python source and packaging tests
```

## Data Sources

Kakomu supports local KANJIDIC2, JMdict, sentence-example, and derived kanji-graph imports. Imports can be started from **Settings > Dictionary data** or with the scripts in `scripts/`.

Downloaded datasets remain local and should not be committed.

## Security

- The desktop API binds to `127.0.0.1` on an ephemeral port and requires a per-launch authentication token for `/api` requests.
- The renderer uses context isolation, sandboxing, a narrow preload bridge, navigation restrictions, a Content Security Policy, ASAR integrity validation, and hardened Electron fuses.
- Companion workers bind to loopback addresses and are supervised by the desktop main process.
- Cloud deployment, hosted object storage, and public API exposure are outside this repository's scope.

This project follows semantic versioning. See [CHANGELOG.md](CHANGELOG.md) for release notes.
