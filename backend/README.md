# Local tracker backend

This is the tested ingestion and storage foundation for the local tracker. The
FastAPI lifecycle, HTTP endpoints and React UI are not implemented yet. `FolderScanner`
performs one scan when called; periodic scheduling belongs to the pending app lifecycle.

## Development setup

From the repository root, with Python 3.12 or newer:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.lock
backend/.venv/bin/python -m pip install -r backend/requirements-build.lock
backend/.venv/bin/python -m pip install --no-build-isolation --no-deps -e backend
backend/.venv/bin/python -m pytest backend/tests -q
```

Build and development locks pin the dependencies used for verification. Runtime
dependencies are declared in `pyproject.toml`. The current development session
installed cached upstream wheels offline; a normal setup needs access to PyPI.

The remaining HTTP work additionally needs FastAPI, python-multipart, httpx and
uvicorn. React/TypeScript/Vite/Vitest and Testing Library are needed for the frontend.
These packages are unavailable in this session's caches, and package registry DNS
lookups fail. Their compatible versions and frontend lock will be recorded when
installation becomes possible. The approved stack has not changed.

To unblock development from a terminal with internet access, run these from the
repository root. These install development prerequisites; they do not start an app.
The minimal frontend manifest exists solely so npm can install these dependencies.

```bash
backend/.venv/bin/python -m pip install fastapi python-multipart httpx uvicorn
npm --prefix frontend install react react-dom
npm --prefix frontend install --save-dev vite typescript @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom @types/node
```

The installed compatible versions will then be pinned in the backend configuration
and frontend lock file alongside the API/UI implementation.

## Storage and import behavior

`Settings()` selects repository `data/` by default. Set `POKER_TRACKER_DATA_DIR` or
construct `Settings(data_dir=Path(...))` to use another location. Runtime data is ignored
by Git. Stop all workers before backing up the entire data directory, including
`tracker.duckdb` and `sources/`; archives alone do not include settings/import history.

`Importer.enqueue(stream, filename, 'upload')` finalizes an exact, content-addressed
archive before acknowledging a durable queued job. `run_next()` imports one job;
`ImportWorker` runs that loop in one application-owned thread. Call `recover()` before
starting it on application restart. All writes share one process-wide lock per
database file. Run only one backend process against a data directory.

Repeated hands are deduplicated by source and hand ID plus structured payload hash.
Coalesced submissions retain every filename and trigger while sharing one processing
job. An explicitly different exporter cannot claim the Bet88 identity. Additive JSON
numbers retain exact decimal precision through parsing, fingerprinting and storage.
Different payloads for the same ID are rejected as conflicts; canonical data stays
unchanged. Conflict counts are included in rejected counts. Every accepted file has
an immutable archive, including malformed inputs within the 100 MiB default limit.
Invalid envelopes fail the whole job; invalid hands reject independently. A retry
creates a linked attempt and reuses the archive. Active matching attempts coalesce.

Amounts use exact decimal values and retain printed strings/symbols. Printed source
time stays timezone-free. Source timezone and currency are initially unset; explicit
context applies only to new canonical hands. No money totals, advanced poker
statistics or date-coverage claims are derived by this implementation.

Folder discovery is non-recursive. It requires size, inode and modification time to
stay unchanged across scans separated by at least two seconds, detects replacement
while copying and remembers accepted signatures across restarts. Changed inputs are
reconsidered, including previously failed files. Discovery never edits source files.
On the current Linux filesystem, change time also detects same-size overwrites that
preserve modification time. Watch receipts and queued jobs commit atomically. Reads
use one transaction so counts and page contents share a consistent snapshot.

Canonical payload detail includes Decimal values for additive source numbers. The
pending HTTP layer must use `poker_tracker.json_codec.encode_json` when serializing
these responses; converting them through a float would lose source precision.

## Verification recorded November 26, 2026

The real local 1,145-hand export imported as 1,145 new records, then as 1,145 duplicates
on re-upload under another name. The canonical database retained 1,145 hands, 18,382
ordered events and one source archive; its SHA-256 matched the original. Smoke-test
data was isolated under `/tmp`, and the personal export is not committed.

Tests cover both actual runouts, hidden cards, Unicode names, early-ending hands,
exact decimals, ambiguous/nonexistent source times, concurrent intake, transaction
rollback, restart recovery, stable directory scanning, pagination ties and provenance.
All 93 backend tests and the existing 41 acquisition tests pass. Independent core
review found six material data-integrity issues, each reproduced by a failing test
and fixed; full application review remains part of the pending integration task.
