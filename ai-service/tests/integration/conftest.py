"""PostgreSQL integration-test fixtures for AI Service persistence."""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

_AI_TABLES = ("run_events", "messages", "artifacts", "runs", "sessions")


@pytest.hookimpl(trylast=True)
def pytest_runtest_teardown(item: pytest.Item, nextitem: pytest.Item | None) -> None:
    """Leave legacy synchronous tests with the default loop they expect.

    pytest-asyncio clears the current loop after an async integration test. Some
    pre-existing synchronous tests still call ``asyncio.get_event_loop()``.
    Keep this compatibility shim local to the integration-test subtree.
    """
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())


def _test_database_url() -> str:
    value = os.environ.get("AI_TEST_DATABASE_URL", "").strip()
    if not value:
        pytest.fail(
            "AI_TEST_DATABASE_URL is required for AI persistence integration tests; "
            "a real PostgreSQL database must be provided (SQLite is not supported)."
        )
    if value.startswith("sqlite"):
        pytest.fail("AI_TEST_DATABASE_URL must reference PostgreSQL, not SQLite.")
    if not value.startswith(("postgresql://", "postgresql+psycopg://")):
        pytest.fail("AI_TEST_DATABASE_URL must be a PostgreSQL URL.")
    return value


def _async_database_url(value: str) -> str:
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


def _alembic_database_url(value: str) -> str:
    """Escape ConfigParser interpolation syntax without changing the URL."""
    return value.replace("%", "%%")


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Apply the AI schema once to the explicitly supplied PostgreSQL database."""
    root = Path(__file__).resolve().parents[2]
    config = Config(root / "alembic.ini")
    config.set_main_option("script_location", str(root / "migrations"))
    config.set_main_option(
        "sqlalchemy.url", _alembic_database_url(_test_database_url())
    )
    command.upgrade(config, "head")


@pytest_asyncio.fixture
async def db_engine(migrated_database: None) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(_async_database_url(_test_database_url()))
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "TRUNCATE TABLE "
                    + ", ".join(f'ai."{table}"' for table in _AI_TABLES)
                    + " RESTART IDENTITY CASCADE"
                )
            )
        yield engine
    finally:
        await engine.dispose()
