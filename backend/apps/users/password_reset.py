"""Password recovery with Django's signed, self-expiring reset tokens."""
import logging

from django.conf import settings
from django.contrib.auth.hashers import identify_hasher
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from apps.core.services.mail import mail_enabled

from .auth.options import is_password_auth_enabled
from .models import User, UserLoginRecord

logger = logging.getLogger('qjudge.auth')
MAX_USER_ID = 2**63 - 1


def reset_enabled():
    return is_password_auth_enabled() and mail_enabled()


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


def _decode_user_id(uid):
    try:
        user_id = int(urlsafe_base64_decode(uid).decode())
    except (TypeError, ValueError, UnicodeDecodeError):
        return None
    return user_id if 0 < user_id <= MAX_USER_ID else None


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
    # The token signs the current password hash and last login, so it stops
    # working once used and expires after PASSWORD_RESET_TIMEOUT. Nothing is stored.
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    minutes = settings.PASSWORD_RESET_TIMEOUT // 60
    # A URL fragment keeps the secret out of SPA request/referrer URLs.
    link = f'{settings.FRONTEND_URL.rstrip("/")}/reset-password#uid={uid}&token={token}'
    send_mail('[QJudge] 重設密碼 / Reset your password',
              f'請在 {minutes} 分鐘內開啟以下連結重設密碼：\n{link}\n\n'
              '此連結只能使用一次。若你沒有提出申請，請忽略此郵件。\n'
              f'Use this link within {minutes} minutes. If you did not request it, ignore this email.',
              settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)


def complete_password_reset(uid, token, password):
    user_id = _decode_user_id(uid)
    if not reset_enabled() or user_id is None:
        raise InvalidResetToken()
    with transaction.atomic():
        # Password login and redemption share the user lock. Checking the token
        # against the locked row makes a second redemption see the new hash.
        user = User.objects.select_for_update().filter(pk=user_id).first()
        if (user is None or not user.is_active or not _has_local_password(user)
                or not default_token_generator.check_token(user, token)):
            raise InvalidResetToken()
        validate_password(password, user=user)
        user.set_password(password)
        user.save(update_fields=['password', 'updated_at'])
        for outstanding in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=outstanding)
        UserLoginRecord.objects.filter(user=user, is_current=True).update(is_current=False)
    logger.info('password_reset_completed user_id=%s', user.pk)
