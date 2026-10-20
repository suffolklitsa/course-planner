import json
import tempfile
import unittest
from pathlib import Path

from scripts import import_offerings as imp


class ParseMeeting(unittest.TestCase):
    def test_two_days(self):
        self.assertEqual(imp.parse_meeting("T_TH | 12:00 PM - 1:25 PM"), [
            {"day": "Tue", "start": "12:00", "end": "13:25"},
            {"day": "Thu", "start": "12:00", "end": "13:25"},
        ])

    def test_thursday_is_not_tuesday(self):
        self.assertEqual([m["day"] for m in imp.parse_meeting("TH | 8:00 PM - 9:50 PM")], ["Thu"])

    def test_different_times_on_different_days(self):
        self.assertEqual(imp.parse_meeting("F | 10:30 AM - 11:25 AM M_W | 10:30 AM - 11:55 AM"), [
            {"day": "Mon", "start": "10:30", "end": "11:55"},
            {"day": "Wed", "start": "10:30", "end": "11:55"},
            {"day": "Fri", "start": "10:30", "end": "11:25"},
        ])

    def test_asynchronous_has_no_meetings(self):
        self.assertEqual(imp.parse_meeting(""), [])

    def test_unknown_format_fails_loudly(self):
        with self.assertRaises(ValueError):
            imp.parse_meeting("TBA")


class Tags(unittest.TestCase):
    def test_requirements_areas_and_concentrations(self):
        req, areas, conc, other = imp.classify_tags([
            "Law - Experiential Learning",
            "Law Areas of Focus - Area of Focus Recommended Health and Biomedical",
            "Law Areas of Focus - Area of Focus Core Civil Litigation",
            "Law - Trial and Appellate Advocacy Concentration",
            "Law - Race, Equity and Law",
        ])
        self.assertTrue(req["experiential"])
        self.assertFalse(req["writing"])
        self.assertEqual(areas, [{"name": "Health and Biomedical", "level": "recommended"},
                                 {"name": "Civil Litigation", "level": "core"}])
        self.assertEqual(conc, ["Trial and Appellate Advocacy"])
        self.assertEqual(other, ["Law - Race, Equity and Law"])


class Build(unittest.TestCase):
    def test_end_to_end_on_a_tiny_source(self):
        row = {"title": "Entertainment Law", "section": "2155-1", "term": "Spring Law 2027", "status": "Open",
               "meeting": "T | 10:00 AM - 11:25 AM", "credits": 2.0, "delivery_mode": "In-Person",
               "prerequisites": "", "instructors": ["Stacey Lantagne"], "description": "x",
               "start_date": "2027-01-19-08:00", "end_date": "2027-05-14-07:00", "tags": []}
        block = {"term": "Spring 2027", "division": "Day", "day": "Tuesday", "time": "10:00 AM - 11:25 AM",
                 "section": "2155-1", "title": "Entertainment Law", "instructor": "Stacey Lantagne",
                 "delivery_mode": "In-Person", "room": ""}
        with tempfile.TemporaryDirectory() as d:
            src = Path(d)
            (src / f"{imp.OFFERINGS}.json").write_text(json.dumps([row]))
            (src / "law-spring-day-block-schedule-2027.json").write_text(json.dumps([block]))
            data = imp.build(src)
        s = data["sections"][0]
        self.assertEqual(s["id"], "2027SP-2155-1")
        self.assertEqual(s["division"], "Day")
        self.assertEqual(s["start_date"], "2027-01-19")
        self.assertEqual(data["terms"], [{"code": "2027SP", "name": "Spring 2027"}])


if __name__ == "__main__":
    unittest.main()
