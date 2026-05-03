"""Exam problem preview helpers for QJudge MCP widgets."""

import json
from typing import Any


EXAM_PROBLEM_PREVIEW_TEMPLATE_URI = "ui://widget/exam-problem-preview-v1.html"

EXAM_PROBLEM_PREVIEW_FIELDS = (
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


def build_exam_problem_preview(
    current_question: dict[str, Any],
    patch: dict[str, Any],
) -> dict[str, Any]:
    """Build a render-focused preview for an exam problem after applying a patch."""
    preview_problem = dict(current_question)
    preview_problem.update(patch)

    changed_fields = []
    unchanged_count = 0
    changed_labels: dict[str, str] = {}
    for field, label in EXAM_PROBLEM_PREVIEW_FIELDS:
        old_value = current_question.get(field)
        new_value = preview_problem.get(field)
        if _json_equal(old_value, new_value):
            unchanged_count += 1
            continue
        changed_fields.append(field)
        changed_labels[field] = label

    risk_flags = []
    if "correct_answer" in changed_fields:
        risk_flags.append("正確答案已變更，請確認預覽中的答案標示符合預期。")
    if "score" in changed_fields:
        risk_flags.append("分數已變更，請確認這題在考試總分中的比重。")
    if "options" in changed_fields:
        risk_flags.append("選項已變更，請確認選項順序與正確答案仍一致。")

    return {
        "kind": "exam_problem_preview",
        "question_id": current_question.get("id") or current_question.get("question_id"),
        "preview_problem": preview_problem,
        "source_question": current_question,
        "patch": patch,
        "update_summary": {
            "changed_fields": changed_fields,
            "changed_labels": changed_labels,
            "changed_count": len(changed_fields),
            "unchanged_count": unchanged_count,
        },
        "risk_flags": risk_flags,
    }
