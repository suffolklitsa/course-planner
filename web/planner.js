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
  if (f.query) {
    const haystack = [section.title, section.section, section.course_number, ...section.instructors].join(" ").toLowerCase();
    for (const word of f.query.toLowerCase().split(/\s+/).filter(Boolean)) if (!haystack.includes(word)) return false;
  }
  return true;
}
