#!/usr/bin/env python3
"""Check data/courses.json against the contract in docs/DATA.md. Runs in CI."""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TERM_CODE = re.compile(r"^\d{4}(FA|SP|SU)$")
DELIVERY = {"In-Person", "Online Synchronous", "Online Asynchronous", "Hybrid"}
DIVISIONS = {"Day", "Evening"}
REQUIREMENTS = {"experiential", "writing", "ma_bar", "first_year", "clinic_or_internship"}
REQUIRED = {"id", "term", "term_code", "course_number", "section", "title", "credits", "delivery", "division",
            "meetings", "start_date", "end_date", "instructors", "prerequisites", "requirements",
            "areas_of_focus", "concentrations", "tags", "description"}


def problems(data: dict) -> list[str]:
    out = []
    if data.get("schema_version") != 1:
        out.append("schema_version must be 1")
    terms = data.get("terms", [])
    term_codes = {t["code"] for t in terms if isinstance(t, dict) and "code" in t}
    for i, source in enumerate(data.get("sources", [])):
        where = f"sources[{i}]"
        if not isinstance(source, dict):
            out.append(f"{where}: must be an object")
            continue
        if not source.get("id"):
            out.append(f"{where}: id is required")
        if not isinstance(source.get("url"), str) or not source["url"].startswith("https://"):
            out.append(f"{where}: url must start with https://")
        if not isinstance(source.get("fetched_at"), str) or not DATE.match(source["fetched_at"]):
            out.append(f"{where}: fetched_at must be YYYY-MM-DD")
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
        if not isinstance(s["term_code"], str) or not TERM_CODE.fullmatch(s["term_code"]):
            out.append(f"{where}: term_code must look like YYYYFA, YYYYSP or YYYYSU")
        if not isinstance(s["term_code"], str) or s["id"] != f"{s['term_code']}-{s['section']}":
            out.append(f"{where}: id must be term_code-section")
        if not isinstance(s["credits"], (int, float)) or s["credits"] <= 0:
            out.append(f"{where}: credits must be a positive number")
        if s["delivery"] not in DELIVERY:
            out.append(f"{where}: delivery must be one of {sorted(DELIVERY)}")
        if s["division"] is not None and s["division"] not in DIVISIONS:
            out.append(f"{where}: division must be Day, Evening or null")
        if not isinstance(s["requirements"], dict) or set(s["requirements"]) != REQUIREMENTS:
            out.append(f"{where}: requirements must have exactly {sorted(REQUIREMENTS)}")
        elif not all(isinstance(value, bool) for value in s["requirements"].values()):
            out.append(f"{where}: requirements values must be boolean")
        if not isinstance(s["areas_of_focus"], list) or any(
            not isinstance(area, dict)
            or not isinstance(area.get("name"), str)
            or area.get("level") not in {"core", "recommended"}
            for area in s["areas_of_focus"]
        ):
            out.append(f"{where}: areas_of_focus entries need name and core/recommended level")
        for m in s["meetings"]:
            if m.get("day") not in DAYS or not HHMM.match(m.get("start", "")) or not HHMM.match(m.get("end", "")):
                out.append(f"{where}: bad meeting {m}")
            elif m["start"] >= m["end"]:
                out.append(f"{where}: meeting ends before it starts {m}")
        for key in ("start_date", "end_date"):
            if s[key] is not None and (
                not isinstance(s[key], str) or not DATE.match(s[key])
            ):
                out.append(f"{where}: {key} must be YYYY-MM-DD or null")
        if (
            isinstance(s["start_date"], str)
            and isinstance(s["end_date"], str)
            and DATE.match(s["start_date"])
            and DATE.match(s["end_date"])
            and date.fromisoformat(s["start_date"]) > date.fromisoformat(s["end_date"])
        ):
            out.append(f"{where}: start_date must be on or before end_date")
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
