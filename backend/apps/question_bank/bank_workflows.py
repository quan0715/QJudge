"""
Question-bank workflows built on QuestionAsset, QuestionVersion, and membership rows.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Max, Q

from apps.contests.models import ExamQuestion, ExamQuestionType
from apps.problems.models import CodingProblem

from .models import QuestionBank, QuestionBankMembership
from .question_assets import (
    ensure_question_bank_membership,
    sync_exam_question_question_asset,
)


def _next_membership_order(bank: QuestionBank) -> int:
    result = QuestionBankMembership.objects.filter(bank=bank).aggregate(max_order=Max("order"))
    return (result["max_order"] if result["max_order"] is not None else -1) + 1


@dataclass
class ExamReconstructibilityResult:
    is_reconstructible: bool
    reason: str = ""


def get_my_bank_default_name(category: str) -> str:
    if category == QuestionBank.Category.EXAM:
        return "我的考卷題庫"
    return "我的程式題庫"


def _resolve_or_create_active_personal_bank(user, category: str) -> QuestionBank:
    """
    Resolve a user's active bank for category.
    If duplicated rows exist (legacy data), pick the most recently updated one
    instead of raising MultipleObjectsReturned.
    """
    bank = (
        QuestionBank.objects.filter(
            owner=user,
            category=category,
            is_archived=False,
        )
        .order_by("-updated_at", "-id")
        .first()
    )
    if bank:
        return bank

    try:
        return QuestionBank.objects.create(
            owner=user,
            category=category,
            is_archived=False,
            name=get_my_bank_default_name(category),
            visibility=QuestionBank.Visibility.PRIVATE,
            verified=False,
        )
    except IntegrityError:
        bank = (
            QuestionBank.objects.filter(
                owner=user,
                category=category,
                is_archived=False,
            )
            .order_by("-updated_at", "-id")
            .first()
        )
        if bank:
            return bank
        raise


def get_or_create_personal_bank(
    user,
    category: str,
    target_bank_uuid: UUID | str | None = None,
) -> QuestionBank:
    if target_bank_uuid is not None:
        bank = QuestionBank.objects.filter(
            uuid=target_bank_uuid,
            owner=user,
            is_archived=False,
        ).first()
        if not bank:
            raise ValueError("Target bank not found")
        if bank.category != category:
            raise ValueError("Target bank category mismatch")
        return bank

    return _resolve_or_create_active_personal_bank(user=user, category=category)


def _get_asset_description(problem: CodingProblem) -> dict[str, str]:
    """Read flat content fields from QuestionAsset payload."""
    from .question_assets import extract_content_from_payload
    if not problem.question_asset_id:
        return {"description": "", "input_description": "", "output_description": "", "hint": ""}
    try:
        payload = problem.question_asset.payload or {}
        return extract_content_from_payload(payload)
    except Exception:
        return {"description": "", "input_description": "", "output_description": "", "hint": ""}


def _build_coding_ext_payload(problem: CodingProblem) -> dict[str, Any]:
    content = _get_asset_description(problem)
    return {
        **content,
        "test_cases": list(
            problem.test_cases.values(
                "input_data",
                "output_data",
                "is_sample",
                "score",
                "weight_percent",
                "order",
                "is_hidden",
            )
        ),
        "language_configs": list(
            problem.language_configs.values(
                "language",
                "template_code",
                "is_enabled",
                "order",
            )
        ),
        "forbidden_keywords": problem.forbidden_keywords or [],
        "required_keywords": problem.required_keywords or [],
    }


def _resolve_problem_source_context(problem: CodingProblem) -> tuple[str | None, str]:
    from apps.question_bank.models import ContestQuestionBinding
    binding = (
        ContestQuestionBinding.objects.select_related("contest")
        .filter(coding_problem=problem)
        .order_by("contest__created_at", "contest__id", "order", "id")
        .first()
    )
    if binding is None:
        return None, ""
    return str(binding.contest_id), binding.contest.name


def _user_may_ingest_coding_problem(*, user, problem: CodingProblem) -> bool:
    """Allow creator or any contest owner/admin that links this problem in a contest."""
    if getattr(problem, "created_by_id", None) == user.id:
        return True
    from apps.question_bank.models import ContestQuestionBinding
    return ContestQuestionBinding.objects.filter(coding_problem=problem).filter(
        Q(contest__owner=user) | Q(contest__admins=user)
    ).exists()


def upsert_problem_into_bank(problem: CodingProblem, bank: QuestionBank, created_by=None) -> QuestionBankMembership:
    if bank.category != QuestionBank.Category.CODING:
        raise ValueError(
            f"Cannot add a coding problem to a '{bank.category}' bank "
            f"(bank '{bank.name}' only accepts '{QuestionBank.Category.CODING}' questions)."
        )
    if not problem.question_asset_id:
        from .question_assets import ensure_problem_question_asset
        ensure_problem_question_asset(problem=problem, actor=created_by or problem.created_by)
        problem.refresh_from_db(fields=["question_asset", "question_version"])
    return ensure_question_bank_membership(
        bank=bank,
        question_asset=problem.question_asset,
        order=_next_membership_order(bank),
        actor=created_by or problem.created_by,
    )


def upsert_exam_question_into_bank(
    exam_question: ExamQuestion,
    bank: QuestionBank,
    created_by=None,
) -> QuestionBankMembership:
    if bank.category != QuestionBank.Category.EXAM:
        raise ValueError(
            f"Cannot add an exam question to a '{bank.category}' bank "
            f"(bank '{bank.name}' only accepts '{QuestionBank.Category.EXAM}' questions)."
        )
    reconstructibility = validate_exam_question_reconstructibility(exam_question)
    if not reconstructibility.is_reconstructible:
        raise ValueError(
            "Exam question is not reconstructible for bank ingest: "
            f"{reconstructibility.reason}"
        )
    question_asset, question_version = sync_exam_question_question_asset(
        exam_question=exam_question,
        actor=created_by or exam_question.contest.owner,
    )
    membership = ensure_question_bank_membership(
        bank=bank,
        question_asset=question_asset,
        order=exam_question.order,
        actor=created_by or exam_question.contest.owner,
    )
    sync_exam_question_bank_source(exam_question=exam_question, membership=membership)
    return membership


def sync_exam_question_bank_source(*, exam_question: ExamQuestion, membership: QuestionBankMembership) -> None:
    bank = membership.bank
    ExamQuestion.objects.filter(pk=exam_question.pk).update(
        source_bank_id=bank.uuid,
        source_bank_name=bank.name,
        source_question_id=membership.id,
        source_mode="copy",
    )
    exam_question.source_bank_id = bank.uuid
    exam_question.source_bank_name = bank.name
    exam_question.source_question_id = membership.id
    exam_question.source_mode = "copy"


def clone_membership_to_bank(
    source_membership: QuestionBankMembership,
    target_bank: QuestionBank,
    user,
) -> QuestionBankMembership:
    if target_bank.is_archived:
        raise ValueError("Cannot clone into an archived bank.")
    if target_bank.category != source_membership.bank.category:
        raise ValueError(
            f"Cannot clone a {source_membership.bank.category} question "
            f"into a {target_bank.category} bank."
        )

    with transaction.atomic():
        QuestionBank.objects.select_for_update().get(pk=target_bank.pk)
        existing = QuestionBankMembership.objects.filter(
            bank=target_bank,
            question_asset=source_membership.question_asset,
        ).first()
        if existing:
            return existing
        return ensure_question_bank_membership(
            bank=target_bank,
            question_asset=source_membership.question_asset,
            order=_next_membership_order(target_bank),
            actor=user,
        )


def is_publicly_accessible_bank(bank: QuestionBank) -> bool:
    if bank.visibility != QuestionBank.Visibility.PUBLIC or not bank.verified or bank.is_archived:
        return False
    if bank.review_status == QuestionBank.ReviewStatus.APPROVED:
        return True
    owner = getattr(bank, "owner", None)
    return owner is None or bool(getattr(owner, "is_staff", False) or getattr(owner, "role", None) == "admin")


def validate_exam_question_reconstructibility(exam_question: ExamQuestion) -> ExamReconstructibilityResult:
    if not exam_question.prompt or not exam_question.prompt.strip():
        return ExamReconstructibilityResult(False, "prompt is empty")

    if exam_question.question_type in {
        ExamQuestionType.TRUE_FALSE,
        ExamQuestionType.SINGLE_CHOICE,
        ExamQuestionType.MULTIPLE_CHOICE,
    }:
        if not isinstance(exam_question.options, list) or len(exam_question.options) == 0:
            return ExamReconstructibilityResult(False, "choice question options are missing")
        if exam_question.correct_answer in (None, "", []):
            return ExamReconstructibilityResult(False, "choice question correct_answer is missing")

    return ExamReconstructibilityResult(True)


def _is_effectively_accessible_bank_for_user(*, bank: QuestionBank, user) -> bool:
    if bank.is_archived:
        return False
    if bank.owner_id == user.id:
        return True
    return is_publicly_accessible_bank(bank)


def _source_id_from_membership_payload(
    membership: QuestionBankMembership,
    *,
    source_type: str,
) -> str | None:
    version = membership.question_asset.latest_version
    payload = version.payload if version and isinstance(version.payload, dict) else {}
    payload_source_type = payload.get("source_type")
    if payload_source_type and payload_source_type != source_type:
        return None
    source_id = payload.get("source_id")
    if source_id is None:
        return None
    return str(source_id)


def _get_effective_synced_ids_for_user(
    *,
    user,
    source_type: str,
) -> set[str]:
    resolved: set[str] = set()
    rows = (
        QuestionBankMembership.objects.select_related(
            "bank",
            "bank__owner",
            "question_asset",
            "question_asset__latest_version",
        )
        .order_by("-updated_at", "-id")
    )
    for row in rows:
        if not _is_effectively_accessible_bank_for_user(bank=row.bank, user=user):
            continue
        value = _source_id_from_membership_payload(
            row,
            source_type=source_type,
        )
        if value is None:
            continue
        try:
            resolved.add(str(UUID(str(value))))
        except (TypeError, ValueError):
            continue
    return resolved


def _resolve_effective_existing_membership(*, queryset, user) -> QuestionBankMembership | None:
    rows = list(
        queryset.select_related(
            "bank",
            "bank__owner",
            "question_asset",
            "question_asset__latest_version",
        ).order_by("-updated_at", "-id")
    )
    for row in rows:
        if row.bank.is_archived:
            continue
        if row.bank.owner_id == user.id:
            return row
    for row in rows:
        if _is_effectively_accessible_bank_for_user(bank=row.bank, user=user):
            return row
    return None


def list_question_bank_inbox(user, category: str | None = None) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {
        "coding": [],
        "exam": [],
    }

    if category in (None, "coding"):
        synced = _get_effective_synced_ids_for_user(
            user=user,
            source_type="problem",
        )
        from apps.question_bank.models import ContestQuestionBinding
        bank_imported = set(
            ContestQuestionBinding.objects.filter(
                source_bank_id__isnull=False,
                coding_problem__isnull=False,
            ).values_list("coding_problem_id", flat=True)
        )
        managed_problem_ids = ContestQuestionBinding.objects.filter(
            coding_problem__isnull=False,
        ).filter(
            Q(contest__owner=user) | Q(contest__admins=user)
        ).values_list("coding_problem_id", flat=True)
        coding_rows = (
            CodingProblem.objects.filter(Q(created_by=user) | Q(id__in=managed_problem_ids))
            .exclude(id__in=synced | bank_imported)
            .select_related("question_asset")
            .distinct()
            .order_by("-updated_at", "-id")
        )
        coding_items: list[dict[str, Any]] = []
        for row in coding_rows:
            contest_id, contest_name = _resolve_problem_source_context(row)
            coding_items.append(
                {
                    "source_type": "problem",
                    "source_id": str(row.id),
                    "title": (row.question_asset.title if row.question_asset_id else "") or str(row.id),
                    "contest_id": contest_id,
                    "contest_name": contest_name,
                    "question_type": "coding",
                    "updated_at": row.updated_at,
                }
            )
        result["coding"] = coding_items

    if category in (None, "exam"):
        synced = _get_effective_synced_ids_for_user(
            user=user,
            source_type="exam_question",
        )
        exam_rows = (
            ExamQuestion.objects.filter(Q(contest__owner=user) | Q(contest__admins=user))
            .filter(source_bank_id__isnull=True)
            .exclude(id__in=synced)
            .select_related("contest")
            .order_by("-updated_at", "-id")
            .distinct()
        )
        result["exam"] = [
            {
                "source_type": "exam_question",
                "source_id": str(row.id),
                "title": (row.prompt or "").replace("\n", " ").strip()[:60] or f"Q{(row.order or 0) + 1}",
                "contest_id": row.contest_id,
                "contest_name": row.contest.name,
                "question_type": row.question_type,
                "score": row.score,
                "updated_at": row.updated_at,
            }
            for row in exam_rows
        ]

    return result


def ingest_question_bank_inbox_items(
    *,
    user,
    target_bank_uuid: UUID | str,
    items: list[dict[str, Any]],
) -> dict[str, Any]:
    target_bank = QuestionBank.objects.filter(
        uuid=target_bank_uuid,
        owner=user,
        is_archived=False,
    ).first()
    if not target_bank:
        raise ValueError("Target bank not found")

    if not items:
        raise ValueError("No items selected")

    normalized_items = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        source_type = item["source_type"]
        source_id = str(item["source_id"])
        key = (source_type, source_id)
        if key in seen:
            continue
        seen.add(key)
        normalized_items.append({"source_type": source_type, "source_id": source_id})

    if target_bank.category == QuestionBank.Category.CODING:
        invalid = [row for row in normalized_items if row["source_type"] != "problem"]
        if invalid:
            raise ValueError("Coding bank can only ingest coding problems")
    elif target_bank.category == QuestionBank.Category.EXAM:
        invalid = [row for row in normalized_items if row["source_type"] != "exam_question"]
        if invalid:
            raise ValueError("Exam bank can only ingest exam questions")

    ingested_question_ids: list[str] = []
    moved_question_ids: list[str] = []

    with transaction.atomic():
        target_bank = QuestionBank.objects.select_for_update().get(pk=target_bank.pk)
        for item in normalized_items:
            source_type = item["source_type"]
            source_id = item["source_id"]

            if source_type == "problem":
                source = CodingProblem.objects.filter(id=source_id).first()
                if not source or not _user_may_ingest_coding_problem(user=user, problem=source):
                    raise ValueError(f"Problem {source_id} not found")

                if not source.question_asset_id:
                    from .question_assets import ensure_problem_question_asset
                    ensure_problem_question_asset(problem=source, actor=user)
                    source.refresh_from_db(fields=["question_asset", "question_version"])

                existing = _resolve_effective_existing_membership(
                    queryset=QuestionBankMembership.objects.filter(question_asset=source.question_asset),
                    user=user,
                )
                if existing:
                    if existing.bank.owner_id != user.id:
                        raise ValueError(f"Problem {source_id} already synced to an accessible bank")
                    if existing.bank_id != target_bank.id:
                        existing.bank = target_bank
                        existing.order = _next_membership_order(target_bank)
                        existing.added_by = user
                        existing.save(update_fields=["bank", "order", "added_by", "updated_at"])
                        moved_question_ids.append(str(existing.id))
                    ingested_question_ids.append(str(existing.id))
                    continue

                membership = upsert_problem_into_bank(problem=source, bank=target_bank, created_by=user)
                ingested_question_ids.append(str(membership.id))
                continue

            source = (
                ExamQuestion.objects.filter(id=source_id)
                .filter(Q(contest__owner=user) | Q(contest__admins=user))
                .first()
            )
            if not source:
                raise ValueError(f"Exam question {source_id} not found")

            question_asset, _question_version = sync_exam_question_question_asset(
                exam_question=source,
                actor=user,
            )
            existing = _resolve_effective_existing_membership(
                queryset=QuestionBankMembership.objects.filter(question_asset=question_asset),
                user=user,
            )
            if existing:
                if existing.bank.owner_id != user.id:
                    raise ValueError(f"Exam question {source_id} already synced to an accessible bank")
                if existing.bank_id != target_bank.id:
                    existing.bank = target_bank
                    existing.order = _next_membership_order(target_bank)
                    existing.added_by = user
                    existing.save(update_fields=["bank", "order", "added_by", "updated_at"])
                    moved_question_ids.append(str(existing.id))
                sync_exam_question_bank_source(exam_question=source, membership=existing)
                ingested_question_ids.append(str(existing.id))
                continue

            membership = upsert_exam_question_into_bank(
                exam_question=source,
                bank=target_bank,
                created_by=user,
            )
            ingested_question_ids.append(str(membership.id))

    return {
        "target_bank_id": str(target_bank.uuid),
        "requested_count": len(normalized_items),
        "ingested_count": len(ingested_question_ids),
        "moved_count": len(moved_question_ids),
        "question_ids": ingested_question_ids,
    }
