# 0004: Operational Web App First

Date: 2026-06-14

## Status

Accepted

## Context

The rebuild needs a frontend, but the priority is the actual local study workspace rather than marketing, onboarding, or public deployment. The old app had useful screens for resources, lookup, OCR, drawing recognition, and pronunciation training.

## Decision

Build the frontend as an operational Vite/React app:

- Sidebar navigation into dashboard, resources, lookup, OCR, drawing recognition, and speech-model controls.
- No login or signup in the local-first phase.
- Direct API calls to the local TypeScript API through `VITE_API_URL` with `http://127.0.0.1:3001` as the default.
- Use a restrained, task-oriented interface optimized for repeated study workflows.
- Use `lucide-react` icons for controls and status signals.

## Consequences

- The first screen is useful immediately when local data exists.
- Public-product pages, hosted auth flows, and deployment-focused affordances stay out of scope.
- The UI can evolve feature-by-feature without requiring a design-system extraction yet.
