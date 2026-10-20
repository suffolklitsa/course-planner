#!/usr/bin/env python3
"""Check data/courses.json against the contract in docs/DATA.md. Runs in CI."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REQUIRED = {"id", "term", "term_code", "course_number", "section", "title", "credits", "delivery", "division",
            "meetings", "start_date", "end_date", "instructors", "prerequisites", "requirements",
            "areas_of_focus", "concentrations", "tags", "description"}


def problems(data: dict) -> list[str]:
    out = []
    if data.get("schema_version") != 1:
        out.append("schema_version must be 1")
    term_codes = {t["code"] for t in data.get("terms", [])}
    seen = set()
    for i, s in enumerate(data.get("sections", [])):
        where = f"sections[{i}] ({s.get('id', '?')})"
        missing = REQUIRED - s.keys()
        if missing:
            out.append(f"{where}: missing {sorted(missing)}")
            continue
        if s["id"] in seen:
            out.append(f"{where}: duplicate id")
        seen.add(s["id"])
        if s["term_code"] not in term_codes:
            out.append(f"{where}: term_code not listed in terms")
        if not isinstance(s["credits"], (int, float)) or s["credits"] <= 0:
            out.append(f"{where}: credits must be a positive number")
        for m in s["meetings"]:
            if m.get("day") not in DAYS or not HHMM.match(m.get("start", "")) or not HHMM.match(m.get("end", "")):
                out.append(f"{where}: bad meeting {m}")
            elif m["start"] >= m["end"]:
                out.append(f"{where}: meeting ends before it starts {m}")
        for key in ("start_date", "end_date"):
            if s[key] is not None and not DATE.match(s[key]):
                out.append(f"{where}: {key} must be YYYY-MM-DD or null")
    return out


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "data" / "courses.json")
    errors = problems(json.loads(path.read_text(encoding="utf-8")))
    for e in errors:
        print(e)
    print(f"{path}: {'ok' if not errors else f'{len(errors)} problems'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
