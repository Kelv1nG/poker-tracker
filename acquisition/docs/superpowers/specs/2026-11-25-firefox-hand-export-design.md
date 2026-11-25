# Firefox hand history export prototype

Paths in this document are relative to `acquisition/`.

Status: approved by the user on November 25, 2026; implemented and packaged. The authenticated Bet88 export still needs its first live check in the user's Firefox.

## Intent

Export complete Bet88 poker hand histories from a date and time range using the Firefox history page the user has already opened and signed into. Keep setup small enough for a first working prototype.

## Decisions established in the conversation

- Use the existing Firefox session; the user handles login and navigation to an individual hand in the history screen.
- Read the displayed "Hand Started" date and time to decide which hands to collect.
- Capture the full player summary, cards, and ordered hand events, including hands ending before the river.
- Provide a small extension UI with From and To controls.
- Export automatically and remember a configurable destination folder under Firefox's Downloads directory.

## Approaches

1. Python or Go command line tool: suitable for an independent process, but connecting to the current Firefox session adds setup. A Playwright session would require separate login and navigation. Not selected for this workflow.
2. JavaScript pasted into Firefox's console: quickest extraction experiment, but inconvenient for repeated date entry, configuration, and progress.
3. A small Firefox extension: reuses the current page, supplies the requested controls, and saves exports through Firefox. This is the proposed direction following the user's extension suggestion.

## Proposed behavior and defaults

These are implementation recommendations, not additional user requirements.

- The extension popup contains From and To date/time fields, an export folder setting, Start, Stop, and a progress/status area. Use minute precision to match the displayed hand timestamps. Default the range to the current calendar day.
- Interpret the range using the date and time printed on the history page, without assuming or converting its timezone. Both endpoints are inclusive. Label the controls as using the page's displayed time.
- Default the folder to `PokerTracker`. Remember a configurable relative subfolder, for example `PokerTracker/Bet88`. It is relative to Firefox's configured Downloads folder; an arbitrary absolute path requires a separate native application and is outside this prototype.
- Validate the range and folder before starting. Invalid values must not trigger navigation.
- Show the currently displayed starting hand and make clear that collection proceeds backward from there. The user should open the newest hand they want to include; the extension does not seek forward to newer hands.
- Skip hands newer than To, collect those within the range, and stop on the first hand earlier than From. Include a hand exactly at either boundary.
- After inspecting each hand, click Previous Hand and wait for a different hand ID and a fully rendered hand panel before reading again. Do not treat the ID changing alone as proof that all events are ready. Repeated IDs, timeouts, unexpected date ordering, or unreadable data stop the run with an explicit reason.
- A disabled Previous Hand control ends the available history. A missing control is an error rather than evidence that the history is exhausted.
- Display hands inspected, hands collected, and the timestamp currently reached. Closing the popup must not stop the run; reopening it restores the status and controls. Only one run may be active at a time.
- Save each collected hand to extension storage before continuing, deduplicated by hand ID within the run. Stop waits for the current capture to finish and does not discard captured hands.
- On completion, stop, or failure, automatically download one JSON file containing the collected hands and metadata describing the requested range, actual starting hand, observed range, and finish reason. A failed or manually stopped run is explicitly marked partial. With zero matches, show a clear result without creating an empty export.
- Use a filename containing the requested range and export time. Avoid overwriting existing files. Confirm download completion before reporting the file as saved. Retain captured data for retry if saving fails; starting a new run must not silently discard an unsaved export.

## Extraction and architecture

Use JavaScript WebExtensions with a popup, a background coordinator for state and downloads, and a content script for reading and stepping through the page. Restrict page access to Bet88 origins needed for the poker history. Detect the frame containing `.full-hand-container`; if an inaccessible frame prevents extraction, stop with an actionable message.

The existing `hand-sample.html` provides selectors for the table name and timestamp/ID header, `.player-result` summaries, `.phase-group` streets, and event table rows. Preserve source action labels and amounts, card ranks and suits, and event order in the JSON. Following the user's November 25 request, exclude raw hand HTML from new stored captures and exports, including exports of older stored captures; markup comparisons remain internal to render-readiness checks. Store monetary values as strings to avoid floating point changes. Face-down cards remain unknown. Turn and river rows contain earlier board cards inside `.previous-cards`; preserve complete board snapshots without treating those repeated cards as newly dealt cards. Keep later pocket-card reveals as their own events.

The sample includes a run-it-twice choice and a decline. Preserve these events verbatim. If additional boards are rendered in other hands, preserve their groups and order rather than assuming exactly four streets or inferring a board that is not shown.

Do not collect account balances, cookies, or unrelated page content. Storage and export remain local; no server is involved.

## Scope and limits

The first version supports the history view that is open, including its loaded cash-game or tournament selection. It does not switch categories, log in, recover after browser restart, or promise collection of hands newer than the starting hand. A signed distribution package and an arbitrary filesystem destination are later work. Load the development extension temporarily through Firefox's `about:debugging`.

A static HTML sample cannot prove live navigation behavior or frame placement. The first live Firefox check must confirm the Previous Hand control, complete panel readiness, and backward chronological ordering. Site markup changes may require selector updates.

## Validation

Verify extraction against the supplied HTML, especially suits, hidden cards, action order, repeated board cards, and blank amounts. Use a controlled history fixture to verify both inclusive boundaries, skips above To, early-ending hands, duplicate IDs, slow rendering, stopping, popup reopening, and retaining data on download failure. Finish with a small live Firefox export and compare it to the displayed hands before trusting a larger run.

## Builder choices

The builder chooses module layout, manifest version supported by the installed Firefox, exact JSON schema, safe render-readiness strategy, and test tooling. Keep those choices small and compatible with testing on the existing page.

## References

- [Firefox content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
- [Downloads API: paths are relative to the default download directory](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/download)
- [Temporary extension installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
