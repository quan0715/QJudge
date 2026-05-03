"""Exam question diff helpers for QJudge MCP widgets."""

import json
from typing import Any


EXAM_QUESTION_DIFF_TEMPLATE_URI = "ui://widget/exam-question-diff-v1.html"

EXAM_QUESTION_DIFF_FIELDS = (
    ("question_type", "題型"),
    ("prompt", "題目敘述"),
    ("explanation", "詳解"),
    ("score", "分數"),
    ("options", "選項"),
    ("correct_answer", "正確答案"),
)


def _json_equal(left: Any, right: Any) -> bool:
    if isinstance(left, (dict, list)) or isinstance(right, (dict, list)):
        return json.dumps(left, sort_keys=True, ensure_ascii=False) == json.dumps(
            right,
            sort_keys=True,
            ensure_ascii=False,
        )
    return left == right


def build_exam_question_diff(
    current_question: dict[str, Any],
    patch: dict[str, Any],
) -> dict[str, Any]:
    """Build a field-level before/after diff for an exam question patch."""
    proposed_question = dict(current_question)
    proposed_question.update(patch)

    changes = []
    unchanged = 0
    for field, label in EXAM_QUESTION_DIFF_FIELDS:
        old_value = current_question.get(field)
        new_value = proposed_question.get(field)
        changed = not _json_equal(old_value, new_value)
        if changed:
            changes.append({
                "field": field,
                "label": label,
                "old_value": old_value,
                "new_value": new_value,
            })
        else:
            unchanged += 1

    risk_flags = []
    if any(change["field"] == "correct_answer" for change in changes):
        risk_flags.append("正確答案已變更，會影響既有作答判斷。")
    if any(change["field"] == "score" for change in changes):
        risk_flags.append("分數已變更，可能影響總分或評分結果。")
    if any(change["field"] == "options" for change in changes):
        risk_flags.append("選項已變更，請確認正確答案索引或內容仍一致。")

    return {
        "kind": "exam_question_diff",
        "question_id": current_question.get("id") or current_question.get("question_id"),
        "current_question": current_question,
        "proposed_question": proposed_question,
        "patch": patch,
        "changes": changes,
        "has_changes": bool(changes),
        "summary": {
            "changed": len(changes),
            "unchanged": unchanged,
        },
        "risk_flags": risk_flags,
    }
