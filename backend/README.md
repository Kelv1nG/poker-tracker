# Local tracker backend

FastAPI coordinates one import worker, a two-second directory scanner and DuckDB.
The built React UI is served by the same loopback-only application. From the
repository root, run `make run` and open http://127.0.0.1:8000.

## Setup and tests

```bash
make setup
backend/.venv/bin/python -m pytest backend/tests -q
```

Setup uses `uv pip sync` with runtime/test and build lock files, then installs this
package editable. Python 3.12+ is required. The frontend requires Node 24+.
`make serve` starts just the API for development with Vite on port 5173.

`Settings()` selects repository `data/` by default. Override it with
`POKER_TRACKER_DATA_DIR`. `POKER_TRACKER_MAX_UPLOAD_BYTES` changes the default
100 MiB acceptance limit. Tests use temporary data directories.

## Import semantics

- A job is acknowledged after an exact content-addressed archive and durable queued
  row exist. Original filenames are metadata, never archive paths.
- Uploads and stable directory snapshots share the importer. Active matching sources
  share one processing job while retaining every filename and trigger. Watch receipts
  and queued jobs commit atomically.
- Bet88 schema v1 is supported. Unsupported/malformed envelopes fail the whole attempt;
  invalid hands reject independently with source array indexes and reasons.
- Canonical identity is `(source_id, hand_id)`. Identical structured payloads are
  duplicates. Different payloads are rejected conflicts, preserving the first version
  and conflicting source association. Conflicts are included in rejected counts.
- Canonical rows, normalized children, provenance, outcomes, counts and terminal status
  share one transaction. Startup recovers queued/interrupted jobs from archives.
  Retry creates a linked attempt, reusing source bytes.
- Source JSON numbers retain decimal precision through parsing, hashing and storage.
  API responses use the lossless encoder. Money uses Decimal/DECIMAL(24,8) and retains
  original display strings/symbols.
- Source time remains as printed. Timezone/currency/hero context is not guessed.
  Explicit context applies to new canonical hands. Ambiguous/nonexistent local times
  keep UTC unset with quality flags.

One process owns each data directory. A shared engine anchor creates independent
connections for threads; a writer lock serializes mutations. Each read response uses
one transaction snapshot. Shutdown joins background work and releases the runtime's
database ownership; other owners retain their valid lifetime.

Folder discovery is non-recursive, ignores temporary/non-JSON files and requires
unchanged identity/size/mtime/ctime across scans separated by two seconds. Snapshots
are checked before and after copying. Accepted signatures survive restarts. Changed
inputs, including previously failed files, are reconsidered. The archive and links
into it are excluded. Watched files are never edited or moved.

Stop the app before backing up the whole data directory: database and sources.
Archives alone do not include settings or import history.

## Verification environment

The sandbox blocks loopback binds and socketpair send. HTTP tests exercise the real
ASGI app in-process with a bounded selector for cross-thread callbacks; this workaround
is confined to test utilities. Browser inspection uses the production bundle and
recorded responses from the real API. Live socket/browser verification must run from
the user's terminal; ordinary application code is unchanged.

The real local 1,145-hand export imported as 1,145 new records, then 1,145 duplicates
under another filename. Its archive matched the original SHA-256 and 18,382 ordered
events survived. Actual directory-created overlapping input produced two duplicates.
Smoke data and snapshots stay under `/tmp`; personal exports are not committed.
