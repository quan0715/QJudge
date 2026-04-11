from __future__ import annotations

from typing import Any

from django.db.models import Max

from apps.contests.models import ExamQuestion, ExamQuestionType
from apps.problems.models import CodingProblem, Problem  # Problem = CodingProblem alias

from .models import (
    ContestQuestionBinding,
    Question,
    QuestionAsset,
    QuestionBankMembership,
    QuestionVersion,
)


def _asset_type_for_exam_question_type(question_type: str) -> str:
    mapping = {
        ExamQuestionType.TRUE_FALSE: QuestionAsset.AssetType.TRUE_FALSE,
        ExamQuestionType.SINGLE_CHOICE: QuestionAsset.AssetType.SINGLE_CHOICE,
        ExamQuestionType.MULTIPLE_CHOICE: QuestionAsset.AssetType.MULTIPLE_CHOICE,
        ExamQuestionType.SHORT_ANSWER: QuestionAsset.AssetType.SHORT_ANSWER,
        ExamQuestionType.ESSAY: QuestionAsset.AssetType.ESSAY,
    }
    return mapping.get(question_type, QuestionAsset.AssetType.ESSAY)


def _build_exam_question_asset_payload(exam_question: ExamQuestion) -> dict[str, Any]:
    return {
        "question_type": exam_question.question_type,
        "options": exam_question.options or [],
        "correct_answer": exam_question.correct_answer,
        "score": exam_question.score,
        "order": exam_question.order,
        "legacy_exam_question_id": str(exam_question.id),
        "legacy_contest_id": str(exam_question.contest_id),
    }


def _build_bank_question_asset_payload(question: Question) -> dict[str, Any]:
    payload = {
        "score": question.score,
        "order": question.order,
        "difficulty": question.difficulty,
        "time_limit": question.time_limit,
        "memory_limit": question.memory_limit,
        "options": question.options or [],
        "correct_answer": question.correct_answer,
        "metadata": question.metadata or {},
    }
    if question.question_type == Question.QuestionType.CODING and hasattr(question, "coding_ext"):
        payload.update(
            {
                "translations": question.coding_ext.translations or [],
                "test_cases": question.coding_ext.test_cases or [],
                "language_configs": question.coding_ext.language_configs or [],
                "forbidden_keywords": question.coding_ext.forbidden_keywords or [],
                "required_keywords": question.coding_ext.required_keywords or [],
            }
        )
    return payload


def _build_bank_question_asset_payload_from_components(
    *,
    question_type: str,
    score: int,
    order: int,
    difficulty: str,
    time_limit: int,
    memory_limit: int,
    options,
    correct_answer,
    metadata,
    coding_ext: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "score": score,
        "order": order,
        "difficulty": difficulty,
        "time_limit": time_limit,
        "memory_limit": memory_limit,
        "options": options or [],
        "correct_answer": correct_answer,
        "metadata": metadata or {},
    }
    if question_type == Question.QuestionType.CODING:
        coding_payload = coding_ext or {}
        payload.update(
            {
                "translations": coding_payload.get("translations") or [],
                "test_cases": coding_payload.get("test_cases") or [],
                "language_configs": coding_payload.get("language_configs") or [],
                "forbidden_keywords": coding_payload.get("forbidden_keywords") or [],
                "required_keywords": coding_payload.get("required_keywords") or [],
            }
        )
    return payload


def _existing_bank_question_coding_ext_payload(question: Question) -> dict[str, Any]:
    if question.question_type != Question.QuestionType.CODING or not hasattr(question, "coding_ext"):
        return {
            "translations": [],
            "test_cases": [],
            "language_configs": [],
            "forbidden_keywords": [],
            "required_keywords": [],
        }
    return {
        "translations": question.coding_ext.translations or [],
        "test_cases": question.coding_ext.test_cases or [],
        "language_configs": question.coding_ext.language_configs or [],
        "forbidden_keywords": question.coding_ext.forbidden_keywords or [],
        "required_keywords": question.coding_ext.required_keywords or [],
    }


def _asset_type_for_bank_question(question: Question) -> str:
    if question.question_type == Question.QuestionType.CODING:
        return QuestionAsset.AssetType.CODING

    metadata = question.metadata if isinstance(question.metadata, dict) else {}
    raw_type = metadata.get("legacy_question_type")
    if raw_type in {
        ExamQuestionType.TRUE_FALSE,
        ExamQuestionType.SINGLE_CHOICE,
        ExamQuestionType.MULTIPLE_CHOICE,
        ExamQuestionType.SHORT_ANSWER,
        ExamQuestionType.ESSAY,
    }:
        return _asset_type_for_exam_question_type(raw_type)

    correct = question.correct_answer
    options = question.options if isinstance(question.options, list) else []
    if isinstance(correct, bool):
        return QuestionAsset.AssetType.TRUE_FALSE
    if isinstance(correct, list):
        return QuestionAsset.AssetType.MULTIPLE_CHOICE
    if isinstance(correct, int) and options:
        return QuestionAsset.AssetType.SINGLE_CHOICE
    return QuestionAsset.AssetType.ESSAY


def _asset_type_for_bank_question_payload(*, question_type: str, metadata, options, correct_answer) -> str:
    if question_type == Question.QuestionType.CODING:
        return QuestionAsset.AssetType.CODING

    metadata = metadata if isinstance(metadata, dict) else {}
    raw_type = metadata.get("legacy_question_type")
    if raw_type in {
        ExamQuestionType.TRUE_FALSE,
        ExamQuestionType.SINGLE_CHOICE,
        ExamQuestionType.MULTIPLE_CHOICE,
        ExamQuestionType.SHORT_ANSWER,
        ExamQuestionType.ESSAY,
    }:
        return _asset_type_for_exam_question_type(raw_type)

    if isinstance(correct_answer, bool):
        return QuestionAsset.AssetType.TRUE_FALSE
    if isinstance(correct_answer, list):
        return QuestionAsset.AssetType.MULTIPLE_CHOICE
    if isinstance(correct_answer, int) and isinstance(options, list) and options:
        return QuestionAsset.AssetType.SINGLE_CHOICE
    return QuestionAsset.AssetType.ESSAY


def publish_question_version(
    *,
    question_asset: QuestionAsset,
    title: str,
    prompt: str,
    payload: dict[str, Any],
    actor=None,
) -> QuestionVersion:
    latest_version = (
        QuestionVersion.objects.filter(question_asset=question_asset)
        .aggregate(max_version=Max("version_number"))
        .get("max_version")
        or 0
    )
    version = QuestionVersion.objects.create(
        question_asset=question_asset,
        version_number=latest_version + 1,
        title=title or "",
        prompt=prompt or "",
        payload=payload or {},
        created_by=actor,
    )
    QuestionAsset.objects.filter(pk=question_asset.pk).update(
        title=title or "",
        prompt=prompt or "",
        payload=payload or {},
        latest_version=version,
        version_state=QuestionAsset.VersionState.PUBLISHED,
    )
    question_asset.title = title or ""
    question_asset.prompt = prompt or ""
    question_asset.payload = payload or {}
    question_asset.latest_version = version
    question_asset.version_state = QuestionAsset.VersionState.PUBLISHED
    return version


def create_question_asset(
    *,
    owner,
    asset_type: str,
    title: str,
    prompt: str,
    visibility: str,
    payload: dict[str, Any],
    actor=None,
) -> tuple[QuestionAsset, QuestionVersion]:
    question_asset = QuestionAsset.objects.create(
        owner=owner,
        asset_type=asset_type,
        title=title or "",
        prompt=prompt or "",
        visibility=visibility,
        status=QuestionAsset.Status.ACTIVE,
        version_state=QuestionAsset.VersionState.PUBLISHED,
        payload=payload or {},
    )
    version = publish_question_version(
        question_asset=question_asset,
        title=title,
        prompt=prompt,
        payload=payload,
        actor=actor or owner,
    )
    return question_asset, version


def create_question_asset_for_bank_payload(
    *,
    owner,
    title: str,
    prompt: str,
    question_type: str,
    score: int,
    order: int,
    difficulty: str,
    time_limit: int,
    memory_limit: int,
    options,
    correct_answer,
    metadata,
    coding_ext: dict[str, Any] | None = None,
    actor=None,
) -> tuple[QuestionAsset, QuestionVersion]:
    payload = _build_bank_question_asset_payload_from_components(
        question_type=question_type,
        score=score,
        order=order,
        difficulty=difficulty,
        time_limit=time_limit,
        memory_limit=memory_limit,
        options=options,
        correct_answer=correct_answer,
        metadata=metadata,
        coding_ext=coding_ext,
    )
    asset_type = _asset_type_for_bank_question_payload(
        question_type=question_type,
        metadata=metadata,
        options=options,
        correct_answer=correct_answer,
    )
    return create_question_asset(
        owner=owner,
        asset_type=asset_type,
        title=title or "",
        prompt=prompt or "",
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload=payload,
        actor=actor or owner,
    )


def publish_question_version_for_bank_payload(
    *,
    question: Question,
    pending_data: dict[str, Any],
    coding_ext: dict[str, Any] | None = None,
    actor=None,
) -> tuple[QuestionAsset, QuestionVersion]:
    effective_question_type = pending_data.get("question_type", question.question_type)
    effective_title = pending_data.get("title", question.title)
    effective_prompt = pending_data.get("prompt", question.prompt)
    effective_score = pending_data.get("score", question.score)
    effective_order = pending_data.get("order", question.order)
    effective_difficulty = pending_data.get("difficulty", question.difficulty)
    effective_time_limit = pending_data.get("time_limit", question.time_limit)
    effective_memory_limit = pending_data.get("memory_limit", question.memory_limit)
    effective_options = pending_data.get("options", question.options)
    effective_correct_answer = pending_data.get("correct_answer", question.correct_answer)
    effective_metadata = pending_data.get("metadata", question.metadata)
    effective_coding_ext = coding_ext if coding_ext is not None else _existing_bank_question_coding_ext_payload(question)
    owner = actor or question.created_by or question.bank.owner
    asset_type = _asset_type_for_bank_question_payload(
        question_type=effective_question_type,
        metadata=effective_metadata,
        options=effective_options,
        correct_answer=effective_correct_answer,
    )
    payload = _build_bank_question_asset_payload_from_components(
        question_type=effective_question_type,
        score=effective_score,
        order=effective_order,
        difficulty=effective_difficulty,
        time_limit=effective_time_limit,
        memory_limit=effective_memory_limit,
        options=effective_options,
        correct_answer=effective_correct_answer,
        metadata=effective_metadata,
        coding_ext=effective_coding_ext,
    )

    if question.question_asset_id:
        asset = question.question_asset
        QuestionAsset.objects.filter(pk=asset.pk).update(
            owner=owner or asset.owner,
            asset_type=asset_type,
            visibility=QuestionAsset.Visibility.PRIVATE,
            status=QuestionAsset.Status.ACTIVE,
        )
        asset.refresh_from_db(fields=["owner", "asset_type", "visibility", "status"])
        version = publish_question_version(
            question_asset=asset,
            title=effective_title,
            prompt=effective_prompt,
            payload=payload,
            actor=owner,
        )
        return asset, version

    return create_question_asset(
        owner=owner,
        asset_type=asset_type,
        title=effective_title,
        prompt=effective_prompt,
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload=payload,
        actor=owner,
    )


def write_coding_content_to_asset(
    *,
    owner,
    title: str,
    prompt: str,
    difficulty: str,
    translations: list[dict[str, Any]],
    time_limit: int = 1000,
    memory_limit: int = 128,
    test_cases: list[dict[str, Any]] | None = None,
    language_configs: list[dict[str, Any]] | None = None,
    forbidden_keywords: list[str] | None = None,
    required_keywords: list[str] | None = None,
    legacy_problem_id: str | None = None,
    existing_asset: QuestionAsset | None = None,
    actor=None,
) -> tuple[QuestionAsset, QuestionVersion]:
    """
    Write coding problem content to QuestionAsset (source of truth).
    Creates a new asset or publishes a new version on an existing one.
    """
    payload = {
        "difficulty": difficulty or "medium",
        "time_limit": time_limit,
        "memory_limit": memory_limit,
        "translations": translations or [],
        "test_cases": test_cases or [],
        "language_configs": language_configs or [],
        "forbidden_keywords": forbidden_keywords or [],
        "required_keywords": required_keywords or [],
    }
    if legacy_problem_id:
        payload["legacy_problem_id"] = legacy_problem_id

    if existing_asset:
        QuestionAsset.objects.filter(pk=existing_asset.pk).update(
            owner=owner or existing_asset.owner,
            asset_type=QuestionAsset.AssetType.CODING,
            visibility=QuestionAsset.Visibility.PRIVATE,
            status=QuestionAsset.Status.ACTIVE,
        )
        existing_asset.refresh_from_db(fields=["owner", "asset_type", "visibility", "status"])
        version = publish_question_version(
            question_asset=existing_asset,
            title=title or "",
            prompt=prompt or "",
            payload=payload,
            actor=actor or owner,
        )
        return existing_asset, version

    return create_question_asset(
        owner=owner,
        asset_type=QuestionAsset.AssetType.CODING,
        title=title or "",
        prompt=prompt or "",
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload=payload,
        actor=actor or owner,
    )


def ensure_problem_question_asset(*, problem: Problem, actor=None) -> tuple[QuestionAsset, QuestionVersion]:
    """Ensure a CodingProblem has a QuestionAsset.

    If the problem already has one, return it.  Otherwise create a new asset
    via ``write_coding_content_to_asset`` (the canonical write path) and link
    it back to the problem row.
    """
    if problem.question_asset_id:
        return problem.question_asset, problem.question_version

    owner = actor or problem.created_by
    if owner is None:
        raise ValueError(f"Cannot resolve owner for problem {problem.id}")

    translation = problem.translations.filter(
        language__in=["zh-TW", "zh-hant", "zh-Hant"]
    ).first() or problem.translations.first()
    prompt = (translation.description if translation else "") or ""

    question_asset, question_version = write_coding_content_to_asset(
        owner=owner,
        title=problem.title or "",
        prompt=prompt,
        difficulty=problem.difficulty or "medium",
        translations=list(
            problem.translations.values(
                "language", "title", "description",
                "input_description", "output_description", "hint",
            )
        ),
        time_limit=problem.time_limit,
        memory_limit=problem.memory_limit,
        test_cases=list(
            problem.test_cases.values(
                "input_data", "output_data", "is_sample",
                "score", "weight_percent", "order", "is_hidden",
            )
        ),
        language_configs=list(
            problem.language_configs.values(
                "language", "template_code", "is_enabled", "order",
            )
        ),
        forbidden_keywords=problem.forbidden_keywords or [],
        required_keywords=problem.required_keywords or [],
        legacy_problem_id=str(problem.id),
        actor=owner,
    )

    Problem.objects.filter(pk=problem.pk).update(
        question_asset=question_asset,
        question_version=question_version,
    )
    problem.question_asset = question_asset
    problem.question_version = question_version
    return question_asset, question_version


def sync_exam_question_question_asset(
    *,
    exam_question: ExamQuestion,
    actor=None,
) -> tuple[QuestionAsset, QuestionVersion]:
    title = (exam_question.prompt or "").replace("\n", " ").strip()[:120] or f"Q{(exam_question.order or 0) + 1}"
    prompt = exam_question.prompt or ""
    payload = _build_exam_question_asset_payload(exam_question)
    asset_type = _asset_type_for_exam_question_type(exam_question.question_type)

    if exam_question.question_asset_id:
        question_asset = exam_question.question_asset
        QuestionAsset.objects.filter(pk=question_asset.pk).update(
            owner=exam_question.contest.owner,
            asset_type=asset_type,
            visibility=QuestionAsset.Visibility.PRIVATE,
            status=QuestionAsset.Status.ACTIVE,
        )
        question_asset.refresh_from_db(fields=["owner", "asset_type", "visibility", "status"])
        version = publish_question_version(
            question_asset=question_asset,
            title=title,
            prompt=prompt,
            payload=payload,
            actor=actor or exam_question.contest.owner,
        )
    else:
        question_asset, version = create_question_asset(
            owner=exam_question.contest.owner,
            asset_type=asset_type,
            title=title,
            prompt=prompt,
            visibility=QuestionAsset.Visibility.PRIVATE,
            payload=payload,
            actor=actor or exam_question.contest.owner,
        )
    ExamQuestion.objects.filter(pk=exam_question.pk).update(
        question_asset=question_asset,
        question_version=version,
    )
    exam_question.question_asset = question_asset
    exam_question.question_version = version
    return question_asset, version


def ensure_question_bank_membership(
    *,
    bank,
    question_asset: QuestionAsset,
    order: int,
    legacy_question: Question | None = None,
    actor=None,
) -> QuestionBankMembership:
    if legacy_question is not None:
        existing_by_legacy = QuestionBankMembership.objects.filter(
            legacy_question=legacy_question
        ).first()
        if existing_by_legacy and (
            existing_by_legacy.bank_id != bank.id
            or existing_by_legacy.question_asset_id != question_asset.id
        ):
            existing_by_legacy.bank = bank
            existing_by_legacy.question_asset = question_asset
            existing_by_legacy.order = order
            existing_by_legacy.added_by = actor
            existing_by_legacy.save(
                update_fields=["bank", "question_asset", "order", "added_by", "updated_at"]
            )
            return existing_by_legacy
    membership, _ = QuestionBankMembership.objects.update_or_create(
        bank=bank,
        question_asset=question_asset,
        defaults={
            "order": order,
            "legacy_question": legacy_question,
            "added_by": actor,
        },
    )
    return membership


def ensure_question_asset_for_bank_question(
    *,
    question: Question,
    actor=None,
) -> tuple[QuestionAsset, QuestionVersion]:
    asset_type = _asset_type_for_bank_question(question)
    title = question.title or ""
    prompt = question.prompt or ""
    payload = _build_bank_question_asset_payload(question)
    owner = question.created_by or question.bank.owner

    if question.question_asset_id:
        asset = question.question_asset
        version = publish_question_version(
            question_asset=asset,
            title=title,
            prompt=prompt,
            payload=payload,
            actor=actor or owner,
        )
    else:
        asset, version = create_question_asset(
            owner=owner,
            asset_type=asset_type,
            title=title,
            prompt=prompt,
            visibility=QuestionAsset.Visibility.PRIVATE,
            payload=payload,
            actor=actor or owner,
        )
    Question.objects.filter(pk=question.pk).update(
        question_asset=asset,
        question_version=version,
    )
    question.question_asset = asset
    question.question_version = version
    ensure_question_bank_membership(
        bank=question.bank,
        question_asset=asset,
        order=question.order,
        legacy_question=question,
        actor=actor or owner,
    )
    return asset, version


def cleanup_orphan_asset_if_needed(question_asset, *, coding_problem=None):
    """Delete QuestionAsset (+ CodingProblem) if no contest bindings or bank memberships remain.

    Call after removing a contest binding to avoid leaving orphaned records
    that have no UI entry point for management or deletion.
    """
    if question_asset is None:
        return False

    has_bindings = ContestQuestionBinding.objects.filter(
        question_asset=question_asset,
    ).exists()
    if has_bindings:
        return False

    has_bank = QuestionBankMembership.objects.filter(
        question_asset=question_asset,
    ).exists()
    if has_bank:
        return False

    # Orphaned — delete CodingProblem first (SET_NULL FK won't cascade)
    if coding_problem is not None:
        coding_problem.delete()

    # CASCADE deletes QuestionVersions
    question_asset.delete()
    return True


def ensure_contest_binding_for_exam_question(
    *,
    exam_question: ExamQuestion,
    actor=None,
) -> ContestQuestionBinding:
    question_asset = exam_question.question_asset
    question_version = exam_question.question_version
    if not question_asset or not question_version:
        question_asset, question_version = sync_exam_question_question_asset(
            exam_question=exam_question,
            actor=actor or exam_question.contest.owner,
        )
    return ContestQuestionBinding.objects.update_or_create(
        legacy_exam_question=exam_question,
        defaults={
            "contest": exam_question.contest,
            "question_asset": question_asset,
            "question_version": question_version,
            "binding_type": _asset_type_for_exam_question_type(exam_question.question_type),
            "order": exam_question.order,
            "score": exam_question.score,
            "created_by": actor,
        },
    )[0]
