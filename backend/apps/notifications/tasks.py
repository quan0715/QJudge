"""
Celery tasks for sending email notifications.
"""
import logging

from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.utils import timezone

from .models import EmailNotification, NotificationStatus

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_notification(self, notification_id: str):
    """
    Send a single EmailNotification record.
    Renders the pre-stored body and sends via Django EMAIL_BACKEND.
    On failure, retries up to 3 times with 60-second delay.
    """
    try:
        notification = EmailNotification.objects.get(pk=notification_id)
    except EmailNotification.DoesNotExist:
        logger.error("EmailNotification %s not found, skipping", notification_id)
        return

    if notification.status == NotificationStatus.DELIVERED:
        return

    notification.status = NotificationStatus.QUEUED
    notification.save(update_fields=['status'])

    from_email = settings.DEFAULT_FROM_EMAIL

    try:
        msg = EmailMultiAlternatives(
            subject=notification.subject,
            body=notification.body_text,
            from_email=from_email,
            to=[notification.recipient_email],
        )
        if notification.body_html:
            msg.attach_alternative(notification.body_html, 'text/html')
        msg.send(fail_silently=False)

        notification.status = NotificationStatus.DELIVERED
        notification.sent_at = timezone.now()
        notification.error_message = ''
        notification.save(update_fields=['status', 'sent_at', 'error_message'])
        logger.info("Sent notification %s to %s", notification_id, notification.recipient_email)

    except Exception as exc:
        notification.retry_count += 1
        notification.error_message = str(exc)[:1000]
        notification.status = NotificationStatus.FAILED
        notification.save(update_fields=['retry_count', 'error_message', 'status'])
        logger.warning(
            "Failed to send notification %s (attempt %d): %s",
            notification_id, notification.retry_count, exc,
        )
        raise self.retry(exc=exc)
