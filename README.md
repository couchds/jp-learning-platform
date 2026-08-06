# Yomunami

Yomunami is a local-first Japanese learning app for collecting words and kanji from games, manga, videos, books, and websites. It combines screen capture, OCR, a study library, dictionary lookup, handwriting recognition, quizzes, and spaced review.

## Apps

- **Desktop app:** the primary experience. It starts its private API and managed OCR, handwriting, and screen-capture workers automatically.
- **Web app:** a client for an already-running Yomunami backend. It never starts or stops local services.
- **Local API:** the shared backend used by both apps, with SQLite and local file storage.

Desktop data is stored under the operating system's Yomunami user-data directory. Web development defaults to `data/local/app.sqlite` and `uploads/`. Databases, uploads, models, `.env` files, and service credentials are ignored by git.

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

py -3 -m venv services/desktop-overlay/.venv
services/desktop-overlay/.venv/Scripts/python -m pip install -r services/desktop-overlay/requirements.txt
```

On macOS/Linux, use `.venv/bin/python` in the same commands.

Start the complete desktop app:

```bash
npm run dev:desktop
```

The desktop main process chooses a private API port, stores data outside the repository, supervises available workers, owns the global capture command, and shuts everything down with the app.

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
  desktop-overlay/ Screen-capture review overlay
  ocr/             Japanese OCR worker
  recognize/       KanjiDraw handwriting worker
scripts/           Data import and desktop packaging tools
tests/             Python source and packaging tests
```

## Data Sources

Yomunami supports local KANJIDIC2, JMdict, sentence-example, and derived kanji-graph imports. Imports can be started from **Settings > Dictionary data** or with the scripts in `scripts/`.

Downloaded datasets remain local and should not be committed.

## Security

- The desktop API binds to `127.0.0.1` on an ephemeral port and requires a per-launch authentication token for `/api` requests.
- The renderer uses context isolation, sandboxing, a narrow preload bridge, navigation restrictions, a Content Security Policy, ASAR integrity validation, and hardened Electron fuses.
- Companion workers bind to loopback addresses and are supervised by the desktop main process.
- Cloud deployment, hosted object storage, and public API exposure are outside this repository's scope.

This project follows semantic versioning. See [CHANGELOG.md](CHANGELOG.md) for release notes.
