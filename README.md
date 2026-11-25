# Poker Tracker

A poker tracker project. Hand-history collection lives in [acquisition/](acquisition/README.md).

## Local tracker implementation

The approved design is in [the architecture document](docs/superpowers/specs/2026-11-25-local-tracker-design.md)
and [implementation plan](docs/superpowers/plans/2026-11-25-local-tracker.md).

Implemented backend foundations live in [backend/](backend/README.md): immutable source
archives, DuckDB storage, Bet88 validation, durable import jobs, folder discovery and
hand-library queries. The FastAPI application and React UI are still pending. This
checkout does not yet start a tracker web application.

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
