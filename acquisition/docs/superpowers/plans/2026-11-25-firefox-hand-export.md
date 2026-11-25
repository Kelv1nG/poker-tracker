# Firefox Hand Export Implementation Plan

Paths in this document are relative to `acquisition/`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a loadable Firefox extension that collects the open Bet88 history within an inclusive range and automatically saves JSON to a remembered subfolder.

**Architecture:** A persistent Firefox Manifest V2 background coordinates frame discovery, traversal, durable captures, and downloads. Small shared JavaScript modules separate validation, DOM extraction, traversal, and export state. A popup supplies controls and reconnects to background state when reopened.

**Tech Stack:** Plain JavaScript WebExtensions; Node's built-in test runner; installed Firefox for real DOM tests; Python standard library for the browser test runner and ZIP packaging. No runtime or development package downloads.

**Spec:** `docs/superpowers/specs/2026-11-25-firefox-hand-export-design.md`

## Global Constraints

- Use the existing Firefox session; the user handles login and navigation to an individual hand in the history screen.
- Interpret the range using the date and time printed on the history page, without assuming or converting its timezone. Both endpoints are inclusive.
- Default the folder to `PokerTracker`. It is relative to Firefox's configured Downloads folder.
- Save each collected hand to extension storage before continuing, deduplicated by hand ID within the run.
- Closing the popup must not stop the run; reopening it restores the status and controls.
- No network service or dependency installation is required. The installed Firefox is 146.0.1.

## Review Focus

- Timestamp rollover and malformed input must fail validation before any page interaction (Task 1).
- Header changes before the events render must not export a mixture of two hands (Task 1).
- Cross-origin poker frames and multiple visible hand panels must resolve unambiguously or produce a useful error (Task 3).
- Popup closure, tab closure, and download completion racing its listener must not lose captured hands or report false success (Tasks 2 and 3).
- Storage or download failures must preserve any previously saved hands and block accidental replacement (Task 2).

## File Map

- `extension/lib/core.js`: date/header/range/folder validation and filename construction.
- `extension/lib/dom.js`: complete hand extraction, Previous Hand selection, and render readiness.
- `extension/lib/collector.js`: ordered backward traversal using injected page and storage operations.
- `extension/lib/exporter.js`: captured hand storage, run state, automatic download, retry, and recovery.
- `extension/content.js`, `extension/background.js`, `extension/manifest.json`: Firefox API adapters, frame targeting, and lifecycle.
- `extension/popup.html`, `extension/popup.js`, `extension/popup.css`, `extension/icon.svg`: compact accessible controls and status.
- `tests/*.test.cjs`: validation, traversal, and export tests using Node with browser API boundary adapters.
- `tests/browser.html`, `tests/browser.js`, `scripts/test-browser.py`: actual Firefox DOM, navigation, and popup checks against the supplied HTML.
- `scripts/check.cjs`, `scripts/package.py`, `package.json`, `README.md`: validation, repeatable packaging, and usage instructions.

## Task 1: Parse and reliably read a hand

**Interfaces:** `PokerTracker.parsePageHeader(text)`, `parseWallTime(text)`, `validateConfig(input)`, `extractHand(panel)`, `findHandPanel(document)`, `waitForHand(document, options)`, `previousControl(document, panel)`.

- [x] Write validation tests with literal dates, inclusive boundaries, invalid calendar dates, safe relative folders, and invalid absolute/traversal paths. Write Firefox DOM tests reading `hand-sample.html`, asserting `Jh/9h`, unknown pocket cards, four phase groups, river board `Js/5s/Ah/Tc/6d`, and blank amounts preserved as null.
- [x] Run `node --test tests/core.test.cjs` and `python3 scripts/test-browser.py`; verify failures identify missing extraction/validation behavior.
- [x] Implement core and DOM modules. Compare wall times as calendar values without timezone conversion; preserve event labels, exact amount strings, original HTML, and grouped boards. Wait for a structurally valid, quiet panel and evidence that the previous payload changed or was replaced; time out if an in-place header changes without a new payload.
- [x] Exercise delayed rendering, missing/disabled Previous Hand, early-ending hands, and selector ambiguity in Firefox. Run both commands until green.

## Task 2: Traverse and export without losing captures

**Interfaces:** `collectHands({config, read, advance, save, progress, shouldStop}) -> result`; `createExporter({storage, download, now, onStatus})` exposes `initialize`, `begin`, `capture`, `progress`, `finish`, `retry`, and `getState`.

- [x] Write failing collector/exporter tests: skip newer hands, include exact boundaries, stop below From, reject reverse ordering and duplicate IDs, stop after current capture, persist before navigation, mark partial failures, recover stored captures after tab loss, and retain records after download failure.
- [x] Run `node --test tests/collector.test.cjs tests/exporter.test.cjs`; inspect expected failures.
- [x] Implement traversal and storage coordinator. Use separate per-hand storage entries and run metadata; keep status small for popup messages. Download through an injected adapter and mark saved only when the adapter confirms completion. Retry without scraping again. Prevent concurrent runs or replacement of unsaved data.
- [x] Run all Node tests; expect no failures.

## Task 3: Connect the Firefox extension and its UI

**Interfaces:** Popup commands `getState`, `preview`, `saveConfig`, `start`, `stop`, `retry`; content commands `frameInfo`, `read`, `advance`. Prefix all messages with `pokerTracker` and target the selected tab/frame explicitly.

- [x] Add failing adapter/browser tests for automatic startup on the prepared tab, saved folder reuse, popup reopening, empty exports, a download already completed before its ID was returned, cancellation, and unauthorized/missing frame failures.
- [x] Implement the manifest, persistent background, content bootstrap, completed-download observer, and popup. Limit host permissions to HTTPS Bet88 origins. Discover the visible history in all accessible frames by asking the sender's background for its frame ID. Reject ambiguous panels. Preserve captures on tab close/reload and permit Stop during slow reads.
- [x] Render From/To date and time inputs, export subfolder, Start/Stop, Retry save, counts, current timestamp, starting-hand hint, finish reason, and saved path. Keep errors visible and controls usable with keyboard input.
- [x] Run `npm test`; inspect Node and real Firefox results. Verify JavaScript parses and every manifest resource exists with `npm run check`.

## Task 4: Package and hand over

- [x] Write installation, range semantics, JSON format, folder configuration, and prototype limitations in `README.md`. Add a small offline history fixture to support manual checking without a Bet88 account.
- [x] Build `dist/poker-tracker-firefox.zip` with `npm run package`, containing only extension files and a top-level manifest.
- [x] Run `npm test`, `npm run check`, and `npm run package`; inspect their exit codes and ZIP listing.
- [x] Obtain one independent code review against the approved spec, make necessary fixes with reproducing tests, and rerun affected verification.
- [x] Mark the plan and ledger with evidence. Report what is locally verified and whether a live Bet88 export was possible.

## Workspace and execution

The current environment is not a Git repository: `.git` is an empty read-only mounted directory and native worktree listing is empty. Work in the authorized workspace without initializing Git or attempting commits. Record execution in `docs/superpowers/plans/2026-11-25-firefox-hand-export-progress.md`. The user explicitly approved the design and requested implementation, so execute inline without another plan approval prompt.
