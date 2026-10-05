"""Other API domains retain their embedded user representation."""
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.contests.serializers import ContestAnnouncementSerializer, ContestParticipantSerializer
from apps.submissions.serializers import SubmissionDetailSerializer
from apps.users.models import User, UserProfile
from apps.users.serializers import UserSerializer

USER_FIELDS = {'id', 'username', 'email', 'role', 'auth_provider', 'is_active', 'date_joined', 'last_login_at', 'profile'}
PROFILE_FIELDS = {'solved_count', 'submission_count', 'accept_rate', 'display_name', 'avatar_url',
                  'preferred_language', 'preferred_theme', 'editor_font_size', 'editor_tab_size', 'onboarding_completed_at'}


@pytest.mark.parametrize(('serializer', 'field'), [
    (ContestParticipantSerializer, 'user'),
    (ContestAnnouncementSerializer, 'created_by'),
    (SubmissionDetailSerializer, 'user'),
])
def test_embedded_user_keeps_existing_fields(serializer, field):
    user = User(id=42, username='embedded', email='embedded@example.test', role='student')
    UserProfile(user=user, solved_count=3, submission_count=5, accept_rate=Decimal('60.00'),
                display_name='Ada', avatar_url='', preferred_language='en', preferred_theme='dark',
                editor_font_size=16, editor_tab_size=2, onboarding_completed_at=timezone.now())
    embedded = serializer().fields[field].to_representation(user)
    assert set(embedded) == USER_FIELDS
    assert set(embedded['profile']) == PROFILE_FIELDS
    assert embedded['is_active'] is True
    assert embedded['profile']['avatar_url'] == ''
    assert embedded['profile']['solved_count'] == 3
    assert embedded['profile']['preferred_language'] == 'en'
    modern = UserSerializer(user).data
    assert 'is_active' not in modern and 'date_joined' not in modern
    assert set(modern['profile']) == {'display_name', 'avatar_url'}
    assert modern['profile']['avatar_url'] is None
    assert modern['onboarding_completed_at'] is not None
