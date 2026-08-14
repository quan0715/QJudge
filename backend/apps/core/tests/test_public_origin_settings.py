from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from config.deployment import parse_public_origin


BACKEND_ROOT = Path(__file__).resolve().parents[3]


def test_parse_public_origin_returns_normalized_origin_and_hostname() -> None:
    parsed = parse_public_origin("https://judge.example.test/")

    assert parsed.url == "https://judge.example.test"
    assert parsed.hostname == "judge.example.test"


@pytest.mark.parametrize(
    "value",
    (
        "judge.example.test",
        "ftp://judge.example.test",
        "https://judge.example.test/path",
        "https://judge.example.test?mode=test",
        "https://user@judge.example.test",
    ),
)
def test_parse_public_origin_rejects_values_that_are_not_origins(value: str) -> None:
    with pytest.raises(ValueError, match="QJUDGE_PUBLIC_ORIGIN"):
        parse_public_origin(value)


@pytest.mark.parametrize(
    ("origin", "expected"),
    (
        ("http://judge.example.test", [False, False, False, False, 0]),
        ("https://judge.example.test", [True, True, True, True, 31536000]),
    ),
)
def test_production_transport_security_follows_public_origin_scheme(
    origin: str,
    expected: list[bool | int],
) -> None:
    environment = os.environ.copy()
    environment.update(
        {
            "DJANGO_ENV": "production",
            "QJUDGE_PUBLIC_ORIGIN": origin,
            "SECRET_KEY": "transport-security-test-secret",
        }
    )
    script = """
import json
from config.settings import prod

print(json.dumps([
    prod.SECURE_SSL_REDIRECT,
    prod.SESSION_COOKIE_SECURE,
    prod.CSRF_COOKIE_SECURE,
    prod.JWT_AUTH_COOKIE_SECURE,
    prod.SECURE_HSTS_SECONDS,
]))
"""

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == expected


def test_production_allowed_hosts_include_required_internal_service_names() -> None:
    environment = os.environ.copy()
    environment.update(
        {
            "DJANGO_ENV": "production",
            "QJUDGE_PUBLIC_ORIGIN": "https://judge.example.test",
            "SECRET_KEY": "allowed-hosts-test-secret",
        }
    )
    script = """
import json
from config.settings import prod

print(json.dumps(prod.ALLOWED_HOSTS))
"""

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == [
        "judge.example.test",
        "localhost",
        "127.0.0.1",
        "backend",
    ]
