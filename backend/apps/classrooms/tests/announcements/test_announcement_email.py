"""Publication sends mail after saving; edits never send another announcement."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom, ClassroomMember
from apps.classrooms.views import ClassroomViewSet
from apps.contests.tasks import deliver_contest_email
from apps.users.models import User


@pytest.mark.parametrize('title', ['Schedule update', 'Schedule\r\nupdate'])
def test_create_delivers_content_and_link_only_after_commit(settings, title):
    """Exercise the create action and real email worker with persistence stubbed."""
    settings.EMAIL_MODE = 'external'
    settings.FRONTEND_URL = 'https://qjudge.test/'
    classroom = SimpleNamespace(uuid='classroom-public-id', name='Algorithms', memberships=Mock())
    classroom.memberships.values_list.return_value = [1, 2, 3]
    announcement = SimpleNamespace(
        classroom=classroom, title=title, content='Class starts at 10:00.',
        created_by_id=1,
    )
    serializer = Mock(instance=announcement)
    serializer.save.return_value = announcement
    view = ClassroomViewSet()
    view.get_object = Mock(return_value=classroom)
    request = SimpleNamespace(method='POST', data={}, user=SimpleNamespace(id=1))
    callbacks = []
    with patch('apps.classrooms.views.ClassroomAnnouncementWriteSerializer', return_value=serializer), \
         patch('apps.classrooms.views.ClassroomAnnouncementSerializer') as output, \
         patch('django.db.transaction.on_commit', side_effect=callbacks.append), \
         patch('apps.contests.tasks.deliver_contest_email.delay', side_effect=deliver_contest_email.run), \
         patch('apps.contests.tasks.get_user_model') as users:
        output.return_value.data = {'title': announcement.title}
        users.return_value.objects.filter.return_value.first.side_effect = [
            SimpleNamespace(email='student@example.com'), SimpleNamespace(email='ta@example.com'),
        ]
        response = view.announcements(request)
        assert response.status_code == 201
        assert len(mail.outbox) == 0
        for callback in callbacks:
            callback()
    assert len(mail.outbox) == 2
    assert [message.to for message in mail.outbox] == [['student@example.com'], ['ta@example.com']]
    for message in mail.outbox:
        assert 'Schedule update' in message.subject
        assert 'Algorithms' in message.body
        assert 'Class starts at 10:00.' in message.body
        assert 'https://qjudge.test/classrooms/classroom-public-id' in message.body
        assert not message.cc and not message.bcc


@pytest.mark.django_db
@pytest.mark.parametrize('email_mode,expected_count', [('external', 2), ('disabled', 0)])
def test_api_notifies_current_members_once(settings, django_capture_on_commit_callbacks, email_mode, expected_count):
    settings.EMAIL_MODE = email_mode
    owner = User.objects.create_user(username='owner', email='owner@example.com')
    classroom = Classroom.objects.create(name='Algorithms', owner=owner, invite_code='MAILTEST')
    for name, role, active, email in [
        ('student', 'student', True, 'student@example.com'),
        ('ta', 'ta', True, 'ta@example.com'),
        ('inactive', 'student', False, 'inactive@example.com'),
        ('empty', 'student', True, ''),
    ]:
        user = User.objects.create_user(username=name, email=email, is_active=active)
        ClassroomMember.objects.create(classroom=classroom, user=user, role=role)
    # Even a publisher who is also a member must not receive their own notice.
    ClassroomMember.objects.create(classroom=classroom, user=owner, role='ta')
    User.objects.create_user(username='outsider', email='outsider@example.com')
    client = APIClient()
    client.force_authenticate(owner)
    url = f'/api/v1/classrooms/{classroom.uuid}/announcements/'
    with django_capture_on_commit_callbacks(execute=True):
        response = client.post(url, {'title': 'New announcement', 'content': 'Meeting at 10:00'}, format='json')
    assert response.status_code == 201
    assert len(mail.outbox) == expected_count
    if expected_count:
        assert {message.to[0] for message in mail.outbox} == {'student@example.com', 'ta@example.com'}
    mail.outbox.clear()
    detail = f'{url}{response.data["id"]}/'
    with django_capture_on_commit_callbacks(execute=True):
        assert client.patch(detail, {'title': 'Correction', 'is_pinned': True}, format='json').status_code == 200
        assert client.delete(detail).status_code == 204
    assert mail.outbox == []
