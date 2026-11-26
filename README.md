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
4. On Hands, filter by inclusive printed times and exact table name. Open a hand to
   inspect players, cards and every phase/event, including both runouts.
5. Overview shows committed library counts and observed source times.

Watching works while the application runs. Pausing discovery leaves accepted jobs
running. Enabled watching and queued/interrupted jobs resume after restart. Run one
backend process per data directory.

Optional Source settings on Imports record exact hero name, IANA source timezone and
ISO currency code. These apply to newly imported hands. Printed hand times are never
silently converted to the machine timezone. Export completion does not guarantee
complete requested-date coverage.

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

This prototype focuses on ingestion and inspection. Player statistics, sessions,
equity, replay and HUD features are future work.

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
