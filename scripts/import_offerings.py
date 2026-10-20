#!/usr/bin/env python3
"""Build data/courses.json from the Suffolk assistant's verified source files.

The assistant (suffolklitsa/suffolk-chatbot) re-fetches Suffolk's public course
pages every week. This script reads its output instead of scraping Suffolk a
second time, so both tools always agree on what is offered.

Usage:
    python3 scripts/import_offerings.py --source /path/to/suffolk-chatbot/data/current_sources

Only maintainers with access to the assistant's repo run this. Everyone else
works from the committed data/courses.json.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

SCHEMA_VERSION = 1
OFFERINGS = "law-course-offerings-2026-27"
BLOCK_SCHEDULES = [
    "law-fall-day-block-schedule-2026",
    "law-fall-evening-block-schedule-2026",
    "law-spring-day-block-schedule-2027",
    "law-spring-evening-block-schedule-2027",
]
DAY_CODES = {"M": "Mon", "T": "Tue", "W": "Wed", "TH": "Thu", "F": "Fri", "SA": "Sat", "SU": "Sun"}
MEETING_RE = re.compile(r"(?P<days>[A-Z_]+) \| (?P<start>\d{1,2}:\d\d [AP]M) - (?P<end>\d{1,2}:\d\d [AP]M)")
TERM_RE = re.compile(r"^(?P<season>Fall|Spring|Summer)(?: Law)? (?P<year>\d{4})$")
AREA_RE = re.compile(r"^Law Areas of Focus - Area of Focus (?P<level>Core|Recommended) (?P<name>.+)$")
REQUIREMENT_TAGS = {
    "Law - Experiential Learning": "experiential",
    "Law - Legal Writing Requirement": "writing",
    "Law - Massachusetts Bar Courses": "ma_bar",
    "Law - First Year": "first_year",
    "Law - Clinicals/Internships": "clinic_or_internship",
}


def to_24h(clock: str) -> str:
    """'4:05 PM' -> '16:05'."""
    t = dt.datetime.strptime(clock.strip(), "%I:%M %p")
    return t.strftime("%H:%M")


def parse_meeting(raw: str) -> list[dict[str, str]]:
    """'T_TH | 12:00 PM - 1:25 PM' -> one entry per day. Empty for asynchronous courses.

    Some sections meet at different times on different days; Suffolk lists those as
    several patterns in one string ('F | 10:30 AM - 11:25 AM M_W | 10:30 AM - 11:55 AM').
    """
    raw = (raw or "").strip()
    if not raw:
        return []
    matches = list(MEETING_RE.finditer(raw))
    leftover = MEETING_RE.sub("", raw).strip()
    if not matches or leftover:
        raise ValueError(f"unrecognized meeting format: {raw!r}")
    days = []
    for m in matches:
        start, end = to_24h(m["start"]), to_24h(m["end"])
        for code in m["days"].split("_"):
            if code not in DAY_CODES:
                raise ValueError(f"unknown day code {code!r} in {raw!r}")
            days.append({"day": DAY_CODES[code], "start": start, "end": end})
    order = list(DAY_CODES.values())
    return sorted(days, key=lambda d: (order.index(d["day"]), d["start"]))


def term_code(term: str) -> tuple[str, str]:
    """'Spring Law 2027' -> ('Spring 2027', '2027SP')."""
    m = TERM_RE.match(term.strip())
    if not m:
        raise ValueError(f"unrecognized term: {term!r}")
    suffix = {"Fall": "FA", "Spring": "SP", "Summer": "SU"}[m["season"]]
    return f"{m['season']} {m['year']}", f"{m['year']}{suffix}"


def iso_date(value: str | None) -> str | None:
    """'2027-01-19-08:00' -> '2027-01-19'."""
    if not value:
        return None
    return value[:10]


def classify_tags(tags: list[str]) -> tuple[dict[str, bool], list[dict[str, str]], list[str], list[str]]:
    requirements = {key: False for key in REQUIREMENT_TAGS.values()}
    areas, concentrations, other = [], [], []
    for tag in tags or []:
        tag = tag.strip()
        if tag in REQUIREMENT_TAGS:
            requirements[REQUIREMENT_TAGS[tag]] = True
        elif (m := AREA_RE.match(tag)):
            areas.append({"name": m["name"].strip(), "level": m["level"].lower()})
        elif tag.endswith("Concentration"):
            concentrations.append(tag.removeprefix("Law - ").removesuffix(" Concentration").strip())
        else:
            other.append(tag)
    return requirements, areas, concentrations, other


def read_header(txt: Path) -> dict[str, str]:
    """The assistant's .txt snapshots start with 'Key: value' lines (Title, Canonical URL, Verified at)."""
    header = {}
    if not txt.exists():
        return header
    for line in txt.read_text(encoding="utf-8").splitlines()[:8]:
        if ": " in line:
            key, value = line.split(": ", 1)
            header[key.strip()] = value.strip()
    return header


def load_divisions(source: Path) -> dict[tuple[str, str], str]:
    divisions = {}
    for name in BLOCK_SCHEDULES:
        path = source / f"{name}.json"
        if not path.exists():
            continue
        for row in json.loads(path.read_text(encoding="utf-8")):
            _, code = term_code(row["term"])
            divisions.setdefault((code, row["section"]), row["division"])
    return divisions


def build(source: Path) -> dict:
    offerings = json.loads((source / f"{OFFERINGS}.json").read_text(encoding="utf-8"))
    divisions = load_divisions(source)
    sections, terms = [], {}
    for row in offerings:
        term, code = term_code(row["term"])
        terms[code] = term
        requirements, areas, concentrations, other = classify_tags(row.get("tags") or [])
        sections.append({
            "id": f"{code}-{row['section']}",
            "term": term,
            "term_code": code,
            "course_number": row["section"].split("-")[0],
            "section": row["section"],
            "title": row["title"].strip(),
            "credits": float(row["credits"]),
            "delivery": row["delivery_mode"],
            "division": divisions.get((code, row["section"])),
            "meetings": parse_meeting(row.get("meeting", "")),
            "start_date": iso_date(row.get("start_date")),
            "end_date": iso_date(row.get("end_date")),
            # Some sections list several professors in one field, joined by " | ".
            "instructors": [n.strip() for i in row.get("instructors") or [] for n in i.split("|") if n.strip()],
            "prerequisites": (row.get("prerequisites") or "").strip(),
            "requirements": requirements,
            "areas_of_focus": areas,
            "concentrations": concentrations,
            "tags": other,
            "description": (row.get("description") or "").strip(),
        })
    sections.sort(key=lambda s: (s["term_code"], s["title"].lower(), s["section"]))
    # "Verified at" is when a person last reviewed the page. "fetched_at" is when this copy was
    # downloaded: from the sync's manifest when there is one, else the file's modification date.
    fetched = {}
    manifest = source / "manifest.json"
    if manifest.exists():
        m = json.loads(manifest.read_text(encoding="utf-8"))
        for src in m.get("sources", []):
            fetched[src.get("id")] = (src.get("fetched_at") or m.get("generated_at") or "")[:10]
    sources = []
    for name in [OFFERINGS, *BLOCK_SCHEDULES]:
        txt = source / f"{name}.txt"
        h = read_header(txt)
        if h:
            when = fetched.get(name) or dt.date.fromtimestamp(txt.stat().st_mtime).isoformat()
            sources.append({"id": name, "url": h.get("Canonical URL", ""), "verified_at": h.get("Verified at", ""), "fetched_at": when})
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": dt.date.today().isoformat(),
        "sources": sources,
        "terms": [{"code": c, "name": terms[c]} for c in sorted(terms)],
        "sections": sections,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", required=True, type=Path, help="the assistant's data/current_sources directory")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "courses.json")
    args = ap.parse_args(argv)
    data = build(args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(data['sections'])} sections across {len(data['terms'])} terms to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
