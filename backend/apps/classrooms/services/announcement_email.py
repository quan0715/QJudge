"""Email classroom members when a new announcement is published."""
from django.conf import settings

from apps.core.services.mail import mail_enabled
from apps.contests.services.email_notifications import queue_emails


def notify_classroom_announcement(announcement):
    if not mail_enabled():
        return
    classroom = announcement.classroom
    recipients = set(classroom.memberships.values_list('user_id', flat=True))
    recipients.add(announcement.created_by_id)
    title = ' '.join(announcement.title.splitlines())
    url = f'{settings.FRONTEND_URL.rstrip("/")}/classrooms/{classroom.uuid}'
    body = (
        f'「{classroom.name}」有新公告：{announcement.title}\n\n'
        f'{announcement.content}\n\n'
        f'請登入 QJudge 查看公告與最新內容：\n{url}\n\n'
        '此信為系統通知，請勿直接回覆。'
    )
    queue_emails(recipients, f'[QJudge] 班級公告：{title}', body)
