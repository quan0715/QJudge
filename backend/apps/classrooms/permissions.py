"""
Permissions and role detection for classrooms.
"""
from rest_framework import permissions

#: Classroom roles that may manage the classroom and its contests.
CLASSROOM_MANAGER_ROLES = frozenset(('platform_admin', 'owner', 'manager'))


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

    membership = classroom.memberships.filter(user=user).first()
    if membership:
        return 'manager' if membership.role == 'ta' else 'member'

    return None


def _classroom_of(obj):
    return obj if hasattr(obj, 'invite_code') else getattr(obj, 'classroom', None)


class IsClassroomOwnerOrAdmin(permissions.BasePermission):
    """Only classroom owner, TAs, or platform admin can access."""

    def has_object_permission(self, request, view, obj):
        classroom = _classroom_of(obj)
        return classroom is not None and get_user_role_in_classroom(request.user, classroom) in CLASSROOM_MANAGER_ROLES


class IsClassroomMember(permissions.BasePermission):
    """Any classroom member (including owner and TAs) can access."""

    def has_object_permission(self, request, view, obj):
        classroom = _classroom_of(obj)
        return classroom is not None and get_user_role_in_classroom(request.user, classroom) is not None
