// Pure scheduling logic. No DOM access here, so every function is testable with `node --test`.

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

export function describeMeetings(section) {
  if (!section.meetings.length) return "No set meeting time";
  const days = section.meetings.map((m) => m.day).join("/");
  const { start, end } = section.meetings[0];
  const sameTime = section.meetings.every((m) => m.start === start && m.end === end);
  if (sameTime) return `${days} ${formatTime(start)} to ${formatTime(end)}`;
  return section.meetings.map((m) => `${m.day} ${formatTime(m.start)} to ${formatTime(m.end)}`).join(", ");
}

function datesOverlap(a, b) {
  // Missing dates mean "the whole term", so treat them as overlapping.
  if (!a.start_date || !a.end_date || !b.start_date || !b.end_date) return true;
  return a.start_date <= b.end_date && b.start_date <= a.end_date;
}

// Two meetings clash when they share a day and their time ranges intersect.
// A class ending at 1:25 and another starting at 1:25 do not clash.
export function meetingsClash(m1, m2) {
  return m1.day === m2.day && toMinutes(m1.start) < toMinutes(m2.end) && toMinutes(m2.start) < toMinutes(m1.end);
}

export function findConflicts(sections) {
  const conflicts = [];
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i];
      const b = sections[j];
      if (a.term_code !== b.term_code || !datesOverlap(a, b)) continue;
      const days = new Set();
      for (const m1 of a.meetings) for (const m2 of b.meetings) if (meetingsClash(m1, m2)) days.add(m1.day);
      if (days.size) conflicts.push({ a: a.id, b: b.id, days: DAY_ORDER.filter((d) => days.has(d)) });
    }
  }
  return conflicts;
}

export function totalCredits(sections) {
  return sections.reduce((sum, s) => sum + s.credits, 0);
}

// Same course number, different section: usually a mistake worth flagging.
export function duplicateCourses(sections) {
  const byCourse = new Map();
  for (const s of sections) byCourse.set(s.course_number, [...(byCourse.get(s.course_number) || []), s.id]);
  return [...byCourse.values()].filter((ids) => ids.length > 1);
}

export function matchesFilters(section, f) {
  if (f.term && section.term_code !== f.term) return false;
  if (f.division && section.division !== f.division) return false;
  if (f.delivery && section.delivery !== f.delivery) return false;
  for (const req of f.requirements || []) if (!section.requirements[req]) return false;
  if (f.query && !matchesQuery(section, f.query, { descriptions: f.searchDescriptions !== false })) return false;
  if (f.area && !(section.areas_of_focus || []).some((a) => a.name === f.area)) return false;
  if (f.hideFirstYear && section.requirements.first_year) return false;
  if (f.hidden && f.hidden.has(section.course_number)) return false;
  if (!matchesTimeFilters(section, f)) return false;
  if (f.credits && section.credits !== Number(f.credits)) return false;
  return true;
}

// ---- Finding courses: grouping, sorting, filtering, conflicts against a schedule ----

const DAY_INDEX = Object.fromEntries(DAY_ORDER.map((d, i) => [d, i]));

// Sections of one course share a course number. Cards show one course with its sections inside.
export function groupByCourse(sections) {
  const groups = new Map();
  for (const s of sections) {
    const key = `${s.term_code}-${s.course_number}`;
    if (!groups.has(key)) groups.set(key, { key, course_number: s.course_number, title: s.title, sections: [] });
    groups.get(key).sections.push(s);
  }
  for (const g of groups.values()) {
    g.sections.sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
    // Titles can differ slightly between sections ("Negotiation" vs "Negotiation HJD"); use the shortest.
    g.title = g.sections.map((s) => s.title).sort((a, b) => a.length - b.length)[0];
  }
  return [...groups.values()];
}

function firstMeeting(s) {
  if (!s.meetings.length) return [9, 99999];
  return s.meetings.reduce((best, m) => {
    const k = [DAY_INDEX[m.day], toMinutes(m.start)];
    return k[0] < best[0] || (k[0] === best[0] && k[1] < best[1]) ? k : best;
  }, [9, 99999]);
}

export const SORTS = {
  title: { label: "Title", key: (g) => [g.title.toLowerCase()] },
  number: { label: "Course number", key: (g) => [Number(g.course_number) || 0] },
  time: { label: "Day and time", key: (g) => g.sections.map(firstMeeting).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0] },
  credits: { label: "Credits (high to low)", key: (g) => [-Math.max(...g.sections.map((s) => s.credits)), g.title.toLowerCase()] },
  professor: { label: "Professor", key: (g) => [(g.sections[0].instructors[0] || "~").split(" ").pop().toLowerCase(), g.title.toLowerCase()] },
};

function cmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function sortGroups(groups, sortName = "title") {
  const sort = SORTS[sortName] || SORTS.title;
  return [...groups].sort((a, b) => cmp(sort.key(a), sort.key(b)) || a.title.localeCompare(b.title));
}

// Time-of-day windows a student can rule in or out. Asynchronous sections pass every time filter.
export const TIME_WINDOWS = {
  morning: { label: "Morning (before noon)", test: (m) => toMinutes(m.start) < 12 * 60 },
  afternoon: { label: "Afternoon (noon to 5pm)", test: (m) => toMinutes(m.start) >= 12 * 60 && toMinutes(m.start) < 17 * 60 },
  evening: { label: "Evening (5pm and later)", test: (m) => toMinutes(m.start) >= 17 * 60 },
};

export function matchesTimeFilters(section, { avoidDays = [], times = [] } = {}) {
  if (section.meetings.some((m) => avoidDays.includes(m.day))) return false;
  if (times.length && section.meetings.length && !section.meetings.every((m) => times.some((t) => TIME_WINDOWS[t].test(m)))) return false;
  return true;
}

// Every chosen section a candidate would clash with, and the days it clashes on.
export function conflictsWith(candidate, chosen) {
  const out = [];
  for (const c of chosen) {
    if (c.id === candidate.id || c.term_code !== candidate.term_code || !datesOverlap(c, candidate)) continue;
    const days = new Set();
    for (const m1 of candidate.meetings) for (const m2 of c.meetings) if (meetingsClash(m1, m2)) days.add(m1.day);
    if (days.size) out.push({ id: c.id, days: DAY_ORDER.filter((d) => days.has(d)) });
  }
  return out;
}

// Search across title, number, professor and (optionally) the course description.
export function matchesQuery(section, query, { descriptions = true } = {}) {
  const words = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const fields = [section.title, section.section, section.course_number, ...section.instructors];
  if (descriptions) fields.push(section.description || "");
  const hay = fields.join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// Where the query matched, for showing "matched in description".
export function queryMatchedOnlyInDescription(section, query) {
  return Boolean(query && query.trim()) && !matchesQuery(section, query, { descriptions: false }) && matchesQuery(section, query);
}
