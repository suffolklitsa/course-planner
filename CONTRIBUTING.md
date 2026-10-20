# Contributing to course-planner

The org-wide guide is at [suffolklitsa/.github](https://github.com/suffolklitsa/.github/blob/main/CONTRIBUTING.md). This page covers what's specific to the planner.

## Before you start

1. Comment on the issue you want so it can be assigned to you.
2. Open a Codespace, or clone the repo and make sure `python3 --version` (3.10+) and `node --version` (18+) work.
3. Make a branch named for the issue, for example `12-week-grid`.

## Rules for this repo

- **Never edit `data/courses.json` by hand.** It's generated from Suffolk's pages by `scripts/import_offerings.py`. If the data is wrong, open an issue with the section number and what Suffolk's page says.
- **Keep logic in `web/planner.js`** and keep it free of page code (`document`, `window`, `localStorage`). Every new function there gets a test in `web/planner.test.js`.
- **No new dependencies** without a reason in the pull request. The planner has none today, and that keeps it easy to run anywhere.
- **A student's plan never leaves the browser.** No uploads, no third-party scripts, no fonts or libraries from outside the site. The only thing sent is the site's own cookieless analytics, and it never includes search text, plan contents or anything that identifies a student.
- **Requirement rules need a source.** Any change that states what counts toward a requirement must link the Suffolk page or academic rule it comes from, and gets the `needs R&W review` label.
- **Accessibility:** controls must work with a keyboard, have visible labels, and keep the focus outline. Check new layouts at 390px wide.

## Browser tests

`npm ci` once, then `npx playwright test` runs the browser tests against a local build (it uses your installed Chrome; CI installs Chromium). To check a deployed copy, for example staging before a release:

```
E2E_BASE_URL=https://staging.suffolklitsa.pages.dev/planner/ npx playwright test
```

New interface behavior gets a test in `tests/e2e/planner.spec.mjs`. Pick sections by rule from `data/courses.json` (for example "two spring sections that clash"), never by name, so the tests survive data refreshes.

## Pull requests

- Run the three checks in the README; CI runs them too.
- Describe what changed and how you checked it. Screenshots help for anything visual.
- Small pull requests get reviewed faster than big ones.

## Refreshing the course data (maintainers)

`scripts/refresh_data.sh` runs twice a day from cron on the server that has the Suffolk assistant: it fetches the five course pages with the assistant's fetcher into `.cache/sources`, rebuilds and validates `courses.json`, and if sections changed, commits to `main`, tags a patch release and merges `main` into `staging`. To run the steps by hand:

The importer reads the Suffolk assistant's verified files, which live in a private repo. A maintainer with access runs:

```
python3 scripts/import_offerings.py --source /srv/dev/suffolk-chatbot/data/current_sources
python3 scripts/validate_data.py
```

and commits `data/courses.json` with a message like `data: refresh courses (sources checked 2026-10-19)`.
