import { describeMeetings, findConflicts, totalCredits, duplicateCourses, matchesFilters } from "./planner.js";

const STORE_KEY = "litsa.planner.v1";
const PAGE = 40;
const $ = (id) => document.getElementById(id);

let all = [];
let byId = new Map();
let chosen = loadChosen();
let shown = PAGE;

function loadChosen() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveChosen() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(chosen));
  } catch {
    // Private windows can refuse storage; the planner still works for this visit.
  }
}

function filters() {
  return {
    term: $("f-term").value,
    query: $("f-query").value.trim(),
    division: $("f-division").value,
    delivery: $("f-delivery").value,
    requirements: [...document.querySelectorAll(".reqs input:checked")].map((i) => i.value),
  };
}

function badges(s) {
  const out = [];
  if (s.requirements.experiential) out.push("Experiential");
  if (s.requirements.writing) out.push("Writing requirement");
  if (s.requirements.ma_bar) out.push("Mass. bar course");
  if (s.requirements.clinic_or_internship) out.push("Clinic or internship");
  return out.map((b) => `<span class="badge">${b}</span>`).join("");
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function sectionCard(s) {
  const added = chosen.includes(s.id);
  const li = el(`<li class="card">
    <div class="card-main">
      <h3>${esc(s.title)}</h3>
      <p class="meta">${esc(s.section)} · ${s.credits} cr · ${esc(describeMeetings(s))}${s.division ? ` · ${esc(s.division)}` : ""} · ${esc(s.delivery)}</p>
      <p class="meta">${esc(s.instructors.join(", ") || "Instructor not listed")}</p>
      ${s.prerequisites ? `<p class="prereq">Prerequisites: ${esc(s.prerequisites)}</p>` : ""}
      <div class="badges">${badges(s)}</div>
    </div>
    <button type="button" class="${added ? "secondary" : "primary"}" aria-pressed="${added}">${added ? "Added" : "Add"}</button>
  </li>`);
  li.querySelector("button").addEventListener("click", () => toggle(s.id));
  return li;
}

function renderResults() {
  const f = filters();
  const matches = all.filter((s) => matchesFilters(s, f));
  $("count").textContent = `${matches.length} section${matches.length === 1 ? "" : "s"}`;
  const list = $("results");
  list.replaceChildren(...matches.slice(0, shown).map(sectionCard));
  $("more").hidden = matches.length <= shown;
}

function renderSchedule() {
  const picked = chosen.map((id) => byId.get(id)).filter(Boolean);
  $("credits").textContent = `${totalCredits(picked)} credit${totalCredits(picked) === 1 ? "" : "s"}`;
  $("empty").hidden = picked.length > 0;
  const warnings = [];
  for (const c of findConflicts(picked)) {
    warnings.push(`<li><strong>Time conflict:</strong> ${esc(byId.get(c.a).title)} and ${esc(byId.get(c.b).title)} overlap on ${c.days.join(", ")}.</li>`);
  }
  for (const ids of duplicateCourses(picked)) {
    warnings.push(`<li><strong>Same course twice:</strong> ${ids.map((id) => esc(byId.get(id).section)).join(" and ")} are sections of ${esc(byId.get(ids[0]).title)}.</li>`);
  }
  $("warnings").innerHTML = warnings.length ? `<ul class="warn">${warnings.join("")}</ul>` : "";
  $("chosen").replaceChildren(...picked.map((s) => {
    const li = el(`<li><div><strong>${esc(s.title)}</strong><br><span class="meta">${esc(s.section)} · ${s.credits} cr · ${esc(describeMeetings(s))}</span></div><button type="button" class="link" aria-label="Remove ${esc(s.title)}">Remove</button></li>`);
    li.querySelector("button").addEventListener("click", () => toggle(s.id));
    return li;
  }));
}

function toggle(id) {
  chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
  saveChosen();
  renderResults();
  renderSchedule();
}

function renderFooter(data) {
  const verified = data.sources.map((s) => s.verified_at).filter(Boolean).sort()[0];
  $("foot").innerHTML = `Course data from Suffolk Law's public course pages${verified ? `, checked ${esc(verified)}` : ""}. Built by LITSA's Build committee. <a href="https://github.com/suffolklitsa/course-planner">Source and issues on GitHub</a>.`;
}

async function start() {
  const res = await fetch("courses.json");
  const data = await res.json();
  all = data.sections;
  byId = new Map(all.map((s) => [s.id, s]));
  chosen = chosen.filter((id) => byId.has(id));
  const term = $("f-term");
  term.replaceChildren(...data.terms.map((t) => new Option(t.name, t.code)));
  term.value = data.terms.some((t) => t.code === "2027SP") ? "2027SP" : data.terms.at(-1).code;
  $("filters").addEventListener("input", () => { shown = PAGE; renderResults(); });
  $("filters").addEventListener("submit", (e) => e.preventDefault());
  $("more").addEventListener("click", () => { shown += PAGE; renderResults(); });
  renderFooter(data);
  renderResults();
  renderSchedule();
}

start().catch((err) => {
  $("count").textContent = "The course list didn't load. Refresh to try again.";
  console.error(err);
});
