"""
Service layer for contest domain logic.
"""

from .export_service import (
    ExportValidationError,
    build_contest_download_response,
    build_paper_exam_results_csv_response,
    build_paper_exam_sheet_response,
    build_student_report_response,
    parse_scale,
)
from .question_edit_lock import (
    ContestQuestionEditLocked,
    LOCKED_ERROR_CODE,
    LOCKED_ERROR_MESSAGE,
    ensure_contest_question_editable,
    lock_contest_question_editing,
    maybe_lock_from_coding_submission,
    maybe_lock_from_exam_answer,
    is_non_empty_exam_answer,
)

__all__ = [
    "ExportValidationError",
    "build_contest_download_response",
    "build_paper_exam_results_csv_response",
    "build_paper_exam_sheet_response",
    "build_student_report_response",
    "parse_scale",
    "ContestQuestionEditLocked",
    "LOCKED_ERROR_CODE",
    "LOCKED_ERROR_MESSAGE",
    "ensure_contest_question_editable",
    "lock_contest_question_editing",
    "maybe_lock_from_coding_submission",
    "maybe_lock_from_exam_answer",
    "is_non_empty_exam_answer",
]
