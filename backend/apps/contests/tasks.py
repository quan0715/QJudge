"""Deliver independent email jobs so one failed recipient does not resend a class."""
from smtplib import SMTPException

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

from apps.core.services.mail import mail_enabled


@shared_task(
    ignore_result=True,
    autoretry_for=(OSError, SMTPException),
    retry_backoff=30,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def deliver_contest_email(user_id, subject, body):
    if not mail_enabled():
        return
    user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
    if user is None or not user.email:
        return
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
