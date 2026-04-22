"""Approval policy for write-class tool actions requiring HITL review."""

from __future__ import annotations


WRITE_ACTIONS: dict[str, set[str]] = {
    "qjudge_grading": {"grade", "batch_grade", "ungrade"},
    "qjudge_contest_manager": {"reorder"},
    "qjudge_coding_problems": {
        "create",
        "update",
        "delete",
    },
    "qjudge_exam": {
        "create",
        "update",
        "delete",
        "reorder",
        "import_from_bank",
        "batch_create",
    },
}
