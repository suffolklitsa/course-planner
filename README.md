# course-planner

Plan your Suffolk Law semesters. The planner runs on the LITSA site at **suffolklitsa.org/planner**; this repo holds its code, its course data and the scripts that keep that data current.

**Status:** version 1 in progress, aimed at spring 2027 registration in November.

## What it does

**Version 1: spring schedule builder**

*Finding courses*
- One card per course, with its sections inside. Search by course, section number, professor or topic (course descriptions are searched too). Press `/` to jump to search.
- Sort by title, course number, day and time, credits or professor.
- Filter by division, format, Area of Focus, credits, what a course counts toward (experiential, writing requirement, Mass. bar course), days to avoid, and morning, afternoon or evening.
- Tell it your year and division: upper-level students stop seeing first-year required sections, and day students get the 12-credit minimum check.
- Mark courses **already taken** or **not interested** to hide them. "Taken" also feeds the prerequisite check.

*Checking a plan*
- **Plan A and Plan B**, plus a starred **shortlist**.
- Sections that conflict with your plan are marked in the results, and you can hide them.
- Warnings for time conflicts, the same course twice, exam conflicts and two exams in one day (once Suffolk posts the exam schedule), prerequisites you may be missing, day students under 12 credits, and several online courses (some students have limits).
- What the plan does toward your requirements: experiential credits and writing-requirement courses.
- Your plan as a **list**, a **week** grid or a **day-by-day** list, right in the schedule panel. Hover over or focus any section to **preview** where it would land, and any clash, before adding it. The week shows each day's span at the top and writes breaks into the gaps; phones open on the day-by-day list, which is also the easiest view for screen readers. A full-size week opens in its own window.
- A course **detail panel**: description, prerequisites, Areas of Focus, the professor's other courses, and a "Report a problem" link that opens a prefilled issue.

*Taking it with you*
- A **list for Workday**: your section numbers, ready to enter at registration.
- A share link, a calendar file (.ics), and a print view.

*Trust*
- Every page says when the course data was last checked and that Workday is the record.
- If a saved section disappears from Suffolk's listing (cancelled or renumbered), the planner says so.
- Data refreshes twice a day during registration.

**Version 2: graduation check and career-path survey** (before April registration)

- Check your plan against the JD requirements: 84 credits, required first- and second-year courses, Professional Responsibility, the Legal Writing Requirement, six upper-level experiential credits, and the rules about what can count twice.
- Track the LIT concentration and other concentrations.
- A career-path survey that teaches what different kinds of legal work involve, ranks every practice area for you, and links each one to Suffolk courses, clinics, faculty and next steps.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan.

## This is unofficial

The planner is a student tool built by LITSA's Build committee. Workday and the Registrar are the official record of what's offered, what you've taken and what you need. If the planner and Workday disagree, Workday is right, and please [open an issue](https://github.com/suffolklitsa/course-planner/issues/new/choose) so we can fix it.

## Privacy

Everything runs in your browser. Plans, the shortlist, your year and division, and the courses you mark taken stay in this browser; the planner never uploads them, and LITSA never sees them. A share link carries only section numbers. The site counts page visits and a short list of actions with cookieless analytics; the next section lists them. Any future feature that would store student information has to be reviewed with the Dean of Students first ([docs/DECISIONS.md](docs/DECISIONS.md)).

## What the planner counts

The planner counts how it gets used, so the Build committee can see which features help and what breaks. Each count goes to the LITSA site's own cookieless analytics as a visit to a made-up page, such as `/planner/ev/add/2155`. Nothing is counted in a browser that opted out at suffolklitsa.org/me/, in automated test browsers, or on a copy running on your own computer.

It counts:

- visits to the planner page;
- adding a section, with the course number only (for example 2155, never the section);
- switching to Plan B, and switching between the List, Week and Day-by-day views;
- making a share link, and opening one;
- printing, and clicking "Report a problem";
- which filter was used, by its name only (for example "credits" or "no classes on"), never the value chosen, and which sort order was picked;
- that a search happened, once per visit;
- marking a course taken or not interested, and starring a section;
- which kinds of warning appeared (time conflict, same course twice, prerequisites, credit minimum, online courses, exams), once per kind per visit;
- errors by kind (a script error, a failed promise, or the course list not loading), once per kind per visit, with no error message.

It never sends:

- what you type into search;
- your plans, your shortlist, or the section numbers in them;
- your year or division;
- share links, or anything after the `#` in the address;
- your name, your email, or any ID that could tell one student from another.

One limit: the credit-minimum warning appears only for day students, so counting it shows that some visitor chose the day division, though not who.

The rules live in `web/track.js`. A count that isn't on its list is dropped before anything is sent.

## How it works

```
Suffolk's public course pages
        │  re-checked weekly by the Suffolk assistant (suffolklitsa/suffolk-chatbot)
        ▼
scripts/import_offerings.py ──► data/courses.json   (committed; the contract is docs/DATA.md)
        │
scripts/build_site.py ──► dist/  (web/ + courses.json)
        │
        ▼
suffolklitsa.org/planner  (the club site copies dist/ on its scheduled builds)
```

- `web/planner.js` holds all scheduling logic as plain functions with no page code, so it can be tested on its own.
- `web/app.js` draws the page and wires up the controls.
- No framework and no build tools: plain HTML, CSS and JavaScript modules.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it yourself

The fastest way is a Codespace: click **Code → Codespaces → Create codespace on staging**. Then, in the terminal:

```
python3 scripts/build_site.py
python3 -m http.server 8000 -d dist
```

Open the forwarded port 8000. On your own computer you need Python 3.10+ and Node 18+, and the same two commands.

Run the checks before opening a pull request:

```
python3 -m unittest discover -s tests     # data importer
node --test web/*.test.js                          # scheduling logic
python3 scripts/validate_data.py          # courses.json matches the contract
```

## Project layout

| Path | What's there |
|---|---|
| `web/` | The page. `app.js` draws it; logic lives in modules, each with tests: `planner.js` (search, sort, filters, conflicts), `state.js` (what's saved in the browser), `rules.js` (credit and requirement checks), `prereq.js`, `exams.js`, `share.js` (share link, calendar, Workday list), `week.js`, `freshness.js`, `report.js`, `track.js` (usage counts) |
| `data/courses.json` | Every 2026-27 section, normalized. Don't edit by hand; rerun the importer. |
| `data/exams-<term>.json` | Final exam schedules, one per term once Suffolk posts it |
| `scripts/` | `import_offerings.py`, `import_exams.py`, `validate_data.py`, `build_site.py`, `refresh_data.sh` (maintainers) |
| `tests/` | Tests for the importer |
| `docs/` | Architecture, data contract, roadmap, decisions |

## Branches

Pull requests go to `staging`, the default branch. `main` is the released version: maintainers promote `staging` to `main` with a pull request when a batch of changes is ready. Both branches are protected and need a review and passing checks.

## Contributing

Pick an issue labeled [`good first issue`](https://github.com/suffolklitsa/course-planner/labels/good%20first%20issue) or [`no code needed`](https://github.com/suffolklitsa/course-planner/labels/no%20code%20needed). Every issue says what done looks like, where to start, and roughly how big it is. Comment on the issue to claim it so two people don't do the same work. Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first pull request.

Questions go in the Build topic on the LITSA GroupMe, or comment on the issue.

## Who owns what

- **Build committee:** code, data pipeline, site integration. Maintainer: Sam Darkwa (@drkwjr).
- **Research & Writing:** anything stating a rule or requirement. Issues labeled `needs R&W review` don't merge until someone from R&W has checked them against the source.

## License

MIT. See [LICENSE](LICENSE).
