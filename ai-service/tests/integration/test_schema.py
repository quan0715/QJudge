"""Contract tests for the AI Service-owned PostgreSQL schema."""

from pathlib import Path

from alembic.config import Config
from sqlalchemy import inspect

from tests.integration.conftest import _alembic_database_url


def test_percent_encoded_database_url_is_safe_for_alembic_config() -> None:
    database_url = "postgresql://user:p%40ss@localhost/qjudge_ai_test"
    config = Config(Path(__file__).resolve().parents[2] / "alembic.ini")

    config.set_main_option("sqlalchemy.url", _alembic_database_url(database_url))

    assert config.get_main_option("sqlalchemy.url") == database_url


async def test_ai_schema_has_only_three_uuid_primary_keys(db_engine) -> None:
    async with db_engine.connect() as connection:
        tables = await connection.run_sync(
            lambda sync: inspect(sync).get_table_names(schema="ai")
        )
        assert set(tables) == {
            "sessions",
            "messages",
            "runs",
            "run_events",
            "artifacts",
        }

        def pk_columns(sync, table: str) -> list[str]:
            return inspect(sync).get_pk_constraint(table, schema="ai")[
                "constrained_columns"
            ]

        assert await connection.run_sync(lambda sync: pk_columns(sync, "sessions")) == [
            "session_id"
        ]
        assert await connection.run_sync(lambda sync: pk_columns(sync, "runs")) == [
            "run_id"
        ]
        assert await connection.run_sync(
            lambda sync: pk_columns(sync, "artifacts")
        ) == ["artifact_id"]
        assert await connection.run_sync(lambda sync: pk_columns(sync, "messages")) == [
            "session_id",
            "ordinal",
        ]
        assert await connection.run_sync(
            lambda sync: pk_columns(sync, "run_events")
        ) == ["run_id", "sequence"]


async def test_removed_identity_columns_do_not_exist(db_engine) -> None:
    forbidden = {
        "external_run_id",
        "thread_id",
        "celery_task_id",
        "tenant_id",
        "user_id",
        "user_message_id",
        "assistant_message_id",
        "object_key",
    }
    async with db_engine.connect() as connection:
        columns = await connection.run_sync(
            lambda sync: {
                column["name"]
                for table in (
                    "sessions",
                    "messages",
                    "runs",
                    "run_events",
                    "artifacts",
                )
                for column in inspect(sync).get_columns(table, schema="ai")
            }
        )
    assert forbidden.isdisjoint(columns)
