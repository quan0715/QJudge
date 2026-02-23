"""AI Chat serializers."""

from rest_framework import serializers

from .models import AIMessage, AIPendingAction, AISession


class AIMessageSerializer(serializers.ModelSerializer):
    """Serializer for AI messages."""

    class Meta:
        model = AIMessage
        fields = [
            "id",
            "role",
            "content",
            "message_type",
            "metadata",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AISessionSerializer(serializers.ModelSerializer):
    """Serializer for AI sessions."""

    messages = AIMessageSerializer(many=True, read_only=True)
    message_count = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()

    class Meta:
        model = AISession
        fields = [
            "session_id",
            "user",
            "context",
            "created_at",
            "updated_at",
            "messages",
            "message_count",
            "title",
        ]
        read_only_fields = ["session_id", "user", "created_at", "updated_at", "messages"]

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_title(self, obj):
        """Generate a title from context or first user message."""
        if obj.context and obj.context.get("title"):
            return obj.context["title"]
        first_user_msg = obj.messages.filter(role="user").first()
        if first_user_msg:
            content = first_user_msg.content
            return content[:30] + "..." if len(content) > 30 else content
        return f"對話 {obj.session_id[:8]}..."


class AISessionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for session list."""

    message_count = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()

    class Meta:
        model = AISession
        fields = [
            "session_id",
            "user",
            "created_at",
            "updated_at",
            "message_count",
            "title",
        ]

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_title(self, obj):
        """Generate a title from context or first user message."""
        if obj.context and obj.context.get("title"):
            return obj.context["title"]
        first_user_msg = obj.messages.filter(role="user").first()
        if first_user_msg:
            content = first_user_msg.content
            return content[:30] + "..." if len(content) > 30 else content
        return f"對話 {obj.session_id[:8]}..."


class RenameSessionSerializer(serializers.Serializer):
    """Serializer for renaming a session."""

    title = serializers.CharField(max_length=100)


# ============================================================
# v2 Serializers
# ============================================================


class SendMessageStreamSerializer(serializers.Serializer):
    """Serializer for POST send_message_stream (v2 contract)."""

    content = serializers.CharField(max_length=10000)
    model_id = serializers.ChoiceField(
        choices=["claude-haiku", "claude-sonnet", "claude-opus"],
        required=False,
        default="claude-sonnet",
    )
    api_key_override = serializers.CharField(
        max_length=200,
        required=False,
        allow_null=True,
        write_only=True,
    )
    system_prompt = serializers.CharField(max_length=10000, required=False, allow_null=True)
    skill = serializers.CharField(max_length=100, required=False, allow_null=True)


class ModelInfoSerializer(serializers.Serializer):
    """Serializer for model info."""

    model_id = serializers.CharField()
    display_name = serializers.CharField()
    description = serializers.CharField()
    is_default = serializers.BooleanField()


class PendingActionSerializer(serializers.ModelSerializer):
    """Serializer for AIPendingAction."""

    class Meta:
        model = AIPendingAction
        fields = [
            "id",
            "session",
            "action_type",
            "target_problem",
            "payload",
            "preview",
            "status",
            "created_at",
            "expires_at",
        ]
        read_only_fields = fields


class PrepareActionSerializer(serializers.Serializer):
    """Serializer for internal prepare action request."""

    session_id = serializers.CharField(max_length=100)
    user_id = serializers.IntegerField()
    action_type = serializers.ChoiceField(choices=["create", "patch"])
    payload = serializers.JSONField()


class CommitActionSerializer(serializers.Serializer):
    """Serializer for internal commit action request."""

    action_id = serializers.UUIDField()
