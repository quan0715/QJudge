"""
Tests for ContestAccessPolicy.

This module provides comprehensive tests for the unified contest access policy,
including parameterized tests for the role × action × status permission matrix.
"""
import pytest
from unittest.mock import Mock, MagicMock, patch
from django.contrib.auth import get_user_model

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.access_policy import (
    ContestAccessPolicy,
    PermissionError,
    ErrorCodes,
    BASE_ROLE_PERMISSIONS,
    check_contest_permission,
    get_all_permissions,
)
from apps.contests.permissions import get_user_role_in_contest

User = get_user_model()


# ============================================================================
# Unit Tests for Access Policy Components
# ============================================================================

class TestPermissionError:
    """Test PermissionError response helpers."""

    def test_forbidden_response(self):
        """Test forbidden() returns correct structure."""
        response = PermissionError.forbidden('test_code', 'Test message')

        assert response.status_code == 403
        assert 'error' in response.data
        assert response.data['error']['code'] == 'test_code'
        assert response.data['error']['message'] == 'Test message'
        assert response.data['error']['type'] == 'permission_denied'

    def test_not_found_response(self):
        """Test not_found() returns correct structure."""
        response = PermissionError.not_found('hidden_resource')

        assert response.status_code == 404
        assert 'error' in response.data
        assert response.data['error']['code'] == 'hidden_resource'
        assert response.data['error']['type'] == 'not_found'


class TestBaseRolePermissions:
    """Test BASE_ROLE_PERMISSIONS configuration."""

    def test_admin_has_all_permissions(self):
        """Admin should have maximum permissions."""
        admin_perms = BASE_ROLE_PERMISSIONS['admin']

        assert 'manage_contest' in admin_perms
        assert 'manage_participants' in admin_perms
        assert 'manage_problems' in admin_perms
        assert 'view_scoreboard_full' in admin_perms
        assert 'view_report' in admin_perms
        assert 'export_report' in admin_perms
        assert 'view_inactive' in admin_perms
        assert 'view_archived' in admin_perms

    def test_teacher_permissions(self):
        """Teacher should have most admin permissions except archived access."""
        teacher_perms = BASE_ROLE_PERMISSIONS['teacher']

        assert 'manage_contest' in teacher_perms
        assert 'view_inactive' in teacher_perms
        assert 'view_archived' not in teacher_perms

    def test_student_permissions(self):
        """Student should have limited permissions."""
        student_perms = BASE_ROLE_PERMISSIONS['student']

        assert 'manage_contest' not in student_perms
        assert 'view_scoreboard_limited' in student_perms
        assert 'view_own_report' in student_perms

    def test_anonymous_permissions(self):
        """Anonymous should have minimal permissions."""
        anon_perms = BASE_ROLE_PERMISSIONS['anonymous']

        assert len(anon_perms) <= 2
        assert 'view_public_contest' in anon_perms


# ============================================================================
# Integration Tests for ContestAccessPolicy
# ============================================================================

@pytest.mark.django_db
class TestContestAccessPolicy:
    """Integration tests for ContestAccessPolicy."""

    @pytest.fixture
    def policy(self):
        """Create policy instance."""
        return ContestAccessPolicy()

    @pytest.fixture
    def admin_user(self, db):
        """Create admin user."""
        return User.objects.create_superuser(
            username='admin',
            email='admin@test.com',
            password='testpass'
        )

    @pytest.fixture
    def teacher_user(self, db):
        """Create teacher user (contest owner)."""
        return User.objects.create_user(
            username='teacher',
            email='teacher@test.com',
            password='testpass'
        )

    @pytest.fixture
    def student_user(self, db):
        """Create student user."""
        return User.objects.create_user(
            username='student',
            email='student@test.com',
            password='testpass'
        )

    @pytest.fixture
    def contest(self, teacher_user, db):
        """Create test contest."""
        return Contest.objects.create(
            name='Test Contest',
            owner=teacher_user,
            status='active',
            scoreboard_visible_during_contest=False,
        )

    @pytest.fixture
    def participant(self, contest, student_user, db):
        """Create contest participant."""
        return ContestParticipant.objects.create(
            contest=contest,
            user=student_user,
            exam_status=ExamStatus.SUBMITTED
        )

    def _create_request(self, user=None):
        """Helper to create mock request."""
        request = Mock()
        request.user = user or Mock(is_authenticated=False)
        return request

    def _create_view(self, action):
        """Helper to create mock view."""
        view = Mock()
        view.action = action
        return view

    # ==================== Role Detection Tests ====================

    def test_admin_role_detection(self, admin_user, contest):
        """Admin user should be detected as admin role."""
        role = get_user_role_in_contest(admin_user, contest)
        assert role == 'admin'

    def test_teacher_role_detection(self, teacher_user, contest):
        """Contest owner should be detected as teacher role."""
        role = get_user_role_in_contest(teacher_user, contest)
        assert role == 'teacher'

    def test_student_role_detection(self, student_user, contest):
        """Regular user should be detected as student role."""
        role = get_user_role_in_contest(student_user, contest)
        assert role == 'student'

    def test_anonymous_role_detection(self, contest):
        """Unauthenticated user should be detected as student role."""
        anon_user = Mock(is_authenticated=False)
        role = get_user_role_in_contest(anon_user, contest)
        assert role == 'student'

    # ==================== Status Restriction Tests ====================

    def test_inactive_contest_admin_access(self, policy, admin_user, contest):
        """Admin should access inactive contest."""
        contest.status = 'inactive'
        contest.save()

        request = self._create_request(admin_user)
        view = self._create_view('retrieve')

        assert policy.has_object_permission(request, view, contest) is True

    def test_inactive_contest_student_blocked(self, policy, student_user, contest):
        """Student should be blocked from inactive contest."""
        contest.status = 'inactive'
        contest.save()

        request = self._create_request(student_user)
        view = self._create_view('retrieve')

        result = policy.has_object_permission(request, view, contest)
        assert result is False
        # Should return 404 for 'retrieve' action (mask_as_404)
        assert hasattr(request, '_permission_error')
        assert request._permission_error.status_code == 404

    def test_archived_contest_teacher_blocked(self, policy, teacher_user, contest):
        """Teacher should be blocked from archived contest."""
        contest.status = 'archived'
        contest.save()

        request = self._create_request(teacher_user)
        view = self._create_view('standings')

        result = policy.has_object_permission(request, view, contest)
        assert result is False
        assert hasattr(request, '_permission_error')
        assert request._permission_error.status_code == 403

    # ==================== Scoreboard Visibility Tests ====================

    def test_scoreboard_hidden_for_student_during_contest(
        self, policy, student_user, contest, participant
    ):
        """Student should not see scoreboard when hidden during contest."""
        contest.scoreboard_visible_during_contest = False
        contest.save()

        request = self._create_request(student_user)
        view = self._create_view('standings')

        result = policy.has_object_permission(request, view, contest)
        assert result is False

    def test_scoreboard_visible_for_student_when_enabled(
        self, policy, student_user, contest, participant
    ):
        """Student should see scoreboard when visibility is enabled."""
        contest.scoreboard_visible_during_contest = True
        contest.save()

        request = self._create_request(student_user)
        view = self._create_view('standings')

        result = policy.has_object_permission(request, view, contest)
        assert result is True

    def test_scoreboard_visible_for_teacher_regardless(
        self, policy, teacher_user, contest
    ):
        """Teacher should always see scoreboard."""
        contest.scoreboard_visible_during_contest = False
        contest.save()

        request = self._create_request(teacher_user)
        view = self._create_view('standings')

        result = policy.has_object_permission(request, view, contest)
        assert result is True

    # ==================== my_report Tests ====================

    def test_my_report_requires_submitted_status(
        self, policy, student_user, contest, participant
    ):
        """Student must have submitted exam to view own report."""
        # Test with SUBMITTED status (should pass)
        participant.exam_status = ExamStatus.SUBMITTED
        participant.save()

        request = self._create_request(student_user)
        view = self._create_view('my_report')

        result = policy.has_object_permission(request, view, contest)
        assert result is True

    def test_my_report_blocked_for_in_progress(
        self, policy, student_user, contest, participant
    ):
        """Student with in-progress exam cannot view report."""
        participant.exam_status = ExamStatus.IN_PROGRESS
        participant.save()

        request = self._create_request(student_user)
        view = self._create_view('my_report')

        result = policy.has_object_permission(request, view, contest)
        assert result is False
        assert request._permission_error.data['error']['code'] == ErrorCodes.EXAM_NOT_SUBMITTED

    def test_my_report_blocked_for_non_participant(
        self, policy, contest
    ):
        """Non-participant cannot view report."""
        other_user = User.objects.create_user(
            username='other',
            email='other@test.com',
            password='testpass'
        )

        request = self._create_request(other_user)
        view = self._create_view('my_report')

        result = policy.has_object_permission(request, view, contest)
        assert result is False
        assert request._permission_error.data['error']['code'] == ErrorCodes.NOT_PARTICIPANT

    # ==================== 403 Error Format Tests ====================

    def test_403_error_format(self, policy, student_user, contest):
        """Test 403 response has correct format."""
        request = self._create_request(student_user)
        view = self._create_view('download')

        result = policy.has_object_permission(request, view, contest)
        assert result is False

        error_response = request._permission_error
        assert error_response.status_code == 403
        assert 'error' in error_response.data

        error = error_response.data['error']
        assert 'code' in error
        assert 'message' in error
        assert 'type' in error
        assert error['type'] == 'permission_denied'


# ============================================================================
# Parameterized Permission Matrix Tests
# ============================================================================

@pytest.mark.django_db
class TestPermissionMatrix:
    """Parameterized tests for the role × action × status permission matrix."""

    @pytest.fixture
    def setup_contest(self, db):
        """Setup contest with all user types."""
        admin = User.objects.create_superuser('admin', 'admin@test.com', 'pass')
        teacher = User.objects.create_user('teacher', 'teacher@test.com', 'pass')
        student = User.objects.create_user('student', 'student@test.com', 'pass')

        contest = Contest.objects.create(
            name='Test Contest',
            owner=teacher,
            status='active',
            scoreboard_visible_during_contest=False,
        )

        ContestParticipant.objects.create(
            contest=contest,
            user=student,
            exam_status=ExamStatus.SUBMITTED
        )

        return {
            'contest': contest,
            'admin': admin,
            'teacher': teacher,
            'student': student,
        }

    @pytest.mark.parametrize('role,action,expected', [
        # Export report (admin/teacher only)
        ('admin', 'download', True),
        ('teacher', 'download', True),
        ('student', 'download', False),

        # Participant report (admin/teacher only)
        ('admin', 'participant_report', True),
        ('teacher', 'participant_report', True),
        ('student', 'participant_report', False),

        # Manage contest
        ('admin', 'toggle_status', True),
        ('teacher', 'toggle_status', True),
        ('student', 'toggle_status', False),

        # Manage participants
        ('admin', 'participants', True),
        ('teacher', 'participants', True),
        ('student', 'participants', False),

        ('admin', 'unlock_participant', True),
        ('teacher', 'unlock_participant', True),
        ('student', 'unlock_participant', False),

        # Manage problems
        ('admin', 'add_problem', True),
        ('teacher', 'add_problem', True),
        ('student', 'add_problem', False),
    ])
    def test_role_action_permissions(self, setup_contest, role, action, expected):
        """Test role × action permission combinations."""
        contest = setup_contest['contest']
        user = setup_contest[role] if role != 'anonymous' else Mock(is_authenticated=False)

        policy = ContestAccessPolicy()
        request = Mock()
        request.user = user
        view = Mock()
        view.action = action

        result = policy.has_object_permission(request, view, contest)
        assert result is expected, f"{role} -> {action}: expected {expected}, got {result}"

    @pytest.mark.parametrize('role,contest_status,action,expected', [
        # Active contest - all can access basic retrieve
        ('admin', 'active', 'retrieve', True),
        ('teacher', 'active', 'retrieve', True),
        ('student', 'active', 'retrieve', True),

        # Inactive contest
        ('admin', 'inactive', 'retrieve', True),
        ('teacher', 'inactive', 'retrieve', True),
        ('student', 'inactive', 'retrieve', False),  # Students blocked from inactive

        # Archived contest
        ('admin', 'archived', 'retrieve', True),
        ('teacher', 'archived', 'retrieve', False),  # Teachers blocked from archived
        ('student', 'archived', 'retrieve', False),
    ])
    def test_status_restrictions(self, setup_contest, role, contest_status, action, expected):
        """Test contest status restrictions."""
        contest = setup_contest['contest']
        contest.status = contest_status
        contest.save()

        user = setup_contest[role] if role != 'anonymous' else Mock(is_authenticated=False)

        policy = ContestAccessPolicy()
        request = Mock()
        request.user = user
        view = Mock()
        view.action = action

        result = policy.has_object_permission(request, view, contest)
        assert result is expected, f"{role} with status {contest_status}: expected {expected}"


# ============================================================================
# Utility Function Tests
# ============================================================================

@pytest.mark.django_db
class TestUtilityFunctions:
    """Test utility functions."""

    @pytest.fixture
    def setup(self, db):
        """Setup test data."""
        user = User.objects.create_user('test', 'test@test.com', 'pass')
        contest = Contest.objects.create(
            name='Test',
            owner=user,
            status='active',
        )
        return {'user': user, 'contest': contest}

    def test_check_contest_permission(self, setup):
        """Test check_contest_permission function."""
        user = setup['user']
        contest = setup['contest']

        # Owner should have manage_contest
        assert check_contest_permission(user, contest, 'manage_contest') is True
        assert check_contest_permission(user, contest, 'view_archived') is False

    def test_get_all_permissions(self, setup):
        """Test get_all_permissions function."""
        user = setup['user']
        contest = setup['contest']

        perms = get_all_permissions(user, contest)
        assert isinstance(perms, set)
        assert 'manage_contest' in perms

    def test_check_permission_anonymous(self, setup):
        """Test permission check for anonymous user."""
        contest = setup['contest']
        anon = Mock(is_authenticated=False)

        assert check_contest_permission(anon, contest, 'manage_contest') is False
        assert check_contest_permission(None, contest, 'manage_contest') is False


# ============================================================================
# Action Permission Map Completeness Test
# ============================================================================

class TestActionPermissionMapCompleteness:
    """Ensure action_permission_map covers expected actions."""

    def test_critical_actions_are_mapped(self):
        """Check critical actions have permission mappings."""
        policy_map = ContestAccessPolicy.action_permission_map

        critical_actions = [
            'download',
            'participant_report',
            'my_report',
            'standings',
            'toggle_status',
            'add_problem',
            'participants',
        ]

        for action in critical_actions:
            assert action in policy_map, f"Critical action '{action}' not in permission map"

    def test_mask_as_404_actions(self):
        """Check mask_as_404 contains expected actions."""
        mask_actions = ContestAccessPolicy.mask_as_404

        # These actions should return 404 for unauthorized access
        expected = {'retrieve', 'participant_report'}
        assert expected.issubset(mask_actions)
