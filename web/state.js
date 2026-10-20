// Everything a student saves, kept only in their own browser. Pure functions plus a storage adapter.
//
// Shape (version 2):
// {
//   version: 2,
//   profile: { year: "1L"|"2L"|"3L"|"4L"|null, division: "Day"|"Evening"|null },
//   plans: { A: [sectionId], B: [sectionId] },  active: "A"|"B",
//   shortlist: [sectionId],
//   taken: [courseNumber],          // courses already completed
//   notInterested: [courseNumber],  // hidden from results
//   seen: { sectionId: "Title (section)" }  // labels for saved sections, to explain ones that disappear
// }

export const STORE_KEY = "litsa.planner.v2";
const OLD_KEY = "litsa.planner.v1";
export const YEARS = ["1L", "2L", "3L", "4L"];

export function emptyState() {
  return { version: 2, profile: { year: null, division: null }, plans: { A: [], B: [] }, active: "A",
           shortlist: [], taken: [], notInterested: [], seen: {} };
}

const uniq = (xs) => [...new Set(xs)];
const arr = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string") : []);

// Accept anything (old versions, hand-edited storage, junk) and return a valid state.
export function normalize(raw) {
  const s = emptyState();
  if (Array.isArray(raw)) { s.plans.A = uniq(arr(raw)); return s; }  // version 1 saved a bare list
  if (!raw || typeof raw !== "object") return s;
  const p = raw.profile || {};
  s.profile.year = YEARS.includes(p.year) ? p.year : null;
  s.profile.division = p.division === "Day" || p.division === "Evening" ? p.division : null;
  s.plans.A = uniq(arr(raw.plans && raw.plans.A));
  s.plans.B = uniq(arr(raw.plans && raw.plans.B));
  s.active = raw.active === "B" ? "B" : "A";
  s.shortlist = uniq(arr(raw.shortlist));
  s.taken = uniq(arr(raw.taken));
  s.notInterested = uniq(arr(raw.notInterested));
  s.seen = raw.seen && typeof raw.seen === "object" ? Object.fromEntries(Object.entries(raw.seen).filter(([k, v]) => typeof v === "string")) : {};
  return s;
}

export const chosenIds = (s) => s.plans[s.active];

function toggleIn(list, value) { return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]; }

export function toggleChosen(s, id, label) {
  const plans = { ...s.plans, [s.active]: toggleIn(s.plans[s.active], id) };
  return { ...s, plans, seen: label ? { ...s.seen, [id]: label } : s.seen };
}
export function setChosen(s, ids) { return { ...s, plans: { ...s.plans, [s.active]: uniq(ids) } }; }
export function clearPlan(s) { return setChosen(s, []); }
export function switchPlan(s, plan) { return { ...s, active: plan === "B" ? "B" : "A" }; }
export function copyPlan(s, from, to) { return { ...s, plans: { ...s.plans, [to]: [...s.plans[from]] } }; }
export function toggleShortlist(s, id, label) { return { ...s, shortlist: toggleIn(s.shortlist, id), seen: label ? { ...s.seen, [id]: label } : s.seen }; }

// Marking a course taken or not interested removes its sections from both plans and the shortlist.
function dropCourse(s, courseNumber, idsForCourse) {
  const out = (ids) => ids.filter((id) => !idsForCourse.includes(id));
  return { ...s, plans: { A: out(s.plans.A), B: out(s.plans.B) }, shortlist: out(s.shortlist) };
}
export function toggleTaken(s, courseNumber, idsForCourse = []) {
  const marking = !s.taken.includes(courseNumber);
  const next = { ...s, taken: toggleIn(s.taken, courseNumber), notInterested: s.notInterested.filter((c) => c !== courseNumber) };
  return marking ? dropCourse(next, courseNumber, idsForCourse) : next;
}
export function toggleNotInterested(s, courseNumber, idsForCourse = []) {
  const marking = !s.notInterested.includes(courseNumber);
  const next = { ...s, notInterested: toggleIn(s.notInterested, courseNumber), taken: s.taken.filter((c) => c !== courseNumber) };
  return marking ? dropCourse(next, courseNumber, idsForCourse) : next;
}
export function setProfile(s, profile) { return normalize({ ...s, profile: { ...s.profile, ...profile } }); }

// Saved sections that are no longer in the data (cancelled or renumbered since they were saved).
export function missingSaved(s, knownIds) {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
  const all = uniq([...s.plans.A, ...s.plans.B, ...s.shortlist]);
  return all.filter((id) => !known.has(id)).map((id) => ({ id, label: s.seen[id] || id }));
}
export function dropMissing(s, knownIds) {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
  const keep = (ids) => ids.filter((id) => known.has(id));
  return { ...s, plans: { A: keep(s.plans.A), B: keep(s.plans.B) }, shortlist: keep(s.shortlist) };
}

// Storage adapter. Private windows and blocked storage throw; the planner still works for that visit.
export function load(storage = globalThis.localStorage) {
  try {
    const v2 = storage.getItem(STORE_KEY);
    if (v2) return normalize(JSON.parse(v2));
    const v1 = storage.getItem(OLD_KEY);
    if (v1) return normalize(JSON.parse(v1));
  } catch { /* fall through */ }
  return emptyState();
}
export function save(state, storage = globalThis.localStorage) {
  try { storage.setItem(STORE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
