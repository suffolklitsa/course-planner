// A prefilled GitHub issue for reporting a wrong section. Nothing about the student is included.

export const REPO = "https://github.com/suffolklitsa/course-planner";

export function reportUrl(section, checkedOn) {
  const title = `Data problem: ${section.section} ${section.title}`;
  const body = [
    "## What's wrong",
    "<!-- For example: the time changed, the section was cancelled, the professor is different. -->",
    "",
    "## What Suffolk's page or Workday says",
    "",
    "## Section in the planner",
    `- Section: ${section.section}`,
    `- Title: ${section.title}`,
    `- Term: ${section.term}`,
    `- Listed time: ${section.meetings.map((m) => `${m.day} ${m.start}-${m.end}`).join(", ") || "none"}`,
    `- Data checked: ${checkedOn || "unknown"}`,
  ].join("\n");
  const q = new URLSearchParams({ title, body, labels: "data problem" });
  return `${REPO}/issues/new?${q.toString()}`;
}
