from copy import deepcopy

from scripts.validate_data import problems


def valid_data() -> dict:
    return {
        "schema_version": 1,
        "sources": [{"id": "catalog", "url": "https://example.test/catalog", "fetched_at": "2027-01-01"}],
        "terms": [{"code": "2027SP", "name": "Spring 2027"}],
        "sections": [
            {
                "id": "2027SP-2155-1",
                "term": "Spring 2027",
                "term_code": "2027SP",
                "course_number": "2155",
                "section": "2155-1",
                "title": "Example Law",
                "credits": 2,
                "delivery": "In-Person",
                "division": "Day",
                "meetings": [{"day": "Tue", "start": "10:00", "end": "11:25"}],
                "start_date": "2027-01-19",
                "end_date": "2027-05-01",
                "instructors": ["Example Person"],
                "prerequisites": "",
                "requirements": {
                    "experiential": False,
                    "writing": False,
                    "ma_bar": False,
                    "first_year": False,
                    "clinic_or_internship": False,
                },
                "areas_of_focus": [{"name": "Civil Litigation", "level": "core"}],
                "concentrations": [],
                "tags": [],
                "description": "Example description",
            }
        ],
    }


def test_valid_data_passes():
    assert problems(valid_data()) == []


def test_rejects_section_contract_values():
    data = valid_data()
    section = data["sections"][0]
    section["delivery"] = "Unknown"
    section["division"] = "Night"
    section["term_code"] = "2027XX"
    section["requirements"]["writing"] = "yes"
    section["areas_of_focus"][0]["level"] = "optional"

    errors = problems(data)

    assert any("delivery must be" in error for error in errors)
    assert any("division must be" in error for error in errors)
    assert any("term_code must look" in error for error in errors)
    assert any("requirements values" in error for error in errors)
    assert any("areas_of_focus entries" in error for error in errors)


def test_rejects_reversed_dates_and_bad_source():
    data = valid_data()
    data["sources"][0] = {"id": "catalog", "url": "http://insecure.test", "fetched_at": "tomorrow"}
    data["sections"][0]["start_date"] = "2027-05-01"
    data["sections"][0]["end_date"] = "2027-01-19"

    errors = problems(data)

    assert any("url must start with https://" in error for error in errors)
    assert any("fetched_at must be YYYY-MM-DD" in error for error in errors)
    assert any("start_date must be on or before end_date" in error for error in errors)


def test_rejects_id_that_does_not_match_term_and_section():
    data = deepcopy(valid_data())
    data["sections"][0]["id"] = "wrong-id"

    assert any("id must be term_code-section" in error for error in problems(data))
