# Poker Tracker

A local poker hand library with manual JSON uploads, automatic directory imports,
complete hand histories and import summaries. The Firefox acquisition extension
produces the Bet88 JSON exports consumed by this application.

## Run the prototype

From the repository root, with dependencies already installed:

```bash
make run
```

Open **http://127.0.0.1:8000**. Keep the terminal running; stop with **Ctrl+C**.
This builds the React UI and serves it together with the local Python API.

For a fresh checkout, install Python 3.12+, Node 24+, `uv` and `make`, then run:

```bash
make setup
make run
```

Setup creates the isolated Python environment if needed, installs pinned Python
packages with uv and installs the frontend from its npm lock.

## Import and browse

1. On Imports, choose **Import JSON** and select an acquisition export.
2. For automatic imports, enter an absolute watch-folder path and choose **Start
   watching**. Stable JSON files are discovered non-recursively every two seconds.
3. Select an import filename to inspect errors, partial-export warnings or retry the
   archive. Duplicates do not add another canonical hand. Conflicts preserve the first
   imported version and remain visible as rejected records.
4. On Hands, select a player (saved hero is the default). Filter by heads-up/multiway,
   result, stakes, position and player action. **More filters** has printed date bounds,
   exact table, street, net bounds, money unit and date/net ordering. Choose **Apply
   filters** to update the whole matching library. Matching counts and per-unit net
   totals cover every page. Compare positions on the left and click a position to
   drill down while keeping other form drafts. Open a table-name link for replay;
   expand **Full hand history and sources** for every original phase/event.
5. Overview shows committed library counts and observed source times.

Watching works while the application runs. Pausing discovery leaves accepted jobs
running. Enabled watching and queued/interrupted jobs resume after restart. Run one
backend process per data directory.

Optional Source settings on Imports record exact hero name, IANA source timezone and
ISO currency code. Hero selects the initial Hands player, including existing imports.
Timezone and currency context apply to newly imported hands. Printed hand times are never
silently converted to the machine timezone. Export completion does not guarantee
complete requested-date coverage.

Hands counts only explicit dealt recipients for HU, including hidden cards. Listed
observers are excluded for a selected player until **Include listed players…** is
checked. Ambiguous participation, stakes and inferred positions remain Unknown.
SB includes the HU button; BTN means a separate button with 3+ dealt players. The
compact grid scrolls horizontally for its remaining columns on narrow screens.
Click **Date** or **Net won** in the grid header to toggle descending/ascending order
across all matching hands. The arrow shows the active order; sorting resets pagination
and preserves other filter drafts. Net won requires an applied player selection.

Net amounts stay exact and preserve their original display. Numeric net bounds and
net sorting require one money context; select a unit when contexts are mixed.
An unresolved `$` symbol is labelled as such, never assumed to mean USD. Existing
imports gain these fields automatically on restart; no reimport is necessary.

The position report preserves all applied filters except position, so comparisons
remain available after a drill-down. Mixed currencies have separate totals and
tables. A position click changes only position; choose currency through Money unit.
With listed-player inclusion enabled, **Not dealt** stays separate from Unknown
position. Net sorting and numeric bounds retain their money context across imports.

Report **bb/100** is 100 times the average recorded net divided by each hand's
established nominal big blind. Unknown BBs are excluded. Optional **VPIP/PFR** count
reliable dealt preflop hands with a voluntary call/raise/bet, or a raise respectively;
repeated actions count once. Hover the rate for numerator/denominator coverage.
These describe whole-hand results, without attributing profit to an action.

Replay starts paused and follows source event order. Start, Previous, Play/Pause,
Next and the step slider support review and rewind. Cards appear when dealt or
revealed, including single-card shows; both runouts remain visible once observed.
Recorded results appear at the end. The table is schematic: starting balances and
action amounts are preserved, without invented seating or running pot/stack values.

See the [review design](docs/superpowers/specs/2026-11-26-review-workspace-design.md),
[desktop preview](docs/previews/review-overview-1280.png),
[narrow preview](docs/previews/review-overview-390.png) and
[replay preview](docs/previews/review-replay-1280.png).

## Data and development

The ignored `data/` directory holds `tracker.duckdb` and exact original files under
`sources/`. Override it with `POKER_TRACKER_DATA_DIR`; set the upload limit with
`POKER_TRACKER_MAX_UPLOAD_BYTES` (default 104857600, or 100 MiB):

```bash
POKER_TRACKER_DATA_DIR=/path/to/tracker-data make run
```

For backups, stop the app and let active work finish, then copy the **entire data
directory**. Include the database and archives to preserve settings, history and
provenance. Watched source files are never moved or edited.

For development, run `make serve` in one terminal and `npm --prefix frontend run dev`
in another. Open http://127.0.0.1:5173; Vite proxies `/api` to the backend.

Run `make test` for backend, UI and acquisition tests. `make build` checks TypeScript
and builds the production UI. See [backend details](backend/README.md) and the
[approved design](docs/superpowers/specs/2026-11-25-local-tracker-design.md).

This prototype includes ingestion, filtering, basic position reports and source
replay. Sessions, equity/EV, advanced statistics and HUD features remain future work.

## Acquisition

`acquisition/` contains the Firefox extension, development scripts, tests, HTML samples, documentation, packaged add-on, and locally cleaned exports.

Load `acquisition/extension/manifest.json` as a temporary add-on in Firefox. See the [acquisition instructions](acquisition/README.md) for setup, date ranges, and export-folder configuration.

Run development commands from the repository root with:

```bash
npm --prefix acquisition test
npm --prefix acquisition run check
npm --prefix acquisition run package
```

The packaged add-on is written to `acquisition/dist/poker-tracker-firefox.zip`.
