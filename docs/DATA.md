# Data contract: `data/courses.json`

`schema_version` is `1`. `scripts/validate_data.py` enforces this contract in CI. Changing a field means updating this page, the validator, the importer and its tests in the same pull request.

## Top level

| Field | Type | Notes |
|---|---|---|
| `schema_version` | number | `1` |
| `generated_at` | `YYYY-MM-DD` | When the importer ran |
| `sources` | list | `{id, url, verified_at}` for each Suffolk page used |
| `terms` | list | `{code, name}`, for example `{"code": "2027SP", "name": "Spring 2027"}` |
| `sections` | list | One entry per section, below |

## Section

| Field | Type | Example | Notes |
|---|---|---|---|
| `id` | string | `2027SP-2155-1` | Term code plus section. Unique. |
| `term` | string | `Spring 2027` | |
| `term_code` | string | `2027SP` | `FA`, `SP` or `SU` after the year |
| `course_number` | string | `2155` | Shared by every section of a course |
| `section` | string | `2155-1` | As Suffolk lists it |
| `title` | string | `Entertainment Law` | |
| `credits` | number | `2`, `1.5` | |
| `delivery` | string | `In-Person` | Also `Online Synchronous`, `Online Asynchronous`, `Hybrid` |
| `division` | string or null | `Day` | From the block schedules. Null when the section isn't on one. |
| `meetings` | list | `[{"day": "Tue", "start": "10:00", "end": "11:25"}]` | 24-hour times. Empty for asynchronous sections. |
| `start_date`, `end_date` | `YYYY-MM-DD` or null | `2027-01-19` | |
| `instructors` | list of strings | `["Stacey Lantagne"]` | |
| `prerequisites` | string | `""` | Suffolk's text as written. Not yet parsed. |
| `requirements` | object | `{"experiential": true, ...}` | Keys: `experiential`, `writing`, `ma_bar`, `first_year`, `clinic_or_internship` |
| `areas_of_focus` | list | `[{"name": "Civil Litigation", "level": "core"}]` | Suffolk's own Areas of Focus tags; `level` is `core` or `recommended` |
| `concentrations` | list of strings | `["Trial and Appellate Advocacy"]` | |
| `tags` | list of strings | | Any other Suffolk tags, unchanged |
| `description` | string | | Suffolk's course description |

## Known gaps

- Prerequisites are free text in mixed formats ("LAW 156 LAW 158 or LAW 552", class-year rules). Parsing them is an open issue.
- The spring 2027 exam schedule isn't published yet, so there's no exam data.
- Rooms aren't listed.
