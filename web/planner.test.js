import { test } from "node:test";
import assert from "node:assert/strict";
import { findConflicts, meetingsClash, totalCredits, describeMeetings, duplicateCourses, matchesFilters, formatTime } from "./planner.js";

const sec = (id, meetings, extra = {}) => ({
  id, term_code: "2027SP", course_number: id.split("-")[0], section: id, title: id, credits: 2,
  meetings, start_date: "2027-01-19", end_date: "2027-05-14", instructors: [], division: "Day",
  delivery: "In-Person", requirements: { experiential: false, writing: false, ma_bar: false }, ...extra,
});

test("back-to-back classes do not clash", () => {
  assert.equal(meetingsClash({ day: "Tue", start: "12:00", end: "13:25" }, { day: "Tue", start: "13:25", end: "14:50" }), false);
});

test("overlapping classes on the same day clash", () => {
  assert.equal(meetingsClash({ day: "Mon", start: "16:00", end: "17:50" }, { day: "Mon", start: "17:00", end: "18:00" }), true);
});

test("same time on different days does not clash", () => {
  assert.equal(meetingsClash({ day: "Mon", start: "16:00", end: "17:50" }, { day: "Wed", start: "16:00", end: "17:50" }), false);
});

test("findConflicts reports the shared days", () => {
  const a = sec("1000-1", [{ day: "Tue", start: "12:00", end: "13:25" }, { day: "Thu", start: "12:00", end: "13:25" }]);
  const b = sec("2000-1", [{ day: "Thu", start: "13:00", end: "14:00" }]);
  assert.deepEqual(findConflicts([a, b]), [{ a: "1000-1", b: "2000-1", days: ["Thu"] }]);
});

test("sections in different terms never conflict", () => {
  const a = sec("1000-1", [{ day: "Mon", start: "10:00", end: "11:00" }]);
  const b = sec("2000-1", [{ day: "Mon", start: "10:00", end: "11:00" }], { term_code: "2026FA" });
  assert.deepEqual(findConflicts([a, b]), []);
});

test("non-overlapping date ranges do not conflict", () => {
  const a = sec("1000-1", [{ day: "Mon", start: "10:00", end: "11:00" }], { end_date: "2027-03-01" });
  const b = sec("2000-1", [{ day: "Mon", start: "10:00", end: "11:00" }], { start_date: "2027-03-08" });
  assert.deepEqual(findConflicts([a, b]), []);
});

test("asynchronous courses never conflict", () => {
  assert.deepEqual(findConflicts([sec("1000-1", []), sec("2000-1", [{ day: "Mon", start: "10:00", end: "11:00" }])]), []);
});

test("totalCredits adds half credits", () => {
  assert.equal(totalCredits([sec("1-1", [], { credits: 1.5 }), sec("2-1", [], { credits: 3 })]), 4.5);
});

test("describeMeetings reads like a schedule", () => {
  assert.equal(describeMeetings(sec("1-1", [{ day: "Tue", start: "12:00", end: "13:25" }, { day: "Thu", start: "12:00", end: "13:25" }])), "Tue/Thu 12:00pm to 1:25pm");
  assert.equal(describeMeetings(sec("1-1", [])), "No set meeting time");
  assert.equal(formatTime("00:30"), "12:30am");
});

test("two sections of the same course are flagged", () => {
  assert.deepEqual(duplicateCourses([sec("2155-1", []), sec("2155-2", []), sec("3000-1", [])]), [["2155-1", "2155-2"]]);
});

test("filters combine", () => {
  const s = sec("2155-1", [], { title: "Entertainment Law", instructors: ["Stacey Lantagne"], requirements: { experiential: true } });
  assert.equal(matchesFilters(s, { term: "2027SP", query: "lantagne entertainment", requirements: ["experiential"] }), true);
  assert.equal(matchesFilters(s, { division: "Evening" }), false);
  assert.equal(matchesFilters(s, { requirements: ["writing"] }), false);
});
