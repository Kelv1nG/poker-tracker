# Player-focused hand list and basic filters

Status: proposed design for review. This extends the existing local prototype.

## Intent and decisions

Make the Hands screen useful for finding particular situations, using the compact
hand grid in the supplied DriveHUD screenshot as a reference. Keep the current
Imports, Hands and Overview navigation and full hand-detail panel.

The user selected these defaults:

- Default to the configured hero, with a player selector for reviewing another player.
- Normally show only hands that the selected player was dealt into. An explicit
  option includes hands where that player is listed but was not dealt in.
- Heads-up means two players dealt into the hand, even when other players are listed.
  A multiway hand that folds down to two remains multiway under this definition.

The requested grid has date, hole cards, preflop situation, board, action line, net
won, position and blinds. Add dealt-player count, starting stack and table context
where they help inspection. Basic filtering covers date, results, stakes, position
and player actions.

## Approach

Builder recommendation: extend the existing Hands query/view over normalized
DuckDB data. Derive fields from stored players, phases and events; filter and sort
before pagination. Existing imports immediately gain the new fields without another
upload or changing canonical source records.

An alternative is to store versioned per-player analytical facts at import time and
backfill existing hands. That makes a larger analytical library faster to query but
adds importer/backfill/version-management work. Defer that until measurements show
it is needed. This query-first choice is a builder recommendation, not a preference
the user has explicitly selected.

All matching and totals must apply to the full candidate library. Deriving/filtering
just the already-paginated 50 rows would produce incorrect results. SQL views/CTEs
and typed presentation derivation are acceptable; reparsing source archives per
request is not. Record query timing on the real local export during validation.

## Data evidence

Audit of the local 1,145-hand export:

- Every hand has explicit preflop `Was dealt` events, including hidden cards.
- Seventeen hands list three or more players but deal cards to exactly two.
- Eighteen records list Tassadar without dealing that player in.
- Seventeen hands lack an ordinary small-blind posting. No player seat or button
  fields are exported. A preliminary action-order check is usable in 1,127 hands;
  it is evidence to validate, not a guarantee that all positions can be inferred.
- Observed ordinary SB/BB posts are 0.02/0.05, 0.05/0.10, 0.10/0.25 and 0.25/0.50.
  Small blind is not always half the big blind.
- Entry bets, dead small blinds, combined entry posts and waiting/declining events
  exist, so they must be distinguished from ordinary blind positions and betting.

Keep synthetic/trimmed hand-checked fixtures in tests. The large personal export
stays ignored and is used only for local validation.

## Selected player and participation

Use exact screen names. The saved hero setting supplies the initial selection;
changing the selector reviews another player without silently changing that setting.
If no hero is configured, retain an all-hands view and invite player selection.
Player-specific cells are blank until a player is selected.

With a selected player, consider only hands listing that player. Default inclusion
requires an explicit preflop deal event for them. The include-not-dealt option also
shows their listed-only records, visibly marked `Not dealt`. Do not infer why a
player was not dealt in; the source does not always state whether they sat out,
were waiting, had just joined, or were otherwise inactive.

Count distinct deal recipients, including `[null, null]` hole cards. Repeated
revelations and second-run board groups do not add players. Missing or contradictory
deal evidence produces nullable participation/roster fields and an Unknown game type.
For example, a betting actor absent from the deal roster prevents confidently
classifying the whole hand. Explicit known participation of another player remains
usable even if the overall roster is uncertain.

Game type: HU for two confirmed recipients; Multiway for three or more; Unknown
when the roster cannot be trusted. The grid can show `HU`, `3-handed`, etc. Table
participants and players dealt in remain separate values.

## Grid fields

- **Date:** existing printed minute timestamp, without browser timezone conversion.
- **Cards:** selected player's explicit two-card deal/reveal information. Hidden cards
  display as unknown. A five-card final result is not a substitute for hole cards.
- **Preflop:** situation immediately before the player's first voluntary betting
  action: Unopened, Limped, Facing raise, Facing re-raise, or Unknown/Not dealt.
  Ignore forced posts, card reveals, wait/entry decisions and run-it-twice acceptance.
- **Board:** preserve each runout. Repeated `Table Cards Dealt` groups must retain
  both complete boards; the second run must not overwrite the first.
- **Line:** selected player's betting actions grouped by PF/flop/turn/river. Use
  R/C/B/X/F for raise/call/bet/check/fold, with an accessible expanded description.
  Multiple actions on one street stay ordered. Missing actions are not checks.
- **Net won:** exact recorded net result and original display string. Positive,
  negative and zero classify Won, Lost and Breakeven; this is a monetary result,
  not an inferred showdown winner.
- **Position:** explicit ordinary SB/BB posts first. Infer remaining positions only
  when active players, distinct ordinary blind roles and a complete consistent
  first betting orbit establish their order. Otherwise show Unknown with a reason.
- **Blinds:** ordinary posted SB/BB values, preserving a missing side as unknown.
  Entry/dead posts are not nominal stakes. Flag potentially short all-in blind
  postings instead of pretending their amount identifies the nominal level.
- **Starting stack:** recorded balance; BB equivalents only when the nominal BB
  is sufficiently established. Monetary arithmetic stays Decimal, with display
  rounding limited to explicitly derived ratios.
- **Context:** table name and dealt-player count. Listed-player count is available
  as secondary information rather than the definition of HU.

For 3–6 confirmed participants, consistent non-blind action order gives these primary
positions: BTN; CO/BTN; HJ/CO/BTN; UTG/HJ/CO/BTN respectively, followed by SB/BB.
These describe active-player order, not exported physical seat numbers. Use labels
UTG (EP) and HJ (MP) where helpful. In HU, display SB/button but classify its primary
position as SB. The BTN filter refers to the separate button position in 3+ handed
play; the SB filter includes the HU button. Unsupported or ambiguous configurations
retain explicit blind roles and leave other positions Unknown.

## Filters and sorting

- Player selector; include-listed-but-not-dealt toggle, off by default.
- Existing inclusive printed From/To and exact table filter.
- Game type: All / Heads-up / Multiway / Unknown.
- Result: All / Won / Lost / Breakeven; optional inclusive net-result bounds.
- Stakes from supported known SB/BB pairs, plus Unknown where appropriate.
- Primary position, including Unknown.
- Player action: Any / Raise / Call / Bet / Check / Fold, with optional street.
  The match means that the player performed that action on the specified street,
  or any street if no street is chosen. It is not a full sequence-pattern editor.
- Sort by printed date or net result, ascending/descending. Include deterministic
  source/hand-ID tie-breakers and keyset pagination appropriate to each ordering.

Combine different filters with AND. Reset pagination when selection, filters or sort
change. Validate query values and bounds before querying, and keep global matching
counts consistent with the returned page snapshot.

Money bounds/sorting need a single comparable unit context: source currency code
and displayed symbol, with unresolved units explicitly labelled. If multiple contexts
exist, require a choice before applying monetary bounds/sort. Won/Lost/Breakeven
sign filters work across contexts. Never convert currencies or combine unresolved
money totals. If a single context exists, select it automatically without guessing
its ISO code. A BB-ratio view is optional and must not replace source amounts.

Unknown derived values remain visible and can be found with the corresponding
Unknown filter. Unknown values never pass numeric bounds by being converted to zero.
With no selected player, disable player-specific action/position/result controls and
keep the baseline hand browser available.

## UI and API integration

Keep the current React/TypeScript, FastAPI and DuckDB stack. Reuse card rendering,
printed-time handling, error states, full details and polling infrastructure.
Expose the available players and supported filter options with typed API responses;
extend hand summaries with nullable derived fields and evidence/quality flags.
Exact endpoint composition is a builder choice. Player lookup must support exact
Unicode names and remain usable as the library grows.

Filter controls should fit the existing panel with a compact primary set and extra
controls grouped sensibly. The grid can scroll horizontally at narrow widths; main
page overflow, keyboard operation, visible focus and legible cards/text are required.
Keep the selected player's identity apparent while browsing. Existing detail panels
continue showing every original event and both runouts.

Canonical hand identity, original source archive, deduplication/conflict rules and
the acquisition export schema stay unchanged. Source settings remain explicit; the
new derivation layer does not silently reinterpret imported timestamps or currencies.

## Acceptance and validation

1. A three-listed/two-dealt hand is HU; hidden cards count; observer-only hero records
   are excluded by default and recoverable with the toggle.
2. Missing/contradictory deal evidence stays Unknown; run-it-twice does not duplicate
   dealt counts, actions or canonical hands.
3. Explicit and inferred position cases cover HU through six-handed, missing SB,
   dead/entry posts and inconsistent action order. Uncertainty stays labelled.
4. Each requested filter acts before pagination. Combined filters, empty results,
   exact decimal bounds, currency contexts, sorting ties and concurrent new imports
   have hand-checked integration tests.
5. Cards, both boards, preflop situation and action line agree with known single-run,
   early-ending and run-it-twice fixtures. No final-hand-to-hole-card guessing occurs.
6. Existing imported data gains fields automatically. UI tests cover hero default,
   player switch, inclusion toggle, filters/sorting, pagination resets and errors.
7. Run backend/frontend/acquisition suites and the production build. Benchmark the
   real sample; inspect the production UI at desktop and narrow widths. Record the
   existing sandbox socket limit rather than claiming a live server check.
8. Keep changes in coherent commits and refresh the importable bundle while normal
   Git metadata is read-only.

Advanced player statistics, sessions, equity/EV, showdown classification, all-in
inference, HUD, a replayer, a full dashboard redesign and a hand-range editor are
outside this pass. Those require additional source semantics and acceptance criteria.

## References

- User's DriveHUD screenshot and the current prototype/normalized data.
- [DriveHUD manual](https://drivehud.com/manual/): action filters and preflop
  situations are defined from the target player's perspective.
- [PokerStars rules](https://www.pokerstars.com/help/articles/poker-rules-master/229151/):
  heads-up dealer/small-blind and betting-order rules. Applying those rules to the
  captured event order is a derivation, not an explicit seat field supplied by Bet88.
