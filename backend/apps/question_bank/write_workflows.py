"""
Write-side workflows for question bank item CRUD.

Question bank writes publish `QuestionVersion` records and maintain
`QuestionBankMembership`; no materialized bank-question adapter is created.
"""
from __future__ import annotations

from typing import Any

from django.db import transaction

from .models import QuestionAsset
from .question_assets import (
    create_question_asset_for_bank_payload,
    ensure_question_bank_membership,
    extract_content_from_payload,
    publish_question_version,
)

QUESTION_TYPE_CODING = "coding"
QUESTION_TYPE_EXAM = "exam"


@transaction.atomic
def create_bank_question(*, bank, created_by, validated_data):
    payload = dict(validated_data)
    coding_ext = payload.pop("coding_ext", None)
    actor = created_by or bank.owner
    question_asset, _question_version = create_question_asset_for_bank_payload(
        owner=actor,
        actor=actor,
        title=payload.get("title", ""),
        prompt=payload.get("prompt", ""),
        question_type=payload.get("question_type", QUESTION_TYPE_CODING),
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
    return ensure_question_bank_membership(
        bank=bank,
        question_asset=question_asset,
        order=payload.get("order", 0),
        actor=actor,
    )


def _asset_question_type(question_asset: QuestionAsset) -> str:
    if question_asset.asset_type == QuestionAsset.AssetType.CODING:
        return QUESTION_TYPE_CODING
    return QUESTION_TYPE_EXAM


def _coding_ext_from_payload(payload: dict) -> dict:
    content = extract_content_from_payload(payload)
    return {
        **content,
        "test_cases": payload.get("test_cases") or [],
        "language_configs": payload.get("language_configs") or [],
        "forbidden_keywords": payload.get("forbidden_keywords") or [],
        "required_keywords": payload.get("required_keywords") or [],
    }


def _payload_for_membership_update(*, membership, pending_data: dict, coding_ext: dict | None) -> dict[str, Any]:
    version = membership.question_asset.latest_version
    existing_payload = version.payload if version and isinstance(version.payload, dict) else {}
    question_type = pending_data.get("question_type") or _asset_question_type(membership.question_asset)
    metadata = pending_data.get("metadata", existing_payload.get("metadata") or {})

    effective_coding_ext = coding_ext
    if effective_coding_ext is None and question_type == QUESTION_TYPE_CODING:
        effective_coding_ext = _coding_ext_from_payload(existing_payload)

    payload = {
        "score": pending_data.get("score", existing_payload.get("score", 100)),
        "order": pending_data.get("order", membership.order),
        "difficulty": pending_data.get("difficulty", existing_payload.get("difficulty", "medium")),
        "time_limit": pending_data.get("time_limit", existing_payload.get("time_limit", 1000)),
        "memory_limit": pending_data.get("memory_limit", existing_payload.get("memory_limit", 128)),
        "options": pending_data.get("options", existing_payload.get("options") or []),
        "correct_answer": pending_data.get("correct_answer", existing_payload.get("correct_answer")),
        "metadata": metadata if isinstance(metadata, dict) else {},
    }
    source_keys = (
        "source_type",
        "source_id",
        "source_contest_id",
        "source_question_id",
        "source_bank_id",
        "source_bank_name",
    )
    for key in source_keys:
        if key in existing_payload:
            payload[key] = existing_payload[key]

    if question_type == QUESTION_TYPE_CODING:
        coding_payload = effective_coding_ext or {}
        payload.update(_coding_ext_from_payload(coding_payload))
    else:
        payload["question_type"] = pending_data.get(
            "question_type",
            existing_payload.get("question_type", membership.question_asset.asset_type),
        )
    return payload


@transaction.atomic
def update_bank_question_membership(*, membership, validated_data, actor=None):
    pending_data = dict(validated_data)
    coding_ext = pending_data.pop("coding_ext", None)
    version = membership.question_asset.latest_version
    if version is None:
        raise ValueError("Question asset has no published version")

    payload = _payload_for_membership_update(
        membership=membership,
        pending_data=pending_data,
        coding_ext=coding_ext,
    )
    title = pending_data.get("title", version.title or membership.question_asset.title)
    prompt = pending_data.get("prompt", version.prompt or membership.question_asset.prompt)
    new_version = publish_question_version(
        question_asset=membership.question_asset,
        title=title,
        prompt=prompt,
        payload=payload,
        actor=actor or membership.added_by or membership.question_asset.owner,
    )
    membership.question_asset.latest_version = new_version
    if "order" in pending_data:
        membership.order = pending_data["order"]
        membership.save(update_fields=["order", "updated_at"])
    return membership
