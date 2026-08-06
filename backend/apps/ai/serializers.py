"""Compatibility request validation and AI Service response mapping."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers


class CreateSessionSerializer(serializers.Serializer):
    context = serializers.JSONField(required=False, default=dict)


class RenameSessionSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=100)


class StartRunSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=100_000)
    model_id = serializers.ChoiceField(
        choices=[
            "openai-nano",
            "openai-mini",
            "openai-mini-medium",
            "deepseek-v4",
            "deepseek-v4-flash",
            "deepseek-v4-pro",
            "deepseek-v4-thinking",
        ],
        required=False,
        default="openai-nano",
    )


class RunApprovalSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])


class RunAnswerSerializer(serializers.Serializer):
    answer = serializers.CharField(max_length=100_000)


class ModelInfoSerializer(serializers.Serializer):
    model_id = serializers.CharField()
    display_name = serializers.CharField()
    description = serializers.CharField()
    is_default = serializers.BooleanField()


class ArtifactUploadSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    step = serializers.RegexField(
        regex=r"^[A-Za-z0-9_\-]{1,64}$", required=False, default="user_upload"
    )
    file = serializers.FileField()


def message_to_legacy(data: dict[str, Any]) -> dict[str, Any]:
    metadata = dict(data.get("metadata") or {})
    if run_id := data.get("run_id"):
        metadata.setdefault("run_id", str(run_id))
    return {
        "id": data.get("ordinal"),
        "role": data.get("role"),
        "content": data.get("content", ""),
        "message_type": "text",
        "metadata": metadata,
        "created_at": data.get("created_at"),
    }


def session_to_legacy(
    data: dict[str, Any],
    *,
    user_id: object,
    include_messages: bool,
) -> dict[str, Any]:
    messages = [
        message_to_legacy(message)
        for message in data.get("messages", [])
        if isinstance(message, dict)
    ]
    result = {
        "session_id": str(data["session_id"]),
        "user": user_id,
        "title": data.get("title") or "新對話",
        "context": data.get("context") or {},
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
        "message_count": len(messages),
    }
    if include_messages:
        result["messages"] = messages
    return result


def session_list_to_legacy(data: dict[str, Any], *, user_id: object) -> dict[str, Any]:
    return {
        "count": int(data.get("count", 0)),
        "next": data.get("next"),
        "previous": data.get("previous"),
        "results": [
            session_to_legacy(item, user_id=user_id, include_messages=False)
            for item in data.get("results", [])
            if isinstance(item, dict)
        ],
    }


def run_to_legacy(data: dict[str, Any]) -> dict[str, Any]:
    pause_payload = data.get("pause_payload") or {}
    status_value = data.get("status")
    return {
        "id": str(data["run_id"]),
        "session_id": str(data["session_id"]),
        "status": status_value,
        "kind": data.get("kind"),
        "model_id": data.get("model_id"),
        "last_event_seq": int(data.get("last_sequence", 0)),
        "approval_payload": pause_payload
        if status_value == "awaiting_approval"
        else {},
        "question_payload": (
            pause_payload if status_value == "awaiting_user_answer" else {}
        ),
        "cancel_requested": bool(data.get("cancel_requested", False)),
        "error": data.get("error_message"),
        "error_code": data.get("error_code"),
        "input_tokens": int(data.get("input_tokens", 0)),
        "output_tokens": int(data.get("output_tokens", 0)),
    }


def run_list_to_legacy(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "count": int(data.get("count", 0)),
        "next": data.get("next"),
        "previous": data.get("previous"),
        "results": [
            run_to_legacy(item)
            for item in data.get("results", [])
            if isinstance(item, dict)
        ],
    }


def artifact_to_legacy(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(data["artifact_id"]),
        "session_id": str(data["session_id"]),
        "run_id": (
            str(data["produced_by_run_id"]) if data.get("produced_by_run_id") else None
        ),
        "step": data.get("step"),
        "filename": data.get("filename"),
        "content_type": data.get("content_type"),
        "size_bytes": int(data.get("size_bytes", 0)),
        "checksum": data.get("checksum"),
        "metadata": data.get("metadata") or {},
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


def artifact_list_to_legacy(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "count": int(data.get("count", 0)),
        "next": data.get("next"),
        "previous": data.get("previous"),
        "results": [
            artifact_to_legacy(item)
            for item in data.get("results", [])
            if isinstance(item, dict)
        ],
    }
