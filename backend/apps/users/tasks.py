"""Account email jobs. Reset secrets are generated inside the worker."""
import logging
from celery import shared_task
from .password_reset import send_password_reset


@shared_task(ignore_result=True)
def deliver_password_reset(identifier):
    # Report delivery failures without exposing message contents or token-bearing
    # exception details in Celery logs. A user can request a fresh link.
    try:
        send_password_reset(identifier)
    except Exception:
        logging.getLogger("qjudge.auth").warning("password_reset_job_failed")
        return
