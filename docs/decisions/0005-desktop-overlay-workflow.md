# 0005: Desktop Overlay Workflow

Date: 2026-06-14

## Status

Accepted

## Context

The core product loop is not only uploading screenshots after the fact. The learner should be able to play a game or read in any app, press a hotkey, OCR a screen region, and add useful words or kanji to a resource tracker.

## Decision

Add a local desktop overlay companion:

- Python/Tk client in `services/desktop-overlay`.
- Global hotkey defaults to `ctrl+shift+o`.
- Drag-select screen region capture using `mss`.
- OCR through the local API and OCR service.
- User reviews candidates before adding selected terms to a resource.
- Overlay captures call the generic OCR endpoint first; screenshot persistence is a separate explicit workflow, not a side effect of recognizing text.
- The web app can launch the overlay through a fixed local API endpoint that starts only the known overlay script.

## Consequences

- The browser cannot directly capture arbitrary game windows, but the local API can launch a trusted companion process.
- The overlay remains local-only and avoids account tokens.
- Overlay OCR does not save screenshots before the learner chooses what to track.
- Screen capture permissions are OS-specific; macOS users may need Screen Recording and Accessibility grants.
- Future packaging can wrap this script into a signed desktop binary.
