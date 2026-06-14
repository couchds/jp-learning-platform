# 0001: Local-First Rebuild

Date: 2026-06-14

## Status

Accepted

## Context

The source app mixed local learning workflows with public deployment concerns: PostgreSQL, Terraform, Google Cloud Storage, optional email delivery, token-based auth, and hosted AI-service assumptions. The new repository should preserve the learning product, OCR, handwriting recognition, and local ML capabilities without carrying over public-internet deployment complexity.

## Decision

Rebuild as a local-first monorepo:

- TypeScript API with SQLite and local filesystem storage as defaults.
- React frontend served locally.
- Python OCR, handwriting recognition, and speech-model services as optional local companion processes.
- No cloud storage, Terraform, email service, service account, or secret defaults in this phase.
- Documentation for future design choices goes in `docs/decisions/`.
- Operational/context notes for future maintainers and Codex runs go in `docs/context/`.

## Consequences

- Local setup should be easier and safer for personal study data.
- Public deployment will need a later, explicit design pass.
- Some old auth and cloud code will be intentionally removed rather than ported.
- Heavy ML/OCR dependencies remain isolated from the core Node install.
