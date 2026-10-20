import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeShare, decodeShare, sharedIds, buildIcs, icsFilename, foldLine, workdayList, workdayRows, copyText } from "./share.js";

const sec = (section, meetings, extra = {}) => ({
  id: `2027SP-${section}`, term_code: "2027SP", course_number: section.split("-")[0], section, title: section, credits: 2,
  delivery: "In-Person", division: "Day", meetings, start_date: "2027-01-19", end_date: "2027-05-14", instructors: [], ...extra,
});
const tueThu = [{ day: "Tue", start: "10:00", end: "11:25" }, { day: "Thu", start: "10:00", end: "11:25" }];
const NOW = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));

// Unfold continuation lines so content checks ignore where folds landed.
const unfold = (ics) => ics.replace(/\r\n /g, "");

test("share link round-trips term, plan and sections", () => {
  const hash = encodeShare({ term: "2027SP", plan: "A", ids: ["2027SP-2155-1", "2027SP-8068-1"] });
  assert.equal(hash, "#t=2027SP&p=A&s=2155-1,8068-1");
  assert.deepEqual(decodeShare(hash), { term: "2027SP", plan: "A", sections: ["2155-1", "8068-1"] });
  assert.deepEqual(sharedIds(decodeShare(hash)), ["2027SP-2155-1", "2027SP-8068-1"]);
});

test("encodeShare drops duplicates and ids from another term", () => {
  assert.equal(encodeShare({ term: "2027SP", ids: ["2027SP-2155-1", "2155-1", "2026FA-9999-1"] }), "#t=2027SP&s=2155-1");
});

test("decodeShare tolerates whitespace, duplicates, full URLs and unknown keys", () => {
  assert.deepEqual(decodeShare("  https://suffolklitsa.org/planner/#x=1&t=2027sp&s=2155-1,%202155-1,,8068-1+3000-2&p=B&t=2026FA "), {
    term: "2027SP", plan: "B", sections: ["2155-1", "8068-1", "3000-2"],
  });
  assert.deepEqual(decodeShare("t=2027SP"), { term: "2027SP", plan: null, sections: [] });
});

test("decodeShare returns null for junk and never throws", () => {
  for (const junk of [undefined, null, 42, {}, "", "#", "#%E0%A4%A", "#t=", "#t=banana&s=1-1", "#s=2155-1", "#==&&=", "#t=%"]) {
    assert.equal(decodeShare(junk), null, String(junk));
  }
  assert.deepEqual(decodeShare("#t=2027SP&s=<script>,2155-1,../x,%E0%A4%A"), { term: "2027SP", plan: null, sections: ["2155-1"] });
});

test("ICS has matched BEGIN/END pairs, CRLF endings and a New York timezone", () => {
  const ics = buildIcs([sec("2155-1", tueThu, { title: "Entertainment Law" })], { calendarName: "Spring 2027", now: NOW });
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false, "no bare LF");
  assert.equal(ics.replace(/\r\n/g, "").includes("\r"), false, "no bare CR");
  const stack = [];
  for (const line of ics.split("\r\n")) {
    const begin = /^BEGIN:(.+)$/.exec(line);
    const end = /^END:(.+)$/.exec(line);
    if (begin) stack.push(begin[1]);
    if (end) assert.equal(stack.pop(), end[1]);
  }
  assert.deepEqual(stack, []);
  for (const part of ["BEGIN:VTIMEZONE", "TZID:America/New_York", "TZNAME:EDT", "TZNAME:EST", "BYMONTH=3;BYDAY=2SU", "BYMONTH=11;BYDAY=1SU", "X-WR-CALNAME:Spring 2027"]) {
    assert.ok(ics.includes(part), part);
  }
});

test("Tue/Thu class starting on a Tuesday gets one weekly event", () => {
  const ics = unfold(buildIcs([sec("2155-1", tueThu, { title: "Entertainment Law" })], { now: NOW }));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 1);
  assert.match(ics, /\r\nDTSTART;TZID=America\/New_York:20270119T100000\r\n/);
  assert.match(ics, /\r\nDTEND;TZID=America\/New_York:20270119T112500\r\n/);
  // May 14 is in EDT, so 23:59:59 local is 03:59:59 UTC the next day.
  assert.match(ics, /\r\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270515T035959Z\r\n/);
  assert.match(ics, /\r\nUID:2027SP-2155-1-TUTH-1000@suffolklitsa\.org\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20261020T120000Z\r\n/);
  assert.match(ics, /\r\nSUMMARY:Entertainment Law\r\n/);
});

test("DTSTART moves to the first meeting day on or after start_date", () => {
  const ics = unfold(buildIcs([sec("1000-1", [{ day: "Mon", start: "18:00", end: "19:50" }], { start_date: "2027-01-19" })], { now: NOW }));
  assert.match(ics, /DTSTART;TZID=America\/New_York:20270125T180000/);
  const fall = unfold(buildIcs([sec("1000-1", [{ day: "Fri", start: "09:00", end: "10:00" }], { start_date: "2026-08-24", end_date: "2026-12-17" })], { now: NOW }));
  assert.match(fall, /DTSTART;TZID=America\/New_York:20260828T090000/);
  // December 17 is in EST, so the offset is five hours.
  assert.match(fall, /UNTIL=20261218T045959Z/);
});

test("meetings at different times become separate events with stable UIDs", () => {
  const s = sec("3000-1", [{ day: "Mon", start: "09:00", end: "10:00" }, { day: "Wed", start: "13:00", end: "14:00" }]);
  const a = buildIcs([s], { now: NOW });
  const b = buildIcs([s], { now: new Date() });
  assert.equal(a.match(/BEGIN:VEVENT/g).length, 2);
  assert.deepEqual(a.match(/UID:.+/g), b.match(/UID:.+/g));
});

test("description lists section, instructors and the Workday note, escaped and folded", () => {
  const instructors = ["James Matthews | Andrew Garcia | Ashley Grant | Kyra DeTone", "Zoë Example, Jr."];
  const ics = buildIcs([sec("2482-1", tueThu, { title: "Seminar; Practice, Part 2", instructors })], { now: NOW });
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const desc = ics.split("\r\n").findIndex((l) => l.startsWith("DESCRIPTION:"));
  assert.ok(ics.split("\r\n")[desc + 1].startsWith(" "), "long description continues on a folded line");
  const flat = unfold(ics);
  assert.match(flat, /SUMMARY:Seminar\\; Practice\\, Part 2\r\n/);
  assert.ok(flat.includes(
    "DESCRIPTION:Section 2482-1\\nInstructors: James Matthews\\, Andrew Garcia\\, Ashley Grant\\, Kyra DeTone\\, Zoë Example\\, Jr.\\nUnofficial\\; check Workday.\r\n",
  ));
});

test("folding never splits a multibyte character", () => {
  const folded = foldLine(`SUMMARY:${"é".repeat(80)}`);
  for (const line of folded.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), `SUMMARY:${"é".repeat(80)}`);
  assert.equal(foldLine("SHORT:line"), "SHORT:line");
});

test("asynchronous sections and sections without dates are skipped", () => {
  const ics = buildIcs([sec("4000-1", [], { delivery: "Online Asynchronous" }), sec("5000-1", tueThu, { start_date: null })], { now: NOW });
  assert.equal(ics.includes("BEGIN:VEVENT"), false);
  assert.ok(ics.includes("BEGIN:VCALENDAR") && ics.includes("END:VCALENDAR"));
});

test("icsFilename uses the term code", () => {
  assert.equal(icsFilename("2027SP"), "litsa-schedule-2027SP.ics");
  assert.equal(icsFilename("../x y"), "litsa-schedule-xy.ics");
  assert.equal(icsFilename(), "litsa-schedule.ics");
});

test("Workday list is sorted by title and ends with the credit total", () => {
  const sections = [
    sec("8068-1", [{ day: "Mon", start: "18:00", end: "19:50" }], { title: "Trial Advocacy", credits: 3 }),
    sec("2155-1", [{ day: "Tue", start: "10:00", end: "11:25" }], { title: "Entertainment Law" }),
    sec("4000-1", [], { title: "administrative Law Online", credits: 1.5 }),
    sec("3000-1", tueThu, { title: "Evidence", credits: 4 }),
  ];
  assert.equal(workdayList(sections), [
    "4000-1  administrative Law Online  (1.5 cr)  No set meeting time",
    "2155-1  Entertainment Law  (2 cr)  Tue 10:00am-11:25am",
    "3000-1  Evidence  (4 cr)  Tue/Thu 10:00am-11:25am",
    "8068-1  Trial Advocacy  (3 cr)  Mon 6:00pm-7:50pm",
    "Total: 10.5 credits",
  ].join("\n"));
  assert.deepEqual(workdayRows(sections)[1], { section: "2155-1", title: "Entertainment Law", credits: 2, when: "Tue 10:00am-11:25am" });
  assert.equal(workdayList([]), "Total: 0 credits");
  assert.equal(workdayList([sec("1-1", [], { credits: 1 })]).split("\n").at(-1), "Total: 1 credit");
});

test("copyText returns false when there is no clipboard or document", async () => {
  assert.equal(await copyText("x"), false);
});

// Swap a global for one test and put the original back.
async function withGlobal(name, value, fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, name, saved);
    else delete globalThis[name];
  }
}

test("copyText uses the clipboard API when it works", async () => {
  let written = null;
  const nav = { clipboard: { writeText: async (t) => { written = t; } } };
  assert.equal(await withGlobal("navigator", nav, () => copyText("2155-1")), true);
  assert.equal(written, "2155-1");
});

test("copyText falls back to a hidden textarea when the clipboard API fails", async () => {
  const nav = { clipboard: { writeText: async () => { throw new Error("denied"); } } };
  const log = [];
  const button = { focus: () => log.push("refocus") };
  const doc = {
    activeElement: button,
    body: { appendChild: (el) => log.push(`append ${el.value}`) },
    createElement: () => ({ style: {}, setAttribute() {}, select: () => log.push("select"), remove: () => log.push("remove") }),
    execCommand: (cmd) => { log.push(cmd); return true; },
  };
  const ok = await withGlobal("navigator", nav, () => withGlobal("document", doc, () => copyText("list")));
  assert.equal(ok, true);
  assert.deepEqual(log, ["append list", "select", "copy", "remove", "refocus"]);
});
