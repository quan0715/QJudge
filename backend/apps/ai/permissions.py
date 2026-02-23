"""Permission classes for AI app."""

from rest_framework.permissions import BasePermission

from .internal_auth import IsInternalService  # noqa: F401 — re-export


class IsTeacherOrAdmin(BasePermission):
    """Only teacher or admin users can use agent write capabilities."""

    message = "只有教師或管理員可以使用此功能。"

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.role in ("teacher", "admin") or user.is_staff
