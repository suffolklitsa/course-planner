#!/usr/bin/env bash
# Refresh data/courses.json from Suffolk's course pages and publish it. Maintainers run this from cron
# on the server that has the Suffolk assistant checked out (it reuses the assistant's page fetcher).
#
#   PLANNER_DIR=/srv/dev/course-planner-data ASSISTANT_DIR=/srv/dev/suffolk-chatbot scripts/refresh_data.sh
#
# 1. Fetch the five course pages into .cache/sources (the assistant's own data is left alone).
# 2. Rebuild and validate data/courses.json. A validation failure stops here and publishes nothing.
# 3. If the data changed: commit to main, tag a patch release so the live site picks it up at its
#    next refresh, then merge main into staging.
set -uo pipefail

REPO="${PLANNER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ASSIST="${ASSISTANT_DIR:-/srv/dev/suffolk-chatbot}"
OUT="$REPO/.cache/sources"
LOG="$REPO/.cache/refresh.log"
mkdir -p "$OUT"
say() { echo "[$(date -u '+%Y-%m-%d %H:%M UTC')] $*" | tee -a "$LOG"; }
cd "$REPO" || exit 1

git checkout -q main && git pull -q --ff-only || { say "git pull failed"; exit 1; }

if ! "$ASSIST/.venv/bin/python" "$ASSIST/scripts/sync_current_sources.py" --output-dir "$OUT" \
     --source-id law-course-offerings-2026-27 \
     --source-id law-fall-day-block-schedule-2026 --source-id law-fall-evening-block-schedule-2026 \
     --source-id law-spring-day-block-schedule-2027 --source-id law-spring-evening-block-schedule-2027 >>"$LOG" 2>&1; then
  say "fetch failed; keeping the last good data"; exit 1
fi

python3 scripts/import_offerings.py --source "$OUT" >>"$LOG" 2>&1 || { say "import failed"; git checkout -q -- data; exit 1; }
if ! python3 scripts/validate_data.py >>"$LOG" 2>&1; then
  say "validation failed; not publishing"; git checkout -q -- data; exit 1
fi

# generated_at changes every run; only publish when the sections themselves changed.
if git diff --quiet -I '"generated_at"' -I '"fetched_at"' -- data/courses.json; then
  git checkout -q -- data; say "no section changes"; exit 0
fi

fetched=$(python3 -c "import json;d=json.load(open('data/courses.json'));print(max(s.get('fetched_at','') for s in d['sources']))")
git add data/courses.json && git commit -q -m "data: refresh courses (fetched $fetched)" && git push -q origin main || { say "push to main failed"; exit 1; }
say "published data fetched $fetched"

latest=$(git tag --list 'v*.*.*' --sort=-v:refname | head -1)
if [ -n "$latest" ]; then
  next=$(echo "$latest" | awk -F. '{printf "%s.%s.%d", $1, $2, $3+1}')
  git tag -a "$next" -m "Data refresh (fetched $fetched)" && git push -q origin "$next" && say "tagged $next"
fi

git fetch -q origin staging && git checkout -q staging && git reset -q --hard origin/staging \
  && git merge -q --no-edit origin/main && git push -q origin staging && say "merged main into staging" \
  || { git merge --abort 2>/dev/null; say "staging merge needs a person"; }
git checkout -q main
