# 0013: Electron-Native Capture and Integrated OCR Review

Date: 2026-08-07

## Status

Accepted. Supersedes the UI and service-launch decisions in 0005, 0006, 0008, 0010, 0011, and 0012.

## Context

The Python/Tk overlay duplicated the product UI, required a third managed worker, opened a separate review window, and made screen permissions attach to a companion process. Yomunami now has a packaged Electron client capable of owning native capture directly.

## Decision

- Capture the display under the pointer with Electron's desktop capture API.
- Briefly hide the main window before capture and return the screenshot through the isolated preload bridge.
- Route the global capture shortcut into the main Capture page.
- Keep cropping, OCR review, resource selection, and selective term saving in the shared React renderer.
- Remove the Python overlay worker, browser launch APIs, and overlay packaging.
- Keep OCR and handwriting recognition as supervised sidecars; the web client consumes an existing backend without managing services.

## Consequences

- Yomunami presents one learner-facing UI instead of a main app plus an overlay control panel.
- Screen Recording permission belongs to Yomunami on macOS.
- Desktop installers are smaller and no longer package Tk, MSS, pynput, or overlay-specific dependencies.
- Screen capture remains desktop-only while image upload OCR remains available in the web client.
