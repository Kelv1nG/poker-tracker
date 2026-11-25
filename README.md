# Poker Tracker

A poker tracker project. Hand-history collection lives in [acquisition/](acquisition/README.md).

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
