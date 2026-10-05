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
    settings.EMAIL_MODE = 'external'
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
    settings.EMAIL_MODE = 'disabled'
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


@pytest.mark.parametrize('password_enabled,email_mode,expected', [(True, 'external', True), (True, 'disabled', False), (False, 'external', False), (False, 'disabled', False)])
def test_public_provider_options_advertise_configured_recovery(settings, password_enabled, email_mode, expected):
    from apps.users.auth.options import get_auth_options
    settings.AUTH_EMAIL_PASSWORD_ENABLED = password_enabled
    settings.EMAIL_MODE = email_mode
    assert get_auth_options()['password_reset_enabled'] is expected


@pytest.mark.parametrize('exhaust_request', [True, False])
def test_request_and_redemption_have_independent_ip_limits(exhaust_request):
    client = APIClient()
    with patch('apps.users.views.password_reset.deliver_password_reset.delay'):
        for number in range(10):
            response = (client.post(REQUEST_URL, {'identifier': f'user{number}@example.test'}, format='json')
                        if exhaust_request else finish(client, 'malformed'))
            assert response.status_code == (202 if exhaust_request else 400)
        same_operation = (client.post(REQUEST_URL, {'identifier': 'another@example.test'}, format='json')
                          if exhaust_request else finish(client, 'malformed'))
        assert same_operation.status_code == 429
        other_operation = (finish(client, 'malformed') if exhaust_request
                           else client.post(REQUEST_URL, {'identifier': 'other@example.test'}, format='json'))
        assert other_operation.status_code == (400 if exhaust_request else 202)


@pytest.mark.parametrize('content_type', ['application/x-www-form-urlencoded', 'multipart/form-data'])
def test_form_recovery_identifiers_have_separate_throttle_buckets(content_type):
    from urllib.parse import urlencode
    from django.http import QueryDict
    assert isinstance(QueryDict('identifier=alice'), dict)
    client = APIClient()
    with patch('apps.users.views.password_reset.deliver_password_reset.delay'):
        for number, identifier in enumerate(['alice', 'bob', 'carol', 'dave']):
            data = {'identifier': identifier}
            response = (client.post(REQUEST_URL, urlencode(data), content_type=content_type, REMOTE_ADDR=f'192.0.2.{number}')
                        if content_type.endswith('urlencoded')
                        else client.post(REQUEST_URL, data, format='multipart', REMOTE_ADDR=f'192.0.2.{number}'))
            assert response.status_code == 202


def test_uvicorn_access_formatter_redacts_reset_tokens_and_preserves_access_logs():
    from io import StringIO
    from uvicorn.logging import AccessFormatter
    from apps.users.security_logging import install_reset_log_redaction
    output = StringIO()
    logger = logging.getLogger('uvicorn.access')
    handler = logging.StreamHandler(output)
    handler.setFormatter(AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s', use_colors=False))
    handlers, filters, level, propagate = logger.handlers[:], logger.filters[:], logger.level, logger.propagate
    try:
        logger.handlers, logger.level, logger.propagate = [handler], logging.INFO, False
        install_reset_log_redaction()
        logger.info('%s - "%s %s HTTP/%s" %d', '127.0.0.1:1234', 'POST', RESET_URL + 'x' * 43, '1.1', 400)
        logger.info('%s - "%s %s HTTP/%s" %d', '127.0.0.1:1234', 'GET', '/api/v1/auth/providers?probe=ordinary-access', '1.1', 200)
        assert 'x' * 43 not in output.getvalue()
        assert '[redacted]' in output.getvalue()
        assert 'ordinary-access' in output.getvalue()
        assert '400 Bad Request' in output.getvalue()
    finally:
        logger.handlers, logger.filters, logger.level, logger.propagate = handlers, filters, level, propagate


def test_uvicorn_runtime_redacts_reset_token_and_keeps_access_logging(tmp_path):
    """Exercise the dev ASGI server with validation-only requests and no database."""
    import json
    import os
    import socket
    import subprocess
    import sys
    import time
    from pathlib import Path
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen

    settings_path = tmp_path / 'log_probe_settings.py'
    settings_path.write_text("from config.settings.test import *\nCACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}\n")
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    environment = {**os.environ, 'DJANGO_SETTINGS_MODULE': 'log_probe_settings',
                   'PYTHONPATH': os.pathsep.join([str(tmp_path), str(Path(__file__).parents[3])])}
    log_path = tmp_path / 'uvicorn.log'
    with log_path.open('w') as output:
        server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'config.asgi:application',
            '--host', '127.0.0.1', '--port', str(port), '--lifespan', 'off'],
            stdout=output, stderr=subprocess.STDOUT, env=environment)
        try:
            deadline = time.monotonic() + 15
            while True:
                try:
                    with urlopen(origin + '/api/v1/auth/providers?probe=ordinary-runtime-access', timeout=1) as response:
                        assert response.status == 200
                    break
                except (URLError, TimeoutError):
                    assert server.poll() is None, 'ASGI server exited before readiness'
                    assert time.monotonic() < deadline, 'ASGI server did not become ready'
                    time.sleep(0.1)
            token = 'y' * 43
            request = Request(origin + RESET_URL + token,
                data=json.dumps({'password': PASSWORD, 'password_confirm': 'mismatched'}).encode(),
                headers={'Content-Type': 'application/json'})
            with pytest.raises(HTTPError) as error:
                urlopen(request, timeout=5)
            assert error.value.code == 400
            assert json.load(error.value)['errors'][0]['field'] == 'password_confirm'
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
    logs = log_path.read_text()
    assert token not in logs
    assert '[redacted]' in logs
    assert 'ordinary-runtime-access' in logs


@pytest.mark.django_db
@pytest.mark.parametrize('identifier_field', ['username', 'email'])
def test_recovery_preserves_exact_case_distinct_login_identifiers(identifier_field):
    from apps.users.services import EmailAuthService
    User.objects.create_user(username='Alice', email='Alice@example.test', password='OriginalPassword98!')
    intended = User.objects.create_user(username='alice', email='alice@example.test', password='OriginalPassword98!')
    identifier = getattr(intended, identifier_field)
    assert EmailAuthService.login(identifier, 'OriginalPassword98!').pk == intended.pk
    send_password_reset(identifier)
    assert mail.outbox[-1].to == [intended.email]
    assert PasswordResetToken.objects.get().user_id == intended.pk


@pytest.mark.django_db
@pytest.mark.parametrize('link_before_issuance', [True, False])
def test_oauth_link_does_not_remove_password_recovery_eligibility(user, link_before_issuance):
    from apps.users.auth.contracts import NormalizedQAuthIdentity
    from apps.users.auth.user_projection import sync_user_projection
    from apps.users.services import EmailAuthService
    identity = NormalizedQAuthIdentity(provider_key='google', provider_subject='linked-subject',
        email=user.email, username=user.username, email_verified=True)
    if link_before_issuance:
        sync_user_projection(user, identity)
    assert EmailAuthService.login(user.email, 'OriginalPassword98!').pk == user.pk
    send_password_reset(user.email)
    assert len(mail.outbox) == 1
    token = re.search(r'#token=([A-Za-z0-9_-]{43})', mail.outbox[-1].body).group(1)
    if not link_before_issuance:
        sync_user_projection(user, identity)
    assert finish(APIClient(), token).status_code == 200
    assert EmailAuthService.login(user.email, PASSWORD).pk == user.pk


@pytest.mark.django_db(transaction=True)
def test_inflight_old_password_login_cannot_leave_refresh_token_after_reset(user):
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
    from threading import Event
    from django.db import close_old_connections, connection
    from apps.users.password_reset import complete_password_reset

    token = emailed_token(user)
    credentials_validated, release_login, reset_lock_attempted = Event(), Event(), Event()
    generate_tokens = JWTService.generate_tokens

    def pause_before_issuance(login_user):
        credentials_validated.set()
        assert release_login.wait(timeout=10)
        return generate_tokens(login_user)

    def login():
        close_old_connections()
        try:
            return APIClient().post('/api/v1/auth/login/password',
                {'identifier': user.email, 'password': 'OriginalPassword98!'}, format='json')
        finally:
            close_old_connections()

    def observe_reset_lock(execute, sql, params, many, context):
        if 'FOR UPDATE' in sql and '"users"' in sql:
            reset_lock_attempted.set()
        return execute(sql, params, many, context)

    def reset():
        close_old_connections()
        try:
            with connection.execute_wrapper(observe_reset_lock):
                complete_password_reset(token, PASSWORD)
        finally:
            close_old_connections()

    with patch('apps.users.views.auth.JWTService.generate_tokens', side_effect=pause_before_issuance):
        with ThreadPoolExecutor(max_workers=2) as workers:
            login_result = workers.submit(login)
            try:
                assert credentials_validated.wait(timeout=5)
                reset_result = workers.submit(reset)
                assert reset_lock_attempted.wait(timeout=5)
                try:
                    # On the vulnerable implementation reset finishes before issuance;
                    # with the shared lock it waits until the login commits.
                    reset_result.result(timeout=1)
                except FutureTimeout:
                    pass
            finally:
                release_login.set()
            response = login_result.result(timeout=10)
            reset_result.result(timeout=10)
    assert response.status_code == 200
    refresh = response.json()['data']['refresh_token']
    assert APIClient().post('/api/v1/auth/refresh', {'refresh': refresh}, format='json').status_code == 401
    user.refresh_from_db()
    assert user.check_password(PASSWORD)
