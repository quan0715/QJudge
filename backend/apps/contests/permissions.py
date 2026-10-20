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

#: Roles allowed to change publication status or delete a contest.
#: co_owner is intentionally excluded.
LIFECYCLE_OWNER_ROLES = frozenset(('platform_admin', 'owner'))

CLASSROOM_SCOPE_TO_CONTEST_SCOPE = {
    'platform_admin': 'platform_admin',
    'owner': 'owner',
    'manager': 'co_owner',
    'member': 'participant',
    None: 'outsider',
}


def map_classroom_role_to_contest_scope(classroom_role: str | None) -> str:
    return CLASSROOM_SCOPE_TO_CONTEST_SCOPE.get(classroom_role, 'outsider')


#: Actions each scope role may perform. The UI flags below and
#: ``ContestAccessPolicy`` both read this table.
BASE_ROLE_PERMISSIONS = {
    'platform_admin': {
        'manage_contest_settings', 'manage_contest_lifecycle',
        'manage_participants', 'manage_problems',
        'view_scoreboard_full', 'view_report', 'export_report',
        'submit', 'view_draft', 'view_participants',
        'manage_clarifications', 'view_all_submissions',
    },
    'owner': {
        'manage_contest_settings', 'manage_contest_lifecycle',
        'manage_participants', 'manage_problems',
        'view_scoreboard_full', 'view_report', 'export_report',
        'submit', 'view_draft', 'view_participants',
        'manage_clarifications', 'view_all_submissions',
    },
    'co_owner': {
        'manage_contest_settings', 'manage_participants', 'manage_problems',
        'view_scoreboard_full', 'view_report', 'export_report',
        'submit', 'view_draft', 'view_participants',
        'manage_clarifications', 'view_all_submissions',
    },
    'participant': {
        'view_scoreboard_limited', 'submit', 'view_own_report',
        'create_clarification',
    },
    'outsider': set(),
    'anonymous': set(),
}


def _get_primary_classroom_binding(contest):
    return (
        contest.classroom_bindings.select_related('classroom')
        .order_by('bound_at')
        .first()
    )


def get_contest_scope_role(user, contest) -> str:
    """
    Return the scope role for *user* within *contest*.

    Every contest belongs to a classroom, and the user's role in its primary
    (earliest) bound classroom is the only authority:

      platform_admin  – system staff / superuser
      owner           – classroom owner
      co_owner        – classroom TA
      participant     – classroom student
      outsider        – authenticated, not in the classroom
      anonymous       – unauthenticated
    """
    if not user or not user.is_authenticated:
        return 'anonymous'
    if user.is_staff or user.is_superuser:
        return 'platform_admin'

    binding = _get_primary_classroom_binding(contest)
    if binding is None:
        return 'outsider'

    from apps.classrooms.permissions import get_user_role_in_classroom

    return map_classroom_role_to_contest_scope(get_user_role_in_classroom(user, binding.classroom))


def can_manage_contest(user, contest) -> bool:
    """Return True if *user* has management rights over *contest*."""
    return get_contest_scope_role(user, contest) in MANAGER_SCOPE_ROLES


def get_contest_permissions(user, contest):
    """Return the contest UI permission flags for *user*."""
    granted = BASE_ROLE_PERMISSIONS[get_contest_scope_role(user, contest)]
    has_ended = bool(contest.end_time and timezone.now() > contest.end_time)
    return {
        'can_switch_view': 'manage_problems' in granted,
        'can_edit_contest': 'manage_contest_settings' in granted,
        'can_toggle_status': 'manage_contest_lifecycle' in granted,
        'can_delete_contest': 'manage_contest_lifecycle' in granted,
        'can_publish_problems': 'manage_problems' in granted,
        'can_view_all_submissions': 'view_all_submissions' in granted,
        'can_view_full_scoreboard': (
            'view_scoreboard_full' in granted
            or contest.scoreboard_visible_during_contest
            or has_ended
        ),
        'can_manage_clarifications': 'manage_clarifications' in granted,
    }


def _contest_of(obj):
    from .models import Contest  # local import avoids cycles

    return obj if isinstance(obj, Contest) else getattr(obj, 'contest', None)


class IsContestOwnerOrAdmin(permissions.BasePermission):
    """
    Object-level permission: only platform_admin, owner, or co_owner can access.
    The contest must be reachable via ``obj`` directly or ``obj.contest``.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        contest = _contest_of(obj)
        if contest is None:
            return False
        return can_manage_contest(request.user, contest)


class IsContestLifecycleOwner(permissions.BasePermission):
    """
    Stricter object-level permission: only platform_admin and owner.
    co_owner is intentionally excluded.

    Use for publication status changes and contest deletion.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        contest = _contest_of(obj)
        if contest is None:
            return False
        return get_contest_scope_role(request.user, contest) in LIFECYCLE_OWNER_ROLES


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
