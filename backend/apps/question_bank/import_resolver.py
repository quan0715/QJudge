"""Shared resolver for importing bank questions into contest surfaces."""
from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from rest_framework.exceptions import (
    NotFound,
    PermissionDenied,
    ValidationError as DRFValidationError,
)

from .bank_workflows import is_publicly_accessible_bank
from .models import Question, QuestionBank, QuestionBankMembership
from .write_workflows import materialize_bank_question_adapter_for_membership


def _normalize_uuid(value, *, field_name: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError):
        raise DRFValidationError({field_name: "Must be a valid UUID."})


def resolve_bank_question_for_import(
    *,
    user,
    question_bank_id,
    question_id,
    allowed_question_types: Iterable[str] | None = None,
    invalid_type_message: str = "Question type cannot be imported here",
):
    """Resolve and materialize a bank question for contest import.

    Returns ``(bank, question)`` on success. Raises DRF exceptions on invalid
    identifiers, access denial, missing rows, or disallowed question types.
    """
    normalized_bank_uuid = _normalize_uuid(
        question_bank_id,
        field_name="question_bank_id",
    )

    bank = QuestionBank.objects.filter(uuid=normalized_bank_uuid, is_archived=False).first()
    if not bank:
        raise NotFound("Question bank not found")

    if bank.owner_id != user.id and not is_publicly_accessible_bank(bank):
        raise PermissionDenied("No access to this question bank")

    normalized_question_uuid = _normalize_uuid(
        question_id,
        field_name="question_id",
    )

    membership = (
        QuestionBankMembership.objects.filter(
            bank=bank,
            id=normalized_question_uuid,
        )
        .select_related("question_asset", "question_asset__latest_version", "legacy_question")
        .first()
    )

    question = None
    if membership:
        if membership.legacy_question_id:
            question = membership.legacy_question
        else:
            question = materialize_bank_question_adapter_for_membership(
                membership=membership,
                actor=user,
            )

    if not question:
        raise NotFound("Question not found in bank")

    if allowed_question_types is not None and question.question_type not in set(allowed_question_types):
        raise DRFValidationError(invalid_type_message)

    return bank, question
