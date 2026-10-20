// Usage counts, sent the same way the LITSA site's analytics.js sends its own events. Counterscale only
// counts page views, so each event is a view of a made-up path, /planner/ev/<name>[/<detail>], with
// /planner/ in the referrer field. Only names and details on the lists below can be sent. Search text,
// plan contents, year and division, share links and anything that identifies a person never are.
// eventPath and trackingAllowed are pure; track() sends and never throws.

// Filter controls on the page and the name each one is counted under. Keys are element ids.
export const FILTER_NAMES = {
  "f-term": "term",
  "f-division": "division",
  "f-delivery": "format",
  "f-area": "area",
  "f-credits": "credits",
  "f-reqs": "counts-toward",
  "f-avoid": "no-classes-on",
  "f-times": "time-of-day",
  "f-descriptions": "descriptions",
  "f-hide-conflicts": "hide-conflicts",
  "f-first-year": "first-year",
  "f-show-hidden": "show-hidden",
  "f-reset": "reset",
};
// The keys of SORTS in planner.js (a test keeps them in step).
export const SORT_NAMES = ["title", "number", "time", "credits", "professor"];
export const WARNING_TYPES = ["conflict", "duplicate", "prereq", "credits", "online", "exam"];
export const ERROR_KINDS = ["script", "promise", "data"];

const NO_DETAIL = null;
const EVENTS = {
  "add": NO_DETAIL, // the course number is checked separately
  "plan-b": NO_DETAIL,
  "view": ["list", "week", "day"],
  "share": ["create", "open"],
  "print": NO_DETAIL,
  "report": NO_DETAIL,
  "filter": Object.values(FILTER_NAMES),
  "sort": SORT_NAMES,
  "search": NO_DETAIL,
  "taken": NO_DETAIL,
  "not-interested": NO_DETAIL,
  "shortlist": NO_DETAIL,
  "warning": WARNING_TYPES,
  "err": ERROR_KINDS,
};
// Sent at most once per page load: search says someone searched, never how often or for what.
const ONCE_PER_LOAD = new Set(["search", "warning", "err"]);
const COURSE_NUMBER = /^\d{3,5}$/;
const REPEAT_MS = 2000;

export function eventPath(name, detail) {
  if (typeof name !== "string" || !Object.hasOwn(EVENTS, name)) return null;
  const base = `/planner/ev/${name}`;
  const hasDetail = detail !== undefined && detail !== null && detail !== "";
  if (name === "add") return hasDetail && typeof detail === "string" && COURSE_NUMBER.test(detail) ? `${base}/${detail}` : base;
  const allowed = EVENTS[name];
  if (!allowed) return hasDetail ? null : base;
  return typeof detail === "string" && allowed.includes(detail) ? `${base}/${detail}` : null;
}

// Whether this browser may send anything. The test hook lifts the automation and local-copy checks only;
// an opt-out at /me/ (litsa.notrack) always wins.
export function trackingAllowed({ webdriver = false, force = false, notrack = null, hostname = "" } = {}) {
  if (notrack === "1") return false;
  if (force === true) return true;
  if (webdriver) return false;
  const host = String(hostname).toLowerCase();
  if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) return false;
  return host === "suffolklitsa.org" || host === "www.suffolklitsa.org" || host.endsWith(".pages.dev");
}

// The same request analytics.js makes in hit(): site id, the site's host, the path, and the referrer field.
export function collectUrl(path) {
  return "https://analytics.suffolklitsa.org/collect?sid=litsa" +
    "&h=" + encodeURIComponent("https://suffolklitsa.org") +
    "&p=" + encodeURIComponent(path) + "&r=" + encodeURIComponent("/planner/");
}

// A tracker with its surroundings passed in, so the guards, repeat limit and once-per-load rule can be tested.
export function makeTracker({ env, send, now = () => Date.now() }) {
  const lastSent = new Map();
  const sentOnce = new Set();
  return function track(name, detail) {
    try {
      const path = eventPath(name, detail);
      if (!path || !trackingAllowed(env())) return false;
      if (ONCE_PER_LOAD.has(name)) {
        if (sentOnce.has(path)) return false;
        sentOnce.add(path);
      }
      const t = now();
      if (lastSent.has(path) && t - lastSent.get(path) < REPEAT_MS) return false;
      lastSent.set(path, t);
      send(collectUrl(path));
      return true;
    } catch {
      return false;
    }
  };
}

function browserEnv() {
  let notrack = null;
  try { notrack = localStorage.getItem("litsa.notrack"); } catch { /* storage blocked */ }
  return {
    webdriver: typeof navigator !== "undefined" && navigator.webdriver === true,
    force: typeof window !== "undefined" && window.LITSA_TRACK_FORCE === true,
    notrack,
    hostname: typeof location !== "undefined" ? location.hostname : "",
  };
}

function send(u) {
  try { fetch(u, { mode: "no-cors", keepalive: true }).catch(() => {}); }
  catch { (new Image()).src = u; }
}

export const track = makeTracker({ env: browserEnv, send });
