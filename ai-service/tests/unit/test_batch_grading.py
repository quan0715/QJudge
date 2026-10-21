"""Pure planning helpers for finalizing a batch grading run."""

from __future__ import annotations

import csv
import io

from application.batch_grading import (
    GradeRow,
    append_written_csv,
    parse_batch_question_id,
    plan_grades,
    progress_status,
    upsert_progress_csv,
)

GRADE_HEADER = (
    "index,exam_answer_id,username,answer_text,original_score,"
    "original_feedback,score,reason,synced\n"
)


def _rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def test_parse_batch_question_id_reads_first_line() -> None:
    assert parse_batch_question_id("batch_question_id: 42\n請批改") == "42"
    assert parse_batch_question_id("請批改這題") is None
    assert parse_batch_question_id("") is None


def test_partial_csv_writes_scored_rows_only() -> None:
    grade_csv = GRADE_HEADER + (
        '1,a1,u1,"答案, 含逗號",,,8,不錯,\n'
        "2,a2,u2,答案,,,,,\n"
        "3,a3,u3,答案,,,3.5,部分正確,\n"
    )

    plan = plan_grades(grade_csv, max_score=10)

    assert plan.rows == [
        GradeRow(exam_answer_id="a1", score=8.0, feedback="不錯"),
        GradeRow(exam_answer_id="a3", score=3.5, feedback="部分正確"),
    ]
    assert plan.out_of_range_count == 0


def test_scores_rounded_to_two_decimals() -> None:
    plan = plan_grades(GRADE_HEADER + "1,a1,u1,x,,,7.336,好,\n", max_score=10)

    assert plan.rows == [GradeRow("a1", 7.34, "好")]


def test_out_of_range_scores_excluded() -> None:
    grade_csv = GRADE_HEADER + "1,a1,u1,x,,,11,太高,\n2,a2,u2,x,,,-1,負分,\n"

    plan = plan_grades(grade_csv, max_score=10)

    assert plan.rows == []
    assert plan.out_of_range_count == 2


def test_progress_status_maps_auth_failure_to_paused() -> None:
    assert progress_status("completed", None) == "completed"
    assert progress_status("cancelled", None) == "cancelled"
    assert progress_status("failed", "WORKER_STALE") == "failed"
    assert progress_status("failed", "MCP_AUTH_FAILED") == "paused"


def test_upsert_progress_replaces_same_question() -> None:
    first = upsert_progress_csv(None, {"question_id": "q1", "status": "failed"})
    second = upsert_progress_csv(first, {"question_id": "q2", "status": "completed"})
    third = upsert_progress_csv(second, {"question_id": "q1", "status": "completed"})

    rows = _rows(third)
    assert [(r["question_id"], r["status"]) for r in rows] == [
        ("q1", "completed"),
        ("q2", "completed"),
    ]
    assert list(rows[0]) == [
        "question_id", "run_id", "status", "written_count", "skipped_count",
        "out_of_range_count", "error", "updated_at",
    ]


def test_append_written_keeps_previous_rows() -> None:
    first = append_written_csv(None, [GradeRow("a1", 8.0, "好")])
    second = append_written_csv(first, [GradeRow("a2", 3.5, "缺少說明")])

    assert _rows(second) == [
        {"exam_answer_id": "a1", "score": "8.0", "feedback": "好"},
        {"exam_answer_id": "a2", "score": "3.5", "feedback": "缺少說明"},
    ]
