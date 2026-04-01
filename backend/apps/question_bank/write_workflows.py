"""
Write-side workflows for question bank question CRUD.

Keep serializer classes focused on payload validation while business-side
effects (coding ext persistence + canonical asset sync) live here.
"""
from __future__ import annotations

from django.db import transaction

from .models import Question, QuestionAsset, QuestionCodingExt
from .question_assets import (
    create_question_asset_for_bank_payload,
    ensure_question_bank_membership,
    publish_question_version_for_bank_payload,
)


@transaction.atomic
def create_bank_question(*, bank, created_by, validated_data) -> Question:
    payload = dict(validated_data)
    coding_ext = payload.pop("coding_ext", None)
    actor = created_by or bank.owner
    question_asset, question_version = create_question_asset_for_bank_payload(
        owner=actor,
        actor=actor,
        title=payload.get("title", ""),
        prompt=payload.get("prompt", ""),
        question_type=payload.get("question_type", Question.QuestionType.CODING),
        score=payload.get("score", 100),
        order=payload.get("order", 0),
        difficulty=payload.get("difficulty", "medium"),
        time_limit=payload.get("time_limit", 1000),
        memory_limit=payload.get("memory_limit", 128),
        options=payload.get("options", []),
        correct_answer=payload.get("correct_answer"),
        metadata=payload.get("metadata", {}),
        coding_ext=coding_ext,
    )
    return materialize_bank_question_adapter(
        bank=bank,
        question_asset=question_asset,
        question_version=question_version,
        actor=actor,
        created_by=created_by,
        question_type=payload.get("question_type", Question.QuestionType.CODING),
        title=payload.get("title", ""),
        prompt=payload.get("prompt", ""),
        score=payload.get("score", 100),
        order=payload.get("order", 0),
        difficulty=payload.get("difficulty", "medium"),
        time_limit=payload.get("time_limit", 1000),
        memory_limit=payload.get("memory_limit", 128),
        options=payload.get("options", []),
        correct_answer=payload.get("correct_answer"),
        metadata=payload.get("metadata", {}),
        coding_ext=coding_ext,
    )


@transaction.atomic
def update_bank_question(*, question: Question, validated_data, actor=None) -> Question:
    payload = dict(validated_data)
    coding_ext = payload.pop("coding_ext", None)
    resolved_actor = actor or question.created_by or question.bank.owner
    question_asset, question_version = publish_question_version_for_bank_payload(
        question=question,
        pending_data=payload,
        coding_ext=coding_ext,
        actor=resolved_actor,
    )

    for attr, value in payload.items():
        setattr(question, attr, value)
    question.question_asset = question_asset
    question.question_version = question_version
    question.save()

    if coding_ext is not None:
        QuestionCodingExt.objects.update_or_create(
            question=question,
            defaults=coding_ext,
        )

    ensure_question_bank_membership(
        bank=question.bank,
        question_asset=question_asset,
        order=question.order,
        legacy_question=question,
        actor=resolved_actor,
    )
    return question


@transaction.atomic
def materialize_bank_question_adapter(
    *,
    bank,
    question_asset,
    question_version,
    actor,
    question_type,
    title,
    prompt,
    score,
    order=0,
    difficulty="medium",
    time_limit=1000,
    memory_limit=128,
    options=None,
    correct_answer=None,
    metadata=None,
    created_by=None,
    source_question=None,
    source_bank=None,
    coding_ext=None,
    existing: Question | None = None,
) -> Question:
    adapter_payload = {
        "question_type": question_type,
        "title": title or "",
        "prompt": prompt or "",
        "options": options or [],
        "correct_answer": correct_answer,
        "score": score,
        "order": order,
        "difficulty": difficulty or "medium",
        "time_limit": time_limit or 1000,
        "memory_limit": memory_limit or 128,
        "metadata": metadata or {},
        "created_by": created_by,
        "source_question": source_question,
        "source_bank": source_bank,
        "question_asset": question_asset,
        "question_version": question_version,
    }

    if existing is None:
        question = Question.objects.create(
            bank=bank,
            **adapter_payload,
        )
    else:
        for attr, value in adapter_payload.items():
            setattr(existing, attr, value)
        existing.bank = bank
        existing.save(update_fields=[*adapter_payload.keys(), "bank", "updated_at"])
        question = existing

    if question.question_type == Question.QuestionType.CODING:
        QuestionCodingExt.objects.update_or_create(
            question=question,
            defaults=coding_ext or {
                "translations": [],
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": [],
                "required_keywords": [],
            },
        )

    ensure_question_bank_membership(
        bank=bank,
        question_asset=question_asset,
        order=question.order,
        legacy_question=question,
        actor=actor,
    )
    return question


@transaction.atomic
def materialize_bank_question_adapter_for_membership(*, membership, actor=None) -> Question:
    if membership.legacy_question_id:
        return membership.legacy_question

    version = membership.question_asset.latest_version
    if version is None:
        raise ValueError("Question asset has no published version")
    payload = version.payload if isinstance(version.payload, dict) else {}
    question_type = (
        Question.QuestionType.CODING
        if membership.question_asset.asset_type == QuestionAsset.AssetType.CODING
        else Question.QuestionType.EXAM
    )
    coding_ext = None
    if question_type == Question.QuestionType.CODING:
        coding_ext = {
            "translations": payload.get("translations") or [],
            "test_cases": payload.get("test_cases") or [],
            "language_configs": payload.get("language_configs") or [],
            "forbidden_keywords": payload.get("forbidden_keywords") or [],
            "required_keywords": payload.get("required_keywords") or [],
        }
    return materialize_bank_question_adapter(
        bank=membership.bank,
        question_asset=membership.question_asset,
        question_version=version,
        actor=actor or membership.added_by or membership.question_asset.owner,
        question_type=question_type,
        title=version.title or membership.question_asset.title,
        prompt=version.prompt or membership.question_asset.prompt,
        score=payload.get("score") or 100,
        order=membership.order,
        difficulty=payload.get("difficulty") or "medium",
        time_limit=payload.get("time_limit") or 1000,
        memory_limit=payload.get("memory_limit") or 128,
        options=payload.get("options") or [],
        correct_answer=payload.get("correct_answer"),
        metadata=(payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}) or {},
        created_by=membership.added_by or membership.question_asset.owner,
        coding_ext=coding_ext,
    )
