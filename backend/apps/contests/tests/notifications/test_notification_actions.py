"""Database-backed action/recipient tests; run in the CI backend suite."""
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.contests.models import Contest, ContestParticipant, ExamAnswer, ExamQuestion
from apps.contests.services.email_notifications import queue_emails
from apps.users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def case():
    users = {name: User.objects.create_user(username=f'notice_{name}', email=f'{name}@example.com',
                                          role='teacher' if name == 'teacher' else 'student')
             for name in ['teacher', 'admin', 'ta', 'student', 'unstarted', 'outsider']}
    classroom = Classroom.objects.create(name='Course', owner=users['teacher'], invite_code='NOTICE01')
    classroom.admins.add(users['admin'])
    for name in ['ta', 'student', 'unstarted']:
        ClassroomMember.objects.create(classroom=classroom, user=users[name], role='ta' if name == 'ta' else 'student')
    contest = Contest.objects.create(name='Midterm', owner=users['teacher'], contest_type='paper_exam',
        status='draft', start_time=timezone.now()-timedelta(hours=2), end_time=timezone.now()-timedelta(hours=1))
    ClassroomContest.objects.create(classroom=classroom, contest=contest)
    participant = ContestParticipant.objects.create(contest=contest, user=users['student'], exam_status='submitted')
    question = ExamQuestion.objects.create(contest=contest, question_type='essay', prompt='Explain', score=10, order=0)
    answer = ExamAnswer.objects.create(participant=participant, question=question, answer={'text': 'Private answer'}, score=6)
    return users, contest, answer


def api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.parametrize('method', ['patch', 'toggle'])
def test_publish_and_results_notify_entire_student_roster_once(case, django_capture_on_commit_callbacks, method):
    users, contest, _ = case
    url = f'/api/v1/contests/{contest.pk}/'
    client = api(users['teacher'])
    with patch('apps.contests.tasks.deliver_contest_email.delay') as send:
        with django_capture_on_commit_callbacks(execute=True):
            response = (client.patch(url, {'status': 'published'}, format='json') if method == 'patch'
                        else client.post(url+'toggle_status/'))
            assert response.status_code == 200, response.data
        assert sorted(c.args[0] for c in send.call_args_list) == sorted([users['student'].pk, users['unstarted'].pk])
        send.reset_mock()
        with django_capture_on_commit_callbacks(execute=True):
            assert client.patch(url, {'results_published': True}, format='json').status_code == 200
        assert send.call_count == 2
        send.reset_mock()
        with django_capture_on_commit_callbacks(execute=True):
            assert client.patch(url, {'results_published': True}, format='json').status_code == 200
        send.assert_not_called()


def test_appeal_open_reply_close_and_duplicates(case, django_capture_on_commit_callbacks):
    users, contest, answer = case
    contest.status, contest.results_published = 'published', True
    contest.save()
    url = f'/api/v1/contests/{contest.pk}/grade-appeals/'
    student, teacher = api(users['student']), api(users['teacher'])
    with patch('apps.contests.tasks.deliver_contest_email.delay') as send:
        with django_capture_on_commit_callbacks(execute=True):
            opened = student.post(url, {'exam_answer': answer.pk, 'content': 'Private explanation'}, format='json')
            assert opened.status_code == 201, opened.data
        assert {c.args[0] for c in send.call_args_list} == {users[n].pk for n in ['teacher', 'admin', 'ta']}
        assert all('Private' not in c.args[2] for c in send.call_args_list)
        send.reset_mock()
        with django_capture_on_commit_callbacks(execute=True):
            assert student.post(url, {'exam_answer': answer.pk, 'content': 'Duplicate'}, format='json').status_code == 200
        send.assert_not_called()
        detail = url + str(opened.data['data']['id']) + '/'
        for action, payload in [('messages/', {'content': 'Reviewed'}), ('close/', {})]:
            with django_capture_on_commit_callbacks(execute=True):
                assert teacher.post(detail+action, payload, format='json').status_code in (200, 201)
            assert [c.args[0] for c in send.call_args_list] == [users['student'].pk]
            send.reset_mock()
        with django_capture_on_commit_callbacks(execute=True):
            assert teacher.post(detail+'close/').status_code == 200
            assert student.post(detail+'messages/', {'content': 'Late'}, format='json').status_code == 409
        send.assert_not_called()


def test_transaction_rollback_discards_notification(django_capture_on_commit_callbacks):
    with patch('apps.contests.tasks.deliver_contest_email.delay') as send:
        with django_capture_on_commit_callbacks(execute=True):
            with pytest.raises(ValueError):
                with transaction.atomic():
                    queue_emails([1], 'Notice', 'Body')
                    raise ValueError('rollback')
        send.assert_not_called()
