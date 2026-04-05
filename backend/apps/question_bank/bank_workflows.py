"""
Legacy question-bank workflows.

These flows still serve older bank/contest entrypoints, but they now
delegate canonical lifecycle concerns to ``question_assets.py``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Max, Q, Sum

from apps.contests.models import ContestProblem, ExamQuestion, ExamQuestionType
from apps.problems.models import CodingProblem, Problem  # Problem = CodingProblem alias

from .models import QuestionBank, Question
from .question_assets import (
    ensure_question_asset_for_bank_question,
    ensure_question_bank_membership,
    sync_exam_question_question_asset,
)
from .write_workflows import materialize_bank_question_adapter


def _next_question_order(bank: QuestionBank) -> int:
    """Return the next order value for a new question in *bank*.

    Must be called while holding a row-level lock on *bank* via
    ``select_for_update()`` inside an atomic transaction to prevent
    concurrent requests from receiving the same order number.
    """
    result = Question.objects.filter(bank=bank).aggregate(max_order=Max("order"))
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


def _pick_problem_translation(problem: Problem):
    translation = problem.translations.filter(language__in=["zh-TW", "zh-hant", "zh-Hant"]).first()
    if translation:
        return translation
    return problem.translations.first()


def _build_coding_ext_payload(problem: Problem) -> dict[str, Any]:
    return {
        "translations": list(
            problem.translations.values(
                "language",
                "title",
                "description",
                "input_description",
                "output_description",
                "hint",
            )
        ),
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


def _resolve_problem_source_context(problem: Problem) -> tuple[str | None, str]:
    contest_problem = (
        ContestProblem.objects.select_related("contest")
        .filter(problem=problem)
        .order_by("contest__created_at", "contest__id", "order", "id")
        .first()
    )
    if contest_problem is None:
        return None, ""
    return str(contest_problem.contest_id), contest_problem.contest.name


def _user_may_ingest_coding_problem(*, user, problem: Problem) -> bool:
    """Allow creator or any contest owner/admin that links this problem in a contest."""
    if getattr(problem, "created_by_id", None) == user.id:
        return True
    return ContestProblem.objects.filter(problem=problem).filter(
        Q(contest__owner=user) | Q(contest__admins=user)
    ).exists()


def upsert_problem_into_bank(problem: Problem, bank: QuestionBank, created_by=None) -> Question:
    if bank.category != QuestionBank.Category.CODING:
        raise ValueError(
            f"Cannot add a coding problem to a '{bank.category}' bank "
            f"(bank '{bank.name}' only accepts '{QuestionBank.Category.CODING}' questions)."
        )
    translation = _pick_problem_translation(problem)
    title = (translation.title if translation else problem.title) or problem.title
    prompt = (translation.description if translation else "") or ""

    score_sum = problem.test_cases.aggregate(total=Sum("score")).get("total") or 100

    defaults = {
        "question_type": Question.QuestionType.CODING,
        "title": title,
        "prompt": prompt,
        "score": int(score_sum),
        "difficulty": problem.difficulty or "medium",
        "time_limit": problem.time_limit,
        "memory_limit": problem.memory_limit,
        "created_by": created_by or problem.created_by,
        "metadata": {
            "legacy_problem_id": str(problem.id),
        },
    }

    # Problem should already have a QuestionAsset (Phase 0 invariant).
    # Fallback: sync on the fly for legacy data that hasn't been backfilled.
    if not problem.question_asset_id:
        from .question_assets import sync_problem_question_asset
        sync_problem_question_asset(problem=problem, actor=created_by or problem.created_by)
        problem.refresh_from_db(fields=["question_asset", "question_version"])
    question_asset = problem.question_asset
    question_version = problem.question_version
    existing = (
        Question.objects.filter(bank=bank, question_asset=question_asset)
        .order_by("-updated_at", "-id")
        .first()
    )
    if existing is None:
        existing = (
            Question.objects.filter(bank=bank, metadata__legacy_problem_id=str(problem.id))
            .order_by("-updated_at", "-id")
            .first()
        )

    return materialize_bank_question_adapter(
        bank=bank,
        question_asset=question_asset,
        question_version=question_version,
        actor=created_by or problem.created_by,
        existing=existing,
        coding_ext=_build_coding_ext_payload(problem),
        **defaults,
    )


def upsert_exam_question_into_bank(
    exam_question: ExamQuestion,
    bank: QuestionBank,
    created_by=None,
) -> Question:
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
    defaults = {
        "question_type": Question.QuestionType.EXAM,
        "title": "",
        "prompt": exam_question.prompt,
        "options": exam_question.options or [],
        "correct_answer": exam_question.correct_answer,
        "score": exam_question.score,
        "order": exam_question.order,
        "created_by": created_by or exam_question.contest.owner,
        "metadata": {
            "legacy_exam_question_id": str(exam_question.id),
            "legacy_contest_id": str(exam_question.contest_id),
            "legacy_question_type": exam_question.question_type,
        },
    }

    existing = Question.objects.filter(bank=bank).filter(
        Q(metadata__legacy_exam_question_id=str(exam_question.id))
    ).first()

    question_asset, question_version = sync_exam_question_question_asset(
        exam_question=exam_question,
        actor=created_by or exam_question.contest.owner,
    )

    question = materialize_bank_question_adapter(
        bank=bank,
        question_asset=question_asset,
        question_version=question_version,
        actor=created_by or exam_question.contest.owner,
        existing=existing,
        **defaults,
    )
    sync_exam_question_bank_source(exam_question=exam_question, bank_question=question)
    return question


def sync_exam_question_bank_source(*, exam_question: ExamQuestion, bank_question: Question) -> None:
    bank = bank_question.bank
    ExamQuestion.objects.filter(pk=exam_question.pk).update(
        source_bank_id=bank.uuid,
        source_bank_name=bank.name,
        source_question_id=bank_question.id,
        source_mode="copy",
    )
    exam_question.source_bank_id = bank.uuid
    exam_question.source_bank_name = bank.name
    exam_question.source_question_id = bank_question.id
    exam_question.source_mode = "copy"


def clone_question_to_bank(source_question: Question, target_bank: QuestionBank, user) -> Question:
    if target_bank.is_archived:
        raise ValueError("Cannot clone into an archived bank.")
    if target_bank.category and source_question.question_type:
        expected_type = (
            Question.QuestionType.CODING
            if target_bank.category == QuestionBank.Category.CODING
            else Question.QuestionType.EXAM
        )
        if source_question.question_type != expected_type:
            raise ValueError(
                f"Cannot clone a {source_question.question_type} question "
                f"into a {target_bank.category} bank."
            )

    with transaction.atomic():
        QuestionBank.objects.select_for_update().get(pk=target_bank.pk)

        question_asset = source_question.question_asset
        question_version = source_question.question_version
        if not question_asset or not question_version:
            question_asset, question_version = ensure_question_asset_for_bank_question(
                question=source_question,
                actor=user,
            )

        existing = (
            Question.objects.filter(
                bank=target_bank,
                question_asset=question_asset,
            )
            .order_by("-updated_at", "-id")
            .first()
        )
        if existing:
            ensure_question_bank_membership(
                bank=target_bank,
                question_asset=question_asset,
                order=existing.order,
                legacy_question=existing,
                actor=user,
            )
            return existing

        coding_ext = None
        if source_question.question_type == Question.QuestionType.CODING and hasattr(source_question, "coding_ext"):
            ext = source_question.coding_ext
            coding_ext = {
                "translations": ext.translations,
                "test_cases": ext.test_cases,
                "language_configs": ext.language_configs,
                "forbidden_keywords": ext.forbidden_keywords,
                "required_keywords": ext.required_keywords,
            }
        cloned = materialize_bank_question_adapter(
            bank=target_bank,
            question_asset=question_asset,
            question_version=question_version,
            actor=user,
            question_type=source_question.question_type,
            title=source_question.title,
            prompt=source_question.prompt,
            options=source_question.options,
            correct_answer=source_question.correct_answer,
            score=source_question.score,
            order=_next_question_order(target_bank),
            difficulty=source_question.difficulty,
            time_limit=source_question.time_limit,
            memory_limit=source_question.memory_limit,
            source_question=source_question,
            source_bank=source_question.bank,
            created_by=user,
            metadata={
                **(source_question.metadata or {}),
                "cloned_from_question_id": str(source_question.id),
                "cloned_from_bank_id": str(source_question.bank.uuid),
                "cloned_from_bank_pk": source_question.bank_id,
            },
            coding_ext=coding_ext,
        )
    return cloned


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


def _get_effective_synced_ids_for_user(*, user, metadata_key: str) -> set[str]:
    resolved: set[str] = set()
    rows = (
        Question.objects.filter(**{f"metadata__{metadata_key}__isnull": False})
        .select_related("bank", "bank__owner")
        .order_by("-updated_at", "-id")
    )
    for row in rows:
        if not _is_effectively_accessible_bank_for_user(bank=row.bank, user=user):
            continue
        value = (row.metadata or {}).get(metadata_key)
        if value is None:
            continue
        try:
            resolved.add(str(UUID(str(value))))
        except (TypeError, ValueError):
            continue
    return resolved


def _resolve_effective_existing_question(*, queryset, user) -> Question | None:
    rows = list(queryset.select_related("bank", "bank__owner").order_by("-updated_at", "-id"))
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
        synced = _get_effective_synced_ids_for_user(user=user, metadata_key="legacy_problem_id")
        bank_imported = set(
            ContestProblem.objects.filter(
                source_bank_id__isnull=False,
            ).values_list("problem_id", flat=True)
        )
        managed_problem_ids = ContestProblem.objects.filter(
            Q(contest__owner=user) | Q(contest__admins=user)
        ).values_list("problem_id", flat=True)
        coding_rows = (
            Problem.objects.filter(Q(created_by=user) | Q(id__in=managed_problem_ids))
            .exclude(id__in=synced | bank_imported)
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
                    "title": row.title,
                    "contest_id": contest_id,
                    "contest_name": contest_name,
                    "question_type": "coding",
                    "updated_at": row.updated_at,
                }
            )
        result["coding"] = coding_items

    if category in (None, "exam"):
        synced = _get_effective_synced_ids_for_user(user=user, metadata_key="legacy_exam_question_id")
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
                source = Problem.objects.filter(id=source_id).first()
                if not source or not _user_may_ingest_coding_problem(user=user, problem=source):
                    raise ValueError(f"Problem {source_id} not found")

                if not source.question_asset_id:
                    from .question_assets import sync_problem_question_asset
                    sync_problem_question_asset(problem=source, actor=user)
                    source.refresh_from_db(fields=["question_asset", "question_version"])

                existing_filters = Q(metadata__legacy_problem_id=str(source.id))
                if source.question_asset_id:
                    existing_filters |= Q(question_asset=source.question_asset)
                existing = _resolve_effective_existing_question(
                    queryset=Question.objects.filter(existing_filters),
                    user=user,
                )
                if existing:
                    if existing.bank.owner_id != user.id:
                        raise ValueError(f"Problem {source_id} already synced to an accessible bank")
                    if existing.bank_id != target_bank.id:
                        existing.bank = target_bank
                        existing.order = _next_question_order(target_bank)
                        existing.save(update_fields=["bank", "order", "updated_at"])
                        moved_question_ids.append(str(existing.id))
                    if existing.question_asset_id:
                        ensure_question_bank_membership(
                            bank=target_bank,
                            question_asset=existing.question_asset,
                            order=existing.order,
                            legacy_question=existing,
                            actor=user,
                        )
                    ingested_question_ids.append(str(existing.id))
                    continue

                question = upsert_problem_into_bank(problem=source, bank=target_bank, created_by=user)
                ingested_question_ids.append(str(question.id))
                continue

            source = (
                ExamQuestion.objects.filter(id=source_id)
                .filter(Q(contest__owner=user) | Q(contest__admins=user))
                .first()
            )
            if not source:
                raise ValueError(f"Exam question {source_id} not found")

            existing = _resolve_effective_existing_question(
                queryset=Question.objects.filter(
                    Q(metadata__legacy_exam_question_id=str(source.id))
                ),
                user=user,
            )
            if existing:
                if existing.bank.owner_id != user.id:
                    raise ValueError(f"Exam question {source_id} already synced to an accessible bank")
                if existing.bank_id != target_bank.id:
                    existing.bank = target_bank
                    existing.order = _next_question_order(target_bank)
                    existing.save(update_fields=["bank", "order", "updated_at"])
                    moved_question_ids.append(str(existing.id))
                if existing.question_asset_id:
                    ensure_question_bank_membership(
                        bank=target_bank,
                        question_asset=existing.question_asset,
                        order=existing.order,
                        legacy_question=existing,
                        actor=user,
                    )
                sync_exam_question_bank_source(exam_question=source, bank_question=existing)
                ingested_question_ids.append(str(existing.id))
                continue

            question = upsert_exam_question_into_bank(
                exam_question=source,
                bank=target_bank,
                created_by=user,
            )
            ingested_question_ids.append(str(question.id))

    return {
        "target_bank_id": str(target_bank.uuid),
        "requested_count": len(normalized_items),
        "ingested_count": len(ingested_question_ids),
        "moved_count": len(moved_question_ids),
        "question_ids": ingested_question_ids,
    }
