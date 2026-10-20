// Share links, calendar export and the Workday list. Pure functions except copyText at the bottom.

import { formatTime } from "./planner.js";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ICS_DAY = { Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA", Sun: "SU" };
const TERM_RE = /^\d{4}(FA|SP|SU)$/;
const SECTION_RE = /^[0-9A-Za-z]{1,10}(-[0-9A-Za-z]{1,10}){0,3}$/;
const PLAN_RE = /^[0-9A-Za-z]{1,8}$/;
const MAX_SHARED = 60;

// ---------- Share links ----------

// A full id is "<term>-<section>". Links carry the term once and bare section numbers.
function toSectionNumber(id, term) {
  const s = String(id ?? "").trim();
  const m = /^(\d{4}(?:FA|SP|SU))-(.+)$/i.exec(s);
  if (!m) return s;
  return m[1].toUpperCase() === term ? m[2] : null;
}

export function encodeShare({ term, plan, ids } = {}) {
  const t = String(term ?? "").trim().toUpperCase();
  const parts = [`t=${encodeURIComponent(t)}`];
  const p = String(plan ?? "").trim();
  if (PLAN_RE.test(p)) parts.push(`p=${p}`);
  const seen = new Set();
  for (const id of ids || []) {
    const n = toSectionNumber(id, t);
    if (n && SECTION_RE.test(n)) seen.add(n);
  }
  parts.push(`s=${[...seen].join(",")}`);
  return `#${parts.join("&")}`;
}

function safeDecode(v) {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
}

export function decodeShare(hash) {
  try {
    if (typeof hash !== "string") return null;
    let h = hash.trim();
    const at = h.indexOf("#");
    if (at >= 0) h = h.slice(at + 1);
    const fields = {};
    for (const pair of h.split(/[&;]/)) {
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const key = safeDecode(pair.slice(0, eq)).trim().toLowerCase();
      // First value wins, so a repeated key cannot override the original.
      if (key in fields) continue;
      fields[key] = safeDecode(pair.slice(eq + 1));
    }
    const term = (fields.t || "").trim().toUpperCase();
    if (!TERM_RE.test(term)) return null;
    const plan = (fields.p || "").trim();
    const sections = [];
    for (const raw of (fields.s || "").split(/[,\s]+/)) {
      const n = toSectionNumber(raw, term);
      if (n && SECTION_RE.test(n) && !sections.includes(n)) sections.push(n);
      if (sections.length >= MAX_SHARED) break;
    }
    return { term, plan: PLAN_RE.test(plan) ? plan : null, sections };
  } catch {
    return null;
  }
}

// Turns decodeShare output back into full section ids for lookups in courses.json.
export function sharedIds(decoded) {
  if (!decoded) return [];
  return decoded.sections.map((s) => `${decoded.term}-${s}`);
}

// ---------- Calendar export (RFC 5545) ----------

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:20070311T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:20071104T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const pad = (n, w = 2) => String(n).padStart(w, "0");
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const hms = (hhmm) => `${hhmm.replace(":", "")}00`;

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

function nthSunday(year, month, n) {
  const first = new Date(Date.UTC(year, month, 1));
  return new Date(Date.UTC(year, month, 1 + ((7 - first.getUTCDay()) % 7) + 7 * (n - 1)));
}

// US rule since 2007: EDT from the second Sunday in March to the first Sunday in November.
function isEdtAtEndOfDay(date) {
  const y = date.getUTCFullYear();
  return date >= nthSunday(y, 2, 2) && date < nthSunday(y, 10, 1);
}

// UNTIL must be UTC when DTSTART has a TZID. Use 23:59:59 New York time on the last day.
function untilUtc(endDate) {
  const offset = isEdtAtEndOfDay(endDate) ? 4 : 5;
  const t = new Date(endDate.getTime() + (23 * 3600 + 59 * 60 + 59 + offset * 3600) * 1000);
  return `${ymd(t)}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}Z`;
}

function stampUtc(d) {
  return `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Lines over 75 octets continue on the next line after one space. Never split a UTF-8 character.
const encoder = new TextEncoder();
export function foldLine(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

function instructorNames(section) {
  return (section.instructors || [])
    .flatMap((i) => String(i).split("|"))
    .map((i) => i.trim())
    .filter(Boolean);
}

// Meetings that share a start and end time become one weekly event.
function meetingPatterns(meetings) {
  const byTime = new Map();
  for (const m of meetings || []) {
    if (!ICS_DAY[m.day] || !m.start || !m.end) continue;
    const key = `${m.start}-${m.end}`;
    if (!byTime.has(key)) byTime.set(key, { start: m.start, end: m.end, days: new Set() });
    byTime.get(key).days.add(m.day);
  }
  return [...byTime.values()]
    .map((p) => ({ ...p, days: DAY_ORDER.filter((d) => p.days.has(d)) }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function firstMeetingDate(startDate, days) {
  const wanted = new Set(days.map((d) => DAY_ORDER.indexOf(d)));
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    if (wanted.has((d.getUTCDay() + 6) % 7)) return d;
  }
  return null;
}

// Sections without meetings or without both dates are left out; there is nothing to place.
export function buildIcs(sections, { calendarName = "Course schedule", now = new Date() } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LITSA//Course Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:America/New_York",
    ...VTIMEZONE,
  ];
  const dtstamp = stampUtc(now);
  for (const s of sections || []) {
    const start = parseDate(s.start_date);
    const end = parseDate(s.end_date);
    if (!start || !end || end < start) continue;
    const description = [
      `Section ${s.section}`,
      `Instructors: ${instructorNames(s).join(", ") || "Not listed"}`,
      "Unofficial; check Workday.",
    ].join("\n");
    for (const p of meetingPatterns(s.meetings)) {
      const first = firstMeetingDate(start, p.days);
      if (!first || first > end) continue;
      const byday = p.days.map((d) => ICS_DAY[d]).join(",");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${s.id}-${byday.replace(/,/g, "")}-${p.start.replace(":", "")}@suffolklitsa.org`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=America/New_York:${ymd(first)}T${hms(p.start)}`,
        `DTEND;TZID=America/New_York:${ymd(first)}T${hms(p.end)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${untilUtc(end)}`,
        `SUMMARY:${escapeText(s.title)}`,
        `DESCRIPTION:${escapeText(description)}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsFilename(term) {
  const t = String(term ?? "").replace(/[^0-9A-Za-z]/g, "");
  return t ? `litsa-schedule-${t}.ics` : "litsa-schedule.ics";
}

// ---------- Workday list ----------

const range = (m) => `${formatTime(m.start)}-${formatTime(m.end)}`;

function describeWhen(section) {
  const patterns = meetingPatterns(section.meetings);
  if (!patterns.length) return "No set meeting time";
  return patterns.map((p) => `${p.days.join("/")} ${range(p)}`).join(", ");
}

function sortByTitle(sections) {
  return [...(sections || [])].sort(
    (a, b) =>
      String(a.title ?? "").localeCompare(String(b.title ?? ""), "en", { sensitivity: "base" }) ||
      String(a.section ?? "").localeCompare(String(b.section ?? ""), "en", { numeric: true }),
  );
}

const roundCredits = (n) => Math.round(n * 100) / 100;

export function workdayRows(sections) {
  return sortByTitle(sections).map((s) => ({ section: s.section, title: s.title, credits: s.credits, when: describeWhen(s) }));
}

export function workdayList(sections) {
  const rows = workdayRows(sections);
  const total = roundCredits(rows.reduce((sum, r) => sum + (Number(r.credits) || 0), 0));
  const lines = rows.map((r) => `${r.section}  ${r.title}  (${roundCredits(r.credits)} cr)  ${r.when}`);
  lines.push(`Total: ${total} ${total === 1 ? "credit" : "credits"}`);
  return lines.join("\n");
}

// ---------- DOM helper (the only browser code in this file) ----------

export async function copyText(text) {
  const value = String(text ?? "");
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Permission denied or insecure context; try the textarea route.
  }
  const doc = globalThis.document;
  if (!doc?.body) return false;
  const previous = doc.activeElement;
  const ta = doc.createElement("textarea");
  try {
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    doc.body.appendChild(ta);
    ta.select();
    return doc.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    ta.remove();
    if (previous && typeof previous.focus === "function") previous.focus();
  }
}
