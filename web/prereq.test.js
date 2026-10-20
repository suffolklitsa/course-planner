import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePrerequisites, checkPrerequisites, prerequisiteBadge, buildCatalog } from "./prereq.js";

// Titles as they appear in data/courses.json. 158, 451, 2427 and 2699 are not in the data.
const catalog = buildCatalog([
  { course_number: "156", title: "Constitutional Law 1A" },
  { course_number: "552", title: "Constitutional Law 5A" },
  { course_number: "151", title: "Contracts 1B" },
  { course_number: "452", title: "Contracts 4A" },
  { course_number: "104", title: "Civil Procedure APO" },
  { course_number: "2166", title: "Evidence WEB" },
  { course_number: "2166", title: "Evidence" },
  { course_number: "2298", title: "Patent Law" },
  { course_number: "2185", title: "Family Law WEB" },
  { course_number: "2518", title: "Appellate Practice" },
  { course_number: "2736", title: "Transactional Skills: Intel Property" },
  { course_number: "2398", title: "Advanced Survey of Core Legal Principles HJD" },
  { course_number: "2488", title: "Advanced Survey: Contracts, Evidence, Torts" },
  { course_number: "2101", title: "Commercial Law Survey WEB" },
]);

const sec = (prerequisites) => ({ id: "2027SP-9999-1", course_number: "9999", title: "Test", prerequisites });
const check = (text, opts = {}) => checkPrerequisites(sec(text), { catalog, taken: new Set(), year: null, division: null, ...opts });

test("buildCatalog strips section suffixes from titles", () => {
  assert.equal(catalog.get("2166"), "Evidence");
  assert.equal(catalog.get("552"), "Constitutional Law");
  assert.equal(catalog.get("104"), "Civil Procedure");
});

test("empty text has no prerequisites", () => {
  const p = parsePrerequisites("", catalog);
  assert.equal(p.raw, "");
  assert.deepEqual(p.courseRefs, []);
  assert.equal(p.unparsed, "");
  assert.deepEqual(check(""), { status: "none", messages: [] });
  assert.deepEqual(checkPrerequisites({ prerequisites: undefined }, {}), { status: "none", messages: [] });
  assert.equal(prerequisiteBadge(sec("")), "");
});

test("a single course is required", () => {
  const p = parsePrerequisites("Law 2166", catalog);
  assert.deepEqual(p.courseRefs, [{ label: "LAW 2166", number: "2166", courseNumber: "2166", title: "Evidence" }]);
  assert.equal(p.anyOf, false);
  assert.equal(p.unparsed, "");
  assert.deepEqual(check("Law 2166"), { status: "may-be-missing", messages: ["May require Evidence (LAW 2166)."] });
  assert.equal(check("Law 2166", { taken: new Set(["2166"]) }).status, "met");
});

test("a list ending in 'or' means one of several courses", () => {
  const p = parsePrerequisites("Law 151 or LAW 452", catalog);
  assert.equal(p.anyOf, true);
  assert.deepEqual(p.groups.map((g) => g.map((r) => r.courseNumber)), [["151", "452"]]);
  assert.equal(check("Law 151 or LAW 452", { taken: new Set(["452"]) }).status, "met");
  assert.deepEqual(check("Law 151 or LAW 452").messages, ["May require one of Contracts (LAW 151) or Contracts (LAW 452)."]);
});

test("parenthesized groups joined by 'and' need one course from each group", () => {
  const text = "Law (LAW 2166 or LAW 2298) and (LAW 104 or LAW 451)";
  const p = parsePrerequisites(text, catalog);
  assert.equal(p.anyOf, false);
  assert.deepEqual(p.groups.map((g) => g.map((r) => r.number)), [["2166", "2298"], ["104", "451"]]);
  assert.equal(check(text, { taken: new Set(["2298", "104"]) }).status, "met");
  const r = check(text, { taken: new Set(["104"]) });
  assert.equal(r.status, "may-be-missing");
  assert.deepEqual(r.messages, ["May require one of Evidence (LAW 2166) or Patent Law (LAW 2298)."]);
});

test("a number missing from the data is unchecked, with the raw label", () => {
  const text = "Law 156 LAW 158 or LAW 552";
  const p = parsePrerequisites(text, catalog);
  assert.deepEqual(p.courseRefs.map((r) => r.courseNumber), ["156", null, "552"]);
  const r = check(text);
  assert.equal(r.status, "unchecked");
  assert.deepEqual(r.messages, [
    "May require one of Constitutional Law (LAW 156), LAW 158 or Constitutional Law (LAW 552).",
    "Lists LAW 158; couldn't match it to a current course. Check with the Registrar.",
  ]);
  // Taking any one listed course is enough, even when another number can't be matched.
  assert.equal(check(text, { taken: new Set(["156"]) }).status, "met");
});

test("without a catalog nothing is matched, so course rules stay unchecked", () => {
  const p = parsePrerequisites("Law 2166");
  assert.equal(p.courseRefs[0].courseNumber, null);
  assert.equal(checkPrerequisites(sec("Law 2166"), { taken: new Set() }).status, "unchecked");
  assert.equal(checkPrerequisites(sec("Law 2166"), { taken: new Set(["2166"]) }).status, "met");
});

test("'Has Completed or In Progress' allows taking it the same term", () => {
  const p = parsePrerequisites("Law 2518 Has Completed or In Progress", catalog);
  assert.equal(p.concurrentOk, true);
  assert.equal(p.unparsed, "");
  assert.deepEqual(check("Law 2518 Has Completed or In Progress").messages, [
    "May require Appellate Practice (LAW 2518). Taking it the same term may count.",
  ]);
});

test("'Not Taken' and 'Courses are Not' list courses that may close this one", () => {
  for (const text of ["LAW Not Taken LAW 2185", "LAW Has Not Taken LAW 2185"]) {
    const p = parsePrerequisites(text, catalog);
    assert.deepEqual(p.courseRefs, []);
    assert.deepEqual(p.excludedRefs.map((r) => r.courseNumber), ["2185"]);
    assert.equal(p.unparsed, "");
    assert.equal(check(text).status, "met");
    assert.deepEqual(check(text, { taken: new Set(["2185"]) }), {
      status: "may-be-missing",
      messages: ["May not be open to you because you took Family Law (LAW 2185)."],
    });
  }
  assert.deepEqual(parsePrerequisites("LAW Courses are Not Law 2101", catalog).excludedRefs.map((r) => r.number), ["2101"]);
  assert.deepEqual(check("LAW Not Taken LAW 2427"), {
    status: "unchecked",
    messages: ["May not be open if you took LAW 2427. Couldn't match it to a current course. Check with the Registrar."],
  });
});

test("a course list can come with an exclusion", () => {
  const p = parsePrerequisites("LAW (LAW 151 or LAW 452) and Has Not Taken LAW 2736", catalog);
  assert.deepEqual(p.groups.map((g) => g.map((r) => r.number)), [["151", "452"]]);
  assert.deepEqual(p.excludedRefs.map((r) => r.number), ["2736"]);
  assert.equal(p.anyOf, true);
});

test("class year and division rules", () => {
  const text = "LAW (JD Day and 2L/3L) or (JD Evening and 3L/4L)";
  const p = parsePrerequisites(text, catalog);
  assert.deepEqual(p.standing, [
    { division: "Day", years: ["2L", "3L"], programs: [] },
    { division: "Evening", years: ["3L", "4L"], programs: [] },
  ]);
  assert.deepEqual(p.classYears, ["2L", "3L", "4L"]);
  assert.deepEqual(p.divisions, ["Day", "Evening"]);
  assert.deepEqual(p.courseRefs, []);
  assert.equal(p.unparsed, "");
  assert.equal(check(text, { year: "2L", division: "Day" }).status, "met");
  assert.equal(check(text, { year: "4L", division: "Evening" }).status, "met");
  assert.deepEqual(check(text, { year: "2L", division: "Evening" }), {
    status: "may-be-missing",
    messages: ["May be only for Day 2L/3L or Evening 3L/4L students."],
  });
  assert.equal(check(text, { year: "1L", division: "Day" }).status, "may-be-missing");
  // A 3L fits both options, so the division doesn't matter.
  assert.equal(check(text, { year: "3L" }).status, "met");
  assert.deepEqual(check(text, { year: "2L" }), {
    status: "unchecked",
    messages: ["May be only for Day 2L/3L or Evening 3L/4L students. Set your year and division to check."],
  });
});

test("class year rule plus exclusion, with nested parentheses", () => {
  const text = "LAW ((JD Day and 2L/3L) or (JD Evening and 3L/4L)) and Has Not Taken LAW 2398 or LAW 2488";
  const p = parsePrerequisites(text, catalog);
  assert.equal(p.standing.length, 2);
  assert.deepEqual(p.excludedRefs.map((r) => r.title), ["Advanced Survey of Core Legal Principles", "Advanced Survey: Contracts, Evidence, Torts"]);
  assert.equal(p.unparsed, "");
  assert.equal(check(text, { year: "3L", division: "Day" }).status, "met");
  assert.equal(check(text, { year: "3L", division: "Day", taken: new Set(["2488"]) }).status, "may-be-missing");
});

test("academic warning rules can't be checked", () => {
  const text = "LAW (Academic Warning and JD Day and 2L/3L) or (Academic Warning and JD Evening and 3L/4L)";
  const p = parsePrerequisites(text, catalog);
  assert.deepEqual(p.standing[0].programs, ["Academic Warning"]);
  assert.equal(check(text, { year: "2L", division: "Day" }).status, "unchecked");
  assert.equal(check(text, { year: "2L", division: "Evening" }).status, "may-be-missing");
});

test("1L section cohorts", () => {
  assert.deepEqual(parsePrerequisites("Student is Law Section A Cohort").cohorts, ["A"]);
  const p = parsePrerequisites("LAW Student is Law Section 4AP Cohort");
  assert.deepEqual(p.cohorts, ["4AP"]);
  assert.equal(p.unparsed, "");
  assert.deepEqual(check("Student is Law Section B Cohort"), {
    status: "unchecked",
    messages: ["May be only for students in 1L Section B. The planner can't check your section."],
  });
  assert.equal(prerequisiteBadge(sec("Student is Law Section B Cohort")), "1L Section B");
});

test("program of study rules", () => {
  assert.deepEqual(parsePrerequisites("LAW Program of Study is MSLL").programs, ["MSLL"]);
  assert.deepEqual(parsePrerequisites("LAW Program of Study LLM Law Programs").programs, ["LLM Law Programs"]);
  assert.deepEqual(parsePrerequisites("LAW Program Area is Academic Warning Programs").programs, ["Academic Warning Programs"]);
  assert.equal(check("LAW Program of Study SJD Program").status, "unchecked");
  assert.equal(prerequisiteBadge(sec("LAW Program of Study SJD Program")), "Has enrollment limits");
});

test("permission wording sets needsPermission", () => {
  // No current string asks for permission; this guards the wording if Suffolk adds one.
  const p = parsePrerequisites("Instructor Permission");
  assert.equal(p.needsPermission, true);
  assert.equal(p.unparsed, "");
  assert.equal(check("Instructor Permission").status, "unchecked");
});

test("text the parser can't read is shown raw and unchecked", () => {
  const p = parsePrerequisites("LAW Course", catalog);
  assert.equal(p.unparsed, "Course");
  assert.deepEqual(check("LAW Course"), {
    status: "unchecked",
    messages: ['Suffolk lists "LAW Course". The planner couldn\'t read this. Check with the Registrar.'],
  });
  assert.equal(prerequisiteBadge(sec("LAW Course")), "Has prerequisites");
});

test("missing courses outrank unchecked ones in the status", () => {
  const r = check("Law (LAW 2166 or LAW 2298) and (LAW 104 or LAW 451)");
  assert.equal(r.status, "may-be-missing");
  assert.equal(r.messages.length, 3);
});

test("messages never claim certainty", () => {
  const data = JSON.parse(readFileSync(new URL("../data/courses.json", import.meta.url)));
  const cat = buildCatalog(data.sections);
  for (const s of data.sections) {
    for (const opts of [{}, { year: "1L", division: "Day" }, { year: "3L", division: "Evening" }]) {
      for (const m of checkPrerequisites(s, { catalog: cat, taken: new Set(), ...opts }).messages) {
        assert.doesNotMatch(m, /\b(must|cannot enroll|not allowed|required)\b/i, m);
      }
    }
  }
});

test("every prerequisite string in the data parses, except 'LAW Course'", () => {
  const data = JSON.parse(readFileSync(new URL("../data/courses.json", import.meta.url)));
  const unread = new Set();
  for (const s of data.sections) {
    if (!s.prerequisites.trim()) continue;
    const p = parsePrerequisites(s.prerequisites);
    if (p.unparsed) unread.add(s.prerequisites);
    const found = p.courseRefs.length + p.excludedRefs.length + p.standing.length + p.cohorts.length + p.programs.length;
    if (!p.unparsed) assert.ok(found > 0, `nothing found in ${s.prerequisites}`);
    assert.notEqual(prerequisiteBadge(s), "");
  }
  assert.deepEqual([...unread], ["LAW Course"]);
});
