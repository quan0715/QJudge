"""
Read-side helpers for question bank APIs.

The read model is asset-first: bank items are `QuestionBankMembership`
rows projected through the latest `QuestionVersion` payload.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from django.db.models import Q

from apps.contests.models import ExamQuestion

from .bank_workflows import is_publicly_accessible_bank
from .models import ContestQuestionBinding, QuestionAsset, QuestionBank, QuestionBankMembership

QUESTION_TYPE_CODING = "coding"
QUESTION_TYPE_EXAM = "exam"


@dataclass(frozen=True)
class BankQuestionReadRow:
    id: str
    bank_item_id: str
    bank: str
    question_type: str
    title: str
    prompt: str
    options: list
    correct_answer: object
    score: int
    order: int
    difficulty: str
    time_limit: int
    memory_limit: int
    source_question_id: str | None
    source_bank_id: str | None
    source_bank_name: str | None
    contest_usages: list[dict]
    question_asset_id: str | None
    question_version_id: str | None
    metadata: dict
    created_by_username: str | None
    coding_ext: dict | None
    created_at: object
    updated_at: object


@dataclass(frozen=True)
class ResolvedBankQuestionTarget:
    bank: QuestionBank
    membership: QuestionBankMembership | None


def build_contest_usage_map(question_ids):
    """Batch-query contest usages for bank membership ids and source ids."""
    if not question_ids:
        return {}

    contest_problem_rows = (
        ContestQuestionBinding.objects.filter(source_question_id__in=question_ids)
        .select_related("contest")
        .values_list("source_question_id", "contest__id", "contest__name")
    )
    exam_question_rows = (
        ExamQuestion.objects.filter(source_question_id__in=question_ids)
        .select_related("contest")
        .values_list("source_question_id", "contest__id", "contest__name")
    )

    usage_map = defaultdict(list)
    seen = set()
    for source_question_id, contest_id, contest_name in list(contest_problem_rows) + list(exam_question_rows):
        dedupe_key = (source_question_id, contest_id)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        usage_map[str(source_question_id)].append(
            {
                "contest_id": str(contest_id),
                "contest_name": contest_name,
            }
        )
    return dict(usage_map)


def get_bank_for_read(*, bank_uuid, user) -> QuestionBank | None:
    bank = QuestionBank.objects.filter(uuid=bank_uuid, is_archived=False).first()
    if not bank:
        return None
    if bank.owner_id != user.id and not is_publicly_accessible_bank(bank):
        return None
    return bank


def _question_type_for_asset_type(asset_type: str) -> str:
    return QUESTION_TYPE_CODING if asset_type == QuestionAsset.AssetType.CODING else QUESTION_TYPE_EXAM


def _payload_for_membership(membership: QuestionBankMembership) -> dict:
    version = membership.question_asset.latest_version
    return version.payload if version and isinstance(version.payload, dict) else {}


def _usage_ids_for_membership(membership: QuestionBankMembership) -> list[str]:
    payload = _payload_for_membership(membership)
    ids: list[str] = []
    for value in (
        membership.id,
        payload.get("source_id"),
        membership.question_asset_id,
    ):
        if not value:
            continue
        try:
            ids.append(str(UUID(str(value))))
        except (TypeError, ValueError):
            continue
    return ids


def _coding_ext_from_membership(membership: QuestionBankMembership, payload: dict) -> dict | None:
    from .question_assets import extract_content_from_payload

    if membership.question_asset.asset_type != QuestionAsset.AssetType.CODING:
        return None
    content = extract_content_from_payload(payload)
    return {
        **content,
        "test_cases": payload.get("test_cases") or [],
        "language_configs": payload.get("language_configs") or [],
        "forbidden_keywords": payload.get("forbidden_keywords") or [],
        "required_keywords": payload.get("required_keywords") or [],
    }


def build_read_row_for_membership(*, membership: QuestionBankMembership) -> BankQuestionReadRow:
    usage_map = build_contest_usage_map(_usage_ids_for_membership(membership))
    return _build_bank_question_read_row(
        bank=membership.bank,
        membership=membership,
        usage_map=usage_map,
    )


def _build_bank_question_read_row(
    *,
    bank: QuestionBank,
    membership: QuestionBankMembership,
    usage_map: dict,
) -> BankQuestionReadRow:
    version = membership.question_asset.latest_version
    payload = _payload_for_membership(membership)

    row_id = str(membership.id)
    question_type = _question_type_for_asset_type(membership.question_asset.asset_type)
    source_question_id = payload.get("source_id")
    source_bank_id = payload.get("source_bank_id")
    source_bank_name = payload.get("source_bank_name")
    contest_usage_key = str(source_question_id) if source_question_id else row_id
    metadata = (payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}) or {}
    if payload.get("question_type"):
        metadata = {**metadata, "question_type": payload.get("question_type")}

    return BankQuestionReadRow(
        id=row_id,
        bank_item_id=row_id,
        bank=str(bank.uuid),
        question_type=question_type,
        title=(version.title if version else membership.question_asset.title) or "",
        prompt=version.prompt if version else "",
        options=(payload.get("options") or []),
        correct_answer=payload.get("correct_answer"),
        score=int(payload.get("score") or 0),
        order=int(membership.order),
        difficulty=payload.get("difficulty") or "medium",
        time_limit=int(payload.get("time_limit") or 1000),
        memory_limit=int(payload.get("memory_limit") or 128),
        source_question_id=str(source_question_id) if source_question_id else None,
        source_bank_id=str(source_bank_id) if source_bank_id else None,
        source_bank_name=str(source_bank_name) if source_bank_name else None,
        contest_usages=usage_map.get(contest_usage_key, []),
        question_asset_id=str(membership.question_asset_id) if membership.question_asset_id else None,
        question_version_id=str(version.id) if version else None,
        metadata=metadata,
        created_by_username=(
            membership.added_by.username
            if membership.added_by_id
            else membership.question_asset.owner.username
        ),
        coding_ext=_coding_ext_from_membership(membership, payload),
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


def get_bank_questions_payload(*, bank: QuestionBank) -> list[BankQuestionReadRow]:
    memberships = (
        bank.asset_memberships.select_related(
            "bank",
            "question_asset",
            "question_asset__owner",
            "question_asset__latest_version",
            "added_by",
        )
        .order_by("order", "id")
    )
    usage_ids = []
    for membership in memberships:
        usage_ids.extend(_usage_ids_for_membership(membership))
    usage_map = build_contest_usage_map(usage_ids)
    rows = [
        _build_bank_question_read_row(
            bank=bank,
            membership=membership,
            usage_map=usage_map,
        )
        for membership in memberships
    ]
    return sorted(rows, key=lambda row: (row.order, row.id))


def get_membership_queryset_for_user(*, user, allow_cloneable=False):
    base = QuestionBankMembership.objects.select_related(
        "bank",
        "bank__owner",
        "question_asset",
        "question_asset__owner",
        "question_asset__latest_version",
        "added_by",
    ).filter(bank__is_archived=False)

    if allow_cloneable:
        return (
            base.filter(
                Q(bank__owner=user)
                | Q(
                    bank__visibility=QuestionBank.Visibility.PUBLIC,
                    bank__verified=True,
                )
            )
            .filter(
                Q(bank__owner=user)
                | Q(bank__owner__isnull=True)
                | Q(bank__owner__is_staff=True)
                | Q(bank__owner__role="admin")
            )
        )

    return base.filter(bank__owner=user)


def resolve_bank_question_target_for_user(*, user, raw_id, allow_cloneable=False) -> ResolvedBankQuestionTarget | None:
    membership = get_membership_queryset_for_user(
        user=user,
        allow_cloneable=allow_cloneable,
    ).filter(id=raw_id).first()
    if membership:
        return ResolvedBankQuestionTarget(
            bank=membership.bank,
            membership=membership,
        )
    return None
