"""Password recovery with opaque tokens and atomic, single-use redemption."""
import hashlib
import logging
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import identify_hasher
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from apps.core.services.mail import mail_enabled

from .auth.options import is_password_auth_enabled
from .models import PasswordResetToken, User, UserLoginRecord

logger = logging.getLogger('qjudge.auth')
TOKEN_PATTERN = re.compile(r'^[A-Za-z0-9_-]{43}$')


def reset_enabled():
    return is_password_auth_enabled() and mail_enabled()


def token_digest(token):
    return hashlib.sha256(token.encode('ascii')).hexdigest()


class InvalidResetToken(Exception):
    pass


def _has_local_password(user):
    # OAuth projections can have an empty or unsupported hash; neither is a
    # local credential. Recovery must never create one for such an account.
    if not user.password or not user.has_usable_password():
        return False
    try:
        identify_hasher(user.password)
    except ValueError:
        return False
    return True


def send_password_reset(identifier):
    """Executed in the mail worker for every identifier, including unknown ones."""
    if not reset_enabled():
        return
    try:
        user = User.objects.get(Q(email=identifier) | Q(username=identifier))
    except (User.DoesNotExist, User.MultipleObjectsReturned):
        return
    if not user.is_active or not _has_local_password(user):
        return
    token = secrets.token_urlsafe(32)
    now = timezone.now()
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user.pk)
        if not user.is_active or not _has_local_password(user):
            return
        PasswordResetToken.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)
        reset = PasswordResetToken.objects.create(user=user, token_digest=token_digest(token), expires_at=now + timedelta(minutes=15))
    # A URL fragment keeps the email token out of SPA request/referrer URLs.
    link = f'{settings.FRONTEND_URL.rstrip("/")}/reset-password#token={token}'
    try:
        send_mail('[QJudge] 重設密碼 / Reset your password',
                  f'請在 15 分鐘內開啟以下連結重設密碼：\n{link}\n\n'
                  '此連結只能使用一次。若你沒有提出申請，請忽略此郵件。\n'
                  'Use this link within 15 minutes. If you did not request it, ignore this email.',
                  settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
    except Exception:
        PasswordResetToken.objects.filter(pk=reset.pk, consumed_at__isnull=True).update(consumed_at=timezone.now())
        # Do not log SMTP exception bodies: some providers include the email contents.
        logger.warning('password_reset_delivery_failed user_id=%s', user.pk)
        raise


def complete_password_reset(token, password):
    if not reset_enabled() or not TOKEN_PATTERN.fullmatch(token):
        raise InvalidResetToken()
    digest = token_digest(token)
    owner = PasswordResetToken.objects.filter(token_digest=digest).values_list('user_id', flat=True).first()
    if owner is None:
        raise InvalidResetToken()
    with transaction.atomic():
        # Issuance and redemption share the user lock, including different links.
        user = User.objects.select_for_update().get(pk=owner)
        reset = PasswordResetToken.objects.select_for_update().get(token_digest=digest)
        now = timezone.now()
        if reset.consumed_at or reset.expires_at <= now or not user.is_active or not _has_local_password(user):
            raise InvalidResetToken()
        validate_password(password, user=user)
        user.set_password(password)
        user.save(update_fields=['password', 'updated_at'])
        PasswordResetToken.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)
        for outstanding in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=outstanding)
        UserLoginRecord.objects.filter(user=user, is_current=True).update(is_current=False)
    logger.info('password_reset_completed user_id=%s', user.pk)
