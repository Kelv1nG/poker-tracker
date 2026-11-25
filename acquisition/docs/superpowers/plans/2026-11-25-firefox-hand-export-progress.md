# SDD ledger — plan: docs/superpowers/plans/2026-11-25-firefox-hand-export.md

Paths in this document are relative to `acquisition/`.

- Ruling: implement inline under the user's explicit instruction to start — avoid another approval cycle; preserve the approved design.
- Ruling: work in the provided workspace without Git commits — `.git` is an empty read-only mount and no native worktree is attached; files and verification are the deliverable.
- Ruling: use Manifest V2 with a persistent background for this Firefox-only prototype — supported by Firefox 146 and avoids idle suspension during capture and download; later cross-browser distribution would need migration.
- Ruling: no package dependencies — package registry access fails in this environment; use Node, Python, and installed Firefox for verification.
- Pre-flight: Task 1 produces validated configuration and hand records consumed by Tasks 2/3; Task 2 produces coordinator commands consumed by Task 3; all use one `PokerTracker` namespace and plain serializable records.

## Progress

- Task 1: complete — core validation 4/4; actual Firefox DOM tests 6/6 passed.
- Task 2: complete — collector and exporter tests 13/13 passed.
- Task 3: complete — 24/24 Node tests and 8/8 actual Firefox browser checks passed, including content-script clicks and popup reopening.
- Task 4: complete — final `npm test` passed 28 Node tests and 9 actual Firefox checks. `npm run check` parsed 9 extension scripts and validated references; `npm run package` produced a verified 17,501-byte ZIP containing only extension files. Independent review and its four required fixes are complete. Live Bet88 and actual installed-extension downloads require the first check in the user's prepared Firefox tab.
- Ruling: target Firefox 140+ and declare no transmitted data — current Mozilla manifest guidance supports this, and installed Firefox is 146; older browsers are outside this prototype.
- Ruling: DOM readiness uses complete structure, changed/replaced payload, and 1.2 seconds without mutations — no API capture or live browser control is available; ambiguous identical in-place payload changes time out and produce a partial export rather than guessed records.
- Ruling: use Node 24 with test isolation disabled — this environment prevents Node child-isolated tests from running correctly; real Firefox DOM checks still run in a disposable browser profile.

## Final review and fixes

- Independent review: one fresh reviewer checked the whole implementation and identified one Critical, three Important, and one Minor issue. No re-review was dispatched; fixes were checked with reproducing tests.
- Final: fixed new summary allowing stale hand events — the Firefox delayed-events test reproduced a new ID and summary containing the previous `0.13` action, then passed only after events independently changed to `0.99`; RED→GREEN.
- Final: fixed hidden iframe discovery — an actual hidden-iframe DOM test and controller tests for hidden/unverifiable parent chains failed first, then passed with independent embedding visibility reports; RED→GREEN. Verified `runtime.getFrameId` exists in installed Firefox's runtime schema, is allowed in content scripts, and accepts cross-origin arguments.
- Final: fixed cleanup rejection orphaning the next run — an injected storage.remove failure reproduced the blocked run; cleanup is now best-effort for already exported records, with run IDs keeping old records isolated; RED→GREEN.
- Final: fixed Retry save ignoring the corrected folder — storage/export tests and the real popup test reproduced the old destination; retry now uses the current edited folder while preserving the original range and hands; RED→GREEN.
- Final verification: `npm test` → 28/28 Node tests and 9/9 Firefox checks; `npm run check` → 9 scripts parsed and all manifest resources present; `npm run package` → verified 17,501-byte ZIP. The popup was also visually inspected in a headless Firefox screenshot.
- Final: minor (deferred): the source hint can remain at the original starting hand if the popup stays open through completion. Reopening refreshes it, and Start always re-detects the displayed hand. Documented in README.
- Final: Ruling: live Bet88 origins/render timing/button behavior and installed-extension downloads cannot be verified through this session's desktop connection — hand over the temporary-install package and explicit small-range live-check instructions; the cost is that site-specific adjustments may still be needed after that first test.
- Ruling: retain the progress/review documents instead of deleting them — no Git history is available to preserve the review and decisions; the cost is a few small development documents in the workspace.

## Version 0.1.1: live run-it-twice fix

- The first live export saved 60 hands, then stopped on hand `ca64b12f-c28f-4764-824e-e62cfd4f2a4b`. The user supplied `run-it-twice-sample.html` from that hand.
- Root cause: the Preflop group contains an actorless `Running it Twice` table announcement between the two player acceptances. The old parser required a player on every non-board row and treated this valid announcement as an unfinished action. The second board is present as three ordered `Table Cards Dealt` groups.
- Regression evidence: the supplied sample failed with the exact player-action error, and the content-script traversal test stopped before collecting that hand. Both failed before the fix.
- Fix: preserve the known announcement as `type: system`, `player: null`. Keep the strict validation for incomplete player actions. Preserve all seven phase groups, both five-card boards, both player acceptances, and the four showdown result rows in their source order.
- Verification: `npm test` passed 28/28 Node tests and 11/11 actual Firefox checks, including the supplied two-run sample and clicking through it to reach the cutoff. `npm run check` validated all 9 extension scripts and resources. `npm run package` rebuilt version 0.1.1 as a verified 17,636-byte ZIP.
- The user's previous 60-hand JSON file was read for investigation and left untouched. The updated extension must be reloaded in Firefox before retrying the live history.

## Version 0.1.2: user-selected reader timing

- User requested a 500 ms stability window with checks every 100 ms. Changed the default settle time from 1200 to 500 ms; the 100 ms poll interval and 25-second failure timeout remain in effect.
- Added a real DOM test with a controlled external clock/scheduler. Before the change it failed by taking 1200 ms; afterward it returned the complete hand after exactly five 100 ms checks (500 ms). Existing delayed-event, incomplete-action, and two-board checks still pass.
- Verification: `npm test` passed 28/28 Node tests and 12/12 actual Firefox checks. `npm run check` passed. `npm run package` rebuilt version 0.1.2 as a verified 17,636-byte ZIP. README describes the new timing.

## Version 0.1.3: structured exports without raw HTML

- User requested removal of unnecessary HTML from the exports. Inspection of the completed Downloads export found 1,145 hands and `raw_html` as the only large string field. The source was 13,402,249 bytes; dropping only that field produces 6,167,775 bytes (54% smaller).
- New hand extraction omits `raw_html`. The durable-capture boundary also strips it defensively, and exporting stored records strips it for compatibility with captures retained by older versions. Cards, actions, street groups, results, metadata, and run-it-twice boards remain intact. Internal DOM markup comparisons still provide rendering checks.
- Tests failed first on HTML present in fresh captures, durable storage, legacy retry exports, and the real Firefox hand fixtures. After the change, `npm test` passed 29/29 Node tests and 12/12 Firefox checks; `npm run check` passed and `npm run package` built the 17,715-byte version 0.1.3 ZIP.
- A cleaned copy is saved at `exports/hands_2026-11-25.cleaned.json` because Downloads is outside this session's writable roots. Verification compared every non-HTML hand field and all top-level metadata, confirmed 1,145 records, and checked the original source SHA-256 remained unchanged. The generated `exports/` folder is ignored by Git.

## Relocation under acquisition/

- At the user's request, moved the extension, scripts, tests, HTML samples, documentation, package manifest, generated ZIP, and cleaned exports into the repository's `acquisition/` component. The repository root now has a short README linking to this component; shared ignore patterns remain at the root.
- Updated the browser runner to use the existing `html_samples/` fixture directory, removed test loaders' dependency on the invoking working directory, and documented component-relative paths. The runtime extension files, sample contents, and cleaned export contents were verified by SHA-256 to be unchanged after the move.
- Verified from the repository root: `npm --prefix acquisition test` passed 29 Node and 12 actual Firefox checks; `npm --prefix acquisition run check` passed; `npm --prefix acquisition run package` rebuilt the ZIP at `acquisition/dist/poker-tracker-firefox.zip`. Archive entries match all current extension files.
- Firefox must now load `acquisition/extension/manifest.json`; development commands run within `acquisition/` or use `npm --prefix acquisition` from the repository root.
