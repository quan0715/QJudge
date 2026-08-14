"""Alembic environment for the AI Service-owned database."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from config import get_settings
from infrastructure.database import models  # noqa: F401
from infrastructure.database.base import Base, normalize_async_database_url

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _include_ai_schema(name: str | None, type_: str, parent_names: dict) -> bool:
    """Keep autogenerate isolated from LangGraph's ai_checkpoint schema."""
    if type_ == "schema":
        return name == "ai"
    return True


def _configured_url() -> str:
    url = config.get_main_option("sqlalchemy.url").strip()
    if not url:
        url = get_settings().ai_database_url.strip()
    if not url:
        raise RuntimeError("AI_DATABASE_URL is required to run AI database migrations")
    return normalize_async_database_url(url)


def run_migrations_offline() -> None:
    context.configure(
        url=_configured_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_schemas=True,
        include_name=_include_ai_schema,
    )

    with context.begin_transaction():
        context.run_migrations()


def _run_sync_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        include_schemas=True,
        include_name=_include_ai_schema,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _configured_url()
    connectable = async_engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(_run_sync_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(_run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
