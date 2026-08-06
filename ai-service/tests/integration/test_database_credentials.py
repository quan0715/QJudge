"""Live proof that Django and AI database credentials cannot cross-connect."""

from __future__ import annotations

import os
from urllib.parse import unquote, urlsplit

import psycopg
import pytest


@pytest.mark.parametrize(
    "variable",
    (
        "AI_TO_DJANGO_TEST_URL",
        "DJANGO_TO_AI_TEST_URL",
        "GLITCHTIP_TO_DJANGO_TEST_URL",
        "DJANGO_TO_GLITCHTIP_TEST_URL",
    ),
)
def test_application_role_cannot_connect_to_the_other_database(variable: str) -> None:
    database_url = os.environ.get(variable, "")
    if not database_url:
        pytest.skip(f"{variable} is required for credential isolation integration test")
    database_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    with pytest.raises(psycopg.OperationalError):
        psycopg.connect(database_url, connect_timeout=3)


@pytest.mark.parametrize(
    "variable",
    ("AI_OWN_TEST_URL", "DJANGO_OWN_TEST_URL", "GLITCHTIP_OWN_TEST_URL"),
)
def test_application_role_can_connect_only_to_its_own_database(variable: str) -> None:
    database_url = os.environ.get(variable, "")
    if not database_url:
        pytest.skip(f"{variable} is required for credential isolation integration test")
    database_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    with psycopg.connect(database_url, connect_timeout=3) as connection:
        assert connection.execute("SELECT current_database()").fetchone()[0]


def test_live_ai_process_uses_the_declared_ai_role_and_database() -> None:
    database_url = os.environ.get("AI_DATABASE_URL", "")
    expected_user = os.environ.get("AI_DB_USER", "")
    expected_database = os.environ.get("AI_DB_NAME", "")
    if not all((database_url, expected_user, expected_database)):
        pytest.skip("live AI database identity environment is required")

    parsed = urlsplit(database_url.replace("postgresql+psycopg://", "postgresql://", 1))
    assert unquote(parsed.username or "") == expected_user
    assert unquote(parsed.path.lstrip("/")) == expected_database
    with psycopg.connect(
        database_url.replace("postgresql+psycopg://", "postgresql://", 1),
        connect_timeout=3,
    ) as connection:
        actual_user, actual_database = connection.execute(
            "SELECT current_user, current_database()"
        ).fetchone()
    assert actual_user == expected_user
    assert actual_database == expected_database
