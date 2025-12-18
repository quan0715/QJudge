"""
Unified Contest Access Policy.

This module provides a centralized permission system for contest operations,
replacing scattered permission checks throughout views.py.
"""
from rest_framework import permissions, status
from django.utils import timezone
from rest_framework.response import Response

from .models import Contest, ContestParticipant, ExamStatus
from .permissions import get_user_role_in_contest


# ============================================================================
# Error Response Helpers
# ============================================================================

class PermissionError:
    """Standardized permission error responses."""

    @staticmethod
    def forbidden(code: str, message: str) -> Response:
        """Return a 403 Forbidden response with structured error."""
        return Response({
            'error': {
                'code': code,
                'message': message,
                'type': 'permission_denied'
            }
        }, status=status.HTTP_403_FORBIDDEN)

    @staticmethod
    def not_found(code: str = 'not_found') -> Response:
        """
        Return a 404 Not Found response for fake obscuring.
        Used when we want to hide the existence of a resource.
        """
        return Response({
            'error': {
                'code': code,
                'message': 'Resource not found',
                'type': 'not_found'
            }
        }, status=status.HTTP_404_NOT_FOUND)


# ============================================================================
# Error Codes
# ============================================================================

class ErrorCodes:
    """Constants for permission error codes."""
    CONTEST_DRAFT = 'contest_draft'
    CONTEST_ARCHIVED = 'contest_archived'
    CONTEST_NOT_STARTED = 'contest_not_started'
    CONTEST_ENDED = 'contest_ended'
    SCOREBOARD_HIDDEN = 'scoreboard_hidden'
    NOT_PARTICIPANT = 'not_participant'
    EXAM_NOT_SUBMITTED = 'exam_not_submitted'
    INSUFFICIENT_ROLE = 'insufficient_role'
    NOT_AUTHENTICATED = 'not_authenticated'


# ============================================================================
# Role-Based Permissions
# ============================================================================

# Base permissions for each role (not considering context)
BASE_ROLE_PERMISSIONS = {
    'admin': {
        'manage_contest', 'manage_participants', 'manage_problems',
        'view_scoreboard_full', 'view_report', 'export_report',
        'submit', 'view_draft', 'view_archived', 'view_participants',
        'manage_clarifications', 'view_all_submissions',
    },
    'teacher': {
        'manage_contest', 'manage_participants', 'manage_problems',
        'view_scoreboard_full', 'view_report', 'export_report',
        'submit', 'view_draft', 'view_archived', 'view_participants',
        'manage_clarifications', 'view_all_submissions',
    },
    'student': {
        'view_scoreboard_limited', 'submit', 'view_own_report',
        'create_clarification',
    },
    'anonymous': {
        'view_public_contest',
    }
}

# Restrictions based on contest status
STATUS_RESTRICTIONS = {
    'draft': {
        'requires_permission': 'view_draft',
        'error_code': ErrorCodes.CONTEST_DRAFT,
        'error_message': 'Contest is not published',
    },
    'archived': {
        'requires_permission': 'view_archived',
        'error_code': ErrorCodes.CONTEST_ARCHIVED,
        'error_message': 'Contest has been archived',
    }
}


# ============================================================================
# Contest Access Policy
# ============================================================================

class ContestAccessPolicy(permissions.BasePermission):
    """
    Unified Contest permission policy.

    Permission check order:
    1. Check if user is authenticated (for protected actions)
    2. Check contest status (draft/published/archived)
    3. Check role-based permissions
    4. Check context-specific conditions (scoreboard settings, exam status)

    Usage in ViewSet:
        permission_classes = [ContestAccessPolicy]

    The policy uses action_permission_map to map DRF actions to internal
    permission names.
    """

    # Map DRF actions to internal permission names
    action_permission_map = {
        # Export & Reports
        'download': 'export_report',
        'participant_report': 'view_report',
        'my_report': 'view_own_report',
        'export_results': 'export_report',

        # Scoreboard
        'standings': 'view_scoreboard',

        # Contest Management
        'toggle_status': 'manage_contest',
        'archive': 'manage_contest',

        # Problem Management
        'add_problem': 'manage_problems',
        'reorder_problems': 'manage_problems',
        'publish_problem_to_practice': 'manage_problems',

        # Participant Management
        'participants': 'view_participants',
        'unlock_participant': 'manage_participants',
        'update_participant': 'manage_participants',
        'add_participant': 'manage_participants',
        'remove_participant': 'manage_participants',
        'reopen_exam': 'manage_participants',
        '_list_events': 'view_participants',

        # Admin Management
        'admins': 'manage_contest',
        'add_admin': 'manage_contest',
        'remove_admin': 'manage_contest',

        # Clarifications
        'reply': 'manage_clarifications',
    }

    # Actions that should return 404 instead of 403 for unauthorized access
    # This prevents information leakage about resource existence
    mask_as_404 = {
        'retrieve',
        'participant_report',
    }

    def has_permission(self, request, view):
        """Check list-level permissions."""
        # Allow list and create with default DRF permissions
        if view.action in ('list', 'create'):
            return True
        # Defer to has_object_permission for detail actions
        return True

    def has_object_permission(self, request, view, obj):
        """Check object-level permissions."""
        # Get the contest object
        contest = obj if isinstance(obj, Contest) else getattr(obj, 'contest', None)
        if not contest:
            return True

        user = request.user
        action = view.action
        role = get_user_role_in_contest(user, contest) if user.is_authenticated else 'anonymous'

        # 1. Check contest status restrictions
        status_error = self._check_contest_status(contest, user, role, action)
        if status_error is not None:
            request._permission_error = status_error
            return False

        # 2. Check role-based permissions
        required_permission = self.action_permission_map.get(action)
        if required_permission:
            role_permissions = BASE_ROLE_PERMISSIONS.get(role, set())

            # Handle scoreboard permission specially
            if required_permission == 'view_scoreboard':
                if 'view_scoreboard_full' not in role_permissions:
                    # Check if student can view limited scoreboard
                    if 'view_scoreboard_limited' not in role_permissions:
                        request._permission_error = self._get_error_response(
                            action,
                            ErrorCodes.INSUFFICIENT_ROLE,
                            'You do not have permission to view the scoreboard'
                        )
                        return False
            elif required_permission not in role_permissions:
                request._permission_error = self._get_error_response(
                    action,
                    ErrorCodes.INSUFFICIENT_ROLE,
                    'You do not have permission to perform this action'
                )
                return False

        # 3. Check context-specific conditions
        context_error = self._check_context_conditions(
            contest, user, role, action, request
        )
        if context_error is not None:
            request._permission_error = context_error
            return False

        return True

    def _check_contest_status(self, contest, user, role, action):
        """Check if contest status allows access."""
        if action in {"standings", "my_report"}:
            return None

        if contest.status == "archived" and action == "retrieve":
            if user.is_authenticated and ContestParticipant.objects.filter(
                contest=contest, user=user
            ).exists():
                return None

        if contest.status in STATUS_RESTRICTIONS:
            restriction = STATUS_RESTRICTIONS[contest.status]
            required = restriction['requires_permission']
            role_permissions = BASE_ROLE_PERMISSIONS.get(role, set())

            if required not in role_permissions:
                return self._get_error_response(
                    action,
                    restriction['error_code'],
                    restriction['error_message']
                )
        return None

    def _check_context_conditions(self, contest, user, role, action, request):
        """Check context-specific conditions (scoreboard settings, exam status, etc.)."""
        is_ended = bool(contest.end_time and timezone.now() > contest.end_time)

        # Scoreboard visibility for students
        if action == 'standings' and role == 'student':
            if not contest.scoreboard_visible_during_contest:
                # Allow viewing after contest ends
                if not is_ended:
                    return self._get_error_response(
                        action,
                        ErrorCodes.SCOREBOARD_HIDDEN,
                        'Scoreboard is not visible during the contest'
                    )

        # Student's own report: must have submitted exam
        if action == 'my_report':
            if not user.is_authenticated:
                return self._get_error_response(
                    action,
                    ErrorCodes.NOT_AUTHENTICATED,
                    'Authentication required'
                )

            try:
                participant = ContestParticipant.objects.get(
                    contest=contest, user=user
                )
                if participant.exam_status != ExamStatus.SUBMITTED:
                    return self._get_error_response(
                        action,
                        ErrorCodes.EXAM_NOT_SUBMITTED,
                        'You can only view your report after submitting the exam'
                    )
            except ContestParticipant.DoesNotExist:
                return self._get_error_response(
                    action,
                    ErrorCodes.NOT_PARTICIPANT,
                    'You are not a participant in this contest'
                )

        return None

    def _get_error_response(self, action, code, message):
        """Generate appropriate error response based on action."""
        if action == "retrieve":
            return Response(
                {"detail": "This contest is not available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if action == "standings" and code == ErrorCodes.SCOREBOARD_HIDDEN:
            return Response(
                {"message": "Scoreboard is not visible"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if action == "export_results" and code == ErrorCodes.INSUFFICIENT_ROLE:
            return Response(
                {"message": "Permission denied"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if action in self.mask_as_404:
            return PermissionError.not_found(code)
        return PermissionError.forbidden(code, message)


# ============================================================================
# Utility Functions
# ============================================================================

def check_contest_permission(user, contest, permission: str) -> bool:
    """
    Utility function to check if a user has a specific permission on a contest.

    Args:
        user: User instance
        contest: Contest instance
        permission: Permission name to check

    Returns:
        True if user has permission, False otherwise
    """
    if not user or not user.is_authenticated:
        role = 'anonymous'
    else:
        role = get_user_role_in_contest(user, contest)

    role_permissions = BASE_ROLE_PERMISSIONS.get(role, set())
    return permission in role_permissions


def get_all_permissions(user, contest) -> set:
    """
    Get all permissions a user has for a contest.

    Args:
        user: User instance
        contest: Contest instance

    Returns:
        Set of permission names
    """
    if not user or not user.is_authenticated:
        role = 'anonymous'
    else:
        role = get_user_role_in_contest(user, contest)

    return BASE_ROLE_PERMISSIONS.get(role, set()).copy()
