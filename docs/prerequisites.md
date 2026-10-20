# Prerequisites

Suffolk lists prerequisites as free text in the `prerequisites` field of `data/courses.json`. This page lists every string in the data, says what the planner reads it as, and names the current courses it points to. The parser is `web/prereq.js`. Its tests are in `web/prereq.test.js`.

The planner only warns. It never blocks a choice, and every message says "may". The Registrar has the final word.

## What's in the data

- 447 sections. 140 have prerequisite text: 50 in Fall 2026 and 90 in Spring 2027.
- 43 distinct strings.
- None asks for instructor permission and none names a concentration.

## What the LAW numbers mean

The numbers in "LAW 2166" use the same numbering as `course_number`. Both 3-digit and 4-digit numbers appear. The 1L courses have 3-digit numbers (Contracts is 151, Torts is 153, Constitutional Law is 156).

We checked this against the data, not against a Suffolk source. The numbers that match line up by subject:

- Criminal Procedure lists LAW 156 and LAW 552. Both are Constitutional Law sections.
- Trusts and Estates lists LAW 102 and LAW 505. Both are Property sections.
- Estate Planning lists LAW 2500, which is Trusts and Estates.
- The tax courses list LAW 2200, which is Federal Income Taxation.
- The two Title IX courses each exclude the other by number.

The strings name 46 different numbers. 32 match a `course_number` in this year's data. 14 don't:

158, 451, 453, 829, 923, 924, 972, 2022, 2345, 2427, 2636, 2699, 2715, 2818.

These may be courses not offered in 2026-27, old numbers, or versions for other divisions. We don't know which, so the planner doesn't guess. It shows the raw number and says it couldn't check it.

A number counts as matched only when it equals a `course_number` exactly. Course numbers with a leading zero (0022, 0082, 0233) are not padded or trimmed. No prerequisite string names them.

## How the planner reads the text

- A leading "LAW" or "Law" with no number after it is a subject label. The planner ignores it.
- A run of courses ending in "or", such as "Law 156 LAW 158 or LAW 552", means one of them. Suffolk's export seems to drop the commas. The courses in each run cover the same subject, which supports this reading.
- Courses in parentheses form a group. Groups joined by "and" each need one course. Example: "(LAW 2166 or LAW 2298) and (LAW 104 or LAW 451)".
- "Has Not Taken" and "Not Taken" list courses that may close this one to you if you've taken them.
- "Courses are Not Law 2101" appears on Commercial Law Sales, and Commercial Law Survey (2101) says the same about Commercial Law Sales. The planner reads it like "Has Not Taken". This is our reading of the pattern, not a Suffolk definition.
- "Has Completed or In Progress" means taking the course in the same term may count.
- "(JD Day and 2L/3L)" means Day division students in their second or third year. The planner checks it against the year and division the student sets.

## Every string

Counts are sections, fall then spring.

### Course required

| Text | Sections | Meaning | Current courses named |
|---|---|---|---|
| Law 2136 | 1 / 2 | May require Business Entity Fundamentals. | 2136 Business Entity Fundamentals |
| Law 2200 | 2 / 1 | May require Federal Income Taxation. | 2200 Federal Income Taxation |
| Law 2166 | 0 / 1 | May require Evidence. | 2166 Evidence |
| Law 2500 | 1 / 0 | May require Trusts and Estates. | 2500 Trusts and Estates |
| Law 2518 Has Completed or In Progress | 1 / 1 | May require Appellate Practice, taken before or in the same term. | 2518 Appellate Practice |

### One of several courses

| Text | Sections | Meaning | Current courses named |
|---|---|---|---|
| Law 156 LAW 158 or LAW 552 | 5 / 5 | One Constitutional Law course. | 156 and 552 Constitutional Law. 158 not found. |
| Law 156 or LAW 552 | 0 / 1 | One Constitutional Law course. | 156 and 552 Constitutional Law |
| Law 151 or LAW 452 | 3 / 2 | One Contracts course. | 151 and 452 Contracts |
| Law 102 or Law 505 | 2 / 1 | One Property course. | 102 and 505 Property |
| Law 153 or LAW 453 | 1 / 0 | Torts, or LAW 453. | 153 Torts. 453 not found. |
| Law 2166 LAW 2699 or LAW 829 | 1 / 0 | Evidence, or one of two others. | 2166 Evidence. 2699 and 829 not found. |
| Law 2200 LAW 2715 or LAW 923 | 0 / 2 | Federal Income Taxation, or one of two others. | 2200 Federal Income Taxation. 2715 and 923 not found. |
| Law 2136 LAW 2636 or LAW 924 | 0 / 1 | Business Entity Fundamentals, or one of two others. | 2136 Business Entity Fundamentals. 2636 and 924 not found. |
| Law 2022 LAW 2136 LAW 2636 or LAW 924 | 0 / 1 | Business Entity Fundamentals, or one of three others. | 2136 Business Entity Fundamentals. 2022, 2636 and 924 not found. |
| Law 2818 LAW 2283 or LAW 972 | 0 / 1 | Negotiation, or one of two others. | 2283 Negotiation. 2818 and 972 not found. |
| Law (LAW 2166 or LAW 2298) and (LAW 104 or LAW 451) | 0 / 1 | Evidence or Patent Law, and Civil Procedure or LAW 451. | 2166 Evidence, 2298 Patent Law, 104 Civil Procedure. 451 not found. |
| Law 2216 LAW 2298 LAW 2362 or LAW 2618 and Has Not Taken LAW 8092 | 0 / 2 | One IP course, and not for students who took LAW 8092. | 2216 Intellectual Property Survey, 2298 Patent Law, 2362 Trademark Law, 2618 Copyright Law. Excludes 8092 Transactional Skills in Commercial & IP Practice. |
| LAW (LAW 151 or LAW 452) and Has Not Taken LAW 2736 | 1 / 0 | One Contracts course, and not for students who took LAW 2736. | 151 and 452 Contracts. Excludes 2736 Transactional Skills: Intel Property. |

### Not open if you took another course

| Text | Sections | Meaning | Current courses named |
|---|---|---|---|
| LAW Courses are Not Law 2101 | 3 / 4 | May be closed to students who took Commercial Law Survey. | 2101 Commercial Law Survey |
| LAW Courses are Not Law 2345 or Law 2587 | 1 / 1 | May be closed to students who took Commercial Law Sales or LAW 2345. | 2587 Commercial Law Sales. 2345 not found. |
| LAW Not Taken LAW 2185 | 2 / 2 | May be closed to students who took Family Law. | 2185 Family Law |
| LAW Not Taken LAW 2960 | 1 / 0 | May be closed to students who took Federal Criminal Practice Seminar. | 2960 Federal Criminal Practice Seminar |
| LAW Not Taken LAW 2427 | 0 / 1 | May be closed to students who took LAW 2427. | 2427 not found. |
| LAW Has Not Taken LAW 2591 | 1 / 0 | May be closed to students who took the other Title IX course. | 2591 Title IX and the Equal Protection Clause |
| LAW Has Not Taken LAW 2593 | 1 / 1 | May be closed to students who took the other Title IX course. | 2593 Title IX in Practice |
| LAW Has Not Taken LAW 2256 | 1 / 0 | May be closed to students who took Education, Equality and the Law. | 2256 Education, Equality and the Law |
| LAW Has Not Taken LAW 8030 | 1 / 0 | May be closed to students who took Schools, Race, and Money. | 8030 Schools, Race, and Money |

### Class year or division

| Text | Sections | Meaning | Current courses named |
|---|---|---|---|
| LAW (JD Day and 2L/3L) or (JD Evening and 3L/4L) | 5 / 0 | Day 2L or 3L, or Evening 3L or 4L. | None |
| LAW (JD Day and 2L/3L) or (JD Evening and 3L/4L) and Has Not Taken LAW 2177 or LAW 2489 | 1 / 1 | Same years, and not for students who took Fundamentals of Law I or II. | Excludes 2177 Fundamentals of Law I, 2489 Fundamentals of Law II |
| LAW ((JD Day and 2L/3L) or (JD Evening and 3L/4L)) and Has Not Taken LAW 2398 or LAW 2488 | 2 / 3 | Same years, and not for students who took either Advanced Survey course. | Excludes 2398 Advanced Survey of Core Legal Principles, 2488 Advanced Survey: Contracts, Evidence, Torts |
| LAW (Academic Warning and JD Day and 2L/3L) or (Academic Warning and JD Evening and 3L/4L) | 2 / 0 | Same years, and only for students on academic warning. The planner can't check academic warning. | None |

### 1L section

These sit on spring 1L sections. Each section is held for one 1L cohort. The planner doesn't know a student's section, so it can't check these.

| Text | Sections | Meaning |
|---|---|---|
| Student is Law Section A Cohort | 0 / 8 | For students in 1L Section A. |
| Student is Law Section B Cohort | 0 / 8 | For students in 1L Section B. |
| Student is Law Section C Cohort | 0 / 8 | For students in 1L Section C. |
| Student is Law Section D Cohort | 0 / 8 | For students in 1L Section D. |
| Student is Law Section E Cohort | 0 / 8 | For students in 1L Section E. |
| Student is Law Section 4A Cohort | 0 / 7 | For students in 1L Section 4A. |
| LAW Student is Law Section 4AP Cohort | 0 / 4 | For students in 1L Section 4AP. |

### Program of study

The planner doesn't know a student's program, so it can't check these.

| Text | Sections | Meaning |
|---|---|---|
| LAW Program of Study is MSLL | 2 / 2 | For students in the MSLL program. |
| LAW Program of Study LLM Law Programs | 2 / 1 | For LLM students. |
| LAW Program of Study SJD Program | 2 / 1 | For SJD students. |
| LAW Program Area is Academic Warning Programs | 4 / 0 | For students in an academic warning program. |

### Other

| Text | Sections | Meaning |
|---|---|---|
| LAW Course | 1 / 0 | On Legal Externship (0022). We couldn't tell what this means. The planner shows the text and says it couldn't read it. |

## Strings we couldn't interpret

- "LAW Course". It names no course, year or program.

The 14 unmatched numbers above are read correctly as course numbers, but we couldn't say which course each one is.

## Statuses

`checkPrerequisites` returns one of these:

- `none`: no prerequisite text.
- `met`: everything the planner could check looks fine.
- `may-be-missing`: the student hasn't marked a listed course as taken, has taken an excluded course, or doesn't fit the class year or division rule.
- `unchecked`: something couldn't be checked. Causes are an unmatched number, a 1L section, a program, academic warning, a missing year or division, or text the parser couldn't read.

When both apply, `may-be-missing` wins and the messages list both.
