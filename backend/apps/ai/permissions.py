"""Permission classes for AI app."""

from django.conf import settings
from rest_framework.permissions import BasePermission


class IsTeacherOrAdmin(BasePermission):
    """Only teacher or admin users can use agent write capabilities."""

    message = "只有教師或管理員可以使用此功能。"

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.role in ("teacher", "admin") or user.is_staff


class IsAIServiceInternal(BasePermission):
    """Authorize internal ai-service traffic via shared secret header.

    Matches the header (``X-AI-Internal-Token``) already used for
    backend↔ai-service communication in run_runtime/stream_proxy.
    """

    message = "Invalid or missing AI service internal token."

    def has_permission(self, request, view):
        expected = getattr(settings, "AI_SERVICE_INTERNAL_TOKEN", "").strip()
        if not expected:
            return False
        provided = (request.headers.get("X-AI-Internal-Token") or "").strip()
        return bool(provided) and provided == expected
