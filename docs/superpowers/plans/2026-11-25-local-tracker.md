# Local Poker Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. User authorized implementation on November 26, 2026.

**Goal:** Deliver the accepted local Imports UI, reliable upload/directory ingestion, a hand browser, and basic library summaries.

**Architecture:** A React UI talks to a Python/FastAPI service on the user's computer. Both intake paths preserve exact original files and submit durable jobs to one importer. DuckDB stores import state, canonical structured hands, ordered normalized data, and initial summary queries; one backend process coordinates database writes.

**Tech Stack:** Python 3.12+, FastAPI/Pydantic, DuckDB, pytest/httpx; Node 24+, React/TypeScript/Vite, Vitest/Testing Library; ordinary CSS matching the approved preview. Pin compatible dependencies and lock files during setup.

**Spec:** `docs/superpowers/specs/2026-11-25-local-tracker-design.md`

## Execution status — November 26, 2026

- Tasks 1–3 implemented and verified: storage, normalization, durable importer/worker.
- Task 4 partly implemented: stable, resumable folder discovery is tested; HTTP routes and application lifecycle are pending.
- Task 5 pending: only a dependency-bootstrap manifest exists; frontend dependencies and the React app are not installed/implemented.
- Task 6 partly implemented: hand queries, cursor pagination, detail/provenance and overview are tested; API/UI integration is pending.
- Task 7 pending: a real 1,145-hand importer smoke test passed; full application acceptance, browser verification and final application review remain.

Package downloads fail because this session cannot resolve registry hostnames.
Cached dependencies allow the core tests to run. FastAPI/multipart and React/Vite/Vitest
are absent from the local caches. The approved stack remains unchanged. See
`backend/README.md` for the runnable core and setup instructions.

## Global Constraints

- The application runs on the user's computer and opens in a browser.
- Support manual JSON uploads and automatic import from a configured directory.
- Preserve original source files unchanged and build analytical data from them.
- Canonical hand identity is `(source_id, hand_id)`, initially `source_id = bet88`.
- Use a single backend worker process. All database mutations share a writer lock; threads use their own database connections rather than concurrently sharing one connection.
- Keep money as Python Decimal/DuckDB `DECIMAL(24,8)` plus original display strings.
- Never infer the source timezone from the operating system.
- No source file in the watched directory is moved, edited, or deleted.
- Initial upload limit: 100 MiB, configurable.
- The existing acquisition tests continue passing. Runtime data, archives, and local exports stay outside Git.

## Review Focus

- Two submissions of overlapping files, including simultaneous upload and scan, must not duplicate hands or lose provenance (Tasks 2–4).
- A process interruption between archive creation, queuing, and import commit must leave recoverable jobs and no partial canonical import (Tasks 1, 3, 7).
- Temporary, growing, replaced, missing, and previously invalid watched files must not cause repeated or permanently missed imports (Task 4).
- Unsupported envelopes, individual invalid hands, conflicting IDs, Unicode names, null cards, and both runouts must retain accurate outcomes and source order (Tasks 2, 3, 6).
- Unset timezone/currency/hero settings and exact decimal money must not produce invented UTC values or monetary totals (Tasks 2, 5, 6).

## Task 1: Storage and immutable source archive

**Files:** Create `backend/pyproject.toml`, `backend/src/poker_tracker/__init__.py`, `settings.py`, `storage/database.py`, `storage/migrations/001_initial.sql`, `storage/repositories.py`, `ingestion/archive.py`, `backend/tests/conftest.py`, `test_storage.py`, `test_archive.py`. Modify `.gitignore` for `/data/`, Python environments/caches, and frontend build output when introduced.

**Interfaces:** `Settings(data_dir: Path, max_upload_bytes: int = 104857600)`; `Database(path: Path)` with `read_connection()` and `write_transaction()` context managers; `archive_source(stream: BinaryIO, settings: Settings) -> ArchivedSource(sha256, path, byte_size)`. All runtime paths come from Settings; tests supply temporary roots.

- [x] Set up an isolated backend environment and pin dependencies. Commands: `python3 -m venv backend/.venv`, then `backend/.venv/bin/python -m pip install -e './backend[dev]'`. Expected: dependencies install into that environment. Report unavailable dependencies rather than silently replacing the proposed stack.
- [x] Write failing tests: archive bytes and SHA match input; two differently named identical uploads reuse one archive; malicious filenames never become disk paths; oversize uploads are not accepted; migrations rerun safely; rolled-back writes are absent; distinct threads do not share a connection.
- [x] Run `backend/.venv/bin/python -m pytest backend/tests/test_archive.py backend/tests/test_storage.py -q`. Expected: failures identify absent archive/storage behavior.
- [x] Implement content-addressed staging/finalization and initial migration tables from the spec. Preserve exact bytes; enforce size during streaming; ensure an existing hash refers to matching stored content. Supply the shared writer lock and independent read connections.
- [x] Run the same tests. Expected: all pass, including restart with an existing database and archive.
- [x] Commit this complete storage/archive chunk: `feat(storage): add local database and immutable source archive`.

## Task 2: Versioned Bet88 normalization

**Files:** Create `backend/src/poker_tracker/ingestion/models.py`, `bet88.py`, `money.py`, `fingerprints.py`, `backend/tests/fixtures/bet88/*.json`, `test_bet88.py`, `test_money.py`. Fixtures are small JSON records derived from the known single-run and two-run samples; do not commit the large personal export.

**Interfaces:** `validate_envelope(raw: bytes) -> ExportEnvelope`; `normalize_hand(raw: dict, source_id: str) -> NormalizedHand`; `hand_fingerprint(raw: dict) -> str`; `parse_money(text: str) -> ParsedMoney`. NormalizedHand carries source/ID, printed time, structured payload without raw_html, ordered players/phases/events, and the deterministic payload hash. Validation errors carry source field paths; the importer attaches file indexes.

- [x] Write failing tests with hand-checked expectations: `$0.13` and `-$1.26` remain exact Decimal values; null/blank action amounts stay null; invalid precision rejects; original time stays `2026-11-25T03:10` and UTC stays null; source plus UUID is identity; key ordering/raw_html do not change a fingerprint while action ordering and result changes do.
- [x] Include both actual runout boards in assertions: `5d Kh 2d Tc 8s` and `Jh 7h Td 5h 4s`; preserve the actorless Running it Twice announcement, both acceptance events, and all showdown rows. Include Unicode names and hidden cards. Do not infer run grouping, seats, or raise semantics that the source does not state.
- [x] Run `backend/.venv/bin/python -m pytest backend/tests/test_bet88.py backend/tests/test_money.py -q`. Expected: missing normalization behavior fails.
- [x] Implement schema-v1 validation and typed records. Accept additive fields, preserve structured payloads, exclude raw_html from derived records, and retain archive/index provenance for all errors. Fail unsupported/malformed envelopes without producing hands.
- [x] Run normalization tests and the backend suite. Expected: all pass with no float rounding, guessed currency/hero, or timezone conversion.
- [x] Commit: `feat(ingestion): normalize versioned Bet88 hand histories`.

## Task 3: Durable shared importer

**Files:** Create `backend/src/poker_tracker/ingestion/jobs.py`, `importer.py`, `worker.py`, `backend/tests/test_importer.py`, `test_recovery.py`; extend repositories with job, identity, outcome, and provenance operations.

**Interfaces:** `Importer.enqueue(stream, filename: str, trigger: Literal['upload', 'watch'], source_id='bet88') -> ImportJob`; `Importer.retry(job_id: UUID) -> ImportJob`; `Importer.run_next() -> ImportJob | None`; `Importer.recover() -> None`. `IMPORTER_VERSION = 1`. Retried jobs are new attempts linked to the previous job; retry an active matching job by returning its ID. Acknowledged queued jobs must reference an existing durable archive and a committed job row.

`jobs.py` defines `Counts(new: int, duplicate: int, rejected: int, conflict: int = 0)` with conflict included in rejected, and `ImportJob(job_id, source_hash, source_id, trigger, importer_version, status, counts, filename, timestamps, error, retry_of)`. Job trigger values are upload/watch/retry. API response naming uses `job_id` consistently.

- [x] Write failing integration tests against temporary real DuckDB files, not a mocked repository:
  ```python
  assert first_result.counts == Counts(new=2, duplicate=0, rejected=0)
  assert overlap_result.counts == Counts(new=1, duplicate=1, rejected=0)
  assert conflicting_result.counts == Counts(new=0, duplicate=0, rejected=1)
  ```
  Also test renamed identical input, repeated IDs within one input, mixed valid/invalid hands, malformed envelopes, raw-HTML legacy files versus cleaned files, and partial-export metadata.
- [x] Test failure before commit leaves no new canonical rows, preserved archived bytes, and a retryable failed job; recovery requeues interrupted work; restarting after a completed commit does not repeat it. Test all normalized child rows and terminal job/count updates roll back together.
- [x] Run `backend/.venv/bin/python -m pytest backend/tests/test_importer.py backend/tests/test_recovery.py -q`. Expected: missing import/recovery behaviors fail.
- [x] Implement validation/classification followed by one transaction for accepted canonical rows, provenance, outcomes, counts, and terminal status. Keep first canonical data on conflicts. Each manual attempt validates/classifies its rows, so a re-upload cannot conceal previously invalid hands. Avoid an in-memory-only job queue.
- [x] Run the backend suite. Expected: counts and canonical totals match literal expectations and no duplicates survive concurrent intake tests.
- [x] Commit: `feat(ingestion): add durable deduplicated import jobs`.

## Task 4: Local API, lifecycle, and folder scanner

**Files:** Create `backend/src/poker_tracker/main.py`, `api/imports.py`, `api/settings.py`, `api/watcher.py`, `api/models.py`, `ingestion/scanner.py`, `backend/tests/test_api_imports.py`, `test_scanner.py`, `test_lifecycle.py`.

**Interfaces:** `create_app(settings: Settings | None = None) -> FastAPI`; `FolderScanner.scan_once() -> ScanResult`; scanner receives Importer and a clock/stat provider so stability tests do not sleep. Implement the spec's import, retry, settings, and watcher endpoints. `POST /api/imports` returns `{job_id, status}` with 202 only after durable acceptance. Job/detail/list response contracts include counts and indexed rejection/conflict reasons; default list limit 50, maximum 200.

- [ ] Write failing tests: upload eventually exposes committed hands; repeated active submissions coalesce; missing/invalid jobs and unsupported files return structured errors; failures remain in history. Verify the API does not process file parsing on the event loop.
- [ ] Test the scanner using actual temporary files and a controlled clock: `.part` ignored; unchanged file stable only after two scans separated by two seconds; growth/replacement during staging defers; changed previously invalid input is reconsidered; unchanged completed/failed candidates do not endlessly enqueue; resume/startup catches files created while paused. Reject archive paths as watch roots.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_api_imports.py backend/tests/test_scanner.py backend/tests/test_lifecycle.py -q`. Expected: missing API/scanner behaviors fail.
- [ ] Implement startup recovery, one import worker, the non-recursive scanner and clean shutdown. Persist enabled/path settings; startup resumes enabled watching. Pausing discovery leaves accepted jobs running. Invalid directories expose effective error state without losing settings/history. Use one process, shared mutation lock, per-thread connections, and off-event-loop disk/parse operations.
- [ ] Run the complete backend suite. Expected: lifecycle shuts down without extra workers or open file/database resources; imports work with the HTTP client context closing after acknowledgement.
- [ ] Commit: `feat(api): add local import endpoints and folder monitoring`.

## Task 5: Imports UI and minimal settings

**Files:** Create `frontend/package.json`, TypeScript/Vite configuration, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/api/client.ts`, `src/api/contracts.ts`, `src/features/imports/*`, `src/features/settings/*`, and corresponding behavior tests. Commit the frontend dependency lock file.

**Interfaces:** Typed API client consumes Task 4 responses. ImportsPage renders upload, persisted watch path and toggle, history, and job details. Settings stores optional exact hero name, IANA source timezone, and ISO currency code through the settings endpoint; leaving them unset is valid. Poll active jobs/watcher at one-second intervals; stop timers when views unmount.

- [ ] Initialize the frontend package and dependencies as part of this UI task. Write failing component tests for native file upload, real response counts instead of preview constants, invalid file/path errors, persisted watch state, pause/resume, retry, and visible rejection/conflict details. Use HTTP boundary adapters; keep the real UI components.
- [ ] Run `npm --prefix frontend test -- --run`. Expected: missing UI behaviors fail.
- [ ] Implement the accepted layout from `docs/previews/local-imports.png`: minimal navigation, Import JSON action, Automatic import path/control, and history table. Keep imported data and import metadata distinct. Render waiting/loading/empty/error/partial-source-warning states; source completion flags must not become claims of full date coverage.
- [ ] Ensure keyboard operation, visible focus, readable contrast and a stacked narrow layout. No backend filenames, database details, or hidden fabricated statistics belong in the user workflow.
- [ ] Run frontend tests and `npm --prefix frontend run build`. Expected: all pass with no TypeScript errors; the Imports screen uses API data and reconnects after backend restart.
- [ ] Commit: `feat(ui): add import management and local settings`.

## Task 6: Hand browser and initial library overview

**Files:** Create `backend/src/poker_tracker/queries/hands.py`, `queries/overview.py`, `api/hands.py`, `api/overview.py`, `backend/tests/test_queries.py`, `frontend/src/features/hands/*`, `frontend/src/features/overview/*`, and view tests.

**Interfaces:** `GET /api/hands` returns `{items, next_cursor, total}` with default limit 50, maximum 200. Use opaque validated cursors over descending `(started_at_local, source_id, hand_id)`; filters use inclusive printed minute boundaries and exact table name. Detail returns canonical structured payload, provenance and quality flags. `/api/overview` returns hand/file/issue counts and observed printed dates; no unresolved monetary totals.

- [ ] Write failing real-database tests for duplicate-minute timestamps across page boundaries, exact range boundaries, table filters, absent IDs, parameterized query inputs, and literal summary counts after an overlapping import. Assert unset timezone/currency produce no invented UTC values or combined money totals.
- [ ] Write failing UI tests that select a hand and see both complete runouts, all ordered actions/system events, unknown cards, and money display strings. Test empty results, fetch failure/retry, and a hand ending preflop.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_queries.py -q` and frontend tests. Expected: absent query/view behaviors fail.
- [ ] Implement read queries and the two views. Print source time directly; do not call JavaScript Date conversion on timezone-free source timestamps. Refresh/reset lists after import completion. Render card suits/unknowns accessibly and preserve source phase labels and order without pretending a replayer is implemented.
- [ ] Run backend tests, frontend tests, and frontend build. Expected: all pass and totals match committed canonical records.
- [ ] Commit: `feat(ui): add hand library and import overview`.

## Task 7: Local acceptance, recovery, and handoff

**Files:** Add root development/test commands in `Makefile` (or a small standard-library launcher), update root `README.md`, add `backend/tests/test_acceptance.py`, and integration setup. Keep acquisition commands available separately. Configure the backend to serve a built frontend and dev proxying of `/api`.

- [ ] Add acceptance tests using real archive/DB storage: upload a fixture, introduce an overlapping file through the scanner, verify exact canonical count and source links, interrupt/recover a job, retry a conflict/invalid file without overwriting canonical hands, and browse both runouts through the API.
- [ ] Run backend/frontend suites, production UI build, and `npm --prefix acquisition test`. Expected: all pass; the extension's 29 Node/12 Firefox checks remain intact.
- [ ] Start the local app and inspect the UI at desktop and narrow widths. Upload the local cleaned 1,145-hand file for a smoke test without committing it. Compare metadata, count, selected hand details, and archived hash; re-import and verify zero extra canonical hands. Validate an actual directory-created file. Record results instead of claiming unsupported live behavior.
- [ ] Request one independent final code review, address material findings with reproducing tests, and rerun affected checks. Follow the user's preference for coherent commits, not one commit per file or a single giant implementation commit.
- [ ] Document exact install/start/test commands, data-directory backup contents, folder watching's app-running requirement, retry/conflict behavior, and current schema/analytics limits. Add a final integration commit if needed: `chore: document and verify the local tracker workflow`.

## Planned commit boundaries

The seven task commits above are the intended implementation chunks. The accepted design/preview and this implementation plan form a separate planning commit before product implementation. If this environment still mounts `.git` read-only, preserve the current base and prepare an importable bundle as in the previous work; never claim the branch was updated when it was not.

## Planning checks and remaining decisions

- Builder check of the architecture returned **nothing important left**.
- Source schema reviewed against the existing 1,145-hand JSON and acquisition exporter.
- Self-review maps spec acceptance criteria to Tasks 1–7, including conflict handling, archive durability, partial exports, two runouts, and explicit time/money semantics.
- Scope and stack approved by the user on November 26, 2026.
- Inline execution with one final independent review; the tasks share contracts heavily and this is one local application.
