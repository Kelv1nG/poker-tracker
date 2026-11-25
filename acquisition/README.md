# Poker Tracker: Firefox hand export

A small Firefox extension that collects complete Bet88 hand histories from the page you already have open. Enter an inclusive From/To date and time range and a remembered export subfolder. The JSON file saves automatically when collection ends.

This component lives in `acquisition/`. Paths and development commands below are relative to that directory.

## Load it in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `extension/manifest.json` in this project. You can also select the ZIP produced by `npm run package`.
3. Return to your logged-in Bet88 poker tab and open **My Profile → Hand History → an individual hand**. Start at the newest hand you want included.
4. Open **Poker Tracker — Hand Export** from Firefox's extensions menu. Set From, To, and Export folder, then click **Start export**.

The current prototype requires Firefox 140 or later. Temporary add-ons last until Firefox restarts; reload the manifest after a restart. No login automation, terminal process, or separate service is needed to use the extension. Installation does not require a site refresh: the script is injected into the existing tab when you open the popup or start an export.

## Date range and navigation

Both boundaries are inclusive, with minute precision matching **Hand Started** on the page. The extension compares the printed date and time directly, without converting it to your computer's timezone. For a whole day, choose `00:00` through `23:59`.

Collection begins at the displayed hand and walks backward. Newer-than-To hands are inspected but skipped; within-range hands are saved; the first older-than-From hand ends collection. A disabled **Previous Hand** button also ends available history. The extension does not seek forward, switch between cash games and tournaments, or include hands unavailable from the currently open selection.

The reader checks every **100 ms** and requires a complete hand panel to remain unchanged for **500 ms** before saving and clicking Previous Hand. Updates restart the stability window. Page loading and local storage add to the time between clicks; the maximum wait for an unreadable hand remains 25 seconds.

Keep the source history tab open and avoid navigating it during collection. You can close and reopen the extension popup; its progress and Stop button reconnect to the background job. **Stop** finishes the current read, then saves the hands already collected as a partial export. If the tab closes or the site stops responding, collected hands are also exported as partial data with the reason included.

## Configure the export folder

The **Export folder** field is remembered automatically. Default: `PokerTracker`. Examples:

```text
PokerTracker
PokerTracker/Bet88
Poker hands/November
```

These are subfolders of **Firefox's configured Downloads directory**. If Firefox saves downloads to `~/Downloads`, `PokerTracker/Bet88` produces files under `~/Downloads/PokerTracker/Bet88/`. Firefox creates the subfolders through its download manager, and the extension does not show a Save As dialog or overwrite existing files.

Firefox's extension download API accepts relative paths; arbitrary absolute paths such as `/home/kelvin/exports` require a native helper, which this prototype does not install. You can change Firefox's default Downloads location in its settings if you want another base directory. [Mozilla download path documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/download)

If a file cannot be saved, the popup shows **Retry save**. You can edit the folder before retrying; this changes the destination without changing the captured records or their original date range. Captured hands remain in local extension storage, and another scrape is blocked until the unsaved export succeeds. Zero matching hands produce a status message instead of an empty file. Successfully exported records can be replaced when you start a new run. Uninstalling the extension or removing its storage can remove retained captures.

## JSON contents

Each file includes the requested range, observed range, actual starting hand, finish reason, a `partial` flag, and an ordered `hands` array. Each hand contains:

- `id`, `started_at` (wall time without a timezone), original `started_at_display`, and `table_name`.
- `players`: names, exact displayed starting balances and net results, and final cards.
- `phases`: street name, cumulative `board`, newly dealt `new_cards`, and ordered `events`. Events preserve player/action labels, action codes where present, amounts, cards, and board rows. Additional groups or run-it-twice choices are preserved in page order.

Exports contain structured hand data only. Raw page HTML is excluded from both new captures and JSON files, including Retry save of older stored captures. The reader still compares markup internally to detect page updates. Cards, action order, monetary values, and both boards of a two-run hand are preserved in full.

Table announcements such as **Running it Twice** are preserved as events with `type: "system"` and `player: null`. In a two-run hand, the second run's **Table Cards Dealt** groups remain in source order after the first river, with their own cumulative boards and new cards; both runs' showdown events are retained.

Known cards use rank/suit strings such as `Jh`, `9h`, `Tc`, or `As`. Face-down cards are `null`. Amounts remain strings (`"0.13"`, `"-$1.26"`) and blank amounts are `null`. A fold before the flop does not create later streets. Board cards repeated in Turn/River markup are represented as cumulative boards and do not become extra newly dealt cards.

The extension reads only the hand-history panel and requires Bet88 page access, download access, and local storage. It does not read login cookies, collect the surrounding account balance, or send records to a server.

## Development and verification

No package installation is needed. Use Node 24+, Python 3, and Firefox:

```bash
npm test
npm run check
npm run package
```

`npm test` checks validation, traversal, durability, retries, download completion races, and frame targeting with Node. It then launches an isolated headless Firefox profile to parse the real `html_samples/hand-sample.html` and `html_samples/run-it-twice-sample.html`, exercise slow rendering and actual Previous Hand clicks through a two-run hand on a controlled fixture, and check popup initialization and reopening. The test runner changes sandbox settings only for its disposable Firefox child process; it does not change the preferences in your normal profile.

`npm run package` writes `dist/poker-tracker-firefox.zip` with the manifest at its root. It contains only extension code, not the sample, tests, or exports. For code changes, click **Reload** beside the temporary add-on in `about:debugging`, then reopen the popup. Reloading interrupts an active run; save its retained hands before starting another.

## First live check and prototype limits

Start with a small range covering a few hands and compare the downloaded records with the page, including the oldest included timestamp. This workspace cannot control the live desktop tab; automated checks use an isolated Firefox fixture, not a logged-in Bet88 session. Live iframe placement, site-specific button behavior, and the actual download need that first check in your browser.

The reader waits for a structurally complete panel, independent evidence that both the player summary and events changed or were replaced, and a quiet rendering period. If only the ID or summary changes while the old events remain in place, it stops rather than assuming the events belong to the new hand. Frame discovery also verifies the visibility of the iframe's parent chain and rejects candidates whose embedding visibility cannot be checked. A repeated ID, forward-moving date, malformed row, or timeout stops collection and preserves a partial export. Site markup changes may require selector updates.

One small UI limitation remains: if the popup stays open through completion, its source hint can still show the original starting hand. Reopen the popup to refresh the hint before another run; Start always re-detects the actual displayed hand.

This is a local prototype, not a signed distribution add-on or an unattended scraper. It does not resume page navigation after restarting Firefox.
