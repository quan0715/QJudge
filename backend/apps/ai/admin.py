"""Admin configuration for AI Chat models."""

from django.contrib import admin
from django.utils.html import format_html

from .models import AIExecutionLog, AIMessage, AISession


class AIMessageInline(admin.TabularInline):
    """Inline display for AIMessage in AISession admin."""

    model = AIMessage
    extra = 0
    readonly_fields = ["role", "content", "message_type", "metadata", "created_at"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(AISession)
class AISessionAdmin(admin.ModelAdmin):
    """Admin for AISession model."""

    list_display = [
        "session_id_short",
        "user",
        "created_problem",
        "created_at",
        "updated_at",
    ]
    list_filter = ["created_at", "user"]
    search_fields = ["session_id", "user__username", "user__email"]
    readonly_fields = ["session_id", "created_at", "updated_at"]
    raw_id_fields = ["user", "created_problem"]
    inlines = [AIMessageInline]

    fieldsets = (
        (None, {"fields": ("session_id", "user")}),
        ("關聯資料", {"fields": ("created_problem", "context")}),
        ("時間戳記", {"fields": ("created_at", "updated_at")}),
    )

    def session_id_short(self, obj):
        """Display shortened session_id."""
        return obj.session_id[:8] + "..." if len(obj.session_id) > 8 else obj.session_id

    session_id_short.short_description = "Session ID"


@admin.register(AIMessage)
class AIMessageAdmin(admin.ModelAdmin):
    """Admin for AIMessage model."""

    list_display = [
        "id",
        "session",
        "role",
        "message_type",
        "short_content",
        "created_at",
    ]
    list_filter = ["role", "message_type", "created_at"]
    search_fields = ["content", "session__user__username"]
    readonly_fields = ["created_at"]
    raw_id_fields = ["session"]

    def short_content(self, obj):
        """Display truncated content."""
        return obj.content[:100] + "..." if len(obj.content) > 100 else obj.content

    short_content.short_description = "內容"


@admin.register(AIExecutionLog)
class AIExecutionLogAdmin(admin.ModelAdmin):
    """Admin for AIExecutionLog model."""

    list_display = [
        "id",
        "user",
        "session",
        "created_at",
        "short_user_message",
    ]
    list_filter = ["created_at", "user"]
    search_fields = ["user__username", "session__session_id", "user_message"]
    readonly_fields = [
        "created_at",
        "updated_at",
        "user_message",
        "ai_response",
        "raw_log",
        "metadata",
    ]
    raw_id_fields = ["user", "session"]

    fieldsets = (
        (
            "基本資訊",
            {"fields": ("user", "session", "created_at", "updated_at")},
        ),
        (
            "對話內容",
            {"fields": ("user_message", "ai_response")},
        ),
        (
            "原始日誌",
            {
                "fields": ("raw_log",),
                "description": "完整的 API 請求/回應、工具調用、思考過程等",
            },
        ),
        (
            "元資訊",
            {"fields": ("metadata",)},
        ),
    )

    def short_user_message(self, obj):
        """Display truncated user message."""
        msg = obj.user_message
        return msg[:50] + "..." if len(msg) > 50 else msg

    short_user_message.short_description = "用戶訊息"
