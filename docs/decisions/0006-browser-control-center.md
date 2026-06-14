# 0006: Browser Control Center

Date: 2026-06-14

## Status

Accepted

## Context

The app needs to feel like a full local product, not only a collection of API endpoints and companion scripts. The learner should be able to start from the browser, see what the tool can do, launch the desktop OCR overlay, track terms by source, and practice from those terms.

## Decision

Make the React app the primary local control center:

- Home explains the local workflow and surfaces workspace counts.
- Capture owns overlay status, overlay launch, and screenshot OCR controls.
- Tracker owns resource-scoped OCR/manual term review.
- Quiz owns resource-scoped recall sessions generated from tracked terms.
- Arbitrary-window capture remains in the desktop overlay because browsers cannot reliably capture games, emulators, and other native windows.

## Consequences

- The browser remains the daily command surface while OS-level screen capture stays in a local companion.
- Product navigation is organized around learner workflows rather than service boundaries.
- Future desktop packaging can keep using the same local API contracts.
