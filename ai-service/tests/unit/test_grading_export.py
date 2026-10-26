import csv
import io

from application.grading_export import grading_files


def test_export_preserves_stored_grades_and_reports_missing_rubric():
    data = {"units": [{"unit_id": "q1", "questions": [{"question_id": "q", "label": "1"}],
        "rubric": None, "grades": [{"exam_answer_id": "a", "score": 1, "feedback": '=SUM(1,2)'}],
        "answers": [{"exam_answer_id": "a", "question_id": "q", "participant_id": "p",
                     "answer": {"text": "多行\n含逗號,與引號\""}, "writable": True}],
        "results": {"a": {"status": "skipped"}}}],
        "official_grades": {"a": {"score": 2, "feedback": "Teacher"}}}
    files = grading_files(data)
    assert "未保存" in files["rubric.md"].decode()
    rows = list(csv.DictReader(io.StringIO(files["grade.csv"].decode("utf-8-sig"))))
    assert len(rows) == 1
    assert rows[0]["draft_score"] == "1"
    assert rows[0]["official_score"] == "2"
    assert rows[0]["matches_draft"] == "False"
    assert rows[0]["draft_feedback"].startswith("'=")
    data["units"][0]["rubric"] = {"criteria": [{"description": "正確觀念", "points": 2}]}
    assert "正確觀念" in grading_files(data)["rubric.md"].decode()
