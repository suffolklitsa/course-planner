import { test } from "node:test";
import assert from "node:assert/strict";
import { matchExams, unmatchedExams, examConflicts, examSummary } from "./exams.js";

const sec = (id, title, instructors, extra = {}) => ({ id, term_code: "2026FA", title, instructors, ...extra });
const exam = (title, instructor, date, start, end, mode = "in-person") => ({ title, instructor, date, start, end, mode });

test("titles match across word order, case, punctuation and abbreviations", () => {
  const sections = [
    sec("2026FA-104-1", "Civil Procedure 1B", ["Joseph Glannon"]),
    sec("2026FA-2989-1", "Immigration: Business", ["Matthew Maiona"]),
    sec("2026FA-2995-1", "Taxation of Mergers/Acquisitions WEB", ["Meredith Conway"]),
    sec("2026FA-120-1", "Legal Practice Skills 1A", ["Dyane O'Leary"]),
    sec("2026FA-120-2", "Legal Practice Skills 1A", ["Rosa Kim"]),
  ];
  const exams = [
    exam("1B Civil Procedure", "Glannon", "2026-12-07", "09:30", "12:30"),
    exam("IMMIGRATION BUSINESS", "Maiona", "2026-12-12", "09:30", "12:30"),
    exam("Taxation of Mergers and Acquisitions WEB", "Conway", "2026-12-14", "09:30", "12:30", "remote"),
    exam("1A LPS", "", "2026-12-18", "09:30", "12:30"),
  ];
  const m = matchExams(sections, exams);
  assert.equal(m.get("2026FA-104-1"), exams[0]);
  assert.equal(m.get("2026FA-2989-1"), exams[1]);
  assert.equal(m.get("2026FA-2995-1"), exams[2]);
  // An exam with no instructor covers every section of the title.
  assert.equal(m.get("2026FA-120-1"), exams[3]);
  assert.equal(m.get("2026FA-120-2"), exams[3]);
});

test("several sections of one title are told apart by instructor surname", () => {
  const sections = [
    sec("2026FA-2166-3", "Evidence", ["Serge Georges"]),
    sec("2026FA-2166-5", "Evidence", ["Rosanna Cavallaro"]),
    sec("2026FA-2166-2", "Evidence WEB", ["Maurice Dyson"]),
    sec("2026FA-2166-1", "Evidence", ["Timothy Wilton"]),
  ];
  const exams = [
    exam("Evidence", "Georges", "2026-12-03", "09:30", "12:30"),
    exam("Evidence", "Cavallaro", "2026-12-12", "09:30", "12:30"),
    exam("Evidence WEB", "Dyson", "2026-12-12", "18:00", "21:00", "remote"),
  ];
  const m = matchExams(sections, exams);
  assert.equal(m.get("2026FA-2166-3"), exams[0]);
  assert.equal(m.get("2026FA-2166-5"), exams[1]);
  assert.equal(m.get("2026FA-2166-2"), exams[2]);
  assert.equal(m.has("2026FA-2166-1"), false);
});

test("a title with one section matches without checking the instructor", () => {
  const m = matchExams([sec("2026FA-107-3", "Criminal Law 1C", ["Ann Santos"])],
    [exam("1C Criminal Law", "Pokorak", "2026-12-11", "09:30", "12:30")]);
  assert.equal(m.has("2026FA-107-3"), true);
});

test("a shortened exam title needs the instructor, and the WEB marker breaks ties", () => {
  const sections = [
    sec("2026FA-2398-4", "Advanced Survey of Core Legal Principles", ["Susan Simone Kang"]),
    sec("2026FA-2398-5", "Advanced Survey of Core Legal Principles WEB", ["Susan Simone Kang"]),
    sec("2026FA-2398-1", "Advanced Survey of Core Legal Principles", ["Jennifer Ciarimboli"]),
    sec("2026FA-2398-3", "Advanced Survey of Core Legal Principles", ["Jennifer Ciarimboli"]),
    sec("2026FA-2187-1", "Advanced Survey of Something Else", ["Pat Example"]),
  ];
  const exams = [
    exam("Advanced Survey", "Kang", "2026-12-04", "14:00", "17:00"),
    exam("Advanced Survey WEB", "Kang", "2026-12-04", "14:00", "17:00", "remote"),
    exam("Advanced Survey", "Ciarimboli", "2026-12-04", "14:00", "17:00"),
  ];
  const m = matchExams(sections, exams);
  assert.equal(m.get("2026FA-2398-4"), exams[0]);
  assert.equal(m.get("2026FA-2398-5"), exams[1]);
  assert.equal(m.get("2026FA-2398-1"), exams[2]);
  assert.equal(m.get("2026FA-2398-3"), exams[2]);
  assert.equal(m.has("2026FA-2187-1"), false);
});

test("identical entries at different times are left unmatched", () => {
  const sections = [sec("2026FA-2587-1", "Commercial Law Sales", ["Stephen McJohn"]), sec("2026FA-2587-3", "Commercial Law Sales", ["Christine Sullivan"])];
  const exams = [
    exam("Commercial Law Sales", "McJohn", "2026-12-15", "18:00", "21:00"),
    exam("Commercial Law Sales", "McJohn", "2026-12-16", "18:00", "21:00"),
  ];
  const m = matchExams(sections, exams);
  assert.equal(m.has("2026FA-2587-1"), false);
  assert.deepEqual(unmatchedExams(sections, exams), exams);
});

test("a whole exams file only matches its own term", () => {
  const file = { term_code: "2026FA", exams: [exam("Antitrust", "Robertson", "2026-12-12", "09:30", "12:30")] };
  const m = matchExams([sec("2027SP-2038-1", "Antitrust", ["Elbert Robertson"], { term_code: "2027SP" }), sec("2026FA-2038-1", "Antitrust", ["Elbert Robertson"])], file);
  assert.deepEqual([...m.keys()], ["2026FA-2038-1"]);
});

test("unmatchedExams lists exams no section claimed", () => {
  const exams = [exam("Antitrust", "Robertson", "2026-12-12", "09:30", "12:30"), exam("Emerging Issues WEB", "Rustad", "2026-12-08", "09:30", "12:30", "remote")];
  assert.deepEqual(unmatchedExams([sec("2026FA-2038-1", "Antitrust", ["Elbert Robertson"])], exams), [exams[1]]);
});

const A = exam("Copyright Law", "Curtin", "2026-12-08", "09:30", "12:30");
const B = exam("Law and Economics", "Robertson", "2026-12-08", "09:30", "12:30");
const C = exam("Trademark Law", "Karol", "2026-12-08", "14:00", "17:00");
const D = exam("Evidence", "Wilton", "2026-12-15", "16:30", "19:30");
const E = exam("Federal Income Tax", "Scuderi", "2026-12-15", "18:00", "21:00");
const map = new Map([["a", A], ["b", B], ["c", C], ["d", D], ["e", E], ["a2", A]]);
const pick = (...ids) => ids.map((id) => ({ id }));

test("two exams in the same slot conflict", () => {
  assert.deepEqual(examConflicts(pick("a", "b"), map), { sameSlot: [{ a: "a", b: "b", date: "2026-12-08", start: "09:30" }], sameDay: [] });
});

test("overlapping exam times count as the same slot", () => {
  assert.deepEqual(examConflicts(pick("d", "e"), map).sameSlot, [{ a: "d", b: "e", date: "2026-12-15", start: "18:00" }]);
  assert.deepEqual(examConflicts(pick("d", "e"), map).sameDay, []);
});

test("two separate exams on one date are a same-day conflict", () => {
  assert.deepEqual(examConflicts(pick("c", "a"), map), { sameSlot: [], sameDay: [{ ids: ["a", "c"], date: "2026-12-08" }] });
  const three = examConflicts(pick("a", "b", "c"), map);
  assert.equal(three.sameSlot.length, 1);
  assert.deepEqual(three.sameDay, [{ ids: ["a", "b", "c"], date: "2026-12-08" }]);
});

test("sections without exams, and sections sharing one exam, don't conflict", () => {
  assert.deepEqual(examConflicts(pick("a", "x", "y", "d"), map), { sameSlot: [], sameDay: [] });
  assert.deepEqual(examConflicts(pick("a", "a2"), map), { sameSlot: [], sameDay: [] });
});

test("examSummary gives the day, date and time, or nothing", () => {
  assert.equal(examSummary({ id: "a" }, map), "Exam Tue Dec 8, 9:30am");
  assert.equal(examSummary({ id: "d" }, map), "Exam Tue Dec 15, 4:30pm");
  assert.equal(examSummary({ id: "r" }, new Map([["r", exam("Advanced Torts WEB", "Rustad", "2026-12-10", "09:30", "12:30", "remote")]])), "Exam Thu Dec 10, 9:30am (remote)");
  assert.equal(examSummary({ id: "none" }, map), "");
});
