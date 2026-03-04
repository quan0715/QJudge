"""
Permissions and role detection for contests.
"""
from rest_framework import permissions
from django.utils import timezone


# ---------------------------------------------------------------------------
# Scope Role System
# ---------------------------------------------------------------------------

#: All roles that can manage contest resources (create/update/delete).
MANAGER_SCOPE_ROLES = frozenset(('platform_admin', 'owner', 'co_owner'))

#: Roles allowed for irreversible lifecycle operations (toggle status, archive, delete, manage admins).
#: co_owner is intentionally excluded.
LIFECYCLE_OWNER_ROLES = frozenset(('platform_admin', 'owner'))

#: Maps scope role → legacy role name (for backward-compat callers).
_SCOPE_TO_LEGACY = {
    'platform_admin': 'admin',
    'owner': 'owner',
    'co_owner': 'teacher',
    'participant': 'student',
    'outsider': 'student',
    'anonymous': 'student',
}


def get_contest_scope_role(user, contest) -> str:
    """
    Return the canonical scope role for *user* within *contest*.

    Roles (most → least privileged):
      platform_admin  – system staff / superuser
      owner           – contest creator
      co_owner        – co-admin added via admins M2M
      participant     – registered contest participant
      outsider        – authenticated but not registered
      anonymous       – unauthenticated
    """
    if not user or not user.is_authenticated:
        return 'anonymous'
    if user.is_staff or user.is_superuser:
        return 'platform_admin'
    if contest.owner_id == user.id:
        return 'owner'
    if contest.admins.filter(pk=user.pk).exists():
        return 'co_owner'
    from .models import ContestParticipant  # avoid circular import
    if ContestParticipant.objects.filter(contest=contest, user=user).exists():
        return 'participant'
    return 'outsider'


def can_manage_contest(user, contest) -> bool:
    """Return True if *user* has management rights over *contest*."""
    return get_contest_scope_role(user, contest) in MANAGER_SCOPE_ROLES


def get_user_role_in_contest(user, contest) -> str:
    """
    Legacy helper – maps scope role to old role strings.

    Returns: 'admin' | 'owner' | 'teacher' | 'student'
    Prefer get_contest_scope_role() for new code.
    """
    return _SCOPE_TO_LEGACY[get_contest_scope_role(user, contest)]


def get_contest_permissions(user, contest):
    """
    Calculate all permissions for a user in a contest.
    
    Returns a dict with boolean flags for various permissions.
    """
    role = get_user_role_in_contest(user, contest)
    
    # Admin has all permissions
    if role == 'admin':
        return {
            'can_switch_view': True,
            'can_edit_contest': True,
            'can_toggle_status': True,
            'can_delete_contest': True,
            'can_publish_problems': True,
            'can_view_all_submissions': True,
            'can_view_full_scoreboard': True,
        }

    # Owner has full permissions
    if role == 'owner':
        return {
            'can_switch_view': True,
            'can_edit_contest': True,
            'can_toggle_status': True,
            'can_delete_contest': True,
            'can_publish_problems': True,
            'can_view_all_submissions': True,
            'can_view_full_scoreboard': True,
        }

    # Co-admin (teacher) can manage content but not lifecycle
    if role == 'teacher':
        return {
            'can_switch_view': True,
            'can_edit_contest': True,
            'can_toggle_status': False,
            'can_delete_contest': False,
            'can_publish_problems': True,
            'can_view_all_submissions': True,
            'can_view_full_scoreboard': True,
        }
    
    # Student permissions are more restricted
    # Scoreboard visibility depends on contest settings and status
    has_ended = bool(contest.end_time and timezone.now() > contest.end_time)
    can_view_scoreboard = (
        contest.scoreboard_visible_during_contest or
        has_ended
    )
    
    return {
        'can_switch_view': False,
        'can_edit_contest': False,
        'can_toggle_status': False,
        'can_delete_contest': False,
        'can_publish_problems': False,
        'can_view_all_submissions': False,
        'can_view_full_scoreboard': can_view_scoreboard,
    }


class IsContestOwnerOrAdmin(permissions.BasePermission):
    """
    Object-level permission: only platform_admin, owner, or co_owner can access.
    The contest must be reachable via ``obj`` directly or ``obj.contest``.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        contest = obj if hasattr(obj, 'admins') else getattr(obj, 'contest', None)
        if contest is None:
            return False
        return can_manage_contest(request.user, contest)


class IsContestLifecycleOwner(permissions.BasePermission):
    """
    Stricter object-level permission: only platform_admin and owner.
    co_owner is intentionally excluded.

    Use for irreversible lifecycle operations: toggle status, archive, delete,
    manage admins.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        contest = obj if hasattr(obj, 'admins') else getattr(obj, 'contest', None)
        if contest is None:
            return False
        return get_contest_scope_role(request.user, contest) in LIFECYCLE_OWNER_ROLES


class IsContestParticipant(permissions.BasePermission):
    """
    Permission class: only contest participants can access.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Admin and owner always have access
        if request.user.is_staff or request.user.is_superuser:
            return True
        
        if obj.owner_id == request.user.id:
            return True
        
        # Check if user is registered for the contest
        from .models import ContestParticipant
        return ContestParticipant.objects.filter(
            contest=obj,
            user=request.user
        ).exists()


class IsTeacherOrAdmin(permissions.BasePermission):
    """
    Permission class: only platform teachers or system admins can access.
    Used for platform-level (non-contest-scoped) endpoints.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            request.user.is_staff
            or request.user.is_superuser
            or getattr(request.user, 'role', None) == 'teacher'
        )
