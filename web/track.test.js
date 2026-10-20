import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventPath, trackingAllowed, collectUrl, makeTracker, track, FILTER_NAMES, SORT_NAMES } from "./track.js";
import { SORTS } from "./planner.js";

const LIVE = { webdriver: false, force: false, notrack: null, hostname: "suffolklitsa.org" };

test("eventPath builds paths for every allowed event", () => {
  assert.equal(eventPath("add"), "/planner/ev/add");
  assert.equal(eventPath("add", "2155"), "/planner/ev/add/2155");
  assert.equal(eventPath("plan-b"), "/planner/ev/plan-b");
  for (const v of ["list", "week", "day"]) assert.equal(eventPath("view", v), `/planner/ev/view/${v}`);
  assert.equal(eventPath("share", "create"), "/planner/ev/share/create");
  assert.equal(eventPath("share", "open"), "/planner/ev/share/open");
  for (const n of ["print", "report", "search", "taken", "not-interested", "shortlist"]) assert.equal(eventPath(n), `/planner/ev/${n}`);
  assert.equal(eventPath("filter", "counts-toward"), "/planner/ev/filter/counts-toward");
  assert.equal(eventPath("sort", "credits"), "/planner/ev/sort/credits");
  for (const w of ["conflict", "duplicate", "prereq", "credits", "online", "exam"]) assert.equal(eventPath("warning", w), `/planner/ev/warning/${w}`);
  for (const e of ["script", "promise", "data"]) assert.equal(eventPath("err", e), `/planner/ev/err/${e}`);
});

test("eventPath returns null for anything off the lists", () => {
  assert.equal(eventPath("pageview"), null);
  assert.equal(eventPath(""), null);
  assert.equal(eventPath(undefined), null);
  assert.equal(eventPath("toString"), null);
  assert.equal(eventPath("view"), null);
  assert.equal(eventPath("view", "agenda"), null);
  assert.equal(eventPath("share", "https://suffolklitsa.org/planner/#t=2027SP&s=2155-1"), null);
  assert.equal(eventPath("filter", "Evidence"), null);
  assert.equal(eventPath("sort", "relevance"), null);
  assert.equal(eventPath("warning", "Time conflict: Evidence and Torts"), null);
  assert.equal(eventPath("err", "TypeError: x is undefined"), null);
  assert.equal(eventPath("print", "now"), null);
  assert.equal(eventPath("search", "constitutional law"), null);
});

test("add keeps only a bare course number and drops anything else to plain add", () => {
  assert.equal(eventPath("add", "12"), "/planner/ev/add");
  assert.equal(eventPath("add", "123"), "/planner/ev/add/123");
  assert.equal(eventPath("add", "12345"), "/planner/ev/add/12345");
  assert.equal(eventPath("add", "123456"), "/planner/ev/add");
  assert.equal(eventPath("add", "2155-1"), "/planner/ev/add");
  assert.equal(eventPath("add", "2027SP-2155-1"), "/planner/ev/add");
  assert.equal(eventPath("add", "2155#t=2027SP"), "/planner/ev/add");
  assert.equal(eventPath("add", "2155?q=jane"), "/planner/ev/add");
  assert.equal(eventPath("add", "2155\n"), "/planner/ev/add");
  assert.equal(eventPath("add", 2155), "/planner/ev/add");
  assert.equal(eventPath("add", "Evidence"), "/planner/ev/add");
});

test("no path ever carries a hash, a query or free text", () => {
  const junk = ["#t=2027SP&s=2155-1", "?q=x", "jane.doe@example.edu", "a b", "../x", "x/y", "%23", "2155-1,8068-1"];
  const names = ["add", "plan-b", "view", "share", "print", "report", "filter", "sort", "search", "taken", "not-interested", "shortlist", "warning", "err"];
  for (const n of names) for (const j of junk) {
    const p = eventPath(n, j);
    if (p === null) continue;
    assert.equal(p, `/planner/ev/${n}`, `${n} with ${j}`);
    assert.doesNotMatch(p, /[#?%@\s,]/);
  }
  const u = collectUrl(eventPath("add", "2155"));
  assert.equal(u, "https://analytics.suffolklitsa.org/collect?sid=litsa&h=https%3A%2F%2Fsuffolklitsa.org&p=%2Fplanner%2Fev%2Fadd%2F2155&r=%2Fplanner%2F");
  assert.doesNotMatch(u, /#/);
  assert.match(collectUrl("/planner/ev/print", "https://staging.suffolklitsa.pages.dev"), /&h=https%3A%2F%2Fstaging\.suffolklitsa\.pages\.dev&/);
});

test("sort names match the planner's sorts, and every filter name is a control on the page", () => {
  assert.deepEqual([...SORT_NAMES].sort(), Object.keys(SORTS).sort());
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const id of Object.keys(FILTER_NAMES)) assert.match(html, new RegExp(`id="${id}"`), id);
  for (const name of Object.values(FILTER_NAMES)) assert.match(name, /^[a-z-]+$/);
});

test("tracking runs only on the live site and its previews", () => {
  assert.equal(trackingAllowed(LIVE), true);
  assert.equal(trackingAllowed({ ...LIVE, hostname: "www.suffolklitsa.org" }), true);
  assert.equal(trackingAllowed({ ...LIVE, hostname: "staging.suffolklitsa.pages.dev" }), true);
  assert.equal(trackingAllowed({ ...LIVE, hostname: "localhost" }), false);
  assert.equal(trackingAllowed({ ...LIVE, hostname: "127.0.0.1" }), false);
  assert.equal(trackingAllowed({ ...LIVE, hostname: "[::1]" }), false);
  assert.equal(trackingAllowed({ ...LIVE, hostname: "example.com" }), false);
  assert.equal(trackingAllowed({ ...LIVE, hostname: "suffolklitsa.org.example.com" }), false);
  assert.equal(trackingAllowed({ ...LIVE, hostname: "" }), false);
  assert.equal(trackingAllowed(), false);
});

test("automation and opt-out stop tracking; the test hook lifts only automation and host checks", () => {
  assert.equal(trackingAllowed({ ...LIVE, webdriver: true }), false);
  assert.equal(trackingAllowed({ ...LIVE, notrack: "1" }), false);
  assert.equal(trackingAllowed({ ...LIVE, notrack: "0" }), true);
  assert.equal(trackingAllowed({ ...LIVE, webdriver: true, force: true }), true);
  assert.equal(trackingAllowed({ ...LIVE, webdriver: true, force: true, hostname: "127.0.0.1" }), true);
  assert.equal(trackingAllowed({ ...LIVE, webdriver: true, force: "true" }), false);
  assert.equal(trackingAllowed({ ...LIVE, force: true, notrack: "1" }), false);
});

function harness(env = LIVE) {
  const sent = [];
  let t = 0;
  const track = makeTracker({ env: () => env, send: (u) => sent.push(new URL(u).searchParams.get("p")), now: () => t });
  return { sent, track, advance: (ms) => { t += ms; } };
}

test("track sends nothing when tracking is off or the event is not allowed", () => {
  for (const env of [{ ...LIVE, webdriver: true }, { ...LIVE, notrack: "1" }, { ...LIVE, hostname: "localhost" }]) {
    const h = harness(env);
    assert.equal(h.track("print"), false);
    assert.deepEqual(h.sent, []);
  }
  const h = harness();
  assert.equal(h.track("search", "my query"), false);
  assert.deepEqual(h.sent, []);
});

test("the same event within two seconds counts once", () => {
  const h = harness();
  h.track("add", "2155");
  h.track("add", "2155");
  h.track("add", "8068");
  h.advance(1999);
  h.track("add", "2155");
  h.advance(1);
  h.track("add", "2155");
  assert.deepEqual(h.sent, ["/planner/ev/add/2155", "/planner/ev/add/8068", "/planner/ev/add/2155"]);
});

test("search, each warning type and each error kind are sent once per page load", () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {
    h.track("search");
    h.track("warning", "conflict");
    h.track("warning", "exam");
    h.track("err", "script");
    h.advance(5000);
  }
  assert.deepEqual(h.sent, ["/planner/ev/search", "/planner/ev/warning/conflict", "/planner/ev/warning/exam", "/planner/ev/err/script"]);
});

test("a once-per-load event that was blocked can still be sent later", () => {
  const env = { ...LIVE, notrack: "1" };
  const sent = [];
  const track = makeTracker({ env: () => env, send: (u) => sent.push(u), now: () => 0 });
  track("search");
  env.notrack = null;
  track("search");
  assert.equal(sent.length, 1);
});

test("track never throws, even if sending or reading the environment fails", () => {
  const boom = () => { throw new Error("blocked"); };
  assert.equal(makeTracker({ env: () => LIVE, send: boom })("print"), false);
  assert.equal(makeTracker({ env: boom, send: () => {} })("print"), false);
});

test("the page's tracker does nothing outside a browser on the site", () => {
  assert.equal(track("print"), false);
});
