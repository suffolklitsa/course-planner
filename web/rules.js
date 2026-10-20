// Planning checks with sources. Each check returns plain messages; none of them blocks anything.
// Rules come from Suffolk Law's Academic Rules and Regulations (linked in RULE_LINKS); keep them in sync.

import { totalCredits } from "./planner.js";

export const RULE_LINKS = {
  rules: "https://www.suffolk.edu/law/academics-clinics/student-life/policies-rules/academic-rules-regulations",
  requirements: "https://www.suffolk.edu/law/academics-clinics/juris-doctor/curriculum-requirements-accordian",
};

const ONLINE = new Set(["Online Synchronous", "Online Asynchronous", "Hybrid"]);
export const isOnline = (s) => ONLINE.has(s.delivery) || /online/i.test(s.delivery || "");

// Day students (outside the Accelerated JD) must take at least 12 credits a semester
// (Academic Rules, Day Division, "Credit Enrollment Requirements").
// Evening minimums vary by year, so the planner only states the day rule.
export function creditLoad(sections, profile = {}) {
  const credits = totalCredits(sections);
  const messages = [];
  if (sections.length && profile.division === "Day" && credits < 12) {
    messages.push({ level: "warn", text: `${credits} credits is under the 12-credit minimum for day students each semester.`, link: RULE_LINKS.rules });
  }
  return { credits, messages };
}

// Distance education: students on Academic Warning may take at most 1 distance course a semester,
// students on Guided Curriculum at most 2. The planner never asks about academic standing; it counts
// online courses and notes the limits so a student can check their own situation.
export function onlineCount(sections) {
  const online = sections.filter(isOnline);
  const messages = [];
  if (online.length >= 2) {
    messages.push({ level: "info", text: `${online.length} of your courses are online or hybrid. Students on Academic Warning or Guided Curriculum have limits on distance education courses.`, link: RULE_LINKS.rules });
  }
  return { count: online.length, messages };
}

// What this semester's schedule contributes to the JD requirements. Six upper-level experiential credits
// are required overall, and one course must satisfy the Legal Writing Requirement.
export function requirementTally(sections) {
  const experiential = sections.filter((s) => s.requirements.experiential).reduce((n, s) => n + s.credits, 0);
  const writing = sections.filter((s) => s.requirements.writing).map((s) => s.title);
  const bar = sections.filter((s) => s.requirements.ma_bar).map((s) => s.title);
  return { experiential, writing, bar };
}

export function allChecks(sections, profile) {
  return [...creditLoad(sections, profile).messages, ...onlineCount(sections).messages];
}
