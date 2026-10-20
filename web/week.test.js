import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutWeek, dayStats, summaryLine, shortRange, gapsForDay, gapLabel, blockLabel, dayHeaderLine, agendaModel } from "./week.js";

const m = (day, start, end) => ({ day, start, end });
const sec = (id, meetings, extra = {}) => ({
  id, section: id, title: `Course ${id}`, credits: 2, meetings,
  start_date: "2027-01-19", end_date: "2027-05-14", ...extra,
});
const lanesOf = (layout, day) =>
  Object.fromEntries(layout.blocks.filter((b) => b.day === day).map((b) => [b.id, [b.lane, b.lanes]]));

test("empty week defaults to Mon to Fri, 9:00 to 17:00", () => {
  assert.deepEqual(layoutWeek([]), {
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startMin: 540, endMin: 1020, blocks: [], unscheduled: [],
  });
});

test("a single section gets one block per meeting", () => {
  const layout = layoutWeek([sec("2155-1", [m("Tue", "10:00", "11:25"), m("Thu", "10:00", "11:25")])]);
  assert.equal(layout.startMin, 600);
  assert.equal(layout.endMin, 690);
  assert.equal(layout.blocks.length, 2);
  const [tue] = layout.blocks;
  assert.deepEqual(
    { ...tue, topPct: Math.round(tue.topPct), heightPct: Math.round(tue.heightPct) },
    { id: "2155-1", title: "Course 2155-1", section: "2155-1", day: "Tue", start: "10:00", end: "11:25", topPct: 0, heightPct: 94, lane: 0, lanes: 1, conflict: false, preview: false, online: false },
  );
  assert.deepEqual(layout.blocks.map((b) => b.day), ["Tue", "Thu"]);
});

test("the time range rounds out to the half hour", () => {
  const layout = layoutWeek([sec("a", [m("Mon", "08:40", "09:50")]), sec("b", [m("Wed", "16:00", "17:50")])]);
  assert.equal(layout.startMin, 8 * 60 + 30);
  assert.equal(layout.endMin, 18 * 60);
  const exact = layoutWeek([sec("a", [m("Mon", "09:00", "10:30")])]);
  assert.deepEqual([exact.startMin, exact.endMin], [540, 630]);
});

test("two overlapping blocks sit side by side", () => {
  const layout = layoutWeek([sec("a", [m("Mon", "10:00", "11:00")]), sec("b", [m("Mon", "10:30", "11:30")]), sec("c", [m("Tue", "10:00", "11:00")])]);
  assert.deepEqual(lanesOf(layout, "Mon"), { a: [0, 2], b: [1, 2] });
  assert.deepEqual(lanesOf(layout, "Tue"), { c: [0, 1] });
});

test("a three-way overlap uses three lanes", () => {
  const layout = layoutWeek([
    sec("a", [m("Wed", "10:00", "12:00")]),
    sec("b", [m("Wed", "10:30", "11:30")]),
    sec("c", [m("Wed", "11:00", "13:00")]),
    sec("d", [m("Wed", "14:00", "15:00")]),
  ]);
  assert.deepEqual(lanesOf(layout, "Wed"), { a: [0, 3], b: [1, 3], c: [2, 3], d: [0, 1] });
});

test("a chain of overlaps reuses a freed lane and shares the cluster width", () => {
  const layout = layoutWeek([
    sec("a", [m("Thu", "09:00", "10:00")]),
    sec("b", [m("Thu", "09:30", "11:00")]),
    sec("c", [m("Thu", "10:00", "11:30")]),
  ]);
  assert.deepEqual(lanesOf(layout, "Thu"), { a: [0, 2], b: [1, 2], c: [0, 2] });
});

test("back-to-back blocks do not overlap", () => {
  const layout = layoutWeek([sec("a", [m("Mon", "12:00", "13:25")]), sec("b", [m("Mon", "13:25", "14:50")])]);
  assert.deepEqual(lanesOf(layout, "Mon"), { a: [0, 1], b: [0, 1] });
});

test("conflict ids mark their blocks", () => {
  const layout = layoutWeek([sec("a", [m("Mon", "10:00", "11:00")]), sec("b", [m("Mon", "10:30", "11:30")])], { conflictIds: new Set(["b"]) });
  assert.deepEqual(layout.blocks.map((b) => [b.id, b.conflict]), [["a", false], ["b", true]]);
});

test("weekend days appear only when a section meets then", () => {
  assert.deepEqual(layoutWeek([sec("a", [m("Sat", "09:00", "12:00")])]).days, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assert.deepEqual(layoutWeek([sec("a", [m("Sun", "09:00", "12:00")])]).days, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"]);
  assert.deepEqual(layoutWeek([sec("a", [m("Fri", "09:00", "12:00")])]).days, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
});

test("sections with no meetings are listed as unscheduled", () => {
  const layout = layoutWeek([sec("async-1", []), sec("a", [m("Mon", "10:00", "11:00")]), sec("async-2", [])]);
  assert.deepEqual(layout.unscheduled, ["async-1", "async-2"]);
  assert.equal(layout.blocks.length, 1);
});

test("dayStats covers only days with classes, with first, last, hours and gaps", () => {
  const stats = dayStats([
    sec("a", [m("Tue", "10:00", "11:25"), m("Thu", "10:00", "11:25")]),
    sec("b", [m("Tue", "13:00", "14:00")]),
    sec("c", [m("Tue", "16:00", "17:50")]),
    sec("async", []),
  ]);
  assert.deepEqual(stats.map((s) => s.day), ["Tue", "Thu"]);
  const tue = stats[0];
  assert.equal(tue.first, "10:00");
  assert.equal(tue.last, "17:50");
  assert.equal(tue.hours, Math.round(((85 + 60 + 110) / 60) * 100) / 100);
  assert.equal(tue.longestGapMin, 120);
  assert.deepEqual(tue.backToBack, []);
  assert.equal(stats[1].longestGapMin, 0);
});

test("overlapping classes are not counted twice in hours", () => {
  const [mon] = dayStats([sec("a", [m("Mon", "10:00", "11:00")]), sec("b", [m("Mon", "10:30", "11:30")])]);
  assert.equal(mon.hours, 1.5);
  assert.equal(mon.longestGapMin, 0);
  assert.equal(mon.last, "11:30");
});

test("back-to-back means a 0 to 10 minute wait", () => {
  const [wed] = dayStats([
    sec("a", [m("Wed", "09:00", "10:00")]),
    sec("b", [m("Wed", "10:10", "11:00")]), // 10 minutes after a: counts
    sec("c", [m("Wed", "11:11", "12:00")]), // 11 minutes after b: does not
    sec("d", [m("Wed", "12:00", "13:00")]), // starts as c ends: counts
  ]);
  assert.deepEqual(wed.backToBack, [["a", "b"], ["c", "d"]]);
});

test("summaryLine reads like a schedule", () => {
  const [tue] = dayStats([
    sec("a", [m("Tue", "10:00", "11:25")]),
    sec("b", [m("Tue", "11:30", "12:55")]),
    sec("c", [m("Tue", "13:00", "14:00")]),
    sec("d", [m("Tue", "16:00", "17:50")]),
  ]);
  assert.equal(summaryLine(tue), "Tue: 10:00am to 5:50pm, 2 back-to-back, longest break 2 hr");
  const [fri] = dayStats([sec("a", [m("Fri", "12:00", "12:50")])]);
  assert.equal(summaryLine(fri), "Fri: 12:00pm to 12:50pm");
});

test("preview ids mark preview blocks; online sections are flagged", () => {
  const layout = layoutWeek([sec("a", [m("Mon", "10:00", "11:00")], { delivery: "Online Synchronous" }), sec("b", [m("Mon", "13:00", "14:00")])], { previewIds: new Set(["b"]) });
  const [a, b] = layout.blocks;
  assert.deepEqual([a.online, a.preview, b.online, b.preview], [true, false, false, true]);
});

test("gapsForDay finds real breaks after merging overlaps", () => {
  const s = [sec("a", [m("Tue", "10:00", "11:25")]), sec("b", [m("Tue", "11:00", "12:00")]), sec("c", [m("Tue", "13:35", "15:00")])];
  assert.deepEqual(gapsForDay(s, "Tue"), [{ startMin: 720, endMin: 815, minutes: 95 }]);
  assert.deepEqual(gapsForDay(s, "Tue", 120), []);
  assert.equal(gapLabel(95), "1 hr 35 min");
  assert.equal(gapLabel(60), "1 hr");
  assert.equal(gapLabel(25), "25 min");
});

test("block labels name the day, time, course and what it clashes with", () => {
  const block = { id: "x", day: "Tue", start: "16:00", end: "17:50", title: "Administrative Law", section: "2020-2", online: false, preview: false, conflict: true };
  assert.equal(blockLabel(block, { conflictNames: new Map([["x", ["Criminal Defense Ethics"]]]) }),
    "Tuesday 4:00pm to 5:50pm, Administrative Law, section 2020-2, conflicts with Criminal Defense Ethics");
  assert.match(blockLabel({ ...block, preview: true, online: true, conflict: false }), /online or hybrid, preview, not in your plan$/);
});

test("day header line counts classes and gives the span", () => {
  const [stat] = dayStats([sec("a", [m("Wed", "09:00", "10:00")]), sec("b", [m("Wed", "18:00", "19:50")])]);
  assert.equal(dayHeaderLine(stat, 2), "2 classes, 9:00am to 7:50pm");
  assert.equal(dayHeaderLine(undefined, 0), "No classes");
});

test("agenda lists each day in order with breaks, conflicts and unscheduled courses", () => {
  const a = sec("a", [m("Mon", "09:00", "10:00")]);
  const b = sec("b", [m("Mon", "12:00", "13:00")]);
  const c = sec("c", []);
  const model = agendaModel([b, a, c], { conflictNames: new Map([["a", ["Course b"]]]), previewIds: new Set(["b"]) });
  assert.equal(model.days.length, 1);
  assert.deepEqual(model.days[0].entries.map((e) => e.type === "gap" ? e.text : e.id), ["a", "2 hr break", "b"]);
  assert.deepEqual(model.days[0].entries[0].conflictWith, ["Course b"]);
  assert.equal(model.days[0].entries[2].preview, true);
  assert.deepEqual(model.unscheduled.map((u) => u.id), ["c"]);
});

test("summaryLine is empty for a day with no classes", () => {
  assert.equal(summaryLine(undefined), "");
});

test("the compact view keeps only days with classes", () => {
  const layout = layoutWeek([sec("a", [m("Tue", "10:00", "11:00")]), sec("b", [m("Thu", "10:00", "11:00")])], { busyDaysOnly: true });
  assert.deepEqual(layout.days, ["Tue", "Thu"]);
  assert.deepEqual(layoutWeek([], { busyDaysOnly: true }).days, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
});

test("shortRange drops a repeated am or pm", () => {
  assert.equal(shortRange("16:00", "17:50"), "4:00 to 5:50pm");
  assert.equal(shortRange("11:00", "12:25"), "11:00am to 12:25pm");
});
