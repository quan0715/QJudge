"""Canonical correct-answer format for objective exam questions.

Students submit 0-based option indexes (true_false: 0 = true, 1 = false) and
``ExamAnswer.auto_grade`` compares them with ``==``, so a correct answer stored
in any other shape grades every student wrong.
"""
from __future__ import annotations

from typing import Any

from apps.contests.models import ExamQuestionType

_FORMAT_HINT = {
    ExamQuestionType.TRUE_FALSE: "true_false expects 0 (true) or 1 (false)",
    ExamQuestionType.SINGLE_CHOICE: "single_choice expects one 0-based option index, e.g. 0",
    ExamQuestionType.MULTIPLE_CHOICE: "multiple_choice expects a non-empty list of distinct 0-based option indexes, e.g. [0, 2]",
}


def _is_index(value: Any, size: int) -> bool:
    return type(value) is int and 0 <= value < size


def objective_answer_error(question_type: str, options: list, answer: Any) -> str | None:
    """Return why ``answer`` is not a canonical objective answer, or ``None``."""
    if question_type == ExamQuestionType.TRUE_FALSE:
        valid = _is_index(answer, 2)
    elif question_type == ExamQuestionType.SINGLE_CHOICE:
        valid = _is_index(answer, len(options))
    elif question_type == ExamQuestionType.MULTIPLE_CHOICE:
        valid = (
            isinstance(answer, list)
            and len(answer) > 0
            and len(set(answer)) == len(answer)
            and all(_is_index(item, len(options)) for item in answer)
        )
    else:
        return None
    if valid:
        return None
    if question_type == ExamQuestionType.TRUE_FALSE:
        return f"{_FORMAT_HINT[question_type]}; got {answer!r}"
    return f"{_FORMAT_HINT[question_type]}; got {answer!r} with {len(options)} options"
