# Review workspace implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, TDD and one final whole-feature review. Continue through all tasks without intermediate approval requests.

**Goal:** Implement the selected review workspace with exact filtered totals, position comparison and source-faithful replay.
**Architecture:** Optional review report on the existing transactional list endpoint, using its predicates and normalized tables. Pure TypeScript replay snapshots plus focused React report/replay components. Preserve existing grid and full source details.
**Tech Stack:** Existing Python/FastAPI/DuckDB/Decimal, React/TypeScript/Vite/Vitest; no dependencies added.
**Spec:** docs/superpowers/specs/2026-11-26-review-workspace-design.md

## Global Constraints

- No reimport, migration, source mutation or acquisition schema changes.
- Same-snapshot global counts/reports; exact source money strings and per-unit separation.
- Position report omits only its own position predicate; top totals include it.
- Unknown participation/BB never enters a denominator as a zero; show coverage.
- Playback reveals information in source order, retains both boards and rewinds deterministically.
- Retain existing filters, all eleven grid fields, sorting, detail provenance and accessibility.
- Normal .git remains readonly; use alternate metadata and deliver an updated bundle.

## Review Focus

- Mixed units, empty groups, observers and unknown BB/stat denominators cannot fabricate profit rates.
- Filter changes/paging/import arrivals cannot leave stale report/player data or reset pending drafts.
- Repeated actions count once per hand; reports precede cursor predicates and LIMIT.
- Earlier replay steps cannot leak later private cards, boards or results.
- Timers, switching hands, empty phases and two runouts cannot duplicate/skip source events.

## Task 1: Exact reports over shared selection

Files: add queries/hand_reports.py and tests/test_hand_reports.py; modify queries/hands.py, api/hands.py.
Interfaces: list_hands(...,with_review=False) preserves the default shape; when true includes review={player,totals,positions,all_positions}. Unit aggregate objects include unit token/label/code/symbol, hand_count, dealt_hands, net_won (exact string), bb100, bb_hands, vpip/pfr nullable decimal strings, numerator/eligible counts. Position rows add position. No actor returns null review; empty actor library returns empty groups.

- [x] Write real-DB/API tests for page-independent sums (fixture hero .05+.05+.14=.24), position-filtered top (.10 BB) versus all-position rows, same action/date/result predicates, mixed units (no combined sum), observers/unknown BB and repeated actions.
- [x] Run focused test file RED; implement SQL aggregates over normalized facts with Decimal ratio calculation/rounding in Python. Reuse the list's built predicates; capture comparison predicates before position and append cursor only after reports.
- [x] Run backend suite and sample benchmark; commit feat(reports): add exact filtered totals and position summaries.

## Task 2: Deterministic source replay

Files: add frontend/src/features/hands/replay.ts, replay.test.ts, HandReplayer.tsx, HandReplayer.test.tsx; reuse Cards.
Interfaces: replayFrames(payload) supplies ordered event/phase frames; replaySnapshot(payload, frames, step) returns visible boards, per-player cards/fold status/ordinary blind roles, current event and finished flag. HandReplayer consumes payload, hero and source identity; resets on new payload identity, not polling object identity. No monetary arithmetic.

- [x] Write failing tests for known early-ending/RIT fixtures, exact first-deal/reveal boundaries, rewind, both boards, result-only cards, phase-only boards and playback lifecycle.
- [x] Implement pure frame/state functions, then controls and schematic view. Final results only when finished; timers stop and clean up correctly.
- [x] Run frontend suite and build; commit feat(replay): add source-ordered hand replayer.

## Task 3: Review workspace integration

Files: API contracts/client; new ReviewSummary.tsx and tests; HandsPage.tsx, HandDetails.tsx/styles and existing tests.
Interfaces: HandPage extends Page with optional nullable review. api.hands asks with_review=true. Report receives applied player/position and setPosition callback; selection preserves pending form fields except position. Details hosts replay and collapsible full source events, preserving original rendered details when expanded.

- [x] Write failing UI tests for global report counts/net, position drill-down, unit separation, pending draft preservation, no-player/empty cases and hand selection/replay/full details. Keep existing grid/sort assertions.
- [x] Build totals strip, left report and right list/replayer; preserve all grid columns with contained scroll. Show separate unit totals and no combined amount. Add VPIP/PFR toggle and denominator tooltips.
- [x] Run frontend suite and build; commit feat(ui): integrate position reports and replay workspace.

## Task 4: Acceptance and delivery

Files: docs/README, handoff and production previews.
- [x] Run make test / make build; compare sample aggregate totals to independent exact sums and measure read performance.
- [x] Inspect production desktop/narrow UI using real ASGI response snapshots, including report selection and run-it-twice replay; disclose socket limitation.
- [x] Request one fresh whole-feature review. Reproduce/fix material findings and rerun relevant/full checks.
- [x] Document metric definitions/coverage, update preview PNGs and verified bundle, commit docs/fixes in coherent chunks; retain branch without merge/push.
