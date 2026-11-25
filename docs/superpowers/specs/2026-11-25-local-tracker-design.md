# Local Poker Tracker: ingestion and first UI

Status: approved for implementation on November 26, 2026. The Imports screen preview was accepted; implementation is in progress.

## Intent and agreed direction

Build a personal poker tracker, starting with trustworthy imports and an inspectable hand library. The application runs on the user's computer and opens in a browser. Support manual JSON uploads and automatic import from a configured directory. Preserve original source files unchanged and build analytical data from them. Continue using the existing Firefox acquisition extension as the producer of JSON exports.

The approved visual direction is `docs/previews/local-imports.html`; `docs/previews/local-imports.png` is its static preview. The example import row is illustrative data, not an implemented import.

## Approaches considered

| Approach | Tradeoff | Decision |
|---|---|---|
| Local Python API, browser UI, embedded DuckDB | Suits batch imports and analytical queries; application coordinates database ownership | Recommended for the first version |
| Local PostgreSQL with browser UI | Strong transactional server and concurrent clients; requires installing and operating a database service | Valid alternative, unnecessary setup for the agreed initial use |
| Hosted application with local import agent | Enables access from other devices; adds hosting, authentication, and a second installed component for folder watching | User excluded hosting from the current scope |

The user selected local execution. Python, React, and DuckDB are proposed implementation choices, not a development/production database switch. The application uses DuckDB during development and normal local use.

## First release

- Imports page matching the accepted layout: upload JSON, configure one watched directory, enable/pause watching, and view import history and results.
- Hands page: paginated hand list, printed date range and table filters, and complete hand detail with players, cards, grouped events, and both runouts when present.
- Overview page: library hand count, source-file count, import issues, and observed printed-date range. Advanced poker statistics are a later stage.
- Minimal settings: source timezone, source currency code, and hero screen name can be recorded, but are initially unset. None is required to import or browse hands.
- Import history shows new, duplicate, and rejected counts. Conflicting versions are a rejected subtype with an explanation. File-level failures show a clear error instead of misleading row counts.
- Settings, source archives, database, and import history survive application restarts.

Later stages include sessions, positions, derived player statistics, charts, hand replay, and a HUD. They need separate definitions and acceptance criteria. The initial schema must preserve enough source detail to derive them later.

## Components and repository layout

```text
acquisition/                    existing Firefox exporter and its tests
backend/
  pyproject.toml
  src/poker_tracker/
    api/                        HTTP routes and response models
    ingestion/                  archive, validation, normalization, importer, scanner
    storage/                    schema, migrations, repositories, write coordination
    queries/                    hand list, hand detail, overview
    main.py                     application factory and lifecycle
    settings.py                 data-root and runtime settings
  tests/
frontend/
  package.json
  src/features/imports/
  src/features/hands/
  src/features/overview/
  src/features/settings/
  src/api/                      typed client and contracts
data/                           ignored runtime data, configurable location
  sources/<hash-prefix>/<sha256>.json
  tracker.duckdb
docs/                           design, plans, and approved preview
```

Use Python 3.12+, FastAPI/Pydantic, and the DuckDB Python library. Use React, TypeScript, and Vite for the UI with ordinary CSS based on the preview. Use pytest/httpx for backend tests and Vitest/Testing Library for frontend behavior. Pin compatible dependency versions and commit lock files during implementation. Node 24 is already used by acquisition.

Bind the API to `127.0.0.1:8000`. Frontend development uses Vite on `127.0.0.1:5173` with `/api` proxied to the backend. A built frontend can be served by the backend. Use a single backend worker process. The data root defaults to repository `data/`, overridable by `POKER_TRACKER_DATA_DIR` and by test settings.

One ingestion worker processes imports sequentially. All database mutations share a writer lock; threads use their own database connections rather than concurrently sharing one connection. Read queries use separate connections within the same process. Parsing and disk work must not run on the HTTP event loop. No external queue or second database is required for this release.

## One ingestion pipeline

Uploads and folder scans both call the same enqueue/import services:

1. Obtain a stable candidate file, enforce the configured size limit, and stream its bytes to a temporary archive file while computing SHA-256.
2. Finalize the content-addressed archive atomically. Preserve the exact input bytes, including formatting and any fields from older exporters. The submitted filename is metadata, never the archive path.
3. Register the source and a durable import job, then acknowledge the upload. A job is not accepted solely into an in-memory queue.
4. Validate the JSON envelope and each hand; normalize accepted records using a recorded importer version.
5. Insert accepted hands, their normalized child rows, provenance, errors, final counts, and completed job status in one DuckDB transaction.

Original files remain the recovery source. Structured hand payloads in the database exclude `raw_html`, matching the latest exporter; the immutable original file can still contain it if supplied by an older exporter.

### Validation and partial files

Initially support only the current Bet88 `schema_version: 1` JSON envelope. Require `hands` to be an array and verify `hand_count` if present. Unknown additive fields do not invalidate the file. Unsupported schema versions and malformed JSON are file-level failures with zero committed hands. Archive invalid inputs that fit the size limit, so errors can be investigated and retried.

Validate each hand independently: UUID, printed time, table name, distinct player names within the hand, monetary strings, and ordered phases/events. Reject an invalid hand with its source index and reason while allowing other valid hands from that file to commit. Preserve system events with null players, Unicode names, hidden cards, early-ending hands, and all repeated `Table Cards Dealt` groups. Do not require every hand to reach the river.

An export marked `partial: true` may contain valid hands. Import them and retain its coverage warning. A successful import does not prove that the requested day or range was fully captured; show observed coverage and source completion metadata.

Initial upload limit: 100 MiB, configurable. Oversize inputs are rejected before acceptance and are not copied into the archive. No source file in the watched directory is moved, edited, or deleted.

### Deduplication and conflicts

- The archive deduplicates identical bytes by SHA-256, independent of filename.
- A job outcome is tracked per import attempt. A manual re-upload of an already processed file validates/classifies its rows again: known identical hands become duplicates and invalid rows remain visible rejections. Scans do not create a new history entry on every pass over unchanged files.
- An already active job for the same source/hash/importer version is coalesced instead of processed twice.
- Canonical hand identity is `(source_id, hand_id)`, initially `source_id = bet88`. File boundaries do not define hand identity.
- Compare a deterministic hash of the structured hand payload, excluding `raw_html` and object-key order while preserving array order and values. Identical payloads are duplicates; link the source to the existing hand without inserting another analytical row.
- A different payload for an existing hand ID is a conflict. Preserve the source and conflicting payload association, report it as rejected/conflict, and retain the existing canonical hand. Do not silently overwrite results or merge information in this release.

### Failure and restart behavior

The archive must be finalized before a durable queued job refers to it. An archive left without a job after a crash is harmless; a retry can reuse it. A queued job can be recovered after restart without the original upload request or watched file still existing.

Jobs move through `queued`, `processing`, and terminal `completed`, `completed_with_errors`, or `failed`. Queued jobs resume at startup. A job found processing after restart is retried from its archived source. The transaction boundary prevents half an import from appearing as complete. On database failure, roll back that import's records and record a failed job separately. Completed jobs remain completed if the process dies before notifying the browser.

## Automatic directory import

Use a non-recursive directory scanner every two seconds, plus an immediate scan at service startup, on enable, and on manual rescan. This avoids relying on delivery of filesystem events. Ignore non-JSON files and temporary downloads such as `.part` files. Require unchanged size and modification time across two scans before staging a file. Detect changes during copying and defer unstable files.

The default suggested directory is the user's `Downloads/PokerTracker`; the editable actual path is persisted. Watching is disabled initially and resumes on startup only if it was enabled. A bad/missing directory displays a watcher error, preserves the configured path, and remains editable. Pausing stops discovery of new jobs; already accepted imports finish. Re-scan changed files after a prior parse failure instead of permanently remembering the filename as processed. Exclude the archive from allowed watch locations.

## Database responsibilities

Use migrations with a stored schema version. Proposed tables:

| Table | Purpose and identity |
|---|---|
| `source_files` | Unique content hash, archive path, byte size, source metadata |
| `import_jobs` | Job ID, source hash, trigger, original filename, importer version, status, counts, timestamps, error |
| `import_hand_results` | Job plus source array index, hand ID/hash, new/duplicate/rejected/conflict outcome and reason |
| `hands` | Unique source + hand ID, canonical payload hash and structured payload, table, printed time, precision and nullable timezone/UTC fields |
| `hand_sources` | Links canonical or conflicting payloads to their source file and record index |
| `hand_players` | Source + hand + exact screen name; balances, result, final cards |
| `hand_phases` | Source + hand + phase ordinal; original label, board and new cards |
| `hand_events` | Source + hand + phase ordinal + event ordinal; type, nullable player, label/code, amount and cards |
| `app_settings` | Watched-directory state and explicit source/hero settings |

Canonical structured payloads and ordered normalized tables preserve source semantics; analytical views can later derive player-hand facts without rescanning the website. Expose an initial library-summary query; do not invent VPIP/PFR, positions, rake, or all-in equity from missing/ambiguous fields.

Keep money as Python Decimal/DuckDB `DECIMAL(24,8)` plus original display strings. Reject unsupported numeric formats or precision rather than rounding silently. Preserve the displayed currency symbol; an ISO currency is nullable until explicitly configured. Do not sum unresolved or mixed currencies into one total.

Keep `started_at_local` as the source's printed value, with minute precision. The current JSON does not identify a timezone. `source_timezone` and `started_at_utc` stay null until explicitly configured; the first UI filters and sorts by printed time. Never infer the source timezone from the operating system. Hero identity is an explicit exact screen name, not a name guessed from the first file.

Explicit source settings apply as context to new canonical imports. They do not silently reinterpret existing hands; retrospective conversion/rebuilding is later work. Ambiguous or nonexistent local times under a configured timezone keep UTC null with a quality flag. Hero settings do not affect hand identity or ingestion outcomes. This release does not present advanced or monetary aggregate statistics dependent on those settings.

## API and UI contracts

All application endpoints use `/api`. List endpoints return `{items, next_cursor, total}`, default to 50 items, and cap requests at 200. Hand sorting breaks timestamp ties by source and hand ID.

- `POST /api/imports`: multipart upload; returns a durable job ID and initial status (202).
- `GET /api/imports`: paginated attempts with trigger, filename, status and counts.
- `GET /api/imports/{job_id}`: job metadata and paginated rejection/conflict details.
- `POST /api/imports/{job_id}/retry`: reuses the archived file; does not require another upload. Active retries coalesce.
- `GET/PATCH /api/settings`: persist the watch path/enabled flag and nullable source/hero settings. Validate before applying changes.
- `GET /api/watcher`: configured/effective state, last scan, and actionable error.
- `POST /api/watcher/rescan`: schedules a scan; does not bypass stability/deduplication.
- `GET /api/hands`: printed date/table filters; paginated summaries.
- `GET /api/hands/{source_id}/{hand_id}`: complete canonical structured hand, quality flags, and provenance.
- `GET /api/overview`: library counts, observed printed dates, and import issue counts.

The frontend polls active import/watcher status once per second and refreshes history/library counts after completion. Counts represent committed results, not placeholder values. Show loading, empty, completed, completed-with-errors, and failed states. Import errors remain inspectable and retryable. Native file selection and directory-path entry must work with the keyboard. An invalid path or file shows an inline error without clearing history.

## Acceptance criteria

1. Uploading a valid export makes its complete hands browsable; the archived bytes match the input SHA-256.
2. Re-uploading the file under another name creates no additional canonical hands or player results.
3. Overlapping exports add only previously unseen hands; changed payloads for an existing ID are visible conflicts.
4. Both runouts, system events, hidden cards, Unicode names, and early-ending hands survive normalization and detail rendering.
5. A watched completed JSON file imports automatically; `.part` files, growing files, and unchanged already-seen files do not produce repeated jobs.
6. Restarting during import produces no duplicate/half-imported data and recovers queued work from the archive.
7. Invalid hands are counted with useful reasons, and valid hands in the same file remain available. Invalid envelopes fail without committing hands.
8. The accepted screen is implemented with real server data and preserves watcher settings across restarts.
9. The existing acquisition tests continue passing. Runtime data, archives, and local exports stay outside Git.

## Builder choices and references

The builder chooses internal Python types, batching sizes, exact compatible dependency pins, SQL indexes, and low-level component composition within these contracts. Defaults above are proposed design choices for review.

- https://duckdb.org/docs/stable/connect/concurrency
- https://fastapi.tiangolo.com/
- Existing exporter contract: `acquisition/extension/lib/exporter.js` and the real samples in `acquisition/html_samples/`.
