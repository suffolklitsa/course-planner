import datetime as dt
import unittest
from pathlib import Path

from scripts import import_exams as imp

FIXTURE = Path(__file__).parent / "fixtures" / "law-fall-exam-schedule-2026.txt"
WEEK2 = [dt.date(2026, 12, d) for d in range(7, 13)]


def part(lines, dates=WEEK2, start="9:30 AM", end="12:30 PM"):
    return imp.RowPart(dates, start, end, lines)


class RealSchedule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = imp.build(FIXTURE.read_text(encoding="utf-8"), "2026FA")
        cls.by_title = {(e["title"], e["instructor"]): e for e in cls.data["exams"]}

    def test_source_comes_from_the_header(self):
        self.assertEqual(self.data["term_code"], "2026FA")
        self.assertEqual(self.data["source"]["verified_at"], "2026-08-26")
        self.assertTrue(self.data["source"]["url"].endswith("/fall-exam-schedule"))

    def test_full_row_maps_column_groups_to_days_in_order(self):
        # Week of 7-DEC, 9:30 row: six column groups for six days.
        self.assertEqual(self.by_title[("1B Civil Procedure", "Glannon")]["date"], "2026-12-07")
        self.assertEqual(self.by_title[("Copyright Law", "Curtin")]["date"], "2026-12-08")
        self.assertEqual(self.by_title[("Business Entity Fundamentals WEB", "Pao")]["date"], "2026-12-09")
        self.assertEqual(self.by_title[("Professional Responsibility", "Ward")]["date"], "2026-12-10")
        self.assertEqual(self.by_title[("1C Criminal Law", "Pokorak")]["date"], "2026-12-11")
        self.assertEqual(self.by_title[("Evidence", "Cavallaro")]["date"], "2026-12-12")

    def test_times_are_24_hour(self):
        e = self.by_title[("Copyright Law", "Curtin")]
        self.assertEqual((e["start"], e["end"]), ("09:30", "12:30"))
        e = self.by_title[("4A Criminal Law", "Dai")]
        self.assertEqual((e["start"], e["end"]), ("14:00", "17:00"))

    def test_makeup_note_pins_its_column_to_saturday(self):
        # "Make up exams 12/7 ... 12/11" can only be on 12/12, and 4A Criminal Law sits below it.
        self.assertEqual(self.by_title[("4A Criminal Law", "Dai")]["date"], "2026-12-12")
        self.assertNotIn(("1D Civil Procedure", "Darden"), self.by_title)

    def test_remote_marker(self):
        self.assertEqual(self.by_title[("Advanced Torts WEB", "Rustad")]["mode"], "remote")
        self.assertEqual(self.by_title[("Antitrust", "Robertson")]["mode"], "in-person")

    def test_multi_line_titles_are_joined(self):
        self.assertIn(("Environmental Law Survey", "Cox"), self.by_title)
        self.assertIn(("State and Local Government", "Infranca"), self.by_title)
        self.assertIn(("Immigration: Business", "Maiona"), self.by_title)

    def test_ambiguous_cells_are_reported_not_dated(self):
        unparsed = "\n".join(self.data["unparsed"])
        self.assertIn("Family Law WEB / Scheuerman (9:30 AM to 12:30 PM, week of 2026-11-30", unparsed)
        self.assertIn("Commercial Law Survey WEB / Rustad", unparsed)
        self.assertIn("Intellectual Property Survey HYB / Karnakis", unparsed)
        self.assertIn("Torts APO / Dyson (2:00 PM to 5:00 PM, 2026-12-12; APO", unparsed)
        self.assertIn("READING DAY", unparsed)

    def test_every_cell_is_accounted_for(self):
        placed = len(self.data["exams"])
        reported = sum(1 for u in self.data["unparsed"] if "not an exam" not in u)
        self.assertEqual(placed + reported, 85)


class Header(unittest.TestCase):
    def test_dates_from_day_headers(self):
        text = "TIME MONDAY  30-NOVTUESDAY  1-DECWEDNESDAY  2-DECTHURSDAY  3-DECFRIDAY  4-DECSATURDAY  5-DEC"
        self.assertEqual(imp.parse_header_dates(text, 2026), [dt.date(2026, 11, 30) + dt.timedelta(days=i) for i in range(6)])

    def test_wrong_weekday_fails_loudly(self):
        with self.assertRaises(ValueError):
            imp.parse_header_dates("TIME MONDAY  1-DEC", 2026)


class Cells(unittest.TestCase):
    def test_instructor_and_glued_column_break(self):
        groups, problems = imp.parse_groups(part(["Trademark Law", "KarolAdvanced Survey ", "HJD", "DeFabritiis"]), 2026)
        self.assertEqual(problems, [])
        self.assertEqual([[(i.text, i.instructor) for i in g] for g in groups],
                         [[("Trademark Law", "Karol")], [("Advanced Survey HJD", "DeFabritiis")]])

    def test_break_before_a_section_code(self):
        groups, _ = imp.parse_groups(part(["Professional ", "Responsibility", "Boonin1B Criminal Law", "Cavallaro"]), 2026)
        self.assertEqual([[(i.text, i.instructor) for i in g] for g in groups],
                         [[("Professional Responsibility", "Boonin")], [("1B Criminal Law", "Cavallaro")]])

    def test_two_instructors(self):
        groups, _ = imp.parse_groups(part(["Labor Law", "Lev/Henry"]), 2026)
        self.assertEqual(groups[0][0].instructor, "Lev/Henry")

    def test_cells_without_instructors(self):
        groups, _ = imp.parse_groups(part(["1E Contracts", "Shabalala1C LPS", "1D LPS", "1E LPS"]), 2026)
        self.assertEqual([i.text for i in groups[1]], ["1C LPS", "1D LPS", "1E LPS"])
        self.assertEqual({i.instructor for i in groups[1]}, {""})

    def test_makeup_note_dates_and_glue(self):
        groups, _ = imp.parse_groups(part(["Make up exams 12/12, ", "12/144A LPS"]), 2026)
        note, lps = groups[0][0], groups[1][0]
        self.assertEqual((note.kind, note.text), ("note", "Make up exams 12/12, 12/14"))
        self.assertEqual(note.dates, ["2026-12-12", "2026-12-14"])
        self.assertEqual(lps.text, "4A LPS")

    def test_notices_take_their_own_columns(self):
        groups, _ = imp.parse_groups(part(["FALL CLASSES END READING DAY Family Law WEB", "Scheuerman"]), 2026)
        self.assertEqual([[i.kind for i in g] for g in groups], [["notice"], ["notice"], ["exam"]])
        self.assertEqual(groups[2][0].text, "Family Law WEB")


class Placement(unittest.TestCase):
    def test_fewer_groups_than_days_is_unknown(self):
        groups = [[imp.Item("exam", "A")], [imp.Item("exam", "B")]]
        self.assertEqual(imp.place_groups(groups, WEEK2), [None, None])

    def test_full_row_is_known(self):
        groups = [[imp.Item("exam", str(i))] for i in range(6)]
        self.assertEqual(imp.place_groups(groups, WEEK2), WEEK2)

    def test_makeup_note_rules_out_earlier_days(self):
        note = imp.Item("note", "Make up exams 12/11", dates=["2026-12-11"])
        groups = [[imp.Item("exam", "A")], [note]]
        self.assertEqual(imp.place_groups(groups, WEEK2), [None, dt.date(2026, 12, 12)])


if __name__ == "__main__":
    unittest.main()
