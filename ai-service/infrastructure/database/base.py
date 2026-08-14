"""SQLAlchemy base and connection factories for the independent AI database."""

from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from config import get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def normalize_async_database_url(url: str) -> str:
    """Select psycopg's async SQLAlchemy dialect for plain PostgreSQL URLs."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def create_async_engine_from_settings() -> AsyncEngine:
    database_url = get_settings().ai_database_url.strip()
    if not database_url:
        raise RuntimeError("AI_DATABASE_URL is required for AI persistence")
    return create_async_engine(
        normalize_async_database_url(database_url),
        pool_pre_ping=True,
    )


def async_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        create_async_engine_from_settings(),
        class_=AsyncSession,
        expire_on_commit=False,
    )
