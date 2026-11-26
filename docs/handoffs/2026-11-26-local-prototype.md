# Local prototype handoff — November 26, 2026

## Run

```bash
cd /home/kelvin/side-projects/poker-tracker
make run
```

Open http://127.0.0.1:8000. The current working files are ready; importing the Git
bundle is separate from running the app. For a fresh checkout, run `make setup`
first. Setup uses uv and the pinned Python/npm dependencies.

Imports, folder settings, retry/details, full hand browsing and Overview are
implemented. Keep the terminal open for watching. Data defaults to ignored `data/`;
stop the application and back up that whole directory for database and archives.

## Evidence and limits

- 115 backend and 13 frontend tests, plus the existing 41 acquisition tests pass.
- Production build and dependency consistency checks pass; the backend wheel contains
  both migrations, bounded intake and the currency validation data.
- Actual 1,145-hand JSON through the API: 1,145 new then 1,145 duplicates. Exact archive
  bytes/SHA-256 and all 18,382 events retained. Actual directory-created overlap
  produced two duplicates. No personal export or smoke database is committed.
- Firefox at 1280px and a true 390px iframe: navigation, filtering, capture metadata,
  second-run groups/boards, Unicode, overview totals and horizontal-overflow checks
  passed. Preview PNGs capture the settled production DOM using recorded real API
  responses from isolated temporary data:
  [desktop](../previews/local-tracker-imports-1280.png),
  [narrow](../previews/local-tracker-imports-390.png).
- The runner forbids loopback sockets. Live HTTP/browser connection testing cannot
  be performed here; the real ASGI app and production UI were checked independently.
- One minor remains: a new import arriving between history pages can repeat an
  attempt on the next page. Refresh to return to the first page. Canonical data and
  keyset hand pagination are unaffected.
- Advanced player statistics, sessions, equity, replay, HUD and multiple backend
  processes are outside this prototype's scope.

Independent final review found four material issues, each reproduced and fixed:
watch-configuration races; multipart limits before spooling; malformed-record
isolation; source coverage and safe optional-metadata display. The final pass also
fixed a watch-folder draft initialization race exposed by an existing UI test.

## Commits

Normal `.git` remains read-only in this runner. The updated source is in your
workspace; coherent commits are preserved on `feat/local-tracker` in
`dist/local-tracker-prototype.bundle`, based on `b729c37`.

If your normal checkout is still on the original base with no new unrelated commits:

```bash
git fetch dist/local-tracker-prototype.bundle feat/local-tracker
git switch -c feat/local-tracker
git reset --mixed FETCH_HEAD
```

If the earlier core bundle was already imported and you are on its feature branch,
fetch the new bundle there and reset mixed to FETCH_HEAD without creating that
branch again. A mixed reset retains working files. Reconcile any unrelated history
before adopting this bundle; no merge or push was performed by this session.

## Implementation decisions

These records include historical setup choices. Earlier dependency/download blocks
were resolved when the user installed the prerequisites. Deferred test placement,
earlier partial task order and the interim core-only review were subsequently
completed by the full integration and final review. The costs/limits below record
why the implementation took these paths.

1. Ruling: work in the current directory using alternate Git metadata at /tmp/poker-tracker-implementation.git on feat/local-tracker — repository .git is read-only and worktree creation cannot update it — commits need bundle import by user.
2. Ruling: build and verify the ingestion core using locally cached dependencies while package downloads are blocked — no FastAPI or React/Vite/Vitest packages exist locally and DNS to PyPI fails — API and UI execution remains blocked until dependencies can be downloaded; do not replace the approved stack.
3. Task 1: Ruling: filename safety and differently named uploads are tested at the importer boundary in Task 3 — archive_source intentionally accepts no filename — those integration checks are deferred to their first consumer.
4. Task 1: Ruling: use uv with repacked cached upstream wheels to install isolated dependencies — package registry is unavailable and default cache is read-only — bootstrap paths are session-specific; committed pins remain standard pip-compatible.
5. Task 3: Ruling: conflict counts use Counts(0,0,1,1), correcting the plan's illustrative Counts(0,0,1) — conflicts are explicitly counted as a rejected subset by the spec — consumers must not add conflict to rejected again.
6. Task 3: Ruling: pin pytz for DuckDB TIMESTAMPTZ reads and explicitly set every connection's display timezone to UTC — integration tests exposed DuckDB's optional pytz requirement and OS-dependent timestamp rendering — one additional runtime package; printed naive times remain untouched.
7. Task 4: Ruling: split the independently runnable scanner from HTTP/lifecycle and implement the database queries from Task 6 before their UI — dependency downloads are blocked, while both modules can be verified against real storage now — Tasks 4 and 6 remain incomplete until their API/UI integration is verified.
8. Task 5: Ruling: create only the private frontend package manifest now, so the user can install development prerequisites from a terminal with internet access — npm registry DNS fails in this session (ENOTFOUND) and UI dependencies are absent — this is setup only, with no app, scripts, or frontend behavior yet.
9. Core review: Ruling: accept the reviewer's exclusion of HTTP/lifecycle, periodic scheduling, React UI and browser acceptance from this interim core review — these are explicitly unimplemented while dependencies are unavailable — this core handoff does not satisfy the full application; Task 7 still requires full-app review/acceptance.
10. Task 4: Ruling: in-process tests use a bounded selector only when the runner blocks socketpair send — sandbox denies loopback binds and event-loop wakeup sockets, so stock TestClient stalls even for a trivial AnyIO portal — no application behavior is replaced; browser-to-live-server verification must run in the user's terminal, with fixture-based browser inspection here.
11. Task 4: Ruling: retain a fixed ISO currency-code list derived from the system iso-codes data for validation — no extra runtime dependency or guessed currency — the list needs maintenance if ISO adds codes.
12. Task 7: Ruling: keep a shared, weakly owned DuckDB anchor and create a separate connection per caller — full API polling exposed repeated attach/detach churn and interrupted-shutdown handle conflicts — one engine lifetime now spans each runtime; explicit close/restart tests RED then GREEN ensure the last owner releases it.
13. Final: Ruling: accept live socket, physical power-loss and advanced/HUD/multiprocess review exclusions — sandbox prohibits loopback binds, hardware power cuts are outside local process-recovery verification, and advanced/HUD/multi-process work is explicitly outside the release — no claims of those checks/features are made; live localhost use must be checked from the user's normal terminal.
