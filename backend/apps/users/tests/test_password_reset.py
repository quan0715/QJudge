import logging
import re
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django.contrib.auth.tokens import default_token_generator
from apps.users.models import User
from apps.users.password_reset import send_password_reset
from apps.users.services import JWTService

REQUEST_URL = '/api/v1/auth/password/reset-requests'
RESET_URL = '/api/v1/auth/password/resets'
LINK_PATTERN = re.compile(r'/reset-password#uid=([A-Za-z0-9_-]+)&token=([0-9a-z]+-[0-9a-f]+)')
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


def emailed_link(user):
    send_password_reset(user.email)
    return LINK_PATTERN.search(mail.outbox[-1].body).groups()


def finish(client, link, **changes):
    uid, token = link
    return client.post(RESET_URL, {'uid': uid, 'token': token, 'password': PASSWORD, 'password_confirm': PASSWORD, **changes},
                       format='json')


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


@pytest.mark.django_db
def test_mail_only_for_active_password_accounts(user):
    _uid, token = emailed_link(user)
    assert default_token_generator.check_token(user, token)
    assert mail.outbox[0].to == [user.email]
    for provider, active in [('google', True), ('email', False)]:
        other = User.objects.create_user(username=f'{provider}-{active}', email=f'{provider}-{active}@example.test', auth_provider=provider, is_active=active,
            password=None if provider == 'google' else 'secret')
        send_password_reset(other.email)
    send_password_reset('missing@example.test')
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_reset_changes_password_once_and_revokes_refresh_tokens(user):
    tokens = JWTService.generate_tokens(user)
    older = emailed_link(user)
    link = emailed_link(user)
    client = APIClient()
    response = finish(client, link)
    assert response.status_code == 200
    assert response.json() == {'data': None, 'meta': {}}
    assert response.cookies['access_token']['max-age'] == 0
    user.refresh_from_db()
    assert user.check_password(PASSWORD)
    assert not user.check_password('OriginalPassword98!')
    assert BlacklistedToken.objects.filter(token__user=user).count() == OutstandingToken.objects.filter(user=user).count()
    assert client.post('/api/v1/auth/refresh', {'refresh': tokens['refresh']}, format='json').status_code == 401
    # The changed password hash invalidates this link and every older one.
    for used in [link, older]:
        assert finish(client, used).json()['errors'][0]['code'] == 'invalid_reset_token'
    login = client.post('/api/v1/auth/login/password', {'identifier': user.email, 'password': PASSWORD}, format='json')
    assert login.status_code == 200


@pytest.mark.django_db
def test_expired_unknown_malformed_and_foreign_links_share_safe_error(user):
    uid, token = emailed_link(user)
    other = User.objects.create_user(username='other-user', email='other@example.test', password='OriginalPassword98!')
    _other_uid, other_token = emailed_link(other)
    client = APIClient()
    with patch.object(default_token_generator, '_now', return_value=datetime.now() + timedelta(minutes=16)):
        expired = finish(client, (uid, token))
    assert expired.json()['errors'][0]['code'] == 'invalid_reset_token'
    unknown_uid = 'OTk5OTk5'  # base64 of an id that does not exist
    huge_uid = 'OTk5OTk5OTk5OTk5OTk5OTk5OTk5'  # beyond the bigint primary key
    for link in [(unknown_uid, token), (huge_uid, token), ('%%%', token), (uid, 'malformed'), (uid, other_token)]:
        result = finish(client, link)
        assert result.status_code == 400
        assert result.json()['errors'][0]['code'] == 'invalid_reset_token'
    user.refresh_from_db()
    assert user.check_password('OriginalPassword98!')


@pytest.mark.django_db
def test_policy_and_confirmation_failures_do_not_consume_token(user):
    link = emailed_link(user)
    client = APIClient()
    mismatch = finish(client, link, password_confirm='different')
    assert mismatch.status_code == 400
    assert mismatch.json()['errors'][0]['field'] == 'password_confirm'
    weak = finish(client, link, password='123', password_confirm='123')
    assert weak.status_code == 400
    assert weak.json()['errors'][0]['field'] == 'password'
    assert finish(client, link).status_code == 200


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


@pytest.mark.django_db
def test_mail_failure_is_reported_without_details(user, caplog):
    from apps.users.tasks import deliver_password_reset
    with patch('apps.users.password_reset.send_mail', side_effect=OSError('SMTP unavailable')):
        with caplog.at_level(logging.WARNING, logger='qjudge.auth'):
            deliver_password_reset(user.email)
    assert [record.getMessage() for record in caplog.records] == ['password_reset_job_failed']


@pytest.mark.django_db(transaction=True)
def test_two_concurrent_redemptions_have_one_winner(user):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from django.db import close_old_connections
    from apps.users.password_reset import complete_password_reset, InvalidResetToken
    uid, token = emailed_link(user)
    ready = Barrier(2)

    def redeem():
        close_old_connections()
        try:
            ready.wait(timeout=5)
            complete_password_reset(uid, token, PASSWORD)
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
    assert LINK_PATTERN.search(mail.outbox[0].body)


@pytest.mark.parametrize('password_enabled,email_mode,expected', [(True, 'external', True), (True, 'disabled', False), (False, 'external', False), (False, 'disabled', False)])
def test_public_provider_options_advertise_configured_recovery(settings, password_enabled, email_mode, expected):
    from apps.users.auth.options import get_auth_options
    settings.AUTH_EMAIL_PASSWORD_ENABLED = password_enabled
    settings.EMAIL_MODE = email_mode
    assert get_auth_options()['password_reset_enabled'] is expected


MALFORMED_LINK = ('bad', 'malformed')


@pytest.mark.parametrize('exhaust_request', [True, False])
def test_request_and_redemption_have_independent_ip_limits(exhaust_request):
    client = APIClient()
    with patch('apps.users.views.password_reset.deliver_password_reset.delay'):
        for number in range(10):
            response = (client.post(REQUEST_URL, {'identifier': f'user{number}@example.test'}, format='json')
                        if exhaust_request else finish(client, MALFORMED_LINK))
            assert response.status_code == (202 if exhaust_request else 400)
        same_operation = (client.post(REQUEST_URL, {'identifier': 'another@example.test'}, format='json')
                          if exhaust_request else finish(client, MALFORMED_LINK))
        assert same_operation.status_code == 429
        other_operation = (finish(client, MALFORMED_LINK) if exhaust_request
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


@pytest.mark.django_db
def test_ambiguous_email_and_username_identifier_does_not_select_an_account():
    from apps.users.services import EmailAuthService
    first = User.objects.create_user(username='first', email='shared@example.test', password='OriginalPassword98!')
    User.objects.create_user(username=first.email, email='second@example.test', password='OriginalPassword98!')
    send_password_reset(first.email)
    assert len(mail.outbox) == 0
    assert EmailAuthService.login(first.email, 'OriginalPassword98!') is None


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
    link = emailed_link(user)
    assert len(mail.outbox) == 1
    if not link_before_issuance:
        sync_user_projection(user, identity)
    assert finish(APIClient(), link).status_code == 200
    assert EmailAuthService.login(user.email, PASSWORD).pk == user.pk


@pytest.mark.django_db(transaction=True)
def test_inflight_old_password_login_cannot_leave_refresh_token_after_reset(user):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from django.db import close_old_connections, connection, DatabaseError, transaction
    from apps.users.password_reset import complete_password_reset

    uid, token = emailed_link(user)
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
                complete_password_reset(uid, token, PASSWORD)
        finally:
            close_old_connections()

    with patch('apps.users.views.auth.JWTService.generate_tokens', side_effect=pause_before_issuance):
        with ThreadPoolExecutor(max_workers=2) as workers:
            login_result = workers.submit(login)
            try:
                assert credentials_validated.wait(timeout=5)
                login_holds_user_lock = False
                try:
                    with transaction.atomic():
                        User.objects.select_for_update(nowait=True).get(pk=user.pk)
                except DatabaseError as exc:
                    assert getattr(exc.__cause__, 'sqlstate', getattr(exc.__cause__, 'pgcode', None)) == '55P03'
                    login_holds_user_lock = True
                reset_result = workers.submit(reset)
                assert reset_lock_attempted.wait(timeout=5)
                if not login_holds_user_lock:
                    # Deterministically finish the reset before vulnerable issuance.
                    # With the shared lock, release login so reset can acquire it.
                    reset_result.result(timeout=10)
            finally:
                release_login.set()
            response = login_result.result(timeout=10)
            reset_result.result(timeout=10)
    assert response.status_code == 200
    refresh = response.json()['data']['refresh_token']
    assert APIClient().post('/api/v1/auth/refresh', {'refresh': refresh}, format='json').status_code == 401
    user.refresh_from_db()
    assert user.check_password(PASSWORD)


@pytest.mark.django_db(transaction=True)
def test_password_login_waiting_on_reset_rechecks_the_committed_password(user):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from django.db import close_old_connections, connection, transaction
    from apps.users.password_reset import complete_password_reset
    uid, token = emailed_link(user)
    lookup_attempted, old_password_checked = Event(), Event()
    locking_lookup = []
    check_password = User.check_password

    def observe_lookup(execute, sql, params, many, context):
        if sql.lstrip().startswith('SELECT') and 'FROM "users"' in sql and not lookup_attempted.is_set():
            locking_lookup.append('FOR UPDATE' in sql)
            lookup_attempted.set()
        return execute(sql, params, many, context)

    def observe_password_check(login_user, raw_password):
        result = check_password(login_user, raw_password)
        if login_user.pk == user.pk and raw_password == 'OriginalPassword98!':
            old_password_checked.set()
        return result

    def login():
        close_old_connections()
        try:
            with connection.execute_wrapper(observe_lookup):
                return APIClient().post('/api/v1/auth/login/password',
                    {'identifier': user.email, 'password': 'OriginalPassword98!'}, format='json')
        finally:
            close_old_connections()

    with patch.object(User, 'check_password', observe_password_check):
        with ThreadPoolExecutor(max_workers=1) as workers:
            with transaction.atomic():
                complete_password_reset(uid, token, PASSWORD)
                login_result = workers.submit(login)
                assert lookup_attempted.wait(timeout=5)
                if not locking_lookup[0]:
                    assert old_password_checked.wait(timeout=5)
            response = login_result.result(timeout=10)
    assert response.status_code == 401
    assert response.json()['errors'][0]['code'] == 'auth_001'
    assert not OutstandingToken.objects.filter(user=user).exists()


@pytest.mark.django_db
@pytest.mark.parametrize('credential', ['blank', 'unusable', 'unsupported'])
def test_pure_oauth_projection_cannot_create_a_password_through_recovery(credential):
    from apps.users.auth.contracts import NormalizedQAuthIdentity
    from apps.users.auth.user_projection import create_user_for_identity
    from apps.users.services import EmailAuthService
    identity = NormalizedQAuthIdentity(provider_key='google', provider_subject='oauth-only',
        email='oauth-only@example.test', username='oauth-only', email_verified=True)
    oauth = create_user_for_identity(identity)
    if credential == 'unusable':
        oauth.set_unusable_password()
    elif credential == 'unsupported':
        oauth.password = 'unsupported$not-a-local-password'
    oauth.save(update_fields=['password'])
    assert EmailAuthService.login(oauth.email, 'sample-password') is None
    send_password_reset(oauth.email)
    assert len(mail.outbox) == 0


@pytest.mark.parametrize('credential', ['blank', 'unusable', 'unsupported', 'valid'])
def test_recovery_eligibility_matches_existing_local_password_capability(credential):
    from apps.users.password_reset import _has_local_password
    account = User(auth_provider='google')
    if credential == 'unusable':
        account.set_unusable_password()
    elif credential == 'unsupported':
        account.password = 'unsupported$not-a-local-password'
    elif credential == 'valid':
        account.set_password(PASSWORD)
    assert _has_local_password(account) is (credential == 'valid')
    assert account.check_password(PASSWORD) is (credential == 'valid')


def test_blocked_password_login_writes_exam_audit_after_user_transaction():
    """The audit storage seam must run after the credential transaction commits."""
    from contextlib import contextmanager
    from types import SimpleNamespace
    from django.db import transaction
    from rest_framework.parsers import JSONParser
    from rest_framework.request import Request
    from rest_framework.test import APIRequestFactory
    from apps.users.views.auth import _password_provider_login
    account = User(id=42, username='student', email='student@example.test')
    conflict = SimpleNamespace(contest=SimpleNamespace(id='exam', name='Exam'),
        participant=SimpleNamespace(id=7, exam_status='in_progress'),
        active_session={'device_id': 'original-device'})
    state, callbacks, audits = {'in_transaction': False}, [], []

    @contextmanager
    def credential_transaction():
        state['in_transaction'] = True
        try:
            yield
        finally:
            state['in_transaction'] = False
            for callback in callbacks:
                callback()

    def after_commit(callback):
        assert state['in_transaction']
        callbacks.append(callback)

    def write_audit(kind):
        assert not state['in_transaction'], 'Exam audit must not hold the password user lock'
        audits.append(kind)

    request = Request(APIRequestFactory().post('/api/v1/auth/login/password',
        {'identifier': account.email, 'password': 'OriginalPassword98!'}, format='json'), parsers=[JSONParser()])
    with patch.object(transaction, 'atomic', credential_transaction), patch.object(transaction, 'on_commit', after_commit), \
         patch('apps.users.views.auth.EmailAuthService.login', return_value=account), \
         patch('apps.users.views.common.find_exam_conflict', return_value=conflict), \
         patch('apps.users.views.common.ExamEvent.objects.create', side_effect=lambda **kwargs: write_audit('event')), \
         patch('apps.users.views.common.log_contest_activity', side_effect=lambda **kwargs: write_audit('activity')), \
         patch('apps.users.views.auth.JWTService.generate_tokens') as issue:
        response = _password_provider_login(request)
    assert response.status_code == 409
    assert response.data['errors'][0]['details']['active_exam']['participant_id'] == 7
    assert audits == ['event', 'activity']
    issue.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_blocked_password_login_does_not_deadlock_with_integrity_lock_order(user):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from django.db import close_old_connections, transaction
    from apps.contests.models import Contest, ContestActivity, ContestParticipant, ExamEvent
    from apps.users.services import EmailAuthService
    teacher = User.objects.create_user(username='lock-teacher', email='lock-teacher@example.test',
        password='TeacherPassword98!', role='teacher')
    now = timezone.now()
    contest = Contest.objects.create(name='Lock order exam', owner=teacher, status='published',
        cheat_detection_enabled=True, start_time=now - timedelta(minutes=5), end_time=now + timedelta(hours=1))
    participant = ContestParticipant.objects.create(contest=contest, user=user,
        exam_status='in_progress', started_at=now)
    contest_locked, user_locked, integrity_join_attempted = Event(), Event(), Event()
    password_login = EmailAuthService.login

    def pause_after_user_lock(*args, **kwargs):
        account = password_login(*args, **kwargs)
        user_locked.set()
        assert integrity_join_attempted.wait(timeout=5)
        return account

    def integrity_locks():
        close_old_connections()
        try:
            with transaction.atomic():
                Contest.objects.select_for_update().get(pk=contest.pk)
                contest_locked.set()
                assert user_locked.wait(timeout=5)
                integrity_join_attempted.set()
                # The real integrity command locks its participant and joined user.
                ContestParticipant.objects.select_for_update().select_related('contest', 'user').get(pk=participant.pk)
        finally:
            close_old_connections()

    def blocked_login():
        close_old_connections()
        try:
            return APIClient().post('/api/v1/auth/login/password',
                {'identifier': user.email, 'password': 'OriginalPassword98!'}, format='json',
                HTTP_X_DEVICE_ID='other-device')
        finally:
            close_old_connections()

    with patch('apps.users.views.auth.EmailAuthService.login', side_effect=pause_after_user_lock):
        with ThreadPoolExecutor(max_workers=2) as workers:
            integrity_result = workers.submit(integrity_locks)
            assert contest_locked.wait(timeout=5)
            login_result = workers.submit(blocked_login)
            response = login_result.result(timeout=10)
            integrity_result.result(timeout=10)
    assert response.status_code == 409
    assert response.json()['errors'][0]['code'] == 'active_exam_session_exists'
    assert ExamEvent.objects.filter(contest=contest, user=user, event_type='concurrent_login_detected').count() == 1
    assert ContestActivity.objects.filter(contest=contest, user=user, action_type='concurrent_login_detected').count() == 1
    assert not OutstandingToken.objects.filter(user=user).exists()
