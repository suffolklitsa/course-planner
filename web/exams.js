// Final exams: matching exam schedule entries to sections, and exam conflicts.
// No DOM access here, so every function is testable with `node --test`.

const STOPWORDS = new Set(["a", "an", "and", "for", "in", "of", "the", "to", "under", "law"]);
const ALIASES = { lps: ["legal", "practice", "skills"], ip: ["intellectual", "property"], tax: ["taxation"], adv: ["advanced"] };
const MARKERS = new Set(["web", "hjd", "hyb"]);
const SECTION_CODE = /^\d[a-z]$/;

// "1B Civil Procedure" and "Civil Procedure 1B" give the same key; "Family Law WEB" keys as "family"
// with marker "web". The exam schedule abbreviates, so LPS, IP and Tax are spelled out.
function parseTitle(title) {
  let words = String(title || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  let marker = "";
  if (words.length && MARKERS.has(words[words.length - 1])) marker = words.pop();
  if (words.length > 1 && SECTION_CODE.test(words[0])) words = [...words.slice(1), words[0]];
  words = words.flatMap((w) => ALIASES[w] || [w]).filter((w) => !STOPWORDS.has(w));
  return { key: words.join(" "), words, marker };
}

function surname(name) {
  const parts = name.toLowerCase().replace(/[^a-z\s-]/g, "").trim().split(/\s+/);
  return parts[parts.length - 1];
}

function sectionSurnames(section) {
  return new Set((section.instructors || []).flatMap((i) => i.split("|")).map((n) => n.trim()).filter(Boolean).map(surname));
}

function examSurnames(exam) {
  return (exam.instructor || "").split("/").map((n) => n.trim()).filter(Boolean).map(surname);
}

// An exam with no instructor ("1A LPS") covers every section of its title.
function teaches(exam, names) {
  const own = examSurnames(exam);
  return !own.length || own.some((n) => names.has(n));
}

function sameSlot(a, b) {
  return a.date === b.date && a.start === b.start && a.end === b.end;
}

function examList(exams) {
  return Array.isArray(exams) ? exams : (exams && exams.exams) || [];
}

// Accepts the exams array or the whole exams-<TERM>.json object (then only that term's sections match).
function sectionsFor(sections, exams) {
  const term = !Array.isArray(exams) && exams && exams.term_code;
  return term ? sections.filter((s) => s.term_code === term) : sections;
}

export function matchExams(sections, exams) {
  const list = examList(exams).map((exam) => ({ exam, ...parseTitle(exam.title) }));
  const pool = sectionsFor(sections, exams);
  const sectionsPerKey = new Map();
  for (const s of pool) {
    const { key } = parseTitle(s.title);
    sectionsPerKey.set(key, (sectionsPerKey.get(key) || 0) + 1);
  }
  const out = new Map();
  for (const s of pool) {
    const t = parseTitle(s.title);
    const names = sectionSurnames(s);
    let cands = list.filter((e) => e.key === t.key);
    // The instructor decides only when several sections, or several exams, share the title.
    if (cands.length > 1 || (sectionsPerKey.get(t.key) || 0) > 1) cands = cands.filter((e) => teaches(e.exam, names));
    if (!cands.length) {
      // Shortened exam titles ("Advanced Survey") match a longer section title only with the same instructor.
      const have = new Set(t.words);
      cands = list.filter((e) => e.words.length && e.words.every((w) => have.has(w)) && examSurnames(e.exam).some((n) => names.has(n)));
    }
    if (cands.length > 1) {
      const sameMarker = cands.filter((e) => e.marker === t.marker);
      if (sameMarker.length) cands = sameMarker;
    }
    if (cands.length > 1) {
      const most = Math.max(...cands.map((e) => e.words.length));
      cands = cands.filter((e) => e.words.length === most);
    }
    // Identical entries at one time are the same exam. Different times would be a guess, so skip.
    if (cands.length && cands.every((e) => sameSlot(e.exam, cands[0].exam))) out.set(s.id, cands[0].exam);
  }
  return out;
}

export function unmatchedExams(sections, exams) {
  const used = new Set(matchExams(sections, exams).values());
  return examList(exams).filter((e) => !used.has(e));
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(a, b) {
  return a.date === b.date && toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

// sameSlot: two chosen sections whose exams overlap in time on one date ("start" is when the overlap begins).
// sameDay: a date with two or more exams that don't overlap. Sections sharing one exam are not a conflict.
export function examConflicts(chosenSections, examBySection) {
  const withExam = chosenSections.filter((s) => examBySection.has(s.id)).map((s) => ({ id: s.id, exam: examBySection.get(s.id) }));
  const sameSlotOut = [];
  for (let i = 0; i < withExam.length; i++) {
    for (let j = i + 1; j < withExam.length; j++) {
      const a = withExam[i].exam;
      const b = withExam[j].exam;
      if (a === b || !overlaps(a, b)) continue;
      sameSlotOut.push({ a: withExam[i].id, b: withExam[j].id, date: a.date, start: a.start > b.start ? a.start : b.start });
    }
  }
  const byDate = new Map();
  for (const x of withExam) byDate.set(x.exam.date, [...(byDate.get(x.exam.date) || []), x]);
  const sameDay = [];
  for (const [date, list] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    const separate = list.some((x) => list.some((y) => x.exam !== y.exam && !overlaps(x.exam, y.exam)));
    if (!separate) continue;
    list.sort((x, y) => x.exam.start.localeCompare(y.exam.start) || x.id.localeCompare(y.id));
    sameDay.push({ ids: list.map((x) => x.id), date });
  }
  return { sameSlot: sameSlotOut, sameDay };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatClock(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
}

// "Exam Tue Dec 8, 9:30am", plus "(remote)" for remote exams. Empty when the section has no known exam.
export function examSummary(section, examBySection) {
  const exam = examBySection.get(section.id);
  if (!exam) return "";
  const [y, mo, d] = exam.date.split("-").map(Number);
  const day = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const text = `Exam ${day} ${MONTHS[mo - 1]} ${d}, ${formatClock(exam.start)}`;
  return exam.mode === "remote" ? `${text} (remote)` : text;
}
