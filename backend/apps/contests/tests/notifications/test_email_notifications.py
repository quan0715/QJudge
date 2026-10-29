"""Database-free coverage of notification policy and delivery boundaries."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from django.core import mail
from django.test import override_settings

from apps.contests.services import email_notifications as notifications
from apps.contests.tasks import deliver_contest_email


@pytest.fixture(autouse=True)
def enabled_mail(settings):
    settings.EMAIL_MODE = 'external'


def contest(status='published', results=True):
    return SimpleNamespace(pk='contest-id', owner_id=1, name='Midterm', status=status,
                           results_published=results)


@pytest.mark.parametrize('before_status,before_results,status,results,events', [
    ('draft', False, 'published', False, ['contest_published']),
    ('published', False, 'published', True, ['results_published']),
    ('published', True, 'published', True, []),
    ('published', True, 'draft', False, []),
    ('draft', False, 'published', True, ['contest_published', 'results_published']),
    ('draft', False, 'draft', True, []),
])
def test_publication_edges(before_status, before_results, status, results, events):
    with patch.object(notifications, 'queue_publication_email') as queue:
        notifications.notify_publication_changes(contest(status, results), before_status, before_results)
    assert [call.args[1] for call in queue.call_args_list] == events


def test_delivery_waits_for_commit_and_has_one_recipient_per_job():
    callbacks = []
    with patch.object(notifications.transaction, 'on_commit', side_effect=lambda cb: callbacks.append(cb)), \
         patch('apps.contests.tasks.deliver_contest_email.delay') as send:
        notifications.queue_emails([2, 2, 3], 'subject', 'body')
        send.assert_not_called()
        for callback in callbacks:
            callback()
        assert sorted(call.args[0] for call in send.call_args_list) == [2, 3]


def test_broker_failure_does_not_fail_saved_action_or_skip_other_recipients():
    with patch.object(notifications.transaction, 'on_commit', side_effect=lambda cb: cb()), \
         patch('apps.contests.tasks.deliver_contest_email.delay', side_effect=[OSError('private'), None]) as send:
        notifications.queue_emails([2, 3], 'subject', 'body')
    assert send.call_count == 2


@pytest.mark.parametrize('actor_id,event,expected', [(2, 'message', [1, 3]), (1, 'message', [2]), (1, 'closed', [2]), (2, 'reopened', [1, 3])])
def test_appeal_only_notifies_other_party(actor_id, event, expected):
    exam = contest()
    exam.expand_question_numbers = False
    question = SimpleNamespace(id='q1', group_id=None, order=0, prompt='Explain binary search')
    exam.exam_questions = Mock()
    exam.exam_questions.only.return_value.order_by.return_value = [question]
    messages = Mock()
    messages.order_by.return_value.first.return_value = SimpleNamespace(pk=1, content='Please explain the deduction')
    messages.order_by.return_value.last.return_value = SimpleNamespace(pk=2, content='More details\nSecond line')
    ticket = SimpleNamespace(pk=9, messages=messages, exam_answer=SimpleNamespace(
        question=question, question_id='q1', participant=SimpleNamespace(contest=exam, user_id=2)))
    with patch.object(notifications, 'manager_ids', return_value={1, 3}), \
         patch.object(notifications, 'contest_url', return_value='https://qjudge.test/contest'), \
         patch.object(notifications, 'queue_emails') as queue:
        notifications.notify_appeal(ticket, actor_id, event)
    ids, subject, body = queue.call_args.args
    assert sorted(ids) == expected
    assert '9' in body
    assert 'https://qjudge.test/contest' in body
    assert 'email' in body
    assert '題號：第 1 題' in body
    assert 'Explain binary search' in body
    assert 'Please explain the deduction' in body
    assert 'More details\nSecond line' in body
    assert ('重開理由：' if event == 'reopened' else '最新訊息：') in body


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
def test_worker_sends_to_one_active_user():
    with patch('apps.contests.tasks.get_user_model') as model:
        model.return_value.objects.filter.return_value.first.return_value = SimpleNamespace(email='student@example.com')
        deliver_contest_email.run(2, 'A notice', 'Open QJudge')
        model.return_value.objects.filter.assert_called_once_with(pk=2, is_active=True)
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ['student@example.com']


def test_worker_ignores_deleted_recipient():
    with patch('apps.contests.tasks.get_user_model') as model, patch('apps.contests.tasks.send_mail') as send:
        model.return_value.objects.filter.return_value.first.return_value = None
        deliver_contest_email.run(2, 'Notice', 'Body')
    send.assert_not_called()


@override_settings(FRONTEND_URL='https://qjudge.test/')
def test_links_use_public_classroom_uuid():
    classroom = SimpleNamespace(pk=42, uuid='public-classroom-uuid')
    with patch.object(notifications, 'get_contest_classroom', return_value=classroom):
        assert notifications.contest_url(contest(), manager=True) == (
            'https://qjudge.test/classrooms/public-classroom-uuid/contest/contest-id/admin')


def test_publication_includes_students_without_attempts():
    with patch.object(notifications, 'roster_user_ids', return_value=[2, 3]), \
         patch.object(notifications, 'contest_url', return_value='https://qjudge.test/contest'), \
         patch.object(notifications, 'queue_emails') as queue:
        notifications.queue_publication_email(contest(), 'results_published')
    assert queue.call_args.args[0] == [2, 3]


def test_smtp_failure_retries_only_failed_recipient():
    from smtplib import SMTPException
    from celery.exceptions import Retry
    with patch('apps.contests.tasks.get_user_model') as model, \
         patch('apps.contests.tasks.send_mail', side_effect=SMTPException('unavailable')), \
         patch.object(deliver_contest_email, 'retry', side_effect=Retry) as retry:
        model.return_value.objects.filter.return_value.first.return_value = SimpleNamespace(email='a@example.com')
        with pytest.raises(Retry):
            deliver_contest_email.run(2, 'Notice', 'Body')
    retry.assert_called_once()


def test_managers_use_owner_and_ta_memberships():
    classroom = SimpleNamespace(owner_id=4, memberships=Mock())
    classroom.memberships.filter.return_value.values_list.return_value = [3, 4]
    with patch.object(notifications, 'get_contest_classroom', return_value=classroom):
        assert notifications.manager_ids(contest()) == {1, 3, 4}
    classroom.memberships.filter.assert_called_once_with(role='ta')


def test_disabled_mail_does_not_queue(settings):
    settings.EMAIL_MODE = 'disabled'
    with patch.object(notifications.transaction, 'on_commit') as commit:
        notifications.queue_emails([2], 'Notice', 'Body')
    commit.assert_not_called()


def test_disabled_mail_skips_existing_worker_job(settings):
    settings.EMAIL_MODE = 'disabled'
    with patch('apps.contests.tasks.get_user_model') as model, patch('apps.contests.tasks.send_mail') as send:
        deliver_contest_email.run(2, 'Notice', 'Body')
    model.assert_not_called()
    send.assert_not_called()
