# Local tracker implementation handoff — November 26, 2026

The backend core is implemented. The web application is not yet runnable.

## Implemented and verified

- Immutable byte-preserving archives, size limits, versioned DuckDB migrations,
  coordinated writes and consistent read snapshots.
- Bet88 schema-v1 validation, exact decimals, printed source times and optional
  explicit timezone/currency context; both runouts and all ordered events.
- Durable import jobs, per-record results, duplicates/conflicts, submission
  provenance, atomic completion, retries, worker and restart recovery.
- Stable non-recursive folder discovery, durable watch receipts, replacement
  detection and changed-file reconsideration. Periodic scheduling is still pending.
- Cursor-paginated hand queries, inclusive printed-minute filters, full detail and
  provenance, and basic library/import overview queries.

93 backend tests pass. The existing 29 Node and 12 Firefox acquisition tests and
static checks pass. The build includes both SQL migrations and installed package
dependencies are compatible.

The personal 1,145-hand export imported as 1,145 new records, then 1,145 duplicates
under another filename, retaining one archive and all 18,382 events. Archived bytes
match the input SHA-256. After the review fixes, the same file again classified as
1,145 duplicates. Migrating the earlier smoke database preserved all hands and
backfilled its submission filenames/triggers. Smoke data lives under `/tmp`, not
the application's default data directory.

Independent core review found six material issues. Each was reproduced with a
failing test and fixed: coalesced submission provenance, foreign-source rejection,
atomic watch acceptance, preserved-mtime overwrite detection, lossless additive
JSON numbers and consistent read snapshots. No minor findings were deferred.

## Remaining work

Continue the [implementation plan](../superpowers/plans/2026-11-25-local-tracker.md)
at Task 4's HTTP/lifecycle portion. Then implement the React Imports/settings UI,
hand/overview HTTP routes and UI, and full local application acceptance/review.
The `frontend` directory currently contains only a private dependency-bootstrap
manifest. The approved preview remains the UI target.

This session cannot resolve PyPI or npm registry hostnames. FastAPI/multipart and
React/Vite/Vitest are not locally cached. [Backend setup instructions](../../backend/README.md)
include the exact commands to install these prerequisites from a terminal with
internet access. Their compatible resolved versions must be pinned before continuing.
The selected stack has not changed.

Canonical payloads can contain Decimal values for additive source numbers. The HTTP
layer must use `poker_tracker.json_codec.encode_json` rather than converting these
through floats. Watch discovery must pass its receipt into `Importer.enqueue` so
the signature and accepted job remain atomic. Start one worker/process per database
and call recovery before startup discovery/processing.

## Commit delivery

The repository's `.git` is read-only in this session. The working files are updated,
but the normal branch has not been changed. Commits were prepared on `feat/local-tracker`
using temporary Git metadata and bundled at `dist/local-tracker-core.bundle`, based
on `b729c37`. The bundle includes the approved design/preview and separate storage,
normalizer, importer, scanner, query, review-fix and setup-documentation chunks.

To import this history from your own terminal at the repository root, while the
normal checkout is still on its original base:

```bash
git fetch dist/local-tracker-core.bundle feat/local-tracker
git switch -c feat/local-tracker
git reset --mixed FETCH_HEAD
```

This keeps the existing working files and records their prepared history on the
feature branch. It does not use a hard reset. If you have already advanced the
repository's history or created that branch, reconcile the bundle with that history
instead of repeating these commands unchanged.
