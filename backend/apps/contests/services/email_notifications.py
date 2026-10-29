"""Email reminders for committed appeal and publication actions.

Messages deliberately contain no answers, scores or conversation contents.
The authenticated system remains the source of record.
"""
import logging

from django.conf import settings
from django.db import transaction

from apps.core.services.mail import mail_enabled

from .participation import get_contest_classroom, roster_user_ids

logger = logging.getLogger(__name__)


def queue_emails(user_ids, subject, body):
    if not mail_enabled():
        return
    # Snapshot recipients at the action, but look up active accounts in the worker.
    recipients = sorted({user_id for user_id in user_ids if user_id is not None})

    def enqueue():
        from ..tasks import deliver_contest_email

        for user_id in recipients:
            try:
                deliver_contest_email.delay(user_id, subject, body)
            except Exception:
                # A broker outage must not turn an already committed action into
                # an HTTP failure. Do not log addresses or message contents.
                logger.error('contest_email_enqueue_failed user_id=%s', user_id)

    if recipients:
        transaction.on_commit(enqueue)


def contest_url(contest, *, manager=False):
    classroom = get_contest_classroom(contest)
    origin = settings.FRONTEND_URL.rstrip('/')
    if classroom is None:
        return f'{origin}/classrooms'
    path = f'/classrooms/{classroom.uuid}/contest/{contest.pk}'
    return origin + path + ('/admin' if manager else '')


def manager_ids(contest):
    ids = {contest.owner_id}
    classroom = get_contest_classroom(contest)
    if classroom is not None:
        ids.add(classroom.owner_id)
        ids.update(classroom.memberships.filter(role='ta').values_list('user_id', flat=True))
    return ids


def notify_appeal(ticket, actor_id, event='message'):
    participant = ticket.exam_answer.participant
    contest = participant.contest
    to_managers = actor_id == participant.user_id and event != 'closed'
    recipients = manager_ids(contest) if to_managers else {participant.user_id}
    recipients = set(recipients) - {actor_id}
    label = '申訴已結案' if event == 'closed' else '申訴有新訊息'
    subject = f'[QJudge] {label}'
    body = (
        f'「{contest.name}」的申訴 #{ticket.pk}：{label}。\n\n'
        f'請登入 QJudge 查看：\n{contest_url(contest, manager=to_managers)}\n\n'
        '請使用申訴系統查看及回覆，不要私訊教師或寄 email。'
        '申訴與處理結果以系統紀錄為主；請勿直接回覆此通知信。'
    )
    queue_emails(recipients, subject, body)


def queue_publication_email(contest, event):
    label = '競賽已發布' if event == 'contest_published' else '成績已發布'
    body = f'「{contest.name}」{label}。\n\n請登入 QJudge 查看：\n{contest_url(contest)}\n\n'
    if event == 'results_published':
        body += '成績有疑問時，請在申訴系統提出，不要私訊教師或寄 email。以系統紀錄為主。\n'
    body += '此信為系統通知，請勿直接回覆。'
    # Include classroom students who have not entered the contest yet, and
    # existing attempts (including staff attempts), matching the teacher roster.
    queue_emails(roster_user_ids(contest), f'[QJudge] {label}', body)


def notify_publication_changes(contest, previous_status, previous_results):
    if contest.status != 'published':
        return
    if previous_status != 'published':
        queue_publication_email(contest, 'contest_published')
    if contest.results_published and not previous_results:
        queue_publication_email(contest, 'results_published')
