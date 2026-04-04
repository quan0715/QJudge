"""
Permission classes for question bank object-level authorization.
"""
from rest_framework import permissions


class IsQuestionBankOwner(permissions.BasePermission):
    """Allow access only to the bank owner."""

    message = "Only the bank owner can perform this action."

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return getattr(obj, "owner_id", None) == user.id


class IsQuestionBankAdminReviewer(permissions.BasePermission):
    """Allow review actions only to platform admins."""

    message = "Admin only."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return bool(user.is_staff or getattr(user, "role", None) == "admin")
