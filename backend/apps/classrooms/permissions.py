"""
Permissions and role detection for classrooms.
"""
from rest_framework import permissions


def get_user_role_in_classroom(user, classroom):
    """
    Determine user's role in a classroom.

    Returns: 'platform_admin' | 'owner' | 'manager' | 'member' | None
    """
    if not user or not user.is_authenticated:
        return None

    if user.is_staff or user.is_superuser:
        return 'platform_admin'

    if classroom.owner_id == user.id:
        return 'owner'

    if classroom.admins.filter(pk=user.pk).exists():
        return 'manager'

    membership = classroom.memberships.filter(user=user).first()
    if membership:
        return 'manager' if membership.role == 'ta' else 'member'

    return None


class IsClassroomOwnerOrAdmin(permissions.BasePermission):
    """Only classroom owner, admins, or system admin can access."""

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_staff or request.user.is_superuser:
            return True

        classroom = obj if hasattr(obj, 'invite_code') else getattr(obj, 'classroom', None)
        if not classroom:
            return False

        if classroom.owner_id == request.user.id:
            return True

        if classroom.admins.filter(pk=request.user.pk).exists():
            return True

        membership = classroom.memberships.filter(user=request.user).first()
        if membership and membership.role == 'ta':
            return True

        return False


class IsClassroomMember(permissions.BasePermission):
    """Any classroom member (including owner/admins) can access."""

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_staff or request.user.is_superuser:
            return True

        classroom = obj if hasattr(obj, 'invite_code') else getattr(obj, 'classroom', None)
        if not classroom:
            return False

        if classroom.owner_id == request.user.id:
            return True

        if classroom.admins.filter(pk=request.user.pk).exists():
            return True

        return classroom.memberships.filter(user=request.user).exists()
