"""Request validation for the AI Service gateway."""

from __future__ import annotations

from rest_framework import serializers


class CreateSessionSerializer(serializers.Serializer):
    context = serializers.JSONField(required=False, default=dict)


class RenameSessionSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=100)


class UpdateSessionSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=100, required=False)
    context = serializers.JSONField(required=False)
    context_mode = serializers.ChoiceField(
        choices=["merge", "replace"], required=False, default="merge"
    )

    def validate(self, attrs):
        if "title" not in attrs and "context" not in attrs:
            raise serializers.ValidationError("title or context is required")
        if "context" in attrs and not isinstance(attrs["context"], dict):
            raise serializers.ValidationError({"context": "Must be an object."})
        return attrs


class StartRunSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=100_000)
    # The AI service owns the live catalog, default and model validation.
    model_id = serializers.CharField(max_length=50, required=False)
    # The AI service owns the page context shape it renders into prompts.
    page_context = serializers.JSONField(required=False)


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
