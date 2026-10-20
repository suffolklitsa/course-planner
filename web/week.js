// Week view: a Mon to Fri grid of the chosen sections.
// layoutWeek and dayStats are pure and tested in week.test.js. renderWeek is the only function that touches the DOM.

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 17 * 60;
const BACK_TO_BACK_MIN = 10;

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 && h < 24 ? "pm" : "am";
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function formatTime(hhmm) {
  return minutesToLabel(toMinutes(hhmm));
}

// Every meeting with a known day and a positive length, as one flat list.
function meetingsOf(sections) {
  const out = [];
  for (const s of sections) {
    for (const m of s.meetings || []) {
      const startMin = toMinutes(m.start);
      const endMin = toMinutes(m.end);
      if (!DAY_ORDER.includes(m.day) || endMin <= startMin) continue;
      out.push({ section: s, day: m.day, start: m.start, end: m.end, startMin, endMin });
    }
  }
  return out;
}

function byTime(a, b) {
  return a.startMin - b.startMin || a.endMin - b.endMin || a.section.id.localeCompare(b.section.id);
}

export function layoutWeek(sections, { conflictIds = new Set() } = {}) {
  const meetings = meetingsOf(sections);
  const days = DAY_ORDER.filter((d, i) => i < 5 || meetings.some((m) => m.day === d));

  let startMin = DEFAULT_START;
  let endMin = DEFAULT_END;
  if (meetings.length) {
    startMin = Math.floor(Math.min(...meetings.map((m) => m.startMin)) / 30) * 30;
    endMin = Math.ceil(Math.max(...meetings.map((m) => m.endMin)) / 30) * 30;
  }
  const span = endMin - startMin;

  const blocks = [];
  for (const day of days) {
    const items = meetings.filter((m) => m.day === day).sort(byTime);
    // Blocks that overlap, directly or through a chain, form a cluster and share its width.
    // Within a cluster each block takes the lowest lane that is free when it starts.
    let cluster = [];
    let clusterEnd = -1;
    let laneEnds = [];
    const flush = () => {
      for (const b of cluster) b.lanes = laneEnds.length;
      cluster = [];
      laneEnds = [];
      clusterEnd = -1;
    };
    for (const m of items) {
      if (cluster.length && m.startMin >= clusterEnd) flush();
      let lane = laneEnds.findIndex((end) => end <= m.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(m.endMin);
      } else {
        laneEnds[lane] = m.endMin;
      }
      const block = {
        id: m.section.id,
        title: m.section.title,
        section: m.section.section,
        day,
        start: m.start,
        end: m.end,
        topPct: ((m.startMin - startMin) / span) * 100,
        heightPct: ((m.endMin - m.startMin) / span) * 100,
        lane,
        lanes: 1,
        conflict: conflictIds.has(m.section.id),
      };
      cluster.push(block);
      blocks.push(block);
      clusterEnd = Math.max(clusterEnd, m.endMin);
    }
    flush();
  }

  const unscheduled = sections.filter((s) => !(s.meetings || []).length).map((s) => s.id);
  return { days, startMin, endMin, blocks, unscheduled };
}

export function dayStats(sections) {
  const meetings = meetingsOf(sections);
  const out = [];
  for (const day of DAY_ORDER) {
    const items = meetings.filter((m) => m.day === day).sort(byTime);
    if (!items.length) continue;

    // Merge overlapping meetings so a conflict is not counted twice and gaps are real free time.
    const merged = [];
    for (const m of items) {
      const last = merged[merged.length - 1];
      if (last && m.startMin <= last.endMin) last.endMin = Math.max(last.endMin, m.endMin);
      else merged.push({ startMin: m.startMin, endMin: m.endMin });
    }
    const classMin = merged.reduce((sum, r) => sum + (r.endMin - r.startMin), 0);
    let longestGapMin = 0;
    for (let i = 1; i < merged.length; i++) longestGapMin = Math.max(longestGapMin, merged[i].startMin - merged[i - 1].endMin);

    // Back to back: the next class starts 0 to 10 minutes after one ends.
    const backToBack = [];
    for (const a of items) {
      for (const b of items) {
        const wait = b.startMin - a.endMin;
        if (a !== b && a.section.id !== b.section.id && wait >= 0 && wait <= BACK_TO_BACK_MIN) backToBack.push([a.section.id, b.section.id]);
      }
    }

    out.push({
      day,
      first: items[0].start,
      last: items.reduce((latest, m) => (m.endMin > latest.endMin ? m : latest)).end,
      hours: Math.round((classMin / 60) * 100) / 100,
      longestGapMin,
      backToBack,
    });
  }
  return out;
}

// ---- DOM ----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function gapLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function summaryLine(stat) {
  const parts = [`${stat.day}: ${formatTime(stat.first)} to ${formatTime(stat.last)}`];
  if (stat.backToBack.length) parts.push(`${stat.backToBack.length} back-to-back`);
  if (stat.longestGapMin >= 30) parts.push(`longest break ${gapLabel(stat.longestGapMin)}`);
  return parts.join(", ");
}

export function renderWeek(container, sections, { conflictIds = new Set(), onSelect = () => {} } = {}) {
  const layout = layoutWeek(sections, { conflictIds });
  const span = layout.endMin - layout.startMin;
  const byId = new Map(sections.map((s) => [s.id, s]));

  const root = el("div", "week");
  const scroll = el("div", "week-scroll");
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", "Week view of your schedule");
  scroll.tabIndex = 0;

  const grid = el("div", "week-grid");
  grid.style.setProperty("--week-days", String(layout.days.length));
  grid.style.setProperty("--week-span", String(span / 60));

  const corner = el("div", "week-corner");
  corner.setAttribute("aria-hidden", "true");
  grid.append(corner);
  for (const day of layout.days) {
    const head = el("div", "week-dayname", day);
    head.setAttribute("aria-hidden", "true");
    grid.append(head);
  }

  const hours = el("div", "week-hours");
  hours.setAttribute("aria-hidden", "true");
  const lines = el("div", "week-lines");
  lines.setAttribute("aria-hidden", "true");
  for (let min = Math.ceil(layout.startMin / 60) * 60; min <= layout.endMin; min += 60) {
    const top = `${((min - layout.startMin) / span) * 100}%`;
    if (min < layout.endMin) {
      const label = el("span", "week-hour", minutesToLabel(min));
      label.style.top = top;
      hours.append(label);
    }
    const line = el("span", "week-line");
    line.style.top = top;
    lines.append(line);
  }
  grid.append(hours, lines);

  layout.days.forEach((day, i) => {
    const col = el("div", "week-col");
    col.dataset.day = day;
    col.style.gridColumn = String(i + 2);
    col.setAttribute("role", "group");
    col.setAttribute("aria-label", DAY_NAMES[day]);
    for (const b of layout.blocks.filter((x) => x.day === day)) {
      const btn = el("button", b.conflict ? "week-block is-conflict" : "week-block");
      btn.type = "button";
      btn.style.top = `${b.topPct}%`;
      btn.style.height = `${b.heightPct}%`;
      btn.style.left = `${(b.lane / b.lanes) * 100}%`;
      btn.style.width = `${100 / b.lanes}%`;
      const when = `${formatTime(b.start)} to ${formatTime(b.end)}`;
      btn.setAttribute("aria-label", `${b.title}, section ${b.section}, ${DAY_NAMES[day]} ${when}${b.conflict ? ", time conflict" : ""}`);
      btn.title = `${b.title} (${b.section}), ${when}`;
      btn.append(el("span", "week-block-title", b.title), el("span", "week-block-meta", b.section));
      if (b.conflict) btn.append(el("span", "week-block-flag", "Conflict"));
      btn.addEventListener("click", () => onSelect(b.id));
      col.append(btn);
    }
    grid.append(col);
  });

  scroll.append(grid);
  root.append(scroll);

  if (layout.unscheduled.length) {
    const box = el("div", "week-unscheduled");
    box.append(el("h3", "week-subhead", "No set meeting time"));
    const list = el("ul", "week-unscheduled-list");
    for (const id of layout.unscheduled) {
      const s = byId.get(id);
      const item = el("li");
      const btn = el("button", "week-chip");
      btn.type = "button";
      btn.textContent = `${s.title} (${s.section})`;
      btn.addEventListener("click", () => onSelect(id));
      item.append(btn);
      list.append(item);
    }
    box.append(list);
    root.append(box);
  }

  const stats = dayStats(sections);
  if (stats.length) {
    const list = el("ul", "week-summary");
    list.setAttribute("aria-label", "Day by day");
    for (const stat of stats) list.append(el("li", "week-summary-day", summaryLine(stat)));
    root.append(list);
  }

  container.replaceChildren(root);
  return layout;
}
