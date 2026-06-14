# 0012 macOS Overlay App Bundle

## Status

Accepted

## Context

The desktop OCR overlay originally launched as a generic Python process. On macOS, Screen Recording and Accessibility permissions are attached to the process/app identity shown by the operating system. A generic `Python` entry makes it unclear which item should receive permission, and permission grants may not transfer predictably between terminal, browser-launched, and app-launched workflows.

## Decision

Add a PyInstaller-based macOS app bundle build for `Yomunami OCR Overlay.app` with bundle identifier `com.yomunami.ocr-overlay`.

The local API launcher prefers the packaged app executable when it exists. If the app has not been built, the launcher falls back to the Python development runtime so local iteration remains simple.

## Consequences

- macOS permission prompts can name Yomunami instead of a generic Python runtime.
- The browser control center can launch the same app identity the user grants Screen Recording and Accessibility permissions to.
- Developers can still run `overlay.py` directly while iterating.
- Built app artifacts stay out of git; contributors rebuild them locally with `npm run build:overlay:macos`.
