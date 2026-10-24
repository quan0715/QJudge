"""Framework-free planning for finalizing one batch grading run.

A batch grading session (task_type ``grading.batch``) runs a few grading units per
run, one subagent per standalone question or complete question group. The AI only fills ``grade_<qid>.csv``; after the run
ends the worker turns each CSV into backend grade writes and records the
outcome back into each ``grade_<qid>.csv`` (``synced`` per row) and the run's
status in ``progress.csv``. The backend's batch write receipts are the record of
which scores the AI wrote.
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Mapping
from dataclasses import dataclass

BATCH_TASK_TYPE = "grading.batch"
BATCH_ARTIFACT_STEP = "batch"

PROGRESS_COLUMNS = ("question_id", "run_id", "status", "error", "updated_at")

_QUESTION_LINE = re.compile(r"^\s*batch_question_id:\s*(.+?)\s*$")


@dataclass(frozen=True)
class GradeRow:
    exam_answer_id: str
    score: float
    feedback: str


@dataclass(frozen=True)
class GradePlan:
    rows: list[GradeRow]
    out_of_range_count: int
    out_of_range_ids: tuple[str, ...] = ()


def parse_batch_question_ids(message: str) -> list[str]:
    """Question ids from the first line: ``batch_question_id: q1,q2``."""
    first_line = message.split("\n", 1)[0] if message else ""
    match = _QUESTION_LINE.match(first_line)
    if not match:
        return []
    return [part.strip() for part in match.group(1).split(",") if part.strip()]


def plan_grades(grade_csv: str, max_score: float) -> GradePlan:
    rows: list[GradeRow] = []
    out_of_range: list[str] = []
    for record in csv.DictReader(io.StringIO(grade_csv)):
        answer_id = (record.get("exam_answer_id") or "").strip()
        raw_score = (record.get("score") or "").strip()
        if not answer_id or not raw_score:
            continue
        try:
            score = float(raw_score)
        except ValueError:
            continue
        if score < 0 or score > max_score:
            out_of_range.append(answer_id)
            continue
        # ExamAnswer.score keeps two decimals; the backend rejects anything finer.
        rows.append(
            GradeRow(answer_id, round(score, 2), (record.get("reason") or "").strip())
        )
    return GradePlan(rows=rows, out_of_range_count=len(out_of_range), out_of_range_ids=tuple(out_of_range))


def progress_status(run_status: str, error_code: str | None) -> str:
    if run_status == "failed":
        return "paused" if error_code == "MCP_AUTH_FAILED" else "failed"
    return run_status


def _write_csv(columns: tuple[str, ...], rows: list[dict[str, str]]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=columns, quoting=csv.QUOTE_ALL, lineterminator="\n"
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row.get(column, "") for column in columns})
    return buffer.getvalue()


def _read_csv(text: str | None) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text))) if text else []


def upsert_progress_csv(existing: str | None, row: dict[str, str]) -> str:
    rows = _read_csv(existing)
    question_id = row.get("question_id", "")
    for index, current in enumerate(rows):
        if current.get("question_id") == question_id:
            rows[index] = row
            break
    else:
        rows.append(row)
    return _write_csv(PROGRESS_COLUMNS, rows)


def mark_grade_csv(grade_csv: str, outcomes: Mapping[str, str]) -> str:
    """Set ``synced`` on each row the worker acted on: yes, skipped, error or out_of_range."""
    reader = csv.DictReader(io.StringIO(grade_csv))
    columns = tuple(reader.fieldnames or ())
    if "synced" not in columns:
        columns = (*columns, "synced")
    rows = []
    for row in reader:
        outcome = outcomes.get((row.get("exam_answer_id") or "").strip())
        rows.append({**row, "synced": outcome} if outcome else row)
    return _write_csv(columns, rows)
