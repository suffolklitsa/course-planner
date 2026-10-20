// Reads Suffolk's free-text prerequisites and compares them with what a student says they've taken.
// No DOM access here, so every function is testable with `node --test`. See docs/prerequisites.md.
//
// parsePrerequisites(text, catalog?) returns:
// {
//   raw: string,                 // Suffolk's text, trimmed
//   courseRefs: [CourseRef],     // every course the text asks for (flattened from `groups`)
//   groups: [[CourseRef]],       // take one course from each group
//   anyOf: boolean,              // true when there is one group with more than one course in it
//   concurrentOk: boolean,       // "Has Completed or In Progress": taking it the same term may count
//   excludedRefs: [CourseRef],   // "Has Not Taken" / "Courses are Not": may be closed if you took these
//   standing: [{ division: "Day"|"Evening"|null, years: ["2L", ...], programs: [string] }],
//                                // alternatives; meeting any one is enough
//   classYears: [string],        // every year named in `standing`
//   divisions: [string],         // every division named in `standing`
//   cohorts: [string],           // 1L sections, e.g. "A", "4AP"
//   programs: [string],          // programs of study, e.g. "MSLL", "SJD Program"
//   needsPermission: boolean,
//   unparsed: string,            // words the parser didn't recognize; "" when it read everything
// }
// CourseRef is { label: "LAW 2166", number: "2166", courseNumber: "2166"|null, title: "Evidence"|null }.
//
// `catalog` is a Map of course_number to title, from buildCatalog(sections). A LAW number gets a
// courseNumber only when it exactly matches a course_number in the catalog. Without a catalog,
// every courseNumber is null and checks come back "unchecked".

const YEARS = ["1L", "2L", "3L", "4L"];
const DIVISIONS = ["Day", "Evening"];
const COURSE_RE = /\blaw\s+(\d{3,4})\b/gi;

// "Property 1B", "Evidence WEB", "Civil Procedure APO" all become the plain course name.
function cleanTitle(title) {
  let t = title.trim();
  for (let prev = ""; prev !== t; ) {
    prev = t;
    t = t.replace(/\s+(WEB|HJD|HYB|APO|[1-9][A-Z]{1,2})$/, "");
  }
  return t;
}

export function buildCatalog(sections) {
  const counts = new Map();
  for (const s of sections) {
    const t = cleanTitle(s.title);
    if (!counts.has(s.course_number)) counts.set(s.course_number, new Map());
    const m = counts.get(s.course_number);
    m.set(t, (m.get(t) || 0) + 1);
  }
  const catalog = new Map();
  for (const [num, m] of counts) catalog.set(num, [...m].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  return catalog;
}

function refsIn(text, catalog) {
  return [...text.matchAll(COURSE_RE)].map(([, number]) => {
    const title = catalog && catalog.has(number) ? catalog.get(number) : null;
    return { label: `LAW ${number}`, number, courseNumber: title === null ? null : number, title };
  });
}

function emptyResult(raw) {
  return {
    raw, courseRefs: [], groups: [], anyOf: false, concurrentOk: false, excludedRefs: [], standing: [],
    classYears: [], divisions: [], cohorts: [], programs: [], needsPermission: false, unparsed: "",
  };
}

export function parsePrerequisites(text, catalog = null) {
  const raw = (text || "").replace(/\s+/g, " ").trim();
  const out = emptyResult(raw);
  if (!raw) return out;

  // A leading "LAW" or "Law" not followed by a number is a subject label, not a course.
  let rest = raw.replace(/^law\s+(?!\d)/i, "");

  // Exclusions sit at the end: "... and Has Not Taken LAW 2398 or LAW 2488".
  const notTaken = rest.match(/(?:\band\s+)?(?:\bhas\s+)?\bnot\s+taken\b(.*)$/i);
  if (notTaken) {
    out.excludedRefs.push(...refsIn(notTaken[1], catalog));
    rest = rest.slice(0, notTaken.index);
  }
  // "Courses are Not Law 2101" appears on courses that overlap that one. Read it the same way.
  const coursesNot = rest.match(/\bcourses\s+are\s+not\b(.*)$/i);
  if (coursesNot) {
    out.excludedRefs.push(...refsIn(coursesNot[1], catalog));
    rest = rest.slice(0, coursesNot.index);
  }

  if (/\bhas\s+completed\s+or\s+in\s+progress\b/i.test(rest)) {
    out.concurrentOk = true;
    rest = rest.replace(/\bhas\s+completed\s+or\s+in\s+progress\b/i, " ");
  }

  // "(JD Day and 2L/3L)", "(Academic Warning and JD Evening and 3L/4L)".
  rest = rest.replace(/\(([^()]*\bJD\s+(?:Day|Evening)\b[^()]*)\)/gi, (_, inner) => {
    const division = /\bJD\s+Day\b/i.test(inner) ? "Day" : /\bJD\s+Evening\b/i.test(inner) ? "Evening" : null;
    const years = (inner.match(/\b[1-4]L\b/gi) || []).map((y) => y.toUpperCase());
    const programs = /\bacademic\s+warning\b/i.test(inner) ? ["Academic Warning"] : [];
    out.standing.push({ division, years, programs });
    return " ";
  });
  out.classYears = YEARS.filter((y) => out.standing.some((s) => s.years.includes(y)));
  out.divisions = DIVISIONS.filter((d) => out.standing.some((s) => s.division === d));

  rest = rest.replace(/\b(?:student\s+is\s+)?law\s+section\s+(\w+)\s+cohort\b/gi, (_, c) => {
    out.cohorts.push(c.toUpperCase());
    return " ";
  });
  rest = rest.replace(/^\s*student\s+is\s+/i, " ");
  rest = rest.replace(/\bprogram\s+(?:of\s+study|area)(?:\s+is)?\s+(.+)$/i, (_, p) => {
    out.programs.push(p.trim());
    return " ";
  });

  if (/\b(permission|consent|approval)\b/i.test(rest)) {
    out.needsPermission = true;
    rest = rest.replace(/\b(?:instructor\s+|dean\s+)?(permission|consent|approval)\b(?:\s+of\s+(?:the\s+)?\w+)?/gi, " ");
  }

  // Course lists. Each "( ... )" is its own group. Outside parentheses, "and" starts a new group,
  // and a run like "Law 156 LAW 158 or LAW 552" is one "one of" list (Suffolk drops the commas).
  const chunks = [];
  rest = rest.replace(/\(([^()]*)\)/g, (whole, inner) => {
    if (!refsIn(inner, null).length) return whole;
    chunks.push(inner);
    return " and ";
  });
  chunks.push(...rest.split(/\band\b/i));
  for (const chunk of chunks) {
    const refs = refsIn(chunk, catalog);
    if (refs.length) out.groups.push(refs);
  }
  out.courseRefs = out.groups.flat();
  out.anyOf = out.groups.length === 1 && out.groups[0].length > 1;

  out.unparsed = rest
    .replace(COURSE_RE, " ")
    .replace(/\b(and|or)\b|[(),]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}

const refName = (r) => (r.title ? `${r.title} (${r.label})` : r.label);

function listWords(names, joiner) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${joiner} ${names[names.length - 1]}`;
}

const unmatchedMessage = (refs) =>
  refs.length > 1
    ? `Lists ${listWords(refs.map((r) => r.label), "and")}; couldn't match them to current courses. Check with the Registrar.`
    : `Lists ${refs[0].label}; couldn't match it to a current course. Check with the Registrar.`;

function standingWords(st) {
  const who = [...st.programs, st.division, st.years.join("/")].filter(Boolean).join(" ");
  return who || "some";
}

// true, false, or null when the planner doesn't know enough. A missing year or division is tried
// with every value, so a 3L passes "(Day and 2L/3L) or (Evening and 3L/4L)" without a division.
function standingResult(standing, year, division) {
  const outcomes = new Set();
  for (const y of year ? [year] : YEARS) {
    for (const d of division ? [division] : DIVISIONS) {
      const alts = standing.map((st) => {
        if ((st.division && st.division !== d) || (st.years.length && !st.years.includes(y))) return false;
        return st.programs.length ? null : true;
      });
      outcomes.add(alts.includes(true) ? true : alts.includes(null) ? null : false);
    }
  }
  return outcomes.size === 1 ? [...outcomes][0] : null;
}

export function checkPrerequisites(section, { taken = new Set(), year = null, division = null, catalog = null } = {}) {
  const p = parsePrerequisites(section.prerequisites, catalog);
  if (!p.raw) return { status: "none", messages: [] };

  const missing = [];
  const unchecked = [];
  const has = (r) => taken.has(r.number) || (r.courseNumber !== null && taken.has(r.courseNumber));

  for (const group of p.groups) {
    if (group.some(has)) continue;
    const names = listWords(group.map(refName), "or");
    const lead = group.length > 1 ? `May require one of ${names}` : `May require ${names}`;
    const when = p.concurrentOk ? ". Taking it the same term may count" : "";
    const unmatched = group.filter((r) => r.courseNumber === null);
    if (unmatched.length) unchecked.push(`${lead}${when}.`, unmatchedMessage(unmatched));
    else missing.push(`${lead}${when}.`);
  }

  for (const r of p.excludedRefs) {
    if (has(r)) missing.push(`May not be open to you because you took ${refName(r)}.`);
    else if (r.courseNumber === null) unchecked.push(`May not be open if you took ${r.label}. Couldn't match it to a current course. Check with the Registrar.`);
  }

  if (p.standing.length) {
    const result = standingResult(p.standing, year, division);
    if (result !== true) {
      const who = listWords(p.standing.map(standingWords), "or");
      if (result === null) {
        const askFor = !year || !division ? " Set your year and division to check." : " The planner can't check this.";
        unchecked.push(`May be only for ${who} students.${askFor}`);
      } else {
        missing.push(`May be only for ${who} students.`);
      }
    }
  }

  for (const c of p.cohorts) unchecked.push(`May be only for students in 1L Section ${c}. The planner can't check your section.`);
  for (const prog of p.programs) unchecked.push(`May be only for students in this program: ${prog}. The planner can't check this.`);
  if (p.needsPermission) unchecked.push("May need permission to enroll. Check with the Registrar.");
  if (p.unparsed) unchecked.push(`Suffolk lists "${p.raw}". The planner couldn't read this. Check with the Registrar.`);

  if (missing.length) return { status: "may-be-missing", messages: [...missing, ...unchecked] };
  if (unchecked.length) return { status: "unchecked", messages: unchecked };
  return { status: "met", messages: ["You seem to meet the listed prerequisites."] };
}

export function prerequisiteBadge(section) {
  const p = parsePrerequisites(section.prerequisites);
  if (!p.raw) return "";
  if (p.groups.length || p.unparsed) return "Has prerequisites";
  if (p.cohorts.length) return p.cohorts.length === 1 ? `1L Section ${p.cohorts[0]}` : "Some 1L sections";
  return "Has enrollment limits";
}
