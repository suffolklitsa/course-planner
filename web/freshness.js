// How current the course data is, said plainly. Pure functions.

const DAY_MS = 86400000;

export function offeringsSource(data) {
  return (data.sources || []).find((s) => s.id && s.id.startsWith("law-course-offerings")) || null;
}

// When the course offerings were last downloaded from Suffolk's page. Falls back to the review date,
// then to the newest date of any source.
export function checkedOn(data) {
  const off = offeringsSource(data);
  if (off && (off.fetched_at || off.verified_at)) return off.fetched_at || off.verified_at;
  return (data.sources || []).map((s) => s.fetched_at || s.verified_at).filter(Boolean).sort().at(-1) || null;
}

export function ageInDays(isoDate, today = new Date()) {
  if (!isoDate) return null;
  const then = new Date(`${isoDate}T12:00:00`);
  return Math.max(0, Math.floor((today - then) / DAY_MS));
}

export function freshnessNote(data, today = new Date()) {
  const date = checkedOn(data);
  const days = ageInDays(date, today);
  const when = date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "an unknown date";
  const stale = days !== null && days > 10;
  return {
    date, days, stale,
    text: `Course data checked ${when}${days !== null ? ` (${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`})` : ""}. Sections change during registration; confirm in Workday.`,
  };
}
