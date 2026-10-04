import hashlib
import logging
import re
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from apps.users.models import PasswordResetToken, User
from apps.users.password_reset import send_password_reset
from apps.users.security_logging import ResetTokenRedactionFilter
from apps.users.services import JWTService

REQUEST_URL = '/api/v1/auth/password/reset-requests'
RESET_URL = '/api/v1/auth/password/resets/'
PASSWORD = 'AnEntirelyNewPassword93!'


@pytest.fixture(autouse=True)
def recovery_settings(settings):
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "password-reset-tests"}}
    settings.PASSWORD_RESET_ENABLED = True
    settings.AUTH_EMAIL_PASSWORD_ENABLED = True
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user(db):
    return User.objects.create_user(username='recover-user', email='recover@example.test', password='OriginalPassword98!')


def emailed_token(user):
    send_password_reset(user.email)
    return re.search(r'#token=([A-Za-z0-9_-]{43})', mail.outbox[-1].body).group(1)


def finish(client, token, **changes):
    return client.post(RESET_URL + token, {'password': PASSWORD, 'password_confirm': PASSWORD, **changes}, format='json')


@pytest.mark.django_db
def test_request_queues_identical_work_for_known_unknown_and_oauth_users(user):
    oauth = User.objects.create_user(username='oauth-recovery', email='oauth@example.test', auth_provider='google')
    client = APIClient()
    with patch('apps.users.views.password_reset.deliver_password_reset.delay') as enqueue:
        for identifier in [user.email, 'unknown@example.test', oauth.email]:
            response = client.post(REQUEST_URL, {'identifier': identifier}, format='json')
            assert response.status_code == 202
            assert response.json() == {'data': None, 'meta': {}}
            enqueue.assert_called_with(identifier)
    assert PasswordResetToken.objects.count() == 0


@pytest.mark.django_db
def test_mail_only_for_active_password_accounts_and_only_digest_persisted(user):
    token = emailed_token(user)
    reset = PasswordResetToken.objects.get()
    assert reset.token_digest == hashlib.sha256(token.encode()).hexdigest()
    assert token not in vars(reset).values()
    assert 14 * 60 < (reset.expires_at - timezone.now()).total_seconds() <= 15 * 60
    assert mail.outbox[0].to == [user.email]
    assert '/reset-password#token=' in mail.outbox[0].body
    for provider, active in [('google', True), ('email', False)]:
        other = User.objects.create_user(username=f'{provider}-{active}', email=f'{provider}-{active}@example.test', auth_provider=provider, is_active=active, password='secret')
        send_password_reset(other.email)
    send_password_reset('missing@example.test')
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_reset_changes_password_once_and_revokes_refresh_tokens(user):
    tokens = JWTService.generate_tokens(user)
    token = emailed_token(user)
    client = APIClient()
    response = finish(client, token)
    assert response.status_code == 200
    assert response.json() == {'data': None, 'meta': {}}
    assert response.cookies['access_token']['max-age'] == 0
    user.refresh_from_db()
    assert user.check_password(PASSWORD)
    assert not user.check_password('OriginalPassword98!')
    assert PasswordResetToken.objects.get().consumed_at is not None
    assert BlacklistedToken.objects.filter(token__user=user).count() == OutstandingToken.objects.filter(user=user).count()
    assert client.post('/api/v1/auth/refresh', {'refresh': tokens['refresh']}, format='json').status_code == 401
    assert finish(client, token).json()['errors'][0]['code'] == 'invalid_reset_token'
    login = client.post('/api/v1/auth/login/password', {'identifier': user.email, 'password': PASSWORD}, format='json')
    assert login.status_code == 200


@pytest.mark.django_db
def test_expired_unknown_malformed_and_superseded_tokens_share_safe_error(user):
    old = emailed_token(user)
    current = emailed_token(user)
    PasswordResetToken.objects.filter(consumed_at__isnull=True).update(expires_at=timezone.now() - timedelta(seconds=1))
    client = APIClient()
    for token in [old, current, 'x' * 43, 'malformed']:
        result = finish(client, token)
        assert result.status_code == 400
        assert result.json()['errors'][0]['code'] == 'invalid_reset_token'
    user.refresh_from_db()
    assert user.check_password('OriginalPassword98!')


@pytest.mark.django_db
def test_policy_and_confirmation_failures_do_not_consume_token(user):
    token = emailed_token(user)
    client = APIClient()
    mismatch = finish(client, token, password_confirm='different')
    assert mismatch.status_code == 400
    assert mismatch.json()['errors'][0]['field'] == 'password_confirm'
    weak = finish(client, token, password='123', password_confirm='123')
    assert weak.status_code == 400
    assert weak.json()['errors'][0]['field'] == 'password'
    assert PasswordResetToken.objects.get().consumed_at is None
    assert finish(client, token).status_code == 200


def test_rate_limits_identifier_across_ips_and_ip_across_identifiers():
    client = APIClient()
    with patch('apps.users.views.password_reset.deliver_password_reset.delay'):
        for number in range(3):
            assert client.post(REQUEST_URL, {'identifier': ' CASE@example.test '}, format='json', REMOTE_ADDR=f'192.0.2.{number}').status_code == 202
        limited = client.post(REQUEST_URL, {'identifier': 'case@example.test'}, format='json', REMOTE_ADDR='192.0.2.8')
        assert limited.status_code == 429
        assert int(limited['Retry-After']) > 0
        cache.clear()
        for number in range(10):
            assert client.post(REQUEST_URL, {'identifier': f'user{number}@example.test'}, format='json').status_code == 202
        assert client.post(REQUEST_URL, {'identifier': 'another@example.test'}, format='json').status_code == 429


def test_feature_disabled_does_not_queue_mail(settings):
    settings.PASSWORD_RESET_ENABLED = False
    with patch('apps.users.views.password_reset.deliver_password_reset.delay') as enqueue:
        response = APIClient().post(REQUEST_URL, {'identifier': 'someone@example.test'}, format='json')
        assert response.status_code == 202
        enqueue.assert_not_called()


def test_reset_tokens_are_redacted_from_request_logs():
    token = 'x' * 43
    record = logging.LogRecord('qjudge.requests', logging.WARNING, '', 0, 'HTTP 400 %s', (RESET_URL + token,), None)
    assert ResetTokenRedactionFilter().filter(record)
    assert token not in record.getMessage()
    assert '[redacted]' in record.getMessage()


@pytest.mark.django_db
def test_mail_failure_revokes_undeliverable_link(user):
    with patch('apps.users.password_reset.send_mail', side_effect=OSError('SMTP unavailable')):
        with pytest.raises(OSError):
            send_password_reset(user.email)
    assert PasswordResetToken.objects.get().consumed_at is not None


@pytest.mark.django_db(transaction=True)
def test_two_concurrent_redemptions_have_one_winner(user):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from django.db import close_old_connections
    from apps.users.password_reset import complete_password_reset, InvalidResetToken
    token = emailed_token(user)
    ready = Barrier(2)

    def redeem():
        close_old_connections()
        try:
            ready.wait(timeout=5)
            complete_password_reset(token, PASSWORD)
            return 'ok'
        except InvalidResetToken:
            return 'invalid'
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(lambda _: redeem(), range(2)))
    assert sorted(results) == ['invalid', 'ok']


@pytest.mark.django_db
def test_request_to_eager_worker_delivers_locmem_mail_by_username(user, settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    response = APIClient().post(REQUEST_URL, {'identifier': user.username}, format='json')
    assert response.status_code == 202
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [user.email]
    assert PasswordResetToken.objects.filter(user=user, consumed_at__isnull=True).count() == 1


@pytest.mark.parametrize('password_enabled,reset_flag,expected', [(True, True, True), (True, False, False), (False, True, False)])
def test_public_provider_options_advertise_configured_recovery(settings, password_enabled, reset_flag, expected):
    from apps.users.auth.options import get_auth_options
    settings.AUTH_EMAIL_PASSWORD_ENABLED = password_enabled
    settings.PASSWORD_RESET_ENABLED = reset_flag
    assert get_auth_options()['password_reset_enabled'] is expected
