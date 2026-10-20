// The planner page. All logic lives in the imported modules; this file draws the page and wires it up.
import { describeMeetings, findConflicts, duplicateCourses, matchesFilters, groupByCourse, sortGroups, SORTS,
         conflictsWith, queryMatchedOnlyInDescription, totalCredits } from "./planner.js";
import * as st from "./state.js";
import { allChecks, requirementTally, RULE_LINKS } from "./rules.js";
import { freshnessNote, checkedOn } from "./freshness.js";
import { reportUrl } from "./report.js";
import { buildCatalog, checkPrerequisites, prerequisiteBadge } from "./prereq.js";
import { matchExams, examConflicts, examSummary } from "./exams.js";
import { encodeShare, decodeShare, sharedIds, buildIcs, icsFilename, workdayRows, workdayList, copyText } from "./share.js";
import { renderWeek, renderAgenda } from "./week.js";

const PAGE = 30;
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let data = null;
let all = [];
let byId = new Map();
let sectionsByCourse = new Map();
let examBySection = new Map();
let catalog = new Map();
let state = st.load();
let shown = PAGE;
let previewId = null;
const VIEW_KEY = "litsa.planner.view";
const VIEWS = ["list", "week", "agenda"];
let view = loadView();

// Phones default to the day-by-day list; five day columns don't fit at 390px.
function loadView() {
  try { const v = localStorage.getItem(VIEW_KEY); if (VIEWS.includes(v)) return v; } catch { /* storage blocked */ }
  return window.matchMedia && window.matchMedia("(max-width: 600px)").matches ? "agenda" : "week";
}
const OFFERINGS_URL = "https://www.suffolk.edu/law/academics-clinics/academic-resources/law-course-offerings";

function persist() { st.save(state); }
const chosen = () => st.chosenIds(state).map((id) => byId.get(id)).filter(Boolean);
const label = (s) => `${s.title} (${s.section})`;
const term = () => $("f-term").value;

function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.textContent = ""; }, 3000);
}

// ---------- filters ----------

function checkedValues(id) { return [...document.querySelectorAll(`#${id} input:checked`)].map((i) => i.value); }

function filters() {
  const hidden = $("f-show-hidden").checked ? null : new Set([...state.taken, ...state.notInterested]);
  return {
    term: term(),
    query: $("f-query").value.trim(),
    searchDescriptions: $("f-descriptions").checked,
    division: $("f-division").value,
    delivery: $("f-delivery").value,
    area: $("f-area").value,
    credits: $("f-credits").value,
    requirements: checkedValues("f-reqs"),
    avoidDays: checkedValues("f-avoid"),
    times: checkedValues("f-times"),
    hideFirstYear: !$("f-first-year").checked,
    hidden,
  };
}

function countActiveFilters() {
  const f = filters();
  const n = [f.division, f.delivery, f.area, f.credits].filter(Boolean).length + f.requirements.length + f.avoidDays.length + f.times.length
    + ($("f-hide-conflicts").checked ? 1 : 0) + ($("f-show-hidden").checked ? 1 : 0);
  $("filter-count").textContent = n ? `(${n} on)` : "";
}

function applyProfileDefaults() {
  const { year, division } = state.profile;
  $("p-year").value = year || "";
  $("p-division").value = division || "";
  // Upper-level students rarely need first-year required sections; 1Ls and students who haven't said see them.
  $("f-first-year").checked = !year || year === "1L";
  if (division && !$("f-division").value) $("f-division").value = division;
}

// ---------- results ----------

function sectionBadges(s) {
  const b = [];
  if (s.requirements.experiential) b.push("Experiential");
  if (s.requirements.writing) b.push("Writing requirement");
  if (s.requirements.ma_bar) b.push("Mass. bar course");
  if (s.requirements.clinic_or_internship) b.push("Clinic or internship");
  if (s.requirements.first_year) b.push("First-year required");
  return b;
}

function conflictNote(s) {
  const clashes = conflictsWith(s, chosen());
  if (!clashes.length) return "";
  const names = clashes.map((c) => `${esc(byId.get(c.id).title)} (${c.days.join(", ")})`).join("; ");
  return `<p class="clash"><span aria-hidden="true">⚠</span> Conflicts with ${names}</p>`;
}

function sectionRow(s, f) {
  const inPlan = st.chosenIds(state).includes(s.id);
  const starred = state.shortlist.includes(s.id);
  const exam = examSummary(s, examBySection);
  const row = el(`<li class="sec${inPlan ? " in-plan" : ""}">
    <div class="sec-main">
      <p class="sec-line"><strong>${esc(s.section)}</strong> · ${esc(describeMeetings(s))}${s.division ? ` · ${esc(s.division)}` : ""} · ${esc(s.delivery)} · ${s.credits} cr</p>
      <p class="meta">${esc(s.instructors.join(", ") || "Professor not listed")}${exam ? ` · ${esc(exam)}` : ""}</p>
      ${conflictNote(s)}
      ${queryMatchedOnlyInDescription(s, f.query) ? `<p class="meta matched">Matched in the course description</p>` : ""}
    </div>
    <div class="sec-actions">
      <button type="button" class="star" aria-pressed="${starred}" aria-label="${starred ? "Remove from" : "Add to"} shortlist: ${esc(label(s))}" title="Shortlist">${starred ? "★" : "☆"}</button>
      <button type="button" class="${inPlan ? "secondary" : "primary"} add" aria-pressed="${inPlan}">${inPlan ? `In Plan ${state.active}` : "Add"}</button>
    </div>
  </li>`);
  row.querySelector(".add").addEventListener("click", () => { previewId = null; state = st.toggleChosen(state, s.id, label(s)); persist(); render(); });
  // Hovering or focusing a section shows where it would land in the week, before adding it.
  row.addEventListener("mouseenter", () => setPreview(s.id));
  row.addEventListener("mouseleave", () => setPreview(null));
  row.addEventListener("focusin", () => setPreview(s.id));
  row.addEventListener("focusout", (e) => { if (!row.contains(e.relatedTarget)) setPreview(null); });
  row.querySelector(".star").addEventListener("click", () => { state = st.toggleShortlist(state, s.id, label(s)); persist(); render(); });
  return row;
}

function courseCard(g, f) {
  const first = g.sections[0];
  const taken = state.taken.includes(g.course_number);
  const notInterested = state.notInterested.includes(g.course_number);
  const prereq = prerequisiteBadge(first);
  const badges = [...new Set(g.sections.flatMap(sectionBadges))];
  const areas = [...new Set(first.areas_of_focus.map((a) => a.name))];
  const card = el(`<li class="card${taken || notInterested ? " is-hidden-course" : ""}">
    <div class="card-head">
      <h3><button type="button" class="title-btn">${esc(g.title)}</button></h3>
      <p class="meta">Course ${esc(g.course_number)} · ${g.sections.length} section${g.sections.length === 1 ? "" : "s"}${taken ? " · <strong>Marked taken</strong>" : ""}${notInterested ? " · <strong>Not interested</strong>" : ""}</p>
      <div class="badges">${badges.map((b) => `<span class="badge">${esc(b)}</span>`).join("")}${prereq ? `<span class="badge prereq">${esc(prereq)}</span>` : ""}${areas.slice(0, 2).map((a) => `<span class="badge area">${esc(a)}</span>`).join("")}</div>
    </div>
    <ol class="secs"></ol>
    <div class="card-actions">
      <button type="button" class="link details">Details</button>
      <button type="button" class="link taken" aria-pressed="${taken}">${taken ? "Unmark taken" : "Already taken"}</button>
      <button type="button" class="link nope" aria-pressed="${notInterested}">${notInterested ? "Show again" : "Not interested"}</button>
    </div>
  </li>`);
  const ol = card.querySelector(".secs");
  for (const s of g.sections) ol.append(sectionRow(s, f));
  const ids = g.sections.map((s) => s.id);
  card.querySelector(".details").addEventListener("click", () => openDetail(first.course_number));
  card.querySelector(".title-btn").addEventListener("click", () => openDetail(first.course_number));
  card.querySelector(".taken").addEventListener("click", () => { state = st.toggleTaken(state, g.course_number, idsAllTerms(g.course_number)); persist(); render(); toast(taken ? "Unmarked." : `Marked ${g.title} as taken.`); });
  card.querySelector(".nope").addEventListener("click", () => { state = st.toggleNotInterested(state, g.course_number, idsAllTerms(g.course_number)); persist(); render(); toast(notInterested ? "Showing it again." : `Hid ${g.title}.`); });
  return card;
}

function idsAllTerms(courseNumber) { return (sectionsByCourse.get(courseNumber) || []).map((s) => s.id); }

function renderResults() {
  const f = filters();
  let matches = all.filter((s) => matchesFilters(s, f));
  if ($("f-hide-conflicts").checked) matches = matches.filter((s) => st.chosenIds(state).includes(s.id) || !conflictsWith(s, chosen()).length);
  const groups = sortGroups(groupByCourse(matches), $("f-sort").value);
  const hiddenCount = state.taken.length + state.notInterested.length;
  $("count").textContent = `${groups.length} course${groups.length === 1 ? "" : "s"}, ${matches.length} section${matches.length === 1 ? "" : "s"}`
    + (hiddenCount && !$("f-show-hidden").checked ? ` · ${hiddenCount} hidden as taken or not interested` : "");
  $("results").replaceChildren(...groups.slice(0, shown).map((g) => courseCard(g, f)));
  $("more").hidden = groups.length <= shown;
  countActiveFilters();
}

// ---------- schedule panel ----------

function renderSchedule() {
  const picked = chosen();
  const credits = totalCredits(picked);
  for (const p of ["A", "B"]) { $(`plan-${p}`).setAttribute("aria-selected", String(state.active === p)); $(`plan-${p}`).textContent = `Plan ${p} (${state.plans[p].length})`; }
  $("a-copy-plan").textContent = `Copy to Plan ${state.active === "A" ? "B" : "A"}`;
  $("credits").textContent = `${credits} credit${credits === 1 ? "" : "s"}`;
  $("empty").hidden = picked.length > 0;
  $("actions").hidden = picked.length === 0;

  const warn = [];
  for (const c of findConflicts(picked)) warn.push(`<li class="bad"><strong>Time conflict:</strong> ${esc(byId.get(c.a).title)} and ${esc(byId.get(c.b).title)} overlap on ${c.days.join(", ")}.</li>`);
  for (const ids of duplicateCourses(picked)) warn.push(`<li class="bad"><strong>Same course twice:</strong> ${ids.map((id) => esc(byId.get(id).section)).join(" and ")} are sections of ${esc(byId.get(ids[0]).title)}.</li>`);
  const ex = examConflicts(picked, examBySection);
  for (const c of ex.sameSlot) warn.push(`<li class="bad"><strong>Exam conflict:</strong> ${esc(byId.get(c.a).title)} and ${esc(byId.get(c.b).title)} have exams at the same time (${esc(c.date)}).</li>`);
  for (const c of ex.sameDay) warn.push(`<li><strong>Two exams in one day:</strong> ${c.ids.map((id) => esc(byId.get(id).title)).join(" and ")} on ${esc(c.date)}.</li>`);
  for (const m of allChecks(picked, state.profile)) warn.push(`<li class="${m.level === "warn" ? "bad" : ""}">${esc(m.text)} <a href="${m.link}" target="_blank" rel="noopener">Rule</a></li>`);
  for (const s of picked) {
    const p = checkPrerequisites(s, { taken: new Set(state.taken), year: state.profile.year, division: state.profile.division, catalog });
    if (p.status === "may-be-missing" || p.status === "unchecked") warn.push(`<li><strong>${esc(s.title)}:</strong> ${p.messages.map(esc).join(" ")}</li>`);
  }
  if (picked.length && !examBySection.size) warn.push(`<li class="quiet">The planner doesn't have this term's exam schedule yet, so exam conflicts can't be checked.</li>`);
  if (picked.some((s) => !s.meetings.length)) warn.push(`<li class="quiet">Conflicts are checked only for sections with set meeting times.</li>`);
  const clear = picked.length && !findConflicts(picked).length && !duplicateCourses(picked).length;
  $("checks").innerHTML = (clear ? `<p class="ok">No time conflicts among sections with set meeting times.</p>` : "")
    + (warn.length ? `<ul class="warn">${warn.join("")}</ul>` : "");

  $("chosen").replaceChildren(...picked.map((s) => {
    const li = el(`<li><div><strong>${esc(s.title)}</strong><br><span class="meta">${esc(s.section)} · ${s.credits} cr · ${esc(describeMeetings(s))}</span></div><button type="button" class="link" aria-label="Remove ${esc(s.title)}">Remove</button></li>`);
    li.querySelector("button").addEventListener("click", () => { state = st.toggleChosen(state, s.id); persist(); render(); });
    return li;
  }));

  const t = requirementTally(picked);
  $("tally").innerHTML = picked.length ? `<h3>Toward your requirements</h3><ul>
      <li>Experiential credits this semester: <strong>${t.experiential}</strong> (six upper-level credits are required in total)</li>
      <li>Writing requirement: ${t.writing.length ? `can be met in ${t.writing.map(esc).join(", ")}` : "none of these courses is marked for it"}</li>
      ${t.bar.length ? `<li>Mass. bar courses: ${t.bar.map(esc).join(", ")}</li>` : ""}
    </ul><p class="quiet">From Suffolk's course tags. <a href="${RULE_LINKS.requirements}" target="_blank" rel="noopener">JD requirements</a></p>` : "";

  $("workday-rows").replaceChildren(...workdayRows(picked).map((r) => el(`<tr><td>${esc(r.section)}</td><td>${esc(r.title)}</td><td>${r.credits}</td><td>${esc(r.when)}</td></tr>`)));
  if (!picked.length) $("workday").hidden = true;

  const shortlisted = state.shortlist.map((id) => byId.get(id)).filter(Boolean);
  $("short-empty").hidden = shortlisted.length > 0;
  $("shortlist").replaceChildren(...shortlisted.map((s) => {
    const inPlan = st.chosenIds(state).includes(s.id);
    const li = el(`<li><div><strong>${esc(s.title)}</strong><br><span class="meta">${esc(s.section)} · ${esc(describeMeetings(s))}</span></div>
      <div class="row-actions"><button type="button" class="link add">${inPlan ? "In plan" : `Add to Plan ${state.active}`}</button><button type="button" class="link rm" aria-label="Remove ${esc(s.title)} from shortlist">Remove</button></div></li>`);
    li.querySelector(".add").disabled = inPlan;
    li.querySelector(".add").addEventListener("click", () => { state = st.toggleChosen(state, s.id, label(s)); persist(); render(); });
    li.querySelector(".rm").addEventListener("click", () => { state = st.toggleShortlist(state, s.id); persist(); render(); });
    return li;
  }));

  renderPlanViews();
}

function setPreview(id) {
  if (id && (st.chosenIds(state).includes(id) || byId.get(id)?.term_code !== term())) id = null;
  if (id === previewId) return;
  previewId = id;
  renderPlanViews();
}

// The plan as a week grid or a day-by-day list, with the previewed section drawn in if there is one.
function renderPlanViews() {
  const picked = chosen();
  const preview = previewId ? byId.get(previewId) : null;
  const drawn = preview ? [...picked, preview] : picked;
  const conflicts = findConflicts(drawn);
  const conflictIds = new Set(conflicts.flatMap((c) => [c.a, c.b]));
  const conflictNames = new Map();
  for (const c of conflicts) {
    conflictNames.set(c.a, [...(conflictNames.get(c.a) || []), byId.get(c.b).title]);
    conflictNames.set(c.b, [...(conflictNames.get(c.b) || []), byId.get(c.a).title]);
  }
  const previewIds = new Set(preview ? [preview.id] : []);
  const onSelect = (id) => openDetail(byId.get(id).course_number);
  for (const v of VIEWS) {
    $(`view-tab-${v}`).setAttribute("aria-selected", String(view === v));
    $(`view-tab-${v}`).tabIndex = view === v ? 0 : -1;
    $(`view-${v}`).hidden = view !== v;
  }
  if (view === "week") renderWeek($("week"), drawn, { conflictIds, previewIds, conflictNames, onSelect, compact: true });
  if (view === "agenda") renderAgenda($("agenda"), drawn, { conflictNames, previewIds, onSelect });
  if ($("weekdlg").open) renderWeek($("week-full"), drawn, { conflictIds, previewIds, conflictNames, onSelect });
}

function setView(v) {
  view = v;
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  renderPlanViews();
}

function renderMissing() {
  const missing = st.missingSaved(state, new Set(byId.keys()));
  const box = $("missing");
  box.hidden = !missing.length;
  if (!missing.length) return;
  box.innerHTML = `<p><strong>Some saved sections are no longer listed:</strong> ${missing.map((m) => esc(m.label)).join("; ")}. They may have been cancelled or renumbered; check Workday.</p>
    <button type="button" class="secondary" id="drop-missing">Remove them from my plans</button>`;
  $("drop-missing").addEventListener("click", () => { state = st.dropMissing(state, new Set(byId.keys())); persist(); render(); });
}

function render() {
  renderMissing();
  renderResults();
  renderSchedule();
}

// ---------- detail panel ----------

function openDetail(courseNumber) {
  const secs = (sectionsByCourse.get(courseNumber) || []).filter((s) => s.term_code === term());
  const list = secs.length ? secs : sectionsByCourse.get(courseNumber) || [];
  const s = list[0];
  if (!s) return;
  const p = checkPrerequisites(s, { taken: new Set(state.taken), year: state.profile.year, division: state.profile.division, catalog });
  const profs = [...new Set(list.flatMap((x) => x.instructors))];
  const otherByProf = profs.map((name) => {
    const others = all.filter((x) => x.term_code === s.term_code && x.course_number !== courseNumber && x.instructors.includes(name));
    return others.length ? `<li>${esc(name)} also teaches ${others.map((o) => esc(o.title)).join(", ")}</li>` : "";
  }).join("");
  $("detail-body").innerHTML = `
    <h2 id="detail-h">${esc(s.title)}</h2>
    <p class="meta">Course ${esc(courseNumber)} · ${esc(s.term)} · ${list.length} section${list.length === 1 ? "" : "s"}</p>
    <div class="badges">${[...new Set(list.flatMap(sectionBadges))].map((b) => `<span class="badge">${esc(b)}</span>`).join("")}</div>
    <h3>Sections</h3>
    <ul>${list.map((x) => `<li><strong>${esc(x.section)}</strong> · ${esc(describeMeetings(x))} · ${esc(x.instructors.join(", ") || "Professor not listed")} · ${esc(x.delivery)} · ${x.credits} cr${examSummary(x, examBySection) ? ` · ${esc(examSummary(x, examBySection))}` : ""} · <a href="${reportUrl(x, checkedOn(data))}" target="_blank" rel="noopener">Report a problem</a></li>`).join("")}</ul>
    <h3>Description</h3>
    <p>${esc(s.description || "Suffolk's listing has no description.")}</p>
    <h3>Prerequisites</h3>
    <p>${s.prerequisites ? esc(s.prerequisites) : "None listed."}</p>
    ${p.messages.length ? `<p class="meta">${p.messages.map(esc).join(" ")}</p>` : ""}
    ${s.areas_of_focus.length ? `<h3>Areas of focus</h3><p>${s.areas_of_focus.map((a) => `${esc(a.name)} (${a.level})`).join(", ")}</p>` : ""}
    ${s.concentrations.length ? `<h3>Concentrations</h3><p>${s.concentrations.map(esc).join(", ")}</p>` : ""}
    ${otherByProf ? `<h3>Same professors this term</h3><ul>${otherByProf}</ul>` : ""}
    <p><a href="${OFFERINGS_URL}" target="_blank" rel="noopener">Suffolk's course offerings page</a></p>`;
  const d = $("detail");
  if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
}

// ---------- actions ----------

function shareLink() { return `${location.origin}${location.pathname}${encodeShare({ term: term(), plan: state.active, ids: st.chosenIds(state) })}`; }

function confirmInPanel(text, onYes) {
  const box = $("confirm");
  box.hidden = false;
  box.innerHTML = `<p>${esc(text)}</p><button type="button" class="primary" id="c-yes">Yes</button> <button type="button" class="secondary" id="c-no">Cancel</button>`;
  $("c-yes").addEventListener("click", () => { box.hidden = true; onYes(); });
  $("c-no").addEventListener("click", () => { box.hidden = true; });
  $("c-yes").focus();
}

function wireViews() {
  for (const v of VIEWS) $(`view-tab-${v}`).addEventListener("click", () => setView(v));
  $("week-open").addEventListener("click", () => {
    const d = $("weekdlg");
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    renderPlanViews();
  });
}

function wireActions() {
  for (const p of ["A", "B"]) $(`plan-${p}`).addEventListener("click", () => { state = st.switchPlan(state, p); persist(); render(); });
  $("a-copy-plan").addEventListener("click", () => {
    const to = state.active === "A" ? "B" : "A";
    const go = () => { state = st.copyPlan(state, state.active, to); persist(); render(); toast(`Copied to Plan ${to}.`); };
    if (state.plans[to].length) confirmInPanel(`Replace the ${state.plans[to].length} sections in Plan ${to}?`, go); else go();
  });
  $("a-clear").addEventListener("click", () => confirmInPanel(`Clear all ${st.chosenIds(state).length} sections from Plan ${state.active}?`, () => { state = st.clearPlan(state); persist(); render(); }));
  $("a-workday").addEventListener("click", () => { const w = $("workday"); w.hidden = !w.hidden; if (!w.hidden) w.scrollIntoView({ block: "nearest" }); });
  $("a-workday-copy").addEventListener("click", async () => toast((await copyText(workdayList(chosen()))) ? "Copied the list." : "Couldn't copy; select the table instead."));
  $("a-share").addEventListener("click", async () => toast((await copyText(shareLink())) ? "Link copied. Anyone who opens it sees this plan." : shareLink()));
  $("a-ics").addEventListener("click", () => {
    const blob = new Blob([buildIcs(chosen(), { calendarName: `Suffolk Law ${data.terms.find((t) => t.code === term())?.name || ""} (LITSA planner)` })], { type: "text/calendar" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: icsFilename(term()) });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Calendar downloaded. Holidays and recess aren't removed; check against the academic calendar.");
  });
  $("a-print").addEventListener("click", () => { $("workday").hidden = false; window.print(); });
}

function wireFilters() {
  const rerender = () => { shown = PAGE; renderResults(); };
  $("filters").addEventListener("input", (e) => { if (e.target.id === "f-term") { renderSchedule(); } rerender(); });
  $("filters").addEventListener("submit", (e) => e.preventDefault());
  $("f-hide-conflicts").addEventListener("change", rerender);
  $("more").addEventListener("click", () => { shown += PAGE; renderResults(); });
  $("f-reset").addEventListener("click", () => {
    for (const i of document.querySelectorAll("#more-filters input[type=checkbox]")) i.checked = i.id === "f-descriptions";
    for (const id of ["f-division", "f-delivery", "f-area", "f-credits"]) $(id).value = "";
    applyProfileDefaults();
    rerender();
  });
  for (const id of ["p-year", "p-division"]) $(id).addEventListener("change", () => {
    state = st.setProfile(state, { year: $("p-year").value || null, division: $("p-division").value || null });
    persist();
    $("f-division").value = "";
    applyProfileDefaults();
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "select", "textarea"].includes(tag) || e.target.isContentEditable) return;
    e.preventDefault();
    $("f-query").focus();
  });
}

function fillOptions(sections) {
  const termSel = $("f-term");
  termSel.replaceChildren(...data.terms.map((t) => new Option(t.name, t.code)));
  termSel.value = data.terms.some((t) => t.code === "2027SP") ? "2027SP" : data.terms.at(-1).code;
  for (const [k, v] of Object.entries(SORTS)) $("f-sort").append(new Option(v.label, k));
  const areas = [...new Set(sections.flatMap((s) => s.areas_of_focus.map((a) => a.name)))].sort();
  $("f-area").append(...areas.map((a) => new Option(a, a)));
  const credits = [...new Set(sections.map((s) => s.credits))].sort((a, b) => a - b);
  $("f-credits").append(...credits.map((c) => new Option(`${c} credit${c === 1 ? "" : "s"}`, String(c))));
}

function applySharedLink() {
  const shared = decodeShare(location.hash);
  if (!shared) return;
  const ids = sharedIds(shared).filter((id) => byId.has(id));
  history.replaceState(null, "", location.pathname);
  if (!ids.length) return;
  $("f-term").value = shared.term;
  const plan = shared.plan || state.active;
  const apply = () => { state = st.switchPlan(state, plan); state = st.setChosen(state, ids); persist(); render(); toast(`Loaded a shared plan with ${ids.length} sections into Plan ${plan}.`); };
  if (state.plans[plan].length) confirmInPanel(`Someone shared a plan with ${ids.length} sections. Replace your Plan ${plan} with it?`, apply); else apply();
}

async function loadExams() {
  for (const t of data.terms) {
    try {
      const r = await fetch(`exams-${t.code}.json`);
      if (!r.ok) continue;
      const ex = await r.json();
      for (const [k, v] of matchExams(all.filter((s) => s.term_code === t.code), ex.exams)) examBySection.set(k, v);
    } catch { /* no exam schedule for this term yet */ }
  }
}

function renderFooter() {
  const f = freshnessNote(data);
  $("fresh").textContent = f.text;
  $("fresh").classList.toggle("stale", f.stale);
  $("foot").innerHTML = `Course data from <a href="${OFFERINGS_URL}">Suffolk Law's course offerings page</a>, checked ${esc(checkedOn(data) || "on an unknown date")}. Built by LITSA's Build committee. Something wrong? Use "Report a problem" on a section, or see the <a href="https://github.com/suffolklitsa/course-planner">source and issues on GitHub</a>.`;
}

async function start() {
  const res = await fetch("courses.json");
  data = await res.json();
  all = data.sections;
  byId = new Map(all.map((s) => [s.id, s]));
  catalog = buildCatalog(all);
  for (const s of all) sectionsByCourse.set(s.course_number, [...(sectionsByCourse.get(s.course_number) || []), s]);
  fillOptions(all);
  applyProfileDefaults();
  await loadExams();
  wireFilters();
  wireActions();
  wireViews();
  renderFooter();
  render();
  applySharedLink();
  // A share link pasted into a tab that already has the planner open changes only the hash.
  window.addEventListener("hashchange", applySharedLink);
}

start().catch((err) => {
  $("count").textContent = "The course list didn't load. Refresh to try again.";
  console.error(err);
});
