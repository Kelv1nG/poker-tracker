# Review workspace handoff

Run `make run` from the repository root and open http://127.0.0.1:8000/#hands.
Dependencies are unchanged. No migration or reimport is needed for this feature.

The workspace adds matching-hand counts and exact per-money-unit totals across all
pages, position comparisons, optional VPIP/PFR and a source-ordered schematic replay.
Position rows retain every filter except position. Clicking a row changes position
alone and preserves unrelated drafts, including a pending money unit. All positions
clears that predicate. Counts and report rows share the list query's read transaction.

Money totals remain Decimal on the server and strings on the wire; currencies and
unresolved source symbols remain separate. BB/100 is 100 times the mean per-hand
net/nominal-BB among confirmed dealt hands with a positive established BB. VPIP counts
voluntary preflop CALL/RAISE/BET and PFR counts RAISE, once per reliable dealt hand.
Zero denominators produce no rate. Hover each rate for its numerator/denominator or
coverage. Observer records appear separately as Not dealt when inclusion is enabled;
they contribute to requested overall results but never dealt/stat denominators.

Replay starts paused, reveals cards and boards at their source events and removes
later information on rewind. One-card reveals retain a hidden second card; five-card
results never become private cards. Both runouts remain visible after observation.
Results appear at the end. Start/Previous/slider/hand changes stop playback; timers
clear at completion and unmount. Full original events, results and archive provenance
remain under Full hand history and sources. Layout is schematic, without inferred
physical seats, running pots, incremental raise amounts or running balances.

## Validation

- `make test`: 172 backend, 42 frontend, 29 acquisition Node and 12 acquisition
  Firefox checks pass (255 total). `make build`: TypeScript and production Vite
  build pass. The complete suite ran after all review fixes.
- Independent source-export calculations: 1,127 Tassadar dealt hands, net 61.35;
  heads-up subset 330 hands, net -41.22. VPIP/PFR hand counts respectively 380/309
  and 165/146. BB/100 independently computed in Decimal is -16.62 over 1,127 hands.
- With listed-player inclusion: 1,145 records, including 18 Not dealt records;
  Unknown position is a distinct 12-record group. Reports agree across pagination
  and preserve comparisons after selecting BB.
- Source archives, canonical payload/hash digest and all 18,382 normalized events
  are checked unchanged in the disposable acceptance library.
- Production Firefox checks use real in-process ASGI response snapshots. The runner
  blocks loopback sockets, so browser-to-live-local-server integration is untested.
  `make run` uses that normal live path outside this runner.
- Final production Firefox checks pass at 1280px and a true 390px iframe: all eleven
  grid columns, global/page-independent totals, position drilldown, pending drafts,
  pagination reset, replay start/end/rewind/timers, both runouts, full source detail,
  Unicode, empty and no-player modes, and contained page/grid overflow. Settled-DOM
  screenshots: [desktop overview](../previews/review-overview-1280.png),
  [narrow overview](../previews/review-overview-390.png),
  [desktop replay](../previews/review-replay-1280.png),
  [narrow replay](../previews/review-replay-390.png).
- Sample report/list API reads were 326–692 ms in the final single local run,
  including ASGI client overhead. This is not a large-library scaling guarantee.

## Independent review

One fresh whole-feature review found four important issues. Each was reproduced
with a failing regression and fixed: position clicks overwriting pending currency;
observer counts mixed into Unknown position; imported second currencies preventing
options refresh while old reports remained displayed; and dropped one-card shows.
Financial queries now pin the resolved sole unit, import polling refreshes options
independently of hand-query errors, and failed requests hide old report/list data.

Deferred minor: rate coverage is exposed through hover titles on table cells. Touch
and keyboard users cannot reliably inspect those details; a visible or operable
coverage disclosure remains future accessibility work. No other minors were deferred.
The reviewer declined no behavior as outside the design.

## Delivery and decisions

The saved plan already selects retaining the feature branch without merge or push.
The existing authorized current-directory fallback and alternate Git metadata under
`/tmp` are retained because normal `.git` is read-only. Changes are in the current
working files and coherent history is delivered in `dist/review-workspace.bundle`
on `feat/review-workspace`. Integration requires importing that bundle in the user's
terminal; existing source/acquisition formats are unchanged.

For an original checkout still on the initial base with no unrelated new commits:

```bash
git fetch dist/review-workspace.bundle feat/review-workspace
git switch -c feat/review-workspace
git reset --mixed FETCH_HEAD
```

If that branch already exists, switch to it rather than recreating it. The bundle
contains earlier prototype/filter history from `b729c37`. Reconcile unrelated history
before adopting it. A mixed reset retains working files. No merge or push performed.

Execution rulings: reuse the previously authorized alternate-metadata fallback and
retain the branch as selected in the plan; no new approval checkpoints. Cost:
normal Git history requires bundle adoption outside the runner. No implementation
scope deviations or additional review exclusions were accepted.

## Full-width layout and row-selection follow-up

Any hand cell now opens the selected hand's replay. Rows have hover/selection and
keyboard-focus feedback; Enter and Space also open the hand. The existing detail
heading receives focus after loading, bringing the selected hand into view. Clicking
the table-name button still works without triggering duplicate row activation.

The application fills the browser width without an outer card, border, radius,
maximum width or surrounding margins. Main content retains small edge spacing. The
position report is capped at 300px on desktop so the recovered width goes to the
hand grid. All eleven columns fit without horizontal scrolling at 1920px and 2560px
with the real sample responses; smaller screens retain contained grid scrolling.

Validation: expected pointer/keyboard regressions failed before implementation;
44 frontend tests and the production build pass. Production Firefox inspection uses
actual ASGI snapshots at 1920px, 2560px, 1280px and a true 390px viewport, including
row-click replay, full-width geometry and overflow. The earlier full backend and
acquisition results precede this UI-only follow-up. See the latest
[desktop preview](../previews/hands-full-width-1920.png). The bundle is updated with
this follow-up; branch retention and the integration instructions above still apply.
