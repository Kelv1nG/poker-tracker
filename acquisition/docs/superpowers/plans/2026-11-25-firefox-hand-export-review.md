# Firefox hand export review package

Paths in this document are relative to `acquisition/`.

Review the full new `extension/`, its tests and scripts, `README.md`, and `package.json`. The environment has no Git metadata, so there is no base/head diff. At the start, the workspace contained only the supplied hand sample and design document. All extension source is new.

Requirements: `docs/superpowers/specs/2026-11-25-firefox-hand-export-design.md` (user approved).

Plan: `docs/superpowers/plans/2026-11-25-firefox-hand-export.md`.

Ledger: `docs/superpowers/plans/2026-11-25-firefox-hand-export-progress.md`; its `Ruling:` lines document environment and prototype decisions.

Current evidence: `npm test` passed 24 Node tests plus 8 actual headless Firefox DOM/UI tests. `npm run check` parsed all 9 extension JavaScript files and checked manifest/popup resources. `npm run package` produced `dist/poker-tracker-firefox.zip`; the ZIP contains only extension files and a root manifest.

Review outcome: four required issues were reproduced and fixed, as recorded in the ledger. Final verification passed 28 Node tests and 9 actual Firefox checks; the final ZIP is 17,501 bytes. One minor source-hint refresh issue is documented and deferred. This package's initial evidence above describes the version reviewed; the ledger records the final fix verification.

Live desktop control is unavailable (`wmctrl -l`: Cannot open display). The real authenticated site, iframe origins, live button behavior, and downloads still require a first test in the user's Firefox. The headless content-script test does click through rendered hand panels and validates the range, but uses a controlled offline history.

## Review focus from the plan

- Timestamp rollover and malformed input must fail validation before any page interaction (Task 1).
- Header changes before the events render must not export a mixture of two hands (Task 1).
- Cross-origin poker frames and multiple visible hand panels must resolve unambiguously or produce a useful error (Task 3).
- Popup closure, tab closure, and download completion racing its listener must not lose captured hands or report false success (Tasks 2 and 3).
- Storage or download failures must preserve any previously saved hands and block accidental replacement (Task 2).

Read-only review: do not modify source, tests, documents, Git state, or the package. Do not dispatch any subagents. Judge requirements by actual user-visible outcomes, including reasonable behavior for failures not exhaustively listed in the spec. Return actionable findings with severity and file/line locations, plus a verdict and an explicit list of anything you declined to judge.
