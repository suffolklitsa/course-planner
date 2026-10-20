// End-to-end checks of the planner as a student uses it. Data comes from the real data/courses.json,
// so the sections used here are picked by rule (for example "two spring sections that clash"), not by name.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { findConflicts } from "../../web/planner.js";
import { encodeShare } from "../../web/share.js";
import { buildCatalog, checkPrerequisites } from "../../web/prereq.js";

const data = JSON.parse(readFileSync(new URL("../../data/courses.json", import.meta.url)));
const spring = data.sections.filter((s) => s.term_code === "2027SP");
const timed = spring.filter((s) => s.meetings.length && !s.requirements.first_year);
const clash = (() => {
  for (const a of timed) for (const b of timed) {
    if (a.course_number !== b.course_number && findConflicts([a, b]).length) return [a, b];
  }
  throw new Error("no clashing pair in the data");
})();
const noClash = (() => {
  for (const a of timed) for (const b of timed) {
    if (a.course_number !== b.course_number && !findConflicts([a, b]).length) return [a, b];
  }
})();

// Analytics requests never reach the real server: every one is answered here and recorded.
// Tracking is off in automated browsers unless a test sets the hook, so most tests must send nothing.
let hits = [];
let forced = false;
test.beforeEach(async ({ context }) => {
  hits = [];
  forced = false;
  await context.route("**/analytics.suffolklitsa.org/**", (route) => {
    hits.push(route.request().url());
    return route.fulfill({ status: 204, body: "" });
  });
});
test.afterEach(() => {
  if (!forced) expect(hits).toEqual([]);
});
async function forceTracking(context) {
  forced = true;
  await context.addInitScript(() => { window.LITSA_TRACK_FORCE = true; });
}

async function fresh(page) {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.goto("./");
  await expect(page.locator("#count")).toContainText("courses");
}
const search = (page, text) => page.locator("#f-query").fill(text);
const card = (page, s) => page.locator(".card", { has: page.locator(".sec-line strong", { hasText: new RegExp(`^${s.section}$`) }) });
async function add(page, s) {
  await search(page, s.section);
  await card(page, s).locator(".sec", { hasText: s.section }).locator("button.add").click();
}

test("loads courses and says how fresh the data is", async ({ page }) => {
  await fresh(page);
  await expect(page.locator("#fresh")).toContainText("Course data checked");
  await expect(page.locator("#fresh")).toContainText("confirm in Workday");
  expect(await page.locator(".card").count()).toBeGreaterThan(10);
});

test("search finds a section by number and by a word only in its description", async ({ page }) => {
  await fresh(page);
  await search(page, clash[0].section);
  await expect(card(page, clash[0])).toBeVisible();
  const withDesc = spring.find((s) => s.description && s.description.split(/\W+/).some((w) => w.length > 9 && !s.title.toLowerCase().includes(w.toLowerCase())));
  const word = withDesc.description.split(/\W+/).find((w) => w.length > 9 && !withDesc.title.toLowerCase().includes(w.toLowerCase()));
  await search(page, word);
  await expect(page.locator(".matched").first()).toBeVisible();
});

test("adding clashing sections warns in the plan and marks the clash in results", async ({ page }) => {
  await fresh(page);
  await add(page, clash[0]);
  await search(page, clash[1].section);
  await expect(card(page, clash[1]).locator(".clash")).toContainText("Conflicts with");
  await add(page, clash[1]);
  await expect(page.locator("#checks")).toContainText("Time conflict");
  await expect(page.locator("#week .is-conflict").first()).toBeVisible();
});

test("hide-conflicts filter removes clashing sections", async ({ page }) => {
  await fresh(page);
  await add(page, clash[0]);
  await page.locator("#more-filters summary").click();
  await page.locator("#f-hide-conflicts").check();
  await search(page, clash[1].section);
  await expect(card(page, clash[1])).toHaveCount(0);
});

test("non-clashing plan says no conflicts, and lists sections for Workday", async ({ page }) => {
  await fresh(page);
  await add(page, noClash[0]);
  await add(page, noClash[1]);
  await expect(page.locator("#checks")).toContainText("No time conflicts");
  await page.locator("#a-workday").click();
  await expect(page.locator("#workday-rows tr")).toHaveCount(2);
  await expect(page.locator("#workday")).toContainText(noClash[0].section);
});

test("plans A and B are separate and copy across", async ({ page }) => {
  await fresh(page);
  await add(page, noClash[0]);
  await page.locator("#plan-B").click();
  await expect(page.locator("#chosen li")).toHaveCount(0);
  await page.locator("#plan-A").click();
  await page.locator("#a-copy-plan").click();
  await page.locator("#plan-B").click();
  await expect(page.locator("#chosen li")).toHaveCount(1);
});

test("not interested hides a course until you choose to show hidden ones", async ({ page }) => {
  await fresh(page);
  await search(page, noClash[0].section);
  await card(page, noClash[0]).locator("button.nope").click();
  await expect(card(page, noClash[0])).toHaveCount(0);
  await page.locator("#more-filters summary").click();
  await page.locator("#f-show-hidden").check();
  await expect(card(page, noClash[0])).toContainText("Not interested");
});

test("telling it you're a 2L hides first-year required sections", async ({ page }) => {
  await fresh(page);
  const firstYear = spring.find((s) => s.requirements.first_year);
  await page.locator("#p-year").selectOption("1L");
  await search(page, firstYear.section);
  await expect(card(page, firstYear)).toBeVisible();
  await page.locator("#p-year").selectOption("2L");
  await search(page, firstYear.section);
  await expect(card(page, firstYear)).toHaveCount(0);
});

test("day students under 12 credits get a note linking the rule", async ({ page }) => {
  await fresh(page);
  await page.locator("#p-division").selectOption("Day");
  await add(page, noClash[0]);
  await expect(page.locator("#checks")).toContainText("12-credit minimum");
});

test("the plan survives a reload and the shortlist works", async ({ page }) => {
  await fresh(page);
  await add(page, noClash[0]);
  await search(page, noClash[1].section);
  await card(page, noClash[1]).locator("button.star").first().click();
  await page.reload();
  await expect(page.locator("#chosen li")).toHaveCount(1);
  await expect(page.locator("#shortlist li")).toHaveCount(1);
});

test("a share link loads its sections into the plan", async ({ page }) => {
  await fresh(page);
  const hash = encodeShare({ term: "2027SP", plan: "B", ids: [noClash[0].id, noClash[1].id] });
  await page.goto(`./${hash}`);
  await expect(page.locator("#toast")).toContainText("Loaded a shared plan");
  await expect(page.locator("#plan-B")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#chosen li")).toHaveCount(2);
});

test("a saved section that disappeared is called out", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.setItem("litsa.planner.v2", JSON.stringify({ version: 2, plans: { A: ["2027SP-0000-9"], B: [] }, seen: { "2027SP-0000-9": "Gone Seminar (0000-9)" } })));
  await page.goto("./");
  await expect(page.locator("#missing")).toContainText("Gone Seminar (0000-9)");
  await page.locator("#drop-missing").click();
  await expect(page.locator("#missing")).toBeHidden();
});

test("details panel shows the description and a report link", async ({ page }) => {
  await fresh(page);
  await search(page, noClash[0].section);
  await card(page, noClash[0]).locator("button.details").click();
  await expect(page.locator("#detail")).toBeVisible();
  await expect(page.locator("#detail")).toContainText("Prerequisites");
  await expect(page.locator("#detail a", { hasText: "Report a problem" }).first()).toHaveAttribute("href", /issues\/new/);
});

test("calendar download produces an .ics file", async ({ page }) => {
  await fresh(page);
  await add(page, noClash[0]);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#a-ics").click()]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
});

test("pressing / jumps to search", async ({ page }) => {
  await fresh(page);
  await page.locator("h1").click();
  await page.keyboard.press("/");
  await expect(page.locator("#f-query")).toBeFocused();
  await expect(page.locator("#f-query")).toHaveValue("");
});

test("no sideways scrolling on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await add(page, noClash[0]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("no-Friday filter removes Friday sections", async ({ page }) => {
  await fresh(page);
  const fri = timed.find((s) => s.meetings.some((m) => m.day === "Fri"));
  test.skip(!fri, "no Friday sections this term");
  await search(page, fri.section);
  await expect(card(page, fri)).toBeVisible();
  await page.locator("#more-filters summary").click();
  await page.locator('#f-avoid input[value="Fri"]').check();
  await expect(card(page, fri)).toHaveCount(0);
});

test("sorting by credits puts the highest-credit courses first", async ({ page }) => {
  await fresh(page);
  await page.locator("#f-sort").selectOption("credits");
  const firstLine = await page.locator(".card .sec-line").first().innerText();
  const max = Math.max(...spring.filter((s) => !s.requirements.first_year || true).map((s) => s.credits));
  expect(firstLine).toContain(`${max} cr`);
});

test("a course with prerequisites shows a badge and a plan note", async ({ page }) => {
  await fresh(page);
  const catalog = buildCatalog(data.sections);
  const withPrereq = timed.find((s) => checkPrerequisites(s, { taken: new Set(), catalog }).status === "may-be-missing");
  await search(page, withPrereq.section);
  await expect(card(page, withPrereq).locator(".badge.prereq")).toBeVisible();
  await add(page, withPrereq);
  await expect(page.locator("#checks")).toContainText(withPrereq.title);
  await expect(page.locator("#checks")).toContainText(/may require/i);
});

test("printing shows the schedule and week, not the search", async ({ page }) => {
  await fresh(page);
  await add(page, noClash[0]);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".finder")).toBeHidden();
  await expect(page.locator(".schedule")).toBeVisible();
  await expect(page.locator("#week")).toBeVisible();
});

test("an empty plan hides the plan actions; adding a section shows them", async ({ page }) => {
  await fresh(page);
  await expect(page.locator("#actions")).toBeHidden();
  await expect(page.locator("#empty")).toBeVisible();
  await add(page, noClash[0]);
  await expect(page.locator("#actions")).toBeVisible();
  await expect(page.locator("#empty")).toBeHidden();
});

// ---- Week view: panel tabs, preview, readability, day by day ----

const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
const gapPair = (() => {
  for (const a of timed) for (const b of timed) {
    if (a.course_number === b.course_number) continue;
    for (const m of a.meetings) for (const n of b.meetings) {
      if (m.day === n.day && toMin(n.start) - toMin(m.end) >= 75 && !findConflicts([a, b]).length) return [a, b];
    }
  }
})();

test("the week shows in the schedule panel by default, and the tab choice is remembered", async ({ page }) => {
  await fresh(page);
  await page.evaluate(() => localStorage.removeItem("litsa.planner.view"));
  await page.reload();
  await expect(page.locator("#view-week")).toBeVisible();
  await add(page, noClash[0]);
  await page.locator("#view-tab-list").click();
  await expect(page.locator("#view-list")).toBeVisible();
  await expect(page.locator("#view-week")).toBeHidden();
  await page.reload();
  await expect(page.locator("#view-tab-list")).toHaveAttribute("aria-selected", "true");
});

test("hovering a section previews it in the week, and the preview names the clash", async ({ page }) => {
  await fresh(page);
  await page.locator("#view-tab-week").click();
  await add(page, clash[0]);
  await search(page, clash[1].section);
  const row = card(page, clash[1]).locator(".sec", { hasText: clash[1].section });
  await row.hover();
  const preview = page.locator("#week .week-block.is-preview").first();
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("aria-label", new RegExp(`preview, not in your plan, conflicts with ${clash[0].title}`));
  await page.locator("h1").hover();
  await expect(page.locator("#week .week-block.is-preview")).toHaveCount(0);
});

test("week blocks use readable text and say the time inside", async ({ page }) => {
  await fresh(page);
  await page.locator("#view-tab-week").click();
  await add(page, noClash[0]);
  const block = page.locator("#week .week-block").first();
  await expect(block.locator(".week-block-time")).toContainText("to");
  const size = await block.locator(".week-block-title").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(14);
});

test("conflicting blocks name the course they clash with", async ({ page }) => {
  await fresh(page);
  await page.locator("#view-tab-week").click();
  await add(page, clash[0]);
  await add(page, clash[1]);
  await expect(page.locator("#week .week-block.is-conflict").first()).toHaveAttribute("aria-label", /conflicts with /);
});

test("breaks between classes are written into the week and the day-by-day list", async ({ page }) => {
  test.skip(!gapPair, "no pair with a long break this term");
  await fresh(page);
  await page.locator("#view-tab-week").click();
  await add(page, gapPair[0]);
  await add(page, gapPair[1]);
  await expect(page.locator("#week .week-gap").first()).toContainText("break");
  await expect(page.locator("#week .week-dayname-sum").filter({ hasText: "2 classes" }).first()).toBeVisible();
  await page.locator("#view-tab-agenda").click();
  await expect(page.locator("#agenda .agenda-gap").first()).toContainText("break");
});

test("day by day lists classes in order and spells out conflicts", async ({ page }) => {
  await fresh(page);
  await add(page, clash[0]);
  await add(page, clash[1]);
  await page.locator("#view-tab-agenda").click();
  await expect(page.locator("#agenda .agenda-dayname").first()).toBeVisible();
  await expect(page.locator("#agenda .agenda-clash").first()).toContainText("Conflicts with");
});

test("phones open on the day-by-day list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await page.evaluate(() => localStorage.removeItem("litsa.planner.view"));
  await page.reload();
  await expect(page.locator("#view-agenda")).toBeVisible();
  await expect(page.locator("#view-tab-agenda")).toHaveAttribute("aria-selected", "true");
});

test("the full-size week opens in a dialog", async ({ page }) => {
  await fresh(page);
  await page.locator("#view-tab-week").click();
  await add(page, noClash[0]);
  await page.locator("#week-open").click();
  await expect(page.locator("#weekdlg")).toBeVisible();
  await expect(page.locator("#week-full .week-block").first()).toBeVisible();
});

// ---- Usage counts ----

const sentPaths = () => hits.map((u) => new URL(u).searchParams.get("p"));

test("usage counts send event names only, never search text, plan contents or the share link", async ({ page, context }) => {
  await forceTracking(context);
  await fresh(page);
  const needle = "Zqxv Distinctive Query";
  await search(page, needle);
  await expect(page.locator("#count")).toContainText("0 courses");
  await add(page, noClash[0]);
  await page.locator("#view-tab-list").click();
  await page.locator("#view-tab-week").click();
  await page.locator("#a-share").click();
  await expect(page.locator("#toast")).not.toBeEmpty();

  // Open the link the planner just made, in a second tab, the way a friend would.
  const hash = encodeShare({ term: "2027SP", plan: "A", ids: [noClash[0].id] });
  const other = await context.newPage();
  await other.goto(`./${hash}`);
  await other.locator("#c-yes").click();
  await expect(other.locator("#toast")).toContainText("Loaded a shared plan");

  const expected = ["/planner/ev/search", `/planner/ev/add/${noClash[0].course_number}`, "/planner/ev/view/list",
    "/planner/ev/view/week", "/planner/ev/share/create", "/planner/ev/share/open"];
  await expect.poll(() => expected.filter((p) => !sentPaths().includes(p))).toEqual([]);
  expect(sentPaths().filter((p) => p === "/planner/ev/search")).toHaveLength(1);

  for (const u of hits) {
    const url = new URL(u);
    const decoded = decodeURIComponent(u);
    expect(url.origin + url.pathname).toBe("https://analytics.suffolklitsa.org/collect");
    expect([...url.searchParams.keys()]).toEqual(["sid", "h", "p", "r"]);
    expect(url.searchParams.get("sid")).toBe("litsa");
    expect(url.searchParams.get("h")).toBe(new URL(page.url()).origin);
    expect(url.searchParams.get("r")).toBe("/planner/");
    expect(url.searchParams.get("p")).toMatch(/^\/planner\/ev\/[a-z-]+(\/[a-z0-9-]+)?$/);
    for (const text of [u, decoded]) {
      expect(text.toLowerCase()).not.toContain("zqxv");
      expect(text).not.toContain("#");
      expect(text).not.toContain(noClash[0].section);
      expect(text).not.toContain(noClash[0].id);
      expect(text).not.toContain("t=2027SP");
      expect(text).not.toContain("s=");
    }
  }
});

test("nothing is sent from an automated browser without the test hook", async ({ page, context }) => {
  await fresh(page);
  await search(page, "Zqxv Distinctive Query");
  await add(page, noClash[0]);
  await page.locator("#view-tab-week").click();
  await page.locator("#a-share").click();
  const hash = encodeShare({ term: "2027SP", plan: "A", ids: [noClash[0].id] });
  const other = await context.newPage();
  await other.goto(`./${hash}`);
  await other.locator("#c-yes").click();
  await expect(other.locator("#toast")).toContainText("Loaded a shared plan");
  await page.waitForTimeout(500);
  expect(hits).toEqual([]);
});
