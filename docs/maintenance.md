# Maintenance policy

## Dependencies

- Node dependencies are locked by `package-lock.json`. CI installs with `npm ci` and rejects high-severity advisories with `npm audit --audit-level=high`.
- Direct Python dependencies are exact-pinned in each installed companion service, with transitive versions in `constraints.txt`. Recreate an environment with `python -m pip install -c constraints.txt -r requirements.txt`. Packaging uses the corresponding build requirements and constraints files.
- Dependabot checks npm and Python inputs weekly. Dependency updates should pass type checks, tests, builds, and the audit gate before merge.
- The current target no longer installs the retired OCR and speech-model Python services; OCR/speech URLs remain configurable for external local companions.

## Review scheduling

Reviews use two ratings: `Correct` and `Again`. A correct answer advances one stage and schedules intervals of 1, 3, 7, 14, 30, 60, 120, 240, then 365 days. `Again` moves back one stage, increments lapses, and schedules a retry in 10 minutes. Review timestamps are stored and compared as UTC ISO-8601 values; the browser formats them in local time.

Quiz results update scheduling and XP in the same SQLite transaction as the saved quiz session. Resetting a review preserves accumulated XP while clearing its stage and lapses. Suspending hides an item from due queues, and mastery clears its next review while retaining history.

## Backups

Backups contain a SQLite online backup, referenced uploads, and a SHA-256 manifest. Restore verifies every file and creates a safety backup before atomically swapping local data. Backup directories are local and are not a substitute for copying important backups to another device.

Imported public dataset rows are included because they live in SQLite. Original compressed downloads under `data/local/imports` are not copied; they are rebuildable by rerunning the importer. User-created captures and recordings referenced by SQLite are included.

## Upload failure policy

Transient OCR and speech uploads are removed in `finally` blocks. Persistent media is deleted when its owning capture, recording, or resource is deleted. File paths are rejected unless they resolve inside the configured upload root. Deletes first rename files into a private staging directory; a database failure restores them, while a successful row deletion commits by removing the staged files. The Data screen can report and remove files that predate these guarantees.

## Runtime diagnostics and search

Runtime Doctor executes Python probes asynchronously with a seven-second process timeout and caches the result for 30 seconds. Companion HTTP timeouts and response/file memory limits are configurable in `apps/api/.env.example`.

Dictionary, kanji, and sentence searches use SQLite FTS5 with NFKC query normalization, case folding, exact/prefix ranking, and deterministic ID tie-breakers. Import writes refresh indexes through triggers in the same transaction. The automated 5,000-row fixture targets less than 500 ms per lookup in CI; release checks against full local datasets should use the same ceiling.
