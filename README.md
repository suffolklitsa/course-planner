# course-planner

Plan your Suffolk Law semesters. The planner runs on the LITSA site at **suffolklitsa.org/planner**; this repo holds its code, its course data and the scripts that keep that data current.

**Status:** version 1 in progress, aimed at spring 2027 registration in November.

## What it does

**Version 1: spring schedule builder**

- Search every spring 2027 section by course, section number or professor.
- Filter by day or evening division, format (in person, online, hybrid), and what a course counts toward: experiential credit, the Legal Writing Requirement, or Massachusetts bar courses.
- Add sections to a schedule and see your credit total, time conflicts, and when you've picked two sections of the same course.
- Your schedule is saved in your own browser. Nothing is sent anywhere.

**Version 2: graduation check and career-path survey** (before April registration)

- Check your plan against the JD requirements: 84 credits, required first- and second-year courses, Professional Responsibility, the Legal Writing Requirement, six upper-level experiential credits, and the rules about what can count twice.
- Track the LIT concentration and other concentrations.
- A career-path survey that teaches what different kinds of legal work involve, ranks every practice area for you, and links each one to Suffolk courses, clinics, faculty and next steps.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan.

## This is unofficial

The planner is a student tool built by LITSA's Build committee. Workday and the Registrar are the official record of what's offered, what you've taken and what you need. If the planner and Workday disagree, Workday is right, and please [open an issue](https://github.com/suffolklitsa/course-planner/issues/new/choose) so we can fix it.

## Privacy

Everything runs in your browser. The planner never uploads what you enter, and LITSA never sees your schedule or your record. The site counts page visits with cookieless analytics and nothing else. Any future feature that would store student information has to be reviewed with the Dean of Students first ([docs/DECISIONS.md](docs/DECISIONS.md)).

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

The fastest way is a Codespace: click **Code → Codespaces → Create codespace on main**. Then, in the terminal:

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
| `web/` | The page: `index.html`, `app.js` (interface), `planner.js` (logic), `planner.test.js`, `styles.css`, `tokens.css` |
| `data/courses.json` | Every 2026-27 section, normalized. Don't edit by hand; rerun the importer. |
| `scripts/` | `import_offerings.py`, `validate_data.py`, `build_site.py` |
| `tests/` | Tests for the importer |
| `docs/` | Architecture, data contract, roadmap, decisions |

## Contributing

Pick an issue labeled [`good first issue`](https://github.com/suffolklitsa/course-planner/labels/good%20first%20issue) or [`no code needed`](https://github.com/suffolklitsa/course-planner/labels/no%20code%20needed). Every issue says what done looks like, where to start, and roughly how big it is. Comment on the issue to claim it so two people don't do the same work. Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first pull request.

Questions go in the Build topic on the LITSA GroupMe, or comment on the issue.

## Who owns what

- **Build committee:** code, data pipeline, site integration. Maintainer: Sam Darkwa (@drkwjr).
- **Research & Writing:** anything stating a rule or requirement. Issues labeled `needs R&W review` don't merge until someone from R&W has checked them against the source.

## License

MIT. See [LICENSE](LICENSE).
