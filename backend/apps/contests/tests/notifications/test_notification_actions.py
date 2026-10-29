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
def case(settings):
    settings.EMAIL_MODE = 'external'
    users = {name: User.objects.create_user(username=f'notice_{name}', email=f'{name}@example.com',
                                          role='teacher' if name == 'teacher' else 'student')
             for name in ['teacher', 'ta', 'student', 'unstarted', 'outsider']}
    classroom = Classroom.objects.create(name='Course', owner=users['teacher'], invite_code='NOTICE01')
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
        assert {c.args[0] for c in send.call_args_list} == {users[n].pk for n in ['teacher', 'ta']}
        assert all('Private explanation' in c.args[2] and '題號：第 1 題' in c.args[2] and 'Explain' in c.args[2] for c in send.call_args_list)
        assert all('Private answer' not in c.args[2] for c in send.call_args_list)
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


def test_transaction_rollback_discards_notification(django_capture_on_commit_callbacks, settings):
    settings.EMAIL_MODE = 'external'
    with patch('apps.contests.tasks.deliver_contest_email.delay') as send:
        with django_capture_on_commit_callbacks(execute=True):
            with pytest.raises(ValueError):
                with transaction.atomic():
                    queue_emails([1], 'Notice', 'Body')
                    raise ValueError('rollback')
        send.assert_not_called()


def test_student_reopens_same_appeal_and_notifies_owner_and_ta_once(case, django_capture_on_commit_callbacks):
    from apps.contests.models import GradeAppeal, GradeAppealMessage
    users, contest, answer = case
    contest.status, contest.results_published = 'published', True
    contest.save()
    ticket = GradeAppeal.objects.create(exam_answer=answer, status='closed', closed_at=timezone.now(), closed_by=users['ta'])
    old = GradeAppealMessage.objects.create(appeal=ticket, author=users['teacher'], content='Original response')
    url = f'/api/v1/contests/{contest.pk}/grade-appeals/{ticket.pk}/'
    with patch('apps.contests.tasks.deliver_contest_email.delay') as send:
        with django_capture_on_commit_callbacks(execute=True):
            response = api(users['student']).post(url+'reopen/', {'content': '  Still unclear  '}, format='json')
        assert response.status_code == 200, response.data
        data = response.data['data']
        assert data['id'] == ticket.pk and data['status'] == 'open'
        assert data['closed_at'] is None and data['closed_by'] is None
        assert [m['content'] for m in data['messages']] == ['Original response', 'Still unclear']
        assert data['messages'][0]['id'] == old.pk
        assert {c.args[0] for c in send.call_args_list} == {users['teacher'].pk, users['ta'].pk}
        assert all(c.args[1] == '[QJudge] 申訴已重新開啟' for c in send.call_args_list)
        assert all('重開理由：\nStill unclear' in c.args[2] for c in send.call_args_list)
        send.reset_mock()
        with django_capture_on_commit_callbacks(execute=True):
            duplicate = api(users['student']).post(url+'reopen/', {'content': 'Still unclear'}, format='json')
        assert duplicate.status_code == 409
        assert ticket.messages.count() == 2
        send.assert_not_called()
        # The same conversation may be closed and reopened again.
        with django_capture_on_commit_callbacks(execute=True):
            assert api(users['ta']).post(url+'close/').status_code == 200
            assert api(users['student']).post(url+'reopen/', {'content': 'Another question'}, format='json').status_code == 200
        assert ticket.messages.count() == 3
    answer.refresh_from_db()
    assert answer.score == 6


@pytest.mark.parametrize('actor,content,published,expected', [
    ('teacher', 'Reason', True, 403), ('ta', 'Reason', True, 403),
    ('unstarted', 'Reason', True, 403), ('outsider', 'Reason', True, 403),
    ('student', '', True, 400), ('student', '   ', True, 400),
    ('student', 'a'*5001, True, 400), ('student', 'Reason', False, 403),
])
def test_reopen_rejects_invalid_actor_reason_or_unpublished_results(case, actor, content, published, expected, django_capture_on_commit_callbacks):
    from apps.contests.models import GradeAppeal
    users, contest, answer = case
    contest.status, contest.results_published = 'published', published
    contest.save()
    ticket = GradeAppeal.objects.create(exam_answer=answer, status='closed', closed_at=timezone.now(), closed_by=users['teacher'])
    url = f'/api/v1/contests/{contest.pk}/grade-appeals/{ticket.pk}/reopen/'
    with patch('apps.contests.tasks.deliver_contest_email.delay') as send:
        with django_capture_on_commit_callbacks(execute=True):
            response = api(users[actor]).post(url, {'content': content}, format='json')
        assert response.status_code == expected, response.data
        send.assert_not_called()
    ticket.refresh_from_db()
    assert ticket.status == 'closed' and ticket.closed_at is not None
    assert ticket.messages.count() == 0
