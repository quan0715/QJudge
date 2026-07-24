import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone


@dataclass(frozen=True)
class IssuedRunToken:
    plaintext: str
    digest: str
    expires_at: datetime


def issue_run_token(scheduled_end_at: datetime | None) -> IssuedRunToken:
    plaintext = secrets.token_urlsafe(48)
    expires_at = (scheduled_end_at or timezone.now()) + timedelta(hours=6)
    return IssuedRunToken(
        plaintext=plaintext,
        digest=hashlib.sha256(plaintext.encode("utf-8")).hexdigest(),
        expires_at=expires_at,
    )


def verify_run_token(run, plaintext: str) -> bool:
    if not plaintext or run.token_revoked_at or not run.token_digest:
        return False
    if run.token_expires_at and run.token_expires_at <= timezone.now():
        return False
    actual = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual, run.token_digest)
