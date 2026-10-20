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

// "12:00 to 1:25pm": the first am/pm is dropped when both times share it.
export function shortRange(start, end) {
  const a = formatTime(start);
  const b = formatTime(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -2)} to ${b}` : `${a} to ${b}`;
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

const isOnline = (s) => /online|hybrid/i.test(s.delivery || "");

function byTime(a, b) {
  return a.startMin - b.startMin || a.endMin - b.endMin || a.section.id.localeCompare(b.section.id);
}

export function layoutWeek(sections, { conflictIds = new Set(), previewIds = new Set(), busyDaysOnly = false } = {}) {
  const meetings = meetingsOf(sections);
  let days = DAY_ORDER.filter((d, i) => i < 5 || meetings.some((m) => m.day === d));
  // The compact view drops empty days so the remaining columns are wide enough to read.
  if (busyDaysOnly && meetings.length) days = DAY_ORDER.filter((d) => meetings.some((m) => m.day === d));

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
        preview: previewIds.has(m.section.id),
        online: isOnline(m.section),
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

// Free stretches of 30 minutes or more between classes on one day, after merging overlaps.
export function gapsForDay(sections, day, minMinutes = 30) {
  const items = meetingsOf(sections).filter((m) => m.day === day).sort(byTime);
  const merged = [];
  for (const m of items) {
    const last = merged[merged.length - 1];
    if (last && m.startMin <= last.endMin) last.endMin = Math.max(last.endMin, m.endMin);
    else merged.push({ startMin: m.startMin, endMin: m.endMin });
  }
  const gaps = [];
  for (let i = 1; i < merged.length; i++) {
    const minutes = merged[i].startMin - merged[i - 1].endMin;
    if (minutes >= minMinutes) gaps.push({ startMin: merged[i - 1].endMin, endMin: merged[i].startMin, minutes });
  }
  return gaps;
}

export function gapLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

// What a screen reader says for one block: day, time, course, section, format, and what it clashes with.
export function blockLabel(block, { conflictNames = new Map() } = {}) {
  const when = `${DAY_NAMES[block.day]} ${formatTime(block.start)} to ${formatTime(block.end)}`;
  const parts = [when, block.title, `section ${block.section}`];
  if (block.online) parts.push("online or hybrid");
  if (block.preview) parts.push("preview, not in your plan");
  const clash = conflictNames.get(block.id) || [];
  if (clash.length) parts.push(`conflicts with ${clash.join(" and ")}`);
  else if (block.conflict) parts.push("time conflict");
  return parts.join(", ");
}

// One line for the top of a day column: how many classes and the span of the day.
export function dayHeaderLine(stat, count) {
  if (!stat) return "No classes";
  return `${count} class${count === 1 ? "" : "es"}, ${formatTime(stat.first)} to ${formatTime(stat.last)}`;
}

// The day-by-day agenda: each day's classes in order, with breaks and conflicts written out.
export function agendaModel(sections, { conflictNames = new Map(), previewIds = new Set() } = {}) {
  const meetings = meetingsOf(sections).sort(byTime);
  const stats = new Map(dayStats(sections).map((x) => [x.day, x]));
  const days = [];
  for (const day of DAY_ORDER) {
    const items = meetings.filter((m) => m.day === day);
    if (!items.length) continue;
    const entries = [];
    let lastEnd = null;
    for (const m of items) {
      if (lastEnd !== null && m.startMin - lastEnd >= 30) entries.push({ type: "gap", minutes: m.startMin - lastEnd, text: `${gapLabel(m.startMin - lastEnd)} break` });
      entries.push({
        type: "class", id: m.section.id, title: m.section.title, section: m.section.section,
        start: m.start, end: m.end, when: `${formatTime(m.start)} to ${formatTime(m.end)}`,
        online: isOnline(m.section), preview: previewIds.has(m.section.id), conflictWith: conflictNames.get(m.section.id) || [],
      });
      lastEnd = lastEnd === null ? m.endMin : Math.max(lastEnd, m.endMin);
    }
    days.push({ day, dayName: DAY_NAMES[day], summary: summaryLine(stats.get(day)), entries });
  }
  const unscheduled = sections.filter((s) => !(s.meetings || []).length).map((s) => ({ id: s.id, title: s.title, section: s.section, preview: previewIds.has(s.id) }));
  return { days, unscheduled };
}

// ---- DOM ----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function summaryLine(stat) {
  if (!stat) return "";
  const parts = [`${stat.day}: ${formatTime(stat.first)} to ${formatTime(stat.last)}`];
  if (stat.backToBack.length) parts.push(`${stat.backToBack.length} back-to-back`);
  if (stat.longestGapMin >= 30) parts.push(`longest break ${gapLabel(stat.longestGapMin)}`);
  return parts.join(", ");
}

export function renderWeek(container, sections, { conflictIds = new Set(), previewIds = new Set(), conflictNames = new Map(), onSelect = () => {}, compact = false } = {}) {
  const layout = layoutWeek(sections, { conflictIds, previewIds, busyDaysOnly: compact });
  const span = layout.endMin - layout.startMin;
  const byId = new Map(sections.map((s) => [s.id, s]));
  const stats = new Map(dayStats(sections).map((x) => [x.day, x]));

  const root = el("div", compact ? "week is-compact" : "week");
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
    const head = el("div", "week-dayname");
    head.setAttribute("aria-hidden", "true");
    const count = new Set(layout.blocks.filter((b) => b.day === day && !b.preview).map((b) => b.id)).size;
    head.append(el("span", "week-dayname-day", day), el("span", "week-dayname-sum", dayHeaderLine(stats.get(day), count)));
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

  const planOnly = sections.filter((s) => !previewIds.has(s.id));
  layout.days.forEach((day, i) => {
    const col = el("div", "week-col");
    col.dataset.day = day;
    col.style.gridColumn = String(i + 2);
    col.setAttribute("role", "group");
    col.setAttribute("aria-label", `${DAY_NAMES[day]}: ${summaryLine(stats.get(day)) || "no classes"}`);
    for (const g of gapsForDay(planOnly, day, compact ? 60 : 45)) {
      const gap = el("span", "week-gap", `${gapLabel(g.minutes)} break`);
      gap.setAttribute("aria-hidden", "true");
      gap.style.top = `${((g.startMin - layout.startMin) / span) * 100}%`;
      gap.style.height = `${(g.minutes / span) * 100}%`;
      col.append(gap);
    }
    for (const b of layout.blocks.filter((x) => x.day === day)) {
      const btn = el("button", ["week-block", b.conflict && "is-conflict", b.preview && "is-preview"].filter(Boolean).join(" "));
      btn.type = "button";
      btn.style.top = `${b.topPct}%`;
      btn.style.height = `${b.heightPct}%`;
      btn.style.left = `${(b.lane / b.lanes) * 100}%`;
      btn.style.width = `${100 / b.lanes}%`;
      btn.setAttribute("aria-label", blockLabel(b, { conflictNames }));
      btn.title = blockLabel(b, { conflictNames });
      btn.append(el("span", "week-block-title", b.title), el("span", "week-block-time", shortRange(b.start, b.end)));
      const meta = el("span", "week-block-meta");
      meta.append(el("span", "week-block-sec", b.section));
      if (b.online) meta.append(el("span", "week-block-tag", "Online"));
      btn.append(meta);
      if (b.preview) btn.append(el("span", "week-block-flag", "Preview"));
      else if (b.conflict) btn.append(el("span", "week-block-flag", "Conflict"));
      if (b.preview) btn.tabIndex = -1;
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
      const btn = el("button", previewIds.has(id) ? "week-chip is-preview" : "week-chip");
      btn.type = "button";
      btn.textContent = `${s.title} (${s.section})${previewIds.has(id) ? ", preview" : ""}`;
      btn.addEventListener("click", () => onSelect(id));
      item.append(btn);
      list.append(item);
    }
    box.append(list);
    root.append(box);
  }

  container.replaceChildren(root);
  return layout;
}

// The agenda: a plain list by day, for screen readers and phones.
export function renderAgenda(container, sections, { conflictNames = new Map(), previewIds = new Set(), onSelect = () => {} } = {}) {
  const model = agendaModel(sections, { conflictNames, previewIds });
  const root = el("div", "agenda");
  if (!model.days.length && !model.unscheduled.length) {
    root.append(el("p", "agenda-empty", "No classes yet."));
    container.replaceChildren(root);
    return model;
  }
  for (const d of model.days) {
    const sec = el("section", "agenda-day");
    sec.append(el("h3", "agenda-dayname", d.dayName));
    sec.append(el("p", "agenda-sum", d.summary.replace(/^\w+: /, "")));
    const list = el("ul", "agenda-list");
    for (const e of d.entries) {
      if (e.type === "gap") { list.append(el("li", "agenda-gap", e.text)); continue; }
      const li = el("li", ["agenda-item", e.conflictWith.length && "is-conflict", e.preview && "is-preview"].filter(Boolean).join(" "));
      const btn = el("button", "agenda-open");
      btn.type = "button";
      btn.append(el("span", "agenda-time", e.when), el("span", "agenda-title", e.title));
      btn.addEventListener("click", () => onSelect(e.id));
      li.append(btn);
      const notes = [`Section ${e.section}`];
      if (e.online) notes.push("online or hybrid");
      if (e.preview) notes.push("preview, not in your plan");
      li.append(el("span", "agenda-meta", notes.join(" · ")));
      if (e.conflictWith.length) li.append(el("span", "agenda-clash", `Conflicts with ${e.conflictWith.join(" and ")}`));
      list.append(li);
    }
    sec.append(list);
    root.append(sec);
  }
  if (model.unscheduled.length) {
    const sec = el("section", "agenda-day");
    sec.append(el("h3", "agenda-dayname", "No set meeting time"));
    const list = el("ul", "agenda-list");
    for (const u of model.unscheduled) list.append(el("li", "agenda-item", `${u.title} (section ${u.section})${u.preview ? ", preview" : ""}`));
    sec.append(list);
    root.append(sec);
  }
  container.replaceChildren(root);
  return model;
}
