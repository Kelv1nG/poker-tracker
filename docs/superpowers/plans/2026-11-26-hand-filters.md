# Player-focused hand filtering implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, with TDD and one final independent review. User approved implementation; do not ask again between tasks.

**Goal:** Extend Hands with player-focused poker columns, reliable HU classification and server-side filters/sorting that work on existing imports.

**Architecture:** A migration adds a derived DuckDB view over existing normalized tables. It computes roster, position, blind, first-action and player-result facts without changing canonical data. Query predicates/counts/keyset paging use that view; presentation helpers decode only returned page payloads for hole cards, boards and action lines. React consumes typed nullable fields and options.

**Tech stack:** Existing Python/FastAPI/DuckDB/Decimal and React/TypeScript/Vite. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-26-hand-filters-design.md`

## Global constraints

- Exact player names; saved hero default; include-listed-but-not-dealt off by default.
- HU means exactly two dealt recipients, including hidden cards. Contradictions remain Unknown.
- Derivations apply to existing data without reimport. Canonical payload/hash/archive and acquisition schema stay unchanged.
- Filters act before pagination and counts; use snapshot-consistent reads and sort-specific keyset cursors.
- Preserve printed time and original monetary strings; Decimal predicates and no combined unresolved monetary totals.
- Relative positions are inferred only with complete ordinary blind/deal/action-order evidence; unsupported/ambiguous cases remain Unknown.
- One backend process, shared mutation lock, independent connections. Existing tests continue passing.
- Normal `.git` remains read-only; use /tmp/poker-tracker-implementation.git metadata and deliver an importable bundle.

## Review focus

- Listed observers, missing deal evidence, hidden cards, dead/entry posts and missing SB must not fabricate participation, stakes or positions.
- Player/currency changes, unknown fields and equal monetary/date sort keys must not cause wrong filters, duplicated pages or stale UI state.
- Both runouts and action order must survive compact presentation; five-card results cannot become inferred hole cards.
- Global counts must agree with the whole filtered library, not just one fetched page; existing data must work on upgrade.
- Unsupported/malformed parameters and mixed money contexts must fail helpfully without silent float conversion or source mutation.

## Task 1: Derived facts and compact presentation

Files: add `storage/migrations/003_hand_analysis.sql`, `queries/hand_presentation.py`, `tests/test_hand_analysis.py`. Modify migration-version expectations in storage tests.

Interfaces: SQL view `player_hand_analysis` has one row per listed player with identity/time/table/player ordinal; normalized Decimal balances/results and original displays; source currency/symbol; nullable dealt count/player participation, game_type (HU/MULTIWAY/UNKNOWN), primary position/evidence, ordinary posted and established nominal blinds, and preflop spot. `present_hand(payload: dict, player: str | None) -> dict` returns hole_cards, boards and action_line.

- [ ] Write failing real-DB fixtures: three listed/two dealt =>HU; observer not dealt; `[null,null]` counts; missing/contradictory deal =>Unknown; repeated runouts do not add participants. Establish literal positional expectations for 2–6 dealt players, missing SB/dead posts and inconsistent first orbit.
- [ ] Include exact results/blinds, nominal short-post uncertainty, reopened old database, original card deals/reveals (not final_hand), both known boards and ordered street lines.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_hand_analysis.py -q`; observe absent-view/helper failures.
- [ ] Implement SQL CTEs for deal evidence, ordinary blind roles/nominal amounts, voluntary first actions, complete non-blind ordering and per-player preflop situation. Unknown cases stay nullable/explicit. Decode page payloads for presentation only.
- [ ] Run backend suite, fix genuine failures and commit `feat(analysis): derive participation, positions and compact hand summaries`.

## Task 2: Filtered queries, options and API

Files: extend `queries/hands.py`, `api/hands.py`; add `queries/hand_filters.py`, `tests/test_hand_filters.py`. Existing legacy no-player hand list remains usable.

Interfaces: `list_hands(..., player=None, include_not_dealt=False, game_type=None, result=None, net_min=None, net_max=None, unit=None, stake=None, position=None, action=None, street=None, sort='date_desc')`. Sort values date_desc/date_asc/net_desc/net_asc. Unit/stake tokens are validated opaque structured values, never floats. `GET /api/hand-options?player=&search=` provides player suggestions and selected-player money units/stakes. SQL binds all user values.

- [ ] Write failing DB/API tests for every filter, combined filters, default dealt-only, all-hands view, exact Unicode names, one-context money bounds and ambiguous-unit rejection. Use literal counts independent of query implementation.
- [ ] Test date/net sorting in both directions, equal keys across page boundaries, unsupported cursor/query values, changed ordering and new arrivals; predicates/counts apply globally before paging.
- [ ] Run focused tests RED, implement validated query construction and filter options, enrich returned page summaries with Task 1 fields. Unknown values do not become zero. Actor filters require player; monetary bounds/sort require a resolved single unit.
- [ ] Run backend suite and benchmark the local 1,145-hand file; compare independently counted participation/HU results. Commit `feat(api): add player-focused hand filters and stable sorting`.

## Task 3: Hands grid and controls

Files: update frontend API contracts/client, `features/hands/HandsPage.tsx`, styles; add focused filter/grid components as needed and behavior tests. Reuse Cards and existing full details.

Interfaces: summary adds nullable actor values, dealt count/game type, position/evidence, preflop spot, blinds/stack, hole_cards/boards/action_line. With no configured hero, retain all-hands mode with blank player cells. Player selection reviews an exact name without modifying saved hero. Form changes apply together, resetting page cursor; defaults never overwrite a user draft.

- [ ] Write failing component tests: hero default, player switch, non-dealt checkbox, HU filter, result/stakes/position/actions, date/net sort, paging resets, all-hands mode, unknown values, errors and both boards.
- [ ] Run frontend suite RED. Implement compact Date/Cards/Preflop/Board/Line/Net won/Position/Blinds/Dealt players/Stack/Table grid with usable primary/extra controls. No React rendering of unvalidated metadata or JavaScript Date on source times.
- [ ] Derive money controls from options; auto-pick a single context, require explicit selection when mixed. Preserve exact string query values. Show source/derived uncertainty accessibly.
- [ ] Run frontend tests and production build; commit `feat(ui): add player-centric hand grid and basic filters`.

## Task 4: Acceptance, final review and delivery

Files: update docs/README and add acceptance cases to existing test modules. Keep new execution record in this plan's own ignored workspace.

- [ ] Run `make test` and `make build`; verify actual source fixtures, read-query timings and archive/canonical counts unchanged.
- [ ] Inspect production UI at desktop/narrow widths with real ASGI response snapshots when socket binding is denied; record limits honestly.
- [ ] Request one fresh independent whole-feature review. Fix material findings with reproducing RED→GREEN tests; record deferred minors. Do not spawn per-task implementers/reviewers.
- [ ] Update handoff/run instructions and importable bundle, verify clean alternate Git status and bundle history. Commit final fixes/docs in coherent chunks.

## Implementation choices

- Current dataset has 2–6 dealt players. Positional inference beyond six leaves non-blind roles Unknown. HU SB displays button context but primary position remains SB.
- Action filter means at least one matching player betting action, optionally on a named street; it is not a sequence editor.
- A player with no voluntary decision has an explicit No decision preflop label, distinct from Unknown and Not dealt.
- Presentation builds maximal observed board chains, retaining distinct runouts/unknown source groups and their order. Canonical phases remain the full detail truth.
