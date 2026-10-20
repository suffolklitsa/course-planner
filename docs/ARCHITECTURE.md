# Architecture

## Pieces

| Piece | Job | Tested by |
|---|---|---|
| `scripts/import_offerings.py` | Turns the assistant's source files into `data/courses.json` | `tests/test_import.py` |
| `scripts/validate_data.py` | Fails CI if `courses.json` breaks the contract in DATA.md | CI |
| `web/planner.js` | Scheduling logic: conflicts, credits, filters, display text | `web/planner.test.js` |
| `web/app.js` | Loads `courses.json`, draws the page, saves the schedule in `localStorage` | Manual for now |
| `scripts/build_site.py` | Copies `web/` and the data into `dist/` | CI |

## Why the data comes from the assistant

The Suffolk assistant already re-fetches Suffolk's course pages every week, checks them against verification markers, and keeps a dated record of each source. Scraping the same pages again here would mean two scrapers that can drift apart. The planner reads the assistant's output and records each source's URL and verification date in `courses.json`, which the page shows in its footer.

## Conflict rules

Two sections conflict when all of these hold:

1. Same term.
2. Their date ranges overlap. A section without dates is treated as running the whole term.
3. They meet on the same day and their times intersect. A class ending at 1:25pm and one starting at 1:25pm do not conflict.

Asynchronous sections have no meetings and never conflict.

## How it reaches the site

The club site (suffolklitsa/suffolklitsa.org) rebuilds on a schedule. Its build will clone this repo, run `scripts/build_site.py`, and copy `dist/` to `/planner`. Until that's wired up, see the open issue on site integration.

## Storage

The only thing stored is the list of chosen section IDs, under the browser key `litsa.planner.v1`. If storage is blocked (private windows), the planner still works for that visit. Changing the format means bumping the key.
