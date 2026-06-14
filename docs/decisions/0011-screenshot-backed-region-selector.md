# 0011 Screenshot-Backed Region Selector

## Status

Accepted

## Context

Precise OCR capture was implemented as a transparent full-screen Tk window. On macOS, the whole window alpha also faded the instruction text and selection rectangle, so the interaction looked like a grey screen with no obvious next action. That made the feature feel broken even when mouse events were still being captured.

## Decision

Replace the transparent region picker with a screenshot-backed selector. The selector captures the target monitor before opening, displays a dimmed screenshot, keeps the selected crop bright while dragging, and provides a persistent instruction bar plus cancel control.

The user starts OCR by dragging around Japanese text and releasing the mouse. Tiny selections stay in the selector and show corrective guidance instead of silently cancelling.

## Consequences

- Region capture is now understandable without prior instructions.
- Selection feedback is visible on macOS because the rectangle and selected crop are not faded by window-level alpha.
- The selector operates on a screenshot instead of the live underlying window, which is consistent with the rest of the local-first OCR flow.
- Future live-overlay work can still draw on top of native windows once packaging and OS permission handling are mature.
