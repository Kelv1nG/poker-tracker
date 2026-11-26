# Player-focused Hands grid and filters

Implemented over the local FastAPI/React/DuckDB prototype. Restart from the repository
root with `make run`, then open http://127.0.0.1:8000/#hands. Dependencies are unchanged.
Existing imports gain the fields through a read-only normalized-data view; no
reimport is required. Source archives, canonical payloads and acquisition exports
retain their existing format.

Hands defaults to the saved hero. Choose an exact player name to review someone else
without changing that setting. With no hero, the all-hands browser remains available.
Apply filters together: game type, result, nominal stakes, primary position and player
betting action. More filters contains printed date bounds, exact table, action street,
exact net bounds, money context and date/net ordering. Changing the query resets its
keyset pagination. New completed imports refresh options and preserve drafts. Date and Net won
headers also apply sorting immediately: the first click on a new column is descending,
then further clicks alternate ascending/descending. Sort arrows and screen-reader
`aria-sort` reflect the applied query, and the More filters dropdown stays synchronized.
Header sorting keeps active predicates and pending drafts; an un-applied player change
must be applied before sorting Net won. If money contexts are mixed, the header opens
More filters and focuses the required unit selector.

The grid shows printed date, private cards, preflop situation, both boards, ordered
street lines, original net display, position, blind posts, dealt count, starting stack
and table/detail link. Scroll the grid horizontally for remaining columns. Desktop
and narrow previews: [1280px](../previews/hand-filters-1280.png),
[390px](../previews/hand-filters-390.png).

HU means exactly two explicit deal recipients, including hidden cards. Listed
observers are excluded by default; the inclusion toggle also exposes unknown
participation. Contradictory betting actors on any street invalidate the roster.
Explicit blind roles are preserved; relative positions require a complete,
uncontradicted first betting orbit. Missing blind decisions after all-in posts do not
by themselves fabricate contradictions. Non-blind positions above six players remain
Unknown. A potentially short blind post is displayed but does not establish nominal
stakes. Five-card final results never become inferred private cards.

Exact money stays in Decimal on the server and strings on the wire. Numeric net
bounds/sorting need one code/symbol context. Mixed contexts require explicit selection;
a displayed `$` with no source code stays unresolved. A new mixed context may require
choosing a unit and applying the query again. No currency conversion or combined
financial totals are introduced.

## Verification

- `make test`: 164 backend, 19 frontend, 29 acquisition Node and 12 acquisition
  Firefox checks pass (224 total).
- `make build`: TypeScript and production Vite build pass.
- Real 1,145-hand dataset: independently counted 1,127 Tassadar deals, 330 HU deals
  and 1,145 listed records; query results agree. Final read timings were approximately
  124–253 ms for the tested queries (single local sample, not a scaling guarantee).
- Canonical payload/hash digest, 18,382 normalized events and all archived SHA-256
  digests remained unchanged during upgrade/query checks.
- Production bundle in Firefox at 1280px and a true 390px iframe: hero selection,
  all eleven columns, HU filtering/count, both compact boards, full second-run events,
  Unicode and page/grid overflow checks pass. PNGs capture settled production DOM.
- Loopback sockets are blocked by the runner. API checks use the actual in-process
  ASGI application; browser inspection uses its recorded real responses. A browser
  connected to a live local server was not tested here.

Independent review found three material issues: later-street roster contradictions,
first-orbit repeats/blind order, and stale money/stake options after imports. Each
was reproduced with a failing test and fixed; the final full suite passed. No
review minors were deferred.

## Commits and implementation decisions

Normal `.git` is read-only in this runner. Source changes are already in the workspace;
coherent commits are preserved on `feat/hand-filters` in `dist/hand-filters.bundle`.
The bundle includes the preceding local prototype history from `b729c37`; no merge
or push was performed. The branch is retained for the user's integration.

For the original checkout with no unrelated new commits:

```bash
git fetch dist/hand-filters.bundle feat/hand-filters
git switch -c feat/hand-filters
git reset --mixed FETCH_HEAD
```

If that feature branch already exists, switch to it rather than recreating it. A mixed
reset retains working files; reconcile unrelated history before adopting the bundle.

Execution rulings and costs:

1. Continue in the authorized current-directory fallback with alternate Git metadata
   under `/tmp`; readonly `.git` prevents ordinary worktree/commit updates. Cost:
   history needs bundle adoption in the user's terminal.
2. Reuse fresh full-suite results when committing instead of repeating them for
   helper bookkeeping. Final acceptance still runs the complete suite after fixes.
3. Correct the initial fold fixture expectation to the actual source actor `궤꼴`,
   rather than changing production behavior to fit a mistaken test.
4. Revise unreleased migration 003 before delivery instead of duplicating its view
   in migration 004. The disposable development smoke DB recreated that view for
   validation. A development-only DB that already applied the interim 003 would
   need its view recreated; ordinary prior-prototype databases have only 001/002.

Review exclusions accepted: physical seat accuracy (source has no seat/button fields,
so inference is labelled); implicit-unit cursor policy (a newly mixed context requires
selection); adversarial deeply nested token hardening (no demonstrated ordinary local
use failure, no advanced parser-hardening claim). These do not add seat analytics,
HUD, replay, sessions, EV/equity or advanced statistics to this iteration.

## Column-header sorting follow-up

Added Date/Net won header buttons over the existing server-side sorting contract;
no database changes or reimport. Five new regressions cover direction toggles, global
query/pagination reset, dropdown synchronization, unapplied drafts, mixed units and
all-hands mode. Frontend suite: 24 tests pass; production build passes. Existing backend
filter/sort integration tests: 23 pass. Production Firefox checks at 1280px and a true
390px viewport pass, including header clicks rendering actual ASGI-sorted largest
($34.86) and smallest (-$20.45) results from the disposable sample library. The original full-suite evidence above
precedes this UI-only follow-up.

## Compact betting line follow-up

The Line column displays one hyphenated action string, e.g. `R-X-B-XF`, with
multiple actions on the same street kept together. Street labels remain in hover
text; the grid shows no street prefixes. Hands without observed actions display a
dash rather than invented checks. Only presentation changes; normalized event groups
and full details are preserved. Frontend suite: 25 tests and production build pass.
