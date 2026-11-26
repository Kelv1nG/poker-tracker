# Review workspace, filtered totals and hand replay

User selected **Review workspace** from the exported proposals on November 26, 2026.
Implement that layout inline, continuing the authorized local tracker work and the
user's preference to build and iterate without further approval checkpoints.

## Intended workflow

Apply existing player/date/game/result/stakes/action/unit filters. See matching hand
count and total net won across every matching hand, not just the current page.
Compare positions in a left report; click one to drill down the hand list and top
totals, then select a hand for a schematic action replayer on the right. Keep the
original eleven grid fields, header sorting, compact action notation and full source
event detail available. On smaller screens the report/list/replay stack vertically;
tables can scroll internally without widening the page. Use the existing app style.

## Approaches and selected layout

Review workspace (selected): totals above, position report left, hands and selected
replay right. It keeps comparisons and the selected hand together. Wide reports
(alternative shown/exported): a wider report followed by hands/replay; more room for
statistics but more vertical separation. An independent replay route was considered
and not selected because it loses current report context.

## Totals and position report

Existing normalized data gains reports without reimport or a migration. Reuse the
same bound predicates, read snapshot and exact Decimal source results as hand paging.
Extend `/api/hands?with_review=true` with an optional `review` member; the default
API shape stays compatible. Report queries never decode the whole payload library.

Top totals follow all applied predicates, including position. Position comparison
uses every applied predicate except position, so the other rows remain available.
A row sets the position predicate immediately and resets paging/selection. All
positions clears it. Pending form drafts remain intact, except the selected position.
Show All/SB/BB/UTG/HJ/CO/BTN/Unknown where applicable. Explicit Unknown stays distinct
from a listed player who was not dealt; observer-only/unknown participation does not
enter dealt-hand statistic denominators. SB includes HU button, as already defined.

Money is grouped by exact `(currency_code, displayed symbol)` context. Mixed units
must never produce a combined monetary number; show separately labelled totals and
position rows per unit, with an option to apply a unit from the existing selector.
Unresolved `$` stays currency-unset. Source amounts and aggregate totals travel as
strings; no JavaScript floating-point money arithmetic. Count results and money
summaries come from the same read transaction. Empty matching results do not masquerade
as results for a different player or the previous filters.

Report columns: Position, Hands, Net won, bb/100, with optional VPIP/PFR columns.
`bb/100 = 100 × mean(net_result / established nominal_bb)` for confirmed dealt hands
with a positive established BB. Exclude unknown BBs and show coverage/denominator;
never convert missing blinds to zero. Mixed stakes can share this ratio only within
a labelled unit context. Decimal arithmetic precedes display rounding. VPIP is the
percentage of reliable dealt preflop records containing voluntary CALL/RAISE/BET;
PFR is the percentage containing RAISE. Count each hand once, ignore forced posts
and informational events. A reliable preflop roster is required for these denominators.
Expose numerator/denominator counts and return null for a zero denominator.

Totals describe recorded results of matching whole hands, not action EV or causal
profit attributed to a particular move. Do not add equity, EV, showdown statistics,
3-bet opportunity statistics, inferred physical seats or session reports in this pass.

## Replayer

Selecting an existing hand link opens a replayer directly beneath the hand grid.
Reuse the canonical hand detail endpoint, with full original events separately
expandable. A schematic table shows listed participants, explicit ordinary blind
roles, starting balances, currently known private cards, visible runout(s), the
current actor/action/recorded amount, and a step counter. Label the layout schematic;
physical seating and authoritative running pot/stack movements are absent from the
source. Do not reconstruct them or guess incremental versus raise-to amounts.

Controls: Start, Previous, Play/Pause, Next and a bounded step slider. Default at
start; no autoplay on selecting a hand. Start/Previous/slider/hand changes stop play.
Playback advances once per second and stops at the final event; clear timers on
unmount and switching hands. Source labels and money displays stay intact. Final
results appear only at the end. Folded players remain visible and marked folded.

Frames follow exported phase/event order. Board-only phases are visible even without
an explicit board event; avoid rendering the same phase board twice when its board
event exists. Hidden `[null,null]` deals remain hidden. Two-card reveals appear only
when their event is reached; five-card results never replace private cards. Advancing
then rewinding must remove later cards, folds, boards and results. Keep both runouts
once observed; while the second run is dealt, retain the first board. Ambiguous
source board groups remain labelled rather than silently merged into a fake runout.
Snapshot derivation is pure and deterministic, without mutating canonical payloads.

## Validation and delivery

Real-DB tests prove global/page-independent exact totals, same predicates, position
comparison scope, money separation, unknown/observer denominators, multiple actions
per hand and BB coverage. Existing cursor/validation tests stay green. Replayer model
and component tests cover early-ending, ordinary river, all-in/run-it-twice, hidden
cards, rewinding, phase-only boards and timers. UI tests cover report drill-down,
unit contexts, draft preservation and retained filters/sorting/full details.

Run full tests and production build; benchmark the real 1,145-hand sample and compare
independently counted sums. Inspect production desktop/narrow layouts with real ASGI
snapshots where loopback sockets are unavailable. One final independent review,
material fixes with regressions, coherent commits and an updated importable bundle.
Keep sources/acquisition formats unchanged and normal readonly `.git` untouched.
