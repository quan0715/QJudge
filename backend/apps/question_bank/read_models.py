"""
Read-side helpers for question bank APIs.

Keep query composition and access rules out of views so the module can
move toward canonical read models without changing endpoint contracts.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from django.db.models import Q

from apps.contests.models import ExamQuestion

from .bank_workflows import is_publicly_accessible_bank
from .models import ContestQuestionBinding, Question, QuestionAsset, QuestionBank, QuestionBankMembership


@dataclass(frozen=True)
class BankQuestionReadRow:
    id: str
    bank_item_id: str
    adapter_question_id: str | None
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
    legacy_question: Question | None


def build_contest_usage_map(question_ids):
    """Batch-query contest usages for bank questions."""
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
        usage_map[source_question_id].append(
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
    return Question.QuestionType.CODING if asset_type == QuestionAsset.AssetType.CODING else Question.QuestionType.EXAM


def _coding_ext_from_membership(membership: QuestionBankMembership, payload: dict) -> dict | None:
    from .question_assets import extract_content_from_payload

    legacy_question = membership.legacy_question
    if legacy_question and hasattr(legacy_question, "coding_ext"):
        ext = legacy_question.coding_ext
        # Flatten legacy translations[0] to top-level content fields
        legacy_translations = ext.translations or []
        if legacy_translations and isinstance(legacy_translations, list):
            t = legacy_translations[0] if isinstance(legacy_translations[0], dict) else {}
            content = {k: t.get(k, "") for k in ("description", "input_description", "output_description", "hint")}
        else:
            content = {"description": "", "input_description": "", "output_description": "", "hint": ""}
        return {
            **content,
            "test_cases": ext.test_cases or [],
            "language_configs": ext.language_configs or [],
            "forbidden_keywords": ext.forbidden_keywords or [],
            "required_keywords": ext.required_keywords or [],
        }
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


def _build_bank_question_read_row(
    *,
    bank: QuestionBank,
    membership: QuestionBankMembership,
    usage_map: dict,
) -> BankQuestionReadRow:
    legacy_question = membership.legacy_question
    version = None
    if legacy_question and legacy_question.question_version_id:
        version = legacy_question.question_version
    if version is None:
        version = membership.question_asset.latest_version
    payload = version.payload if version and isinstance(version.payload, dict) else {}

    row_id = str(membership.id)
    question_type = (
        legacy_question.question_type
        if legacy_question
        else _question_type_for_asset_type(membership.question_asset.asset_type)
    )
    contest_usages = usage_map.get(str(legacy_question.id), []) if legacy_question else []

    return BankQuestionReadRow(
        id=row_id,
        bank_item_id=row_id,
        adapter_question_id=str(legacy_question.id) if legacy_question else None,
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
        source_question_id=str(legacy_question.source_question_id) if legacy_question and legacy_question.source_question_id else None,
        source_bank_id=str(legacy_question.source_bank.uuid) if legacy_question and legacy_question.source_bank_id else None,
        source_bank_name=legacy_question.source_bank.name if legacy_question and legacy_question.source_bank_id else None,
        contest_usages=contest_usages,
        question_asset_id=str(membership.question_asset_id) if membership.question_asset_id else None,
        question_version_id=str(version.id) if version else None,
        metadata=(payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}) or {},
        created_by_username=(
            legacy_question.created_by.username
            if legacy_question and legacy_question.created_by_id
            else (
                membership.added_by.username
                if membership.added_by_id
                else membership.question_asset.owner.username
            )
        ),
        coding_ext=_coding_ext_from_membership(membership, payload),
        created_at=legacy_question.created_at if legacy_question else membership.created_at,
        updated_at=legacy_question.updated_at if legacy_question else membership.updated_at,
    )


def _build_legacy_bank_question_read_row(
    *,
    bank: QuestionBank,
    question: Question,
    usage_map: dict,
) -> BankQuestionReadRow:
    payload = {
        "options": question.options or [],
        "correct_answer": question.correct_answer,
        "score": question.score,
        "difficulty": question.difficulty,
        "time_limit": question.time_limit,
        "memory_limit": question.memory_limit,
        "metadata": question.metadata or {},
    }
    coding_ext = None
    if question.question_type == Question.QuestionType.CODING:
        if hasattr(question, "coding_ext"):
            ext = question.coding_ext
            legacy_translations = ext.translations or []
            if legacy_translations and isinstance(legacy_translations, list):
                t = legacy_translations[0] if isinstance(legacy_translations[0], dict) else {}
                content = {k: t.get(k, "") for k in ("description", "input_description", "output_description", "hint")}
            else:
                content = {"description": "", "input_description": "", "output_description": "", "hint": ""}
            coding_ext = {
                **content,
                "test_cases": ext.test_cases or [],
                "language_configs": ext.language_configs or [],
                "forbidden_keywords": ext.forbidden_keywords or [],
                "required_keywords": ext.required_keywords or [],
            }
        else:
            coding_ext = {
                "description": "",
                "input_description": "",
                "output_description": "",
                "hint": "",
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": [],
                "required_keywords": [],
            }
    return BankQuestionReadRow(
        id=str(question.id),
        bank_item_id=str(question.id),
        adapter_question_id=str(question.id),
        bank=str(bank.uuid),
        question_type=question.question_type,
        title=question.title or "",
        prompt=question.prompt or "",
        options=payload["options"],
        correct_answer=payload["correct_answer"],
        score=int(payload["score"] or 0),
        order=int(question.order),
        difficulty=payload["difficulty"] or "medium",
        time_limit=int(payload["time_limit"] or 1000),
        memory_limit=int(payload["memory_limit"] or 128),
        source_question_id=str(question.source_question_id) if question.source_question_id else None,
        source_bank_id=str(question.source_bank.uuid) if question.source_bank_id else None,
        source_bank_name=question.source_bank.name if question.source_bank_id else None,
        contest_usages=usage_map.get(str(question.id), []),
        question_asset_id=str(question.question_asset_id) if question.question_asset_id else None,
        question_version_id=str(question.question_version_id) if question.question_version_id else None,
        metadata=payload["metadata"],
        created_by_username=question.created_by.username if question.created_by_id else None,
        coding_ext=coding_ext,
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


def build_read_row_for_membership(*, membership: QuestionBankMembership) -> BankQuestionReadRow:
    usage_map = build_contest_usage_map([str(membership.legacy_question_id)] if membership.legacy_question_id else [])
    return _build_bank_question_read_row(
        bank=membership.bank,
        membership=membership,
        usage_map=usage_map,
    )


def build_read_row_for_question(*, question: Question) -> BankQuestionReadRow:
    usage_map = build_contest_usage_map([str(question.id)])
    return _build_legacy_bank_question_read_row(
        bank=question.bank,
        question=question,
        usage_map=usage_map,
    )


def get_bank_questions_payload(*, bank: QuestionBank) -> list[BankQuestionReadRow]:
    memberships = (
        bank.asset_memberships.select_related(
            "question_asset",
            "question_asset__owner",
            "question_asset__latest_version",
            "added_by",
            "legacy_question",
            "legacy_question__coding_ext",
            "legacy_question__source_bank",
            "legacy_question__created_by",
            "legacy_question__question_version",
        )
        .order_by("order", "id")
    )
    legacy_question_ids = [str(membership.legacy_question_id) for membership in memberships if membership.legacy_question_id]
    all_usage_ids = legacy_question_ids
    usage_map = build_contest_usage_map(all_usage_ids)
    rows = [
        _build_bank_question_read_row(
            bank=bank,
            membership=membership,
            usage_map=usage_map,
        )
        for membership in memberships
    ]
    return sorted(rows, key=lambda row: (row.order, row.id))


def get_question_queryset_for_user(*, user, allow_cloneable=False):
    base = Question.objects.select_related(
        "bank",
        "bank__owner",
        "created_by",
        "source_bank",
        "question_asset",
        "question_version",
    )

    if allow_cloneable:
        return (
            base.filter(
                Q(bank__owner=user, bank__is_archived=False)
                | Q(
                    bank__is_archived=False,
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

    return base.filter(bank__owner=user, bank__is_archived=False)


def get_membership_queryset_for_user(*, user, allow_cloneable=False):
    base = QuestionBankMembership.objects.select_related(
        "bank",
        "bank__owner",
        "question_asset",
        "question_asset__owner",
        "question_asset__latest_version",
        "added_by",
        "legacy_question",
        "legacy_question__coding_ext",
        "legacy_question__source_bank",
        "legacy_question__created_by",
        "legacy_question__question_version",
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
    legacy_question = get_question_queryset_for_user(
        user=user,
        allow_cloneable=allow_cloneable,
    ).filter(id=raw_id).first()
    if legacy_question:
        membership = QuestionBankMembership.objects.filter(legacy_question=legacy_question).select_related(
            "bank",
            "question_asset",
            "question_asset__latest_version",
            "added_by",
        ).first()
        return ResolvedBankQuestionTarget(
            bank=legacy_question.bank,
            membership=membership,
            legacy_question=legacy_question,
        )

    membership = get_membership_queryset_for_user(
        user=user,
        allow_cloneable=allow_cloneable,
    ).filter(id=raw_id).first()
    if membership:
        return ResolvedBankQuestionTarget(
            bank=membership.bank,
            membership=membership,
            legacy_question=membership.legacy_question,
        )
    return None
