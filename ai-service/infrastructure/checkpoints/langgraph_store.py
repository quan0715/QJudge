"""PostgreSQL-backed LangGraph checkpoint lifecycle and identity adapter."""

from __future__ import annotations

import argparse
import asyncio
import re
from uuid import UUID

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg import sql
from psycopg_pool import AsyncConnectionPool

from config import get_settings

_SCHEMA_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _psycopg_url(database_url: str) -> str:
    if database_url.startswith("postgresql+psycopg://"):
        return database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    return database_url


class LangGraphCheckpointStore:
    """Keep all LangGraph rows in ``ai_checkpoint`` keyed by session UUID."""

    def __init__(
        self,
        *,
        database_url: str | None = None,
        schema: str | None = None,
    ) -> None:
        settings = get_settings()
        self._database_url = (database_url or settings.ai_database_url).strip()
        self._schema = schema or settings.ai_checkpoint_schema
        if not _SCHEMA_NAME.fullmatch(self._schema):
            raise ValueError("Invalid AI checkpoint schema name")
        self._pool: AsyncConnectionPool | None = None
        self._checkpointer: AsyncPostgresSaver | None = None

    @property
    def checkpointer(self) -> AsyncPostgresSaver:
        if self._checkpointer is None:
            raise RuntimeError("LangGraph checkpoint store is not initialized")
        return self._checkpointer

    def configurable(self, session_id: UUID) -> dict[str, str]:
        if not isinstance(session_id, UUID):
            raise TypeError("session_id must be a UUID")
        return {"thread_id": str(session_id)}

    async def setup(self) -> None:
        if self._checkpointer is not None:
            return
        if not self._database_url:
            raise RuntimeError("AI_DATABASE_URL is required for LangGraph checkpoints")

        pool = AsyncConnectionPool(
            conninfo=_psycopg_url(self._database_url),
            min_size=1,
            max_size=10,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
                "options": f"-c search_path={self._schema}",
            },
            open=False,
        )
        await pool.open()
        try:
            async with pool.connection() as connection:
                await connection.execute(
                    sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                        sql.Identifier(self._schema)
                    )
                )
            checkpointer = AsyncPostgresSaver(pool)
            await checkpointer.setup()
        except BaseException:
            await pool.close()
            raise

        self._pool = pool
        self._checkpointer = checkpointer

    async def close(self) -> None:
        pool = self._pool
        self._pool = None
        self._checkpointer = None
        if pool is not None:
            await pool.close()

    async def delete_session(self, session_id: UUID) -> None:
        await self.checkpointer.adelete_thread(
            self.configurable(session_id)["thread_id"]
        )

    async def repair_cancelled_run(self, session_id: UUID) -> None:
        """Clear the cancelled session checkpoint without changing its identity.

        LangGraph does not expose a supported API for deleting only an interrupt.
        Resetting the same thread removes pending writes and lets a future run reuse
        the authoritative session UUID; no replacement thread is created.
        """

        await self.delete_session(session_id)


async def _setup_from_environment() -> None:
    store = LangGraphCheckpointStore()
    try:
        await store.setup()
    finally:
        await store.close()


def _main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("setup",))
    parser.parse_args()
    asyncio.run(_setup_from_environment())


if __name__ == "__main__":
    _main()
