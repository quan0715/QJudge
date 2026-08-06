"""Live proof that Django and AI database credentials cannot cross-connect."""

from __future__ import annotations

import os

import psycopg
import pytest


@pytest.mark.parametrize(
    "variable",
    ("AI_TO_DJANGO_TEST_URL", "DJANGO_TO_AI_TEST_URL"),
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
    ("AI_OWN_TEST_URL", "DJANGO_OWN_TEST_URL"),
)
def test_application_role_can_connect_only_to_its_own_database(variable: str) -> None:
    database_url = os.environ.get(variable, "")
    if not database_url:
        pytest.skip(f"{variable} is required for credential isolation integration test")
    database_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    with psycopg.connect(database_url, connect_timeout=3) as connection:
        assert connection.execute("SELECT current_database()").fetchone()[0]
