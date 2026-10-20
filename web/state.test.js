import { test } from "node:test";
import assert from "node:assert/strict";
import * as st from "./state.js";
import { creditLoad, onlineCount, requirementTally } from "./rules.js";
import { freshnessNote, checkedOn, ageInDays } from "./freshness.js";
import { reportUrl } from "./report.js";
import { groupByCourse, sortGroups, matchesTimeFilters, conflictsWith, matchesQuery, queryMatchedOnlyInDescription, matchesFilters } from "./planner.js";

const sec = (id, meetings = [], extra = {}) => ({
  id: `2027SP-${id}`, term_code: "2027SP", term: "Spring 2027", course_number: id.split("-")[0], section: id, title: `Course ${id.split("-")[0]}`,
  credits: 2, meetings, start_date: "2027-01-19", end_date: "2027-05-14", instructors: ["Ada Lovelace"], division: "Day", delivery: "In-Person",
  requirements: { experiential: false, writing: false, ma_bar: false, first_year: false }, areas_of_focus: [], description: "", ...extra,
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test("state migrates the version 1 saved list into Plan A", () => {
  const storage = memoryStorage();
  storage.setItem("litsa.planner.v1", JSON.stringify(["2027SP-1000-1", "2027SP-1000-1", "2027SP-2000-1"]));
  const s = st.load(storage);
  assert.deepEqual(s.plans.A, ["2027SP-1000-1", "2027SP-2000-1"]);
  assert.equal(s.active, "A");
});

test("state survives junk and blocked storage", () => {
  assert.deepEqual(st.normalize("nonsense"), st.emptyState());
  assert.deepEqual(st.normalize({ profile: { year: "9L" }, plans: { A: [1, "x"] } }).plans.A, ["x"]);
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(st.load(throwing), st.emptyState());
  assert.equal(st.save(st.emptyState(), throwing), false);
});

test("save and load round-trip", () => {
  const storage = memoryStorage();
  let s = st.toggleChosen(st.emptyState(), "2027SP-1000-1", "Course 1000 (1000-1)");
  s = st.setProfile(s, { year: "2L", division: "Evening" });
  assert.equal(st.save(s, storage), true);
  assert.deepEqual(st.load(storage), s);
});

test("plans A and B are separate, and can be copied", () => {
  let s = st.toggleChosen(st.emptyState(), "a");
  s = st.switchPlan(s, "B");
  assert.deepEqual(st.chosenIds(s), []);
  s = st.copyPlan(s, "A", "B");
  assert.deepEqual(st.chosenIds(s), ["a"]);
  s = st.clearPlan(s);
  assert.deepEqual(s.plans, { A: ["a"], B: [] });
});

test("marking a course taken removes its sections everywhere and clears not-interested", () => {
  let s = st.toggleChosen(st.emptyState(), "2027SP-1000-1");
  s = st.toggleShortlist(s, "2027SP-1000-2");
  s = st.toggleNotInterested(s, "1000", ["2027SP-1000-1", "2027SP-1000-2"]);
  assert.deepEqual(s.notInterested, ["1000"]);
  assert.deepEqual(s.plans.A, []);
  s = st.toggleTaken(s, "1000", ["2027SP-1000-1", "2027SP-1000-2"]);
  assert.deepEqual([s.taken, s.notInterested], [["1000"], []]);
  s = st.toggleTaken(s, "1000");
  assert.deepEqual(s.taken, []);
});

test("saved sections that disappear from the data are reported with their label", () => {
  let s = st.toggleChosen(st.emptyState(), "2027SP-1000-1", "Evidence (1000-1)");
  s = st.toggleShortlist(s, "2027SP-2000-1");
  assert.deepEqual(st.missingSaved(s, new Set(["2027SP-2000-1"])), [{ id: "2027SP-1000-1", label: "Evidence (1000-1)" }]);
  assert.deepEqual(st.dropMissing(s, new Set(["2027SP-2000-1"])).plans.A, []);
});

test("rules: day students under 12 credits get a note; evening students don't", () => {
  const six = [sec("1000-1", [], { credits: 3 }), sec("2000-1", [], { credits: 3 })];
  assert.equal(creditLoad(six, { division: "Day" }).messages.length, 1);
  assert.equal(creditLoad(six, { division: "Evening" }).messages.length, 0);
  assert.equal(creditLoad([], { division: "Day" }).messages.length, 0);
});

test("rules: two or more online courses note the distance education limits", () => {
  const two = [sec("1000-1", [], { delivery: "Online Synchronous" }), sec("2000-1", [], { delivery: "Hybrid" })];
  assert.equal(onlineCount(two).count, 2);
  assert.equal(onlineCount(two).messages.length, 1);
  assert.equal(onlineCount(two.slice(0, 1)).messages.length, 0);
});

test("rules: requirement tally counts experiential credits", () => {
  const t = requirementTally([sec("1000-1", [], { credits: 3, requirements: { experiential: true, writing: true, ma_bar: false } }), sec("2000-1")]);
  assert.equal(t.experiential, 3);
  assert.deepEqual(t.writing, ["Course 1000"]);
});

test("freshness uses the course offerings date and counts days", () => {
  const data = { sources: [{ id: "law-fall-day-block-schedule-2026", verified_at: "2026-09-11" }, { id: "law-course-offerings-2026-27", verified_at: "2026-10-05" }] };
  assert.equal(checkedOn(data), "2026-10-05");
  assert.equal(ageInDays("2026-10-05", new Date("2026-10-20T15:00:00")), 15);
  const note = freshnessNote(data, new Date("2026-10-20T15:00:00"));
  assert.equal(note.stale, true);
  assert.match(note.text, /15 days ago/);
});

test("report link prefills the section and nothing personal", () => {
  const url = reportUrl(sec("2155-1", [{ day: "Tue", start: "10:00", end: "11:25" }]), "2026-10-05");
  assert.match(url, /^https:\/\/github\.com\/suffolklitsa\/course-planner\/issues\/new\?/);
  assert.match(new URL(url).searchParams.get("body"), /Section: 2155-1/);
});

test("grouping puts sections of one course on one card", () => {
  const g = groupByCourse([sec("1000-2"), sec("1000-1"), sec("2000-1")]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].sections.map((s) => s.section), ["1000-1", "1000-2"]);
});

test("sorting by day and time puts Monday mornings first", () => {
  const g = groupByCourse([sec("1000-1", [{ day: "Wed", start: "09:00", end: "10:00" }]), sec("2000-1", [{ day: "Mon", start: "16:00", end: "17:00" }]), sec("3000-1")]);
  assert.deepEqual(sortGroups(g, "time").map((x) => x.course_number), ["2000", "1000", "3000"]);
  assert.deepEqual(sortGroups(g, "number").map((x) => x.course_number), ["1000", "2000", "3000"]);
});

test("time filters: avoid days, time windows, and asynchronous sections pass", () => {
  const fri = sec("1000-1", [{ day: "Fri", start: "09:00", end: "10:00" }]);
  const eve = sec("2000-1", [{ day: "Tue", start: "18:00", end: "19:50" }]);
  assert.equal(matchesTimeFilters(fri, { avoidDays: ["Fri"] }), false);
  assert.equal(matchesTimeFilters(eve, { times: ["evening"] }), true);
  assert.equal(matchesTimeFilters(eve, { times: ["morning"] }), false);
  assert.equal(matchesTimeFilters(sec("3000-1"), { times: ["morning"], avoidDays: ["Fri"] }), true);
});

test("conflictsWith lists every clash with the schedule", () => {
  const cand = sec("1000-1", [{ day: "Tue", start: "16:00", end: "17:50" }]);
  const chosen = [sec("2000-1", [{ day: "Tue", start: "17:00", end: "18:00" }]), sec("3000-1", [{ day: "Wed", start: "16:00", end: "17:00" }])];
  assert.deepEqual(conflictsWith(cand, chosen), [{ id: "2027SP-2000-1", days: ["Tue"] }]);
  assert.deepEqual(conflictsWith(chosen[0], [chosen[0]]), []);
});

test("search covers descriptions and says when only the description matched", () => {
  const s = sec("1000-1", [], { title: "Information Law", description: "Covers data privacy and breach notice." });
  assert.equal(matchesQuery(s, "privacy"), true);
  assert.equal(matchesQuery(s, "privacy", { descriptions: false }), false);
  assert.equal(queryMatchedOnlyInDescription(s, "privacy"), true);
  assert.equal(queryMatchedOnlyInDescription(s, "information"), false);
});

test("filters: hide first-year, hidden courses, area, credits", () => {
  const one = sec("1000-1", [], { requirements: { first_year: true }, areas_of_focus: [{ name: "Civil Litigation", level: "core" }], credits: 3 });
  assert.equal(matchesFilters(one, { hideFirstYear: true }), false);
  assert.equal(matchesFilters(one, { hidden: new Set(["1000"]) }), false);
  assert.equal(matchesFilters(one, { area: "Civil Litigation", credits: "3" }), true);
  assert.equal(matchesFilters(one, { area: "Tax" }), false);
});

test("freshness prefers the fetch date over the review date", () => {
  const data = { sources: [{ id: "law-course-offerings-2026-27", verified_at: "2026-10-12", fetched_at: "2026-10-20" }] };
  assert.equal(checkedOn(data), "2026-10-20");
  assert.equal(freshnessNote(data, new Date("2026-10-20T15:00:00")).stale, false);
});
