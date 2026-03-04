"""
Unit tests for the contest scope role system.

Covers:
  - get_contest_scope_role() for all 6 roles
  - can_manage_contest() for manager vs non-manager roles
  - Backward-compat: get_user_role_in_contest() legacy mapping
  - BASE_ROLE_PERMISSIONS structure with new scope keys
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.permissions import (
    MANAGER_SCOPE_ROLES,
    LIFECYCLE_OWNER_ROLES,
    can_manage_contest,
    get_contest_scope_role,
    get_user_role_in_contest,
)
from apps.contests.access_policy import BASE_ROLE_PERMISSIONS
from apps.users.models import User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def platform_admin() -> User:
    return User.objects.create_superuser(
        username="scope_platform_admin",
        email="scope_platform_admin@example.com",
        password="pass",
    )


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="scope_owner",
        email="scope_owner@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def co_owner(owner: User) -> User:
    return User.objects.create_user(
        username="scope_co_owner",
        email="scope_co_owner@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def participant_user() -> User:
    return User.objects.create_user(
        username="scope_participant",
        email="scope_participant@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def outsider() -> User:
    return User.objects.create_user(
        username="scope_outsider",
        email="scope_outsider@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def contest(owner: User, co_owner: User) -> Contest:
    c = Contest.objects.create(
        name="Scope Role Test Contest",
        owner=owner,
        status="published",
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    c.admins.add(co_owner)
    return c


@pytest.fixture
def registered_participant(contest: Contest, participant_user: User) -> ContestParticipant:
    return ContestParticipant.objects.create(
        contest=contest,
        user=participant_user,
        exam_status=ExamStatus.NOT_STARTED,
    )


# ---------------------------------------------------------------------------
# get_contest_scope_role
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_scope_role_platform_admin(platform_admin: User, contest: Contest) -> None:
    assert get_contest_scope_role(platform_admin, contest) == 'platform_admin'


@pytest.mark.django_db
def test_scope_role_owner(owner: User, contest: Contest) -> None:
    assert get_contest_scope_role(owner, contest) == 'owner'


@pytest.mark.django_db
def test_scope_role_co_owner(co_owner: User, contest: Contest) -> None:
    assert get_contest_scope_role(co_owner, contest) == 'co_owner'


@pytest.mark.django_db
def test_scope_role_participant(
    participant_user: User, contest: Contest, registered_participant: ContestParticipant
) -> None:
    assert get_contest_scope_role(participant_user, contest) == 'participant'


@pytest.mark.django_db
def test_scope_role_outsider(outsider: User, contest: Contest) -> None:
    assert get_contest_scope_role(outsider, contest) == 'outsider'


@pytest.mark.django_db
def test_scope_role_anonymous(contest: Contest) -> None:
    from unittest.mock import Mock
    anon = Mock()
    anon.is_authenticated = False
    assert get_contest_scope_role(anon, contest) == 'anonymous'


@pytest.mark.django_db
def test_scope_role_none_user(contest: Contest) -> None:
    assert get_contest_scope_role(None, contest) == 'anonymous'


# ---------------------------------------------------------------------------
# can_manage_contest
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_can_manage_platform_admin(platform_admin: User, contest: Contest) -> None:
    assert can_manage_contest(platform_admin, contest) is True


@pytest.mark.django_db
def test_can_manage_owner(owner: User, contest: Contest) -> None:
    assert can_manage_contest(owner, contest) is True


@pytest.mark.django_db
def test_can_manage_co_owner(co_owner: User, contest: Contest) -> None:
    assert can_manage_contest(co_owner, contest) is True


@pytest.mark.django_db
def test_cannot_manage_participant(
    participant_user: User, contest: Contest, registered_participant: ContestParticipant
) -> None:
    assert can_manage_contest(participant_user, contest) is False


@pytest.mark.django_db
def test_cannot_manage_outsider(outsider: User, contest: Contest) -> None:
    assert can_manage_contest(outsider, contest) is False


# ---------------------------------------------------------------------------
# MANAGER_SCOPE_ROLES constant
# ---------------------------------------------------------------------------

def test_manager_scope_roles_contents() -> None:
    assert 'platform_admin' in MANAGER_SCOPE_ROLES
    assert 'owner' in MANAGER_SCOPE_ROLES
    assert 'co_owner' in MANAGER_SCOPE_ROLES
    assert 'participant' not in MANAGER_SCOPE_ROLES
    assert 'outsider' not in MANAGER_SCOPE_ROLES
    assert 'anonymous' not in MANAGER_SCOPE_ROLES


def test_lifecycle_owner_roles_contents() -> None:
    """Lifecycle operations must be restricted to platform_admin and owner only."""
    assert 'platform_admin' in LIFECYCLE_OWNER_ROLES
    assert 'owner' in LIFECYCLE_OWNER_ROLES
    assert 'co_owner' not in LIFECYCLE_OWNER_ROLES
    assert 'participant' not in LIFECYCLE_OWNER_ROLES
    assert 'outsider' not in LIFECYCLE_OWNER_ROLES
    assert 'anonymous' not in LIFECYCLE_OWNER_ROLES


# ---------------------------------------------------------------------------
# Legacy backward-compat: get_user_role_in_contest
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_legacy_role_platform_admin(platform_admin: User, contest: Contest) -> None:
    assert get_user_role_in_contest(platform_admin, contest) == 'admin'


@pytest.mark.django_db
def test_legacy_role_owner(owner: User, contest: Contest) -> None:
    assert get_user_role_in_contest(owner, contest) == 'owner'


@pytest.mark.django_db
def test_legacy_role_co_owner(co_owner: User, contest: Contest) -> None:
    assert get_user_role_in_contest(co_owner, contest) == 'teacher'


@pytest.mark.django_db
def test_legacy_role_participant(
    participant_user: User, contest: Contest, registered_participant: ContestParticipant
) -> None:
    assert get_user_role_in_contest(participant_user, contest) == 'student'


@pytest.mark.django_db
def test_legacy_role_outsider(outsider: User, contest: Contest) -> None:
    assert get_user_role_in_contest(outsider, contest) == 'student'


# ---------------------------------------------------------------------------
# BASE_ROLE_PERMISSIONS scope-role keys
# ---------------------------------------------------------------------------

def test_base_permissions_platform_admin() -> None:
    perms = BASE_ROLE_PERMISSIONS['platform_admin']
    assert 'manage_contest_lifecycle' in perms
    assert 'manage_participants' in perms
    assert 'manage_contest_settings' in perms
    assert 'view_scoreboard_full' in perms


def test_base_permissions_co_owner_no_lifecycle() -> None:
    """co_owner should not have lifecycle management (toggle status, delete)."""
    perms = BASE_ROLE_PERMISSIONS['co_owner']
    assert 'manage_contest_settings' in perms
    assert 'manage_participants' in perms
    assert 'manage_contest_lifecycle' not in perms


def test_base_permissions_participant() -> None:
    perms = BASE_ROLE_PERMISSIONS['participant']
    assert 'submit' in perms
    assert 'create_clarification' in perms
    assert 'manage_contest_settings' not in perms


def test_base_permissions_outsider_minimal() -> None:
    perms = BASE_ROLE_PERMISSIONS['outsider']
    assert 'view_public_contest' in perms
    assert 'submit' not in perms
    assert 'create_clarification' not in perms


def test_base_permissions_anonymous_minimal() -> None:
    perms = BASE_ROLE_PERMISSIONS['anonymous']
    assert 'view_public_contest' in perms
    assert 'submit' not in perms


def test_legacy_aliases_intact() -> None:
    """Backward-compat aliases must still exist for old code."""
    assert BASE_ROLE_PERMISSIONS['admin'] is BASE_ROLE_PERMISSIONS['platform_admin']
    assert BASE_ROLE_PERMISSIONS['teacher'] is BASE_ROLE_PERMISSIONS['co_owner']
    assert BASE_ROLE_PERMISSIONS['student'] is BASE_ROLE_PERMISSIONS['participant']
