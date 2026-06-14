# 0010 Hotkey Screen Review Overlay

## Status

Accepted

## Context

The learner expects the desktop hotkey to feel like an in-context reading aid: press a command while a game, browser tab, emulator, or document is visible, then see recognized Japanese text highlighted immediately. The previous drag-to-select flow was useful for precision, but it made the overlay feel like a separate screenshot utility instead of an always-ready companion.

## Decision

Make the global hotkey scan the monitor under the mouse pointer immediately. The overlay hides its control panel, captures that screen, sends it through local OCR, and opens a full-screen screenshot review layer with highlight boxes, OCR text, selectable term candidates, and add-to-tracker controls.

Keep manual region capture available as a precise fallback for dense pages, stylized fonts, and noisy full-screen layouts.

## Consequences

- The first hotkey press now produces the expected visual OCR overlay instead of a region selector.
- Full-screen OCR can be noisier and slower than tight crops, especially for dense browser pages.
- The full-screen review layer uses a screenshot rather than drawing on top of the live underlying app, which keeps the workflow local and stable across games and native windows.
- Future work can add a floating live-overlay mode once packaging and OS permission handling are stronger.
