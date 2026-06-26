"""Shared resolver for importing bank questions into contest surfaces."""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from uuid import UUID

from rest_framework.exceptions import (
    NotFound,
    PermissionDenied,
    ValidationError as DRFValidationError,
)

from .bank_workflows import is_publicly_accessible_bank
from .models import QuestionAsset, QuestionBank, QuestionBankMembership


QUESTION_TYPE_CODING = "coding"
QUESTION_TYPE_EXAM = "exam"


@dataclass(frozen=True)
class BankQuestionImportItem:
    membership: QuestionBankMembership
    question_asset: QuestionAsset
    payload: dict
    question_type: str
    title: str
    prompt: str

    @property
    def id(self):
        return self.membership.id

    @property
    def question_version(self):
        return self.question_asset.latest_version


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
    """Resolve a bank membership for contest import.

    Returns ``(bank, item)`` on success. Raises DRF exceptions on invalid
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
        .select_related("question_asset", "question_asset__latest_version")
        .first()
    )

    if not membership:
        raise NotFound("Question not found in bank")

    version = membership.question_asset.latest_version
    payload = version.payload if version and isinstance(version.payload, dict) else {}
    question_type = (
        QUESTION_TYPE_CODING
        if membership.question_asset.asset_type == QuestionAsset.AssetType.CODING
        else QUESTION_TYPE_EXAM
    )

    if allowed_question_types is not None and question_type not in set(allowed_question_types):
        raise DRFValidationError(invalid_type_message)

    return bank, BankQuestionImportItem(
        membership=membership,
        question_asset=membership.question_asset,
        payload=payload,
        question_type=question_type,
        title=(version.title if version else membership.question_asset.title) or "",
        prompt=(version.prompt if version else membership.question_asset.prompt) or "",
    )
