"""Mail availability is independent of the password login capability."""
import os
from pathlib import Path
import subprocess
import sys

import pytest

from apps.core.services.mail import mail_enabled
from apps.users.auth.options import get_auth_options
from apps.users.password_reset import reset_enabled


@pytest.mark.parametrize('mode,password_enabled,expected', [
    ('external', True, True),
    ('disabled', True, False),
    ('external', False, False),
    ('disabled', False, False),
    ('typo', True, False),
    ('bundled', True, True),
    ('bundled', False, False),
])
def test_password_recovery_requires_mail_and_password_login(settings, mode, password_enabled, expected):
    settings.EMAIL_MODE = mode
    settings.AUTH_EMAIL_PASSWORD_ENABLED = password_enabled
    assert get_auth_options()['password_reset_enabled'] is expected
    assert reset_enabled() is expected


@pytest.mark.parametrize('mode,expected', [(None, 'disabled'), ('', 'disabled'), ('disabled', 'disabled'), ('external', 'external'), ('bundled', 'bundled')])
def test_settings_default_mail_to_disabled(mode, expected):
    result = load_mail_settings(mode)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == expected


def test_settings_reject_unknown_mail_mode():
    result = load_mail_settings('typo')
    assert result.returncode != 0
    assert 'EMAIL_MODE' in result.stderr and 'ImproperlyConfigured' in result.stderr


def load_mail_settings(mode):
    env = {'PATH': os.defpath, 'DATABASE_URL': 'postgresql://test:test@localhost:5432/test', 'QJUDGE_PUBLIC_ORIGIN': 'http://localhost:8080'}
    if mode is not None:
        env['EMAIL_MODE'] = mode
    return subprocess.run(
        [sys.executable, '-c', 'from config.settings.base import EMAIL_MODE; print(EMAIL_MODE)'],
        cwd=Path(__file__).resolve().parents[3], env=env, capture_output=True, text=True,
    )


@pytest.mark.parametrize('mode,expected', [('external', True), ('bundled', True), ('disabled', False), ('typo', False), ('', False)])
def test_mail_capability_does_not_depend_on_password_login(settings, mode, expected):
    settings.EMAIL_MODE = mode
    settings.AUTH_EMAIL_PASSWORD_ENABLED = False
    assert mail_enabled() is expected


def test_manual_smtp_probe_remains_available_while_application_mail_is_disabled(settings):
    from django.core import mail
    from django.core.management import call_command
    settings.EMAIL_MODE = 'disabled'
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    call_command('sendtestemail', 'operator@example.test')
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ['operator@example.test']
    assert mail_enabled() is False
