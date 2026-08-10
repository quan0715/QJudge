"""Atomic grading-rule updates for questions whose exam content is locked."""
from __future__ import annotations

from typing import Literal

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.contests.models import (
    Contest,
    ExamAnswer,
    ExamQuestion,
    ExamQuestionType,
)

from .exam_scoring import ExamScoringService
from .question_edit_lock import ContestQuestionEditLocked

ExistingGradesAction = Literal["regrade", "keep", "mark_pending"]

CONTENT_FIELDS = frozenset({
    "prompt",
    "options",
    "question_type",
    "order",
    "group_id",
    "order_in_group",
    "answer_format",
})
OBJECTIVE_REGRADING_FIELDS = frozenset({"correct_answer", "score"})
SUBJECTIVE_REVIEW_FIELDS = frozenset({
    "correct_answer",
    "reference_answer_document",
    "score",
})
POLICY_FIELDS = frozenset({"score_policy", "score_policy_config"})
EXPLANATION_FIELDS = frozenset({"explanation", "explanation_document"})
GRADING_FIELDS = (
    OBJECTIVE_REGRADING_FIELDS
    | SUBJECTIVE_REVIEW_FIELDS
    | POLICY_FIELDS
    | EXPLANATION_FIELDS
)


def _changed_fields(question: ExamQuestion, values: dict) -> set[str]:
    return {
        name
        for name, value in values.items()
        if getattr(question, name) != value
    }


def _validate_action(
    *,
    question: ExamQuestion,
    changes: set[str],
    action: ExistingGradesAction | None,
) -> None:
    objective = question.question_type in {
        ExamQuestionType.TRUE_FALSE,
        ExamQuestionType.SINGLE_CHOICE,
        ExamQuestionType.MULTIPLE_CHOICE,
    }
    objective_impact = objective and bool(changes & OBJECTIVE_REGRADING_FIELDS)
    subjective_impact = not objective and bool(changes & SUBJECTIVE_REVIEW_FIELDS)

    if objective_impact:
        allowed = {"regrade"}
    elif subjective_impact:
        allowed = {"keep", "mark_pending"}
    else:
        allowed = {"keep"}

    if action not in allowed:
        raise DRFValidationError({
            "existing_grades_action": "action does not match the locked change",
        })


@transaction.atomic
def apply_locked_question_update(
    *,
    question: ExamQuestion,
    validated_data: dict,
    action: ExistingGradesAction | None,
) -> ExamQuestion:
    """Update grading fields and apply the selected existing-grade action."""
    contest = Contest.objects.select_for_update().get(pk=question.contest_id)
    locked_question = ExamQuestion.objects.select_for_update().get(pk=question.pk)
    answers = list(
        ExamAnswer.objects.select_for_update()
        .filter(question=locked_question)
        .select_related("participant", "question")
    )

    changes = _changed_fields(locked_question, validated_data)
    if changes & CONTENT_FIELDS:
        raise ContestQuestionEditLocked()
    unsupported = changes - GRADING_FIELDS
    if unsupported:
        raise ContestQuestionEditLocked()
    if not changes:
        return locked_question

    _validate_action(
        question=locked_question,
        changes=changes,
        action=action,
    )

    for name, value in validated_data.items():
        setattr(locked_question, name, value)
    locked_question.save(update_fields=[*changes, "updated_at"])

    if action == "regrade":
        now = timezone.now()
        for answer in answers:
            answer.question = locked_question
            answer.auto_grade()
            answer.graded_by = None
            answer.graded_at = None
            answer.updated_at = now
        if answers:
            ExamAnswer.objects.bulk_update(
                answers,
                ["score", "is_correct", "graded_by", "graded_at", "updated_at"],
            )
    elif action == "mark_pending":
        now = timezone.now()
        for answer in answers:
            answer.score = None
            answer.is_correct = None
            answer.graded_by = None
            answer.graded_at = None
            answer.updated_at = now
        if answers:
            ExamAnswer.objects.bulk_update(
                answers,
                [
                    "score",
                    "is_correct",
                    "graded_by",
                    "graded_at",
                    "updated_at",
                ],
            )

    policy_changed = bool(changes & POLICY_FIELDS)
    scores_changed = action in {"regrade", "mark_pending"} or policy_changed
    if scores_changed:
        ExamScoringService(contest).recalculate_all()

    if scores_changed and contest.results_published:
        contest.results_published = False
        contest.save(update_fields=["results_published", "updated_at"])

    cache_key = f"contest:{contest.id}:exam_question_detail:{locked_question.id}:v2"
    transaction.on_commit(lambda: cache.delete(cache_key))
    return locked_question
