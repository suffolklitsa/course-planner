# Decisions

Short records of choices that shape the planner, newest first.

**2026-10-20. Lives on the club site.** The planner is served at suffolklitsa.org/planner rather than as its own site: one address students already know, shared styling and analytics.

**2026-10-20. Data comes from the assistant, not a second scraper.** See ARCHITECTURE.md.

**2026-10-20. No framework, no dependencies.** Plain HTML, CSS and JavaScript modules, tested with Node's built-in runner and Python's unittest. Anyone can run it with what's already installed in a Codespace.

**2026-10-19. Student records stay in the browser.** Version 2 may let students paste their Workday progress report. FERPA limits what the school discloses from education records; a student choosing to paste their own record into a page that processes it only in their browser isn't a disclosure by the school. The design keeps it that way: no upload, no storage, nothing reaches LITSA. If any feature would ever store student records, review it with the Dean of Students first.

**2026-10-19. The survey is rules-based.** The same answers always give the same results, and every result explains which answers produced it. Weights live in an editable table so non-programmers can maintain them.

**2026-10-19. Workday stays the official audit.** The planner plans ahead and catches conflicts; it doesn't claim to certify graduation.
