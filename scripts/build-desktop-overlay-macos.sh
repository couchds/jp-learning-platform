#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERLAY_DIR="$ROOT_DIR/services/desktop-overlay"
PYTHON_BIN="${PYTHON:-python3}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The desktop overlay app bundle is only supported on macOS." >&2
  exit 1
fi

cd "$OVERLAY_DIR"

if [[ ! -d .venv ]]; then
  "$PYTHON_BIN" -m venv .venv
fi

source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-build.txt
python -m PyInstaller --clean --noconfirm YomunamiOverlay.spec

APP_PATH="$OVERLAY_DIR/dist/Yomunami OCR Overlay.app"
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_PATH"
fi

echo "Built $APP_PATH"
