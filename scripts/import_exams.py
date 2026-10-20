#!/usr/bin/env python3
"""Build data/exams-<TERM>.json from Suffolk's final exam schedule text.

Usage:
    python3 scripts/import_exams.py --source PATH --term 2026FA

The source is the assistant's .txt snapshot of the exam schedule PDF. The PDF is
a grid (days across, exam times down), and the text keeps only part of that grid:

- Each week starts with a header row ("TIME MONDAY 30-NOVTUESDAY 1-DEC...").
- Each time row starts with its label ("9:30 AM to 12:30 PM").
- Cells come out one day column at a time. A line that wraps ends with a space.
  A cell is a title, then usually the instructor's surname on its own line.
- When the text jumps from the bottom of one column to the top of the next, no
  line break is written, so the two run together ("CurtinFundamentals of Law").
  That join is the only sign of a new column.
- Empty columns leave no trace, and x positions are lost.

So the importer knows the week and time of every cell, and the order of the
column groups in a row, but it only knows the day when exactly one placement of
those groups fits: when a row fills every day column, or when a "Make up exams"
note rules the other days out (make-ups come after the exams they cover).
Everything else goes in "unparsed" with the week and time it came from.

Mode comes from the marker at the end of a title: WEB or HJD means remote, no
marker means in-person. The PDF also marks remote exams by color, which the text
loses. HYB (hybrid) and APO (online program) sections don't say how the exam is
given, so those go in "unparsed".
"""
from __future__ import annotations

import argparse
import datetime as dt
import itertools
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

SCHEMA_VERSION = 1
WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
MONTHS = {m: i for i, m in enumerate(
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], start=1)}

TERM_RE = re.compile(r"^(?P<year>\d{4})(?P<season>FA|SP|SU)$")
TIME_ROW_RE = re.compile(r"^(?P<start>\d{1,2}:\d\d [AP]M) to (?P<end>\d{1,2}:\d\d [AP]M)(?P<rest>.*)$")
DAY_WORD = r"(?:MON|TUES|WEDNES|THURS|FRI|SATUR|SUN)DAY"
HEADER_LINE_RE = re.compile(rf"^(?:TIME\s+)?(?:\d{{1,2}}-[A-Z]{{3}})?(?:{DAY_WORD})?\s*$")
HEADER_DATE_RE = re.compile(rf"({DAY_WORD})\s*(\d{{1,2}})-([A-Z]{{3}})")
# Whole-day notices printed in the grid instead of exams.
NOTICE_RE = re.compile(r"^((?:FALL|SPRING|SUMMER) CLASSES (?:END|BEGIN)|READING DAY|NO EXAMS?)(?:\s+|$)")
MAKEUP_RE = re.compile(r"^make ?-?up exams?\b", re.I)
SLASH_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})")
# The last line of a make-up note: its dates, then maybe the next column's first line.
NOTE_END_RE = re.compile(r"^(?P<dates>.*?\d{1,2}/\d{1,2},?)(?P<rest>(?:\d[A-Z]\b|[A-Z]).*)?$")
NAME = r"[A-Z][A-Za-z'\-]*[a-z]"
NAME_RE = re.compile(rf"{NAME}(?:/{NAME})*")
NEXT_CELL_RE = re.compile(r"(?:[A-Z]|\d[A-Z]\b)")
REMOTE_MARKERS = {"WEB", "HJD"}
UNCLEAR_MARKERS = {"HYB", "APO"}
PREAMBLE_KEYS = ("Title:", "Canonical URL:", "Fetched URL:", "Verified at:", "SHA-256:")


@dataclass
class Item:
    kind: str  # "exam", "note" or "notice"
    text: str
    instructor: str = ""
    dates: list[str] = field(default_factory=list)  # make-up dates, as YYYY-MM-DD


@dataclass
class RowPart:
    dates: list[dt.date]
    start: str  # "9:30 AM"
    end: str
    lines: list[str]
    continued: bool = False  # row carried over after a page break


def to_24h(clock: str) -> str:
    """'4:30 PM' -> '16:30'."""
    return dt.datetime.strptime(clock.strip(), "%I:%M %p").strftime("%H:%M")


def term_year(term: str) -> int:
    m = TERM_RE.match(term)
    if not m:
        raise ValueError(f"term must look like 2026FA, got {term!r}")
    return int(m["year"])


def read_header(text: str) -> dict[str, str]:
    header = {}
    for line in text.splitlines()[:8]:
        if ": " in line:
            key, value = line.split(": ", 1)
            header[key.strip()] = value.strip()
    return header


def parse_header_dates(header_text: str, year: int) -> list[dt.date]:
    """'TIME MONDAY  30-NOVTUESDAY  1-DEC...' -> the dates, checked against their weekday names."""
    dates = []
    for day, num, mon in HEADER_DATE_RE.findall(header_text):
        if mon not in MONTHS:
            raise ValueError(f"unknown month {mon!r} in header {header_text!r}")
        d = dt.date(year, MONTHS[mon], int(num))
        if WEEKDAYS[d.weekday()] != day:
            raise ValueError(f"{num}-{mon}-{year} is not a {day} (header {header_text!r})")
        dates.append(d)
    if not dates:
        raise ValueError(f"no dates in header {header_text!r}")
    return dates


def slash_dates(text: str, year: int) -> list[str]:
    out = []
    for month, day in SLASH_DATE_RE.findall(text):
        try:
            out.append(dt.date(year, int(month), int(day)).isoformat())
        except ValueError:
            pass
    return out


def split_rows(text: str, year: int) -> tuple[list[RowPart], list[str]]:
    """Cut the text into week blocks and time rows. Returns the row parts and any stray lines."""
    lines = text.splitlines()
    parts: list[RowPart] = []
    stray: list[str] = []
    dates: list[dt.date] | None = None
    current: RowPart | None = None
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("TIME") and HEADER_LINE_RE.match(line):
            header = []
            while i < len(lines) and lines[i].strip() and HEADER_LINE_RE.match(lines[i]):
                header.append(lines[i])
                i += 1
            new_dates = parse_header_dates("".join(header), year)
            # A repeated header with the same dates is a page break inside a row.
            # The row carries on: rows run top to bottom, so it can only be the last one started.
            if current and new_dates == dates:
                current = RowPart(dates, current.start, current.end, [], continued=True)
                parts.append(current)
            else:
                current = None
            dates = new_dates
            continue
        m = TIME_ROW_RE.match(line)
        if m and dates:
            current = RowPart(dates, m["start"], m["end"], [m["rest"]] if m["rest"].strip() else [])
            parts.append(current)
        elif current:
            current.lines.append(line)
        elif dates is None and (line.startswith(PREAMBLE_KEYS) or line.endswith("Exam Schedule")
                                or line.replace(" ", "") == "In-PersonExamRemoteExam."):
            pass  # title, metadata and the color legend
        else:
            stray.append(line.strip())
        i += 1
    return parts, stray


def glue_splits(line: str) -> list[int]:
    """Where a surname could end and the next column's first line begin ('KarolAdvanced Survey')."""
    return [i for i in range(2, len(line))
            if NAME_RE.fullmatch(line[:i]) and NEXT_CELL_RE.match(line, i)]


def parse_groups(part: RowPart, year: int) -> tuple[list[list[Item]], list[str]]:
    """Turn a row's lines into column groups of items. Problems make the whole row unplaceable."""
    groups: list[list[Item]] = [[]]
    problems: list[str] = []
    queue = list(part.lines)

    def new_group():
        if groups[-1]:
            groups.append([])

    # Single-line notices at the top of a row sit side by side, joined by spaces.
    if queue:
        first = queue.pop(0)
        while (m := NOTICE_RE.match(first)):
            new_group()
            groups[-1].append(Item("notice", m[1]))
            first = first[m.end():]
            new_group()
        if first.strip():
            queue.insert(0, first)

    while queue:
        line = queue.pop(0)
        if MAKEUP_RE.match(line):
            note = [line]
            while note[-1].endswith(" ") and queue:
                note.append(queue.pop(0))
            m = NOTE_END_RE.match(note[-1])
            rest = None
            if m and m["rest"]:
                note[-1], rest = m["dates"], m["rest"]
            text = " ".join(n.strip() for n in note)
            groups[-1].append(Item("note", text, dates=slash_dates(text, year)))
            if rest:
                new_group()
                queue.insert(0, rest)
            continue

        title = [line]
        while title[-1].endswith(" ") and queue:
            title.append(queue.pop(0))
        item = Item("exam", " ".join(t.strip() for t in title))
        groups[-1].append(item)
        if not queue:
            break
        nxt = queue[0]
        if NAME_RE.fullmatch(nxt):
            item.instructor = queue.pop(0)
            continue
        splits = glue_splits(nxt)
        if len(splits) == 1:
            queue.pop(0)
            item.instructor = nxt[:splits[0]]
            new_group()
            queue.insert(0, nxt[splits[0]:])
        elif len(splits) > 1:
            problems.append(f"can't tell where the surname ends in {nxt!r}")
            item.instructor = queue.pop(0)
        # No split: the next line is another cell in the same column, with no instructor here.

    groups = [g for g in groups if g]
    for g in groups:
        for it in g:
            # A lone capitalized word with no instructor is probably a surname that lost its title.
            if it.kind == "exam" and not it.instructor and NAME_RE.fullmatch(it.text):
                problems.append(f"cell {it.text!r} has no instructor")
    if part.continued and part.lines and NAME_RE.fullmatch(part.lines[0]):
        problems.append(f"page break may split a cell before {part.lines[0]!r}")
    return groups, problems


def place_groups(groups: list[list[Item]], dates: list[dt.date]) -> list[dt.date | None]:
    """The date of each column group, or None when more than one placement fits."""
    fits = []
    for cols in itertools.combinations(range(len(dates)), len(groups)):
        ok = True
        for col, group in zip(cols, groups):
            for it in group:
                # A make-up session comes after every exam it makes up.
                if it.kind == "note" and it.dates and dates[col].isoformat() <= max(it.dates):
                    ok = False
        if ok:
            fits.append(cols)
    placed = []
    for k in range(len(groups)):
        options = {cols[k] for cols in fits}
        placed.append(dates[options.pop()] if len(options) == 1 else None)
    return placed


def describe(it: Item) -> str:
    return f"{it.text} / {it.instructor}" if it.instructor else it.text


def build(text: str, term: str) -> dict:
    year = term_year(term)
    header = read_header(text)
    parts, stray = split_rows(text, year)
    exams: list[dict] = []
    unparsed: list[str] = [f"{s} (outside any time row)" for s in stray]
    for part in parts:
        groups, problems = parse_groups(part, year)
        slot = f"{part.start} to {part.end}"
        week = f"week of {part.dates[0].isoformat()}"
        cont = ", continued after a page break" if part.continued else ""
        placed = [None] * len(groups) if problems else place_groups(groups, part.dates)
        why = "; ".join(problems) if problems else (
            f"day not recoverable ({len(groups)} column group{'s' if len(groups) != 1 else ''}"
            f" for {len(part.dates)} days)")
        for group, date in zip(groups, placed):
            for it in group:
                where = f"{slot}, {date.isoformat() if date else week}{cont}"
                if it.kind != "exam":
                    unparsed.append(f"{describe(it)} ({where}; not an exam)")
                    continue
                if date is None:
                    unparsed.append(f"{describe(it)} ({where}; {why})")
                    continue
                marker = it.text.split()[-1]
                if marker in UNCLEAR_MARKERS:
                    unparsed.append(f"{describe(it)} ({where}; {marker} doesn't say if the exam is remote)")
                    continue
                exams.append({
                    "title": it.text,
                    "instructor": it.instructor,
                    "date": date.isoformat(),
                    "start": to_24h(part.start),
                    "end": to_24h(part.end),
                    "mode": "remote" if marker in REMOTE_MARKERS else "in-person",
                })
    exams.sort(key=lambda e: (e["date"], e["start"], e["title"].lower(), e["instructor"]))
    return {
        "schema_version": SCHEMA_VERSION,
        "term_code": term,
        "source": {"url": header.get("Canonical URL", ""), "verified_at": header.get("Verified at", "")},
        "exams": exams,
        "unparsed": unparsed,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", required=True, type=Path, help="the exam schedule .txt snapshot")
    ap.add_argument("--term", required=True, help="term code, for example 2026FA")
    ap.add_argument("--out", type=Path, help="default: data/exams-<TERM>.json")
    args = ap.parse_args(argv)
    data = build(args.source.read_text(encoding="utf-8"), args.term)
    out = args.out or Path(__file__).resolve().parent.parent / "data" / f"exams-{args.term}.json"
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out}: {len(data['exams'])} exams, {len(data['unparsed'])} unparsed", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
