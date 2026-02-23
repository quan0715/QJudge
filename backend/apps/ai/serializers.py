"""AI Chat serializers."""

from rest_framework import serializers

from .models import AIMessage, AISession


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


class ProblemReferenceSerializer(serializers.Serializer):
    """Serializer for problem reference context."""

    id = serializers.IntegerField()
    title = serializers.CharField(max_length=200)
    difficulty = serializers.CharField(max_length=20, required=False, allow_null=True)
    description = serializers.CharField(max_length=2000, required=False, allow_null=True)
    tags = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        allow_null=True,
    )


class SendMessageSerializer(serializers.Serializer):
    """Serializer for sending a message."""

    content = serializers.CharField(max_length=10000)
    skill = serializers.CharField(max_length=100, required=False, allow_null=True)
    system_prompt = serializers.CharField(max_length=5000, required=False, allow_null=True)
    session_id = serializers.CharField(max_length=200, required=False, allow_null=True,
                                       help_text="Claude SDK session ID for resuming existing session")
    session_mode = serializers.ChoiceField(
        choices=["new", "resume", "auto"],
        required=False,
        default="auto",
        help_text="Session handling mode: 'new' starts fresh, 'resume' requires existing session, 'auto' resumes if available",
    )
    model = serializers.ChoiceField(
        choices=["haiku", "sonnet", "opus"],
        required=False,
        default="haiku",
        help_text="Model to use: 'haiku' (fast/cheap), 'sonnet' (balanced), 'opus' (powerful)",
    )
    reference = ProblemReferenceSerializer(required=False, allow_null=True)


class RenameSessionSerializer(serializers.Serializer):
    """Serializer for renaming a session."""

    title = serializers.CharField(max_length=100)
