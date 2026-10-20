#!/usr/bin/env python3
"""Assemble the planner into dist/ (web files + data/courses.json).

dist/ is what the club site copies to suffolklitsa.org/planner. For local use:
    python3 scripts/build_site.py && python3 -m http.server 8000 -d dist
"""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    dist = ROOT / "dist"
    if dist.exists():
        shutil.rmtree(dist)
    shutil.copytree(ROOT / "web", dist, ignore=shutil.ignore_patterns("*.test.js"))
    shutil.copy2(ROOT / "data" / "courses.json", dist / "courses.json")
    print(f"built {dist}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
