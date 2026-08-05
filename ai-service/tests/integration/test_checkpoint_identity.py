"""Real PostgreSQL contract for LangGraph checkpoint identity and schema."""

from __future__ import annotations

import os
from uuid import uuid4

from langgraph.checkpoint.base import empty_checkpoint
from sqlalchemy import inspect

from config import get_settings
from infrastructure.checkpoints.langgraph_store import LangGraphCheckpointStore


async def _put_checkpoint(store: LangGraphCheckpointStore, session_id) -> dict:
    configurable = {
        **store.configurable(session_id),
        # LangGraph adds this namespace key before calling the saver. The
        # public AI checkpoint identity remains only the session UUID.
        "checkpoint_ns": "",
    }
    return await store.checkpointer.aput(
        {"configurable": configurable},
        empty_checkpoint(),
        {"source": "input", "step": 0, "parents": {}},
        {},
    )


async def test_checkpoint_store_uses_ai_database_schema_and_session_identity(
    db_engine, monkeypatch
) -> None:
    monkeypatch.setenv("AI_DATABASE_URL", os.environ["AI_TEST_DATABASE_URL"])
    get_settings.cache_clear()
    store = LangGraphCheckpointStore()
    session_id = uuid4()

    try:
        await store.setup()
        saved_config = await _put_checkpoint(store, session_id)

        assert saved_config["configurable"]["thread_id"] == str(session_id)
        assert await store.checkpointer.aget_tuple(saved_config) is not None

        async with db_engine.connect() as connection:
            checkpoint_tables = await connection.run_sync(
                lambda sync: inspect(sync).get_table_names(schema="ai_checkpoint")
            )
            public_tables = await connection.run_sync(
                lambda sync: inspect(sync).get_table_names(schema="public")
            )
        assert "checkpoints" in checkpoint_tables
        assert "checkpoints" not in public_tables

        await store.delete_session(session_id)
        assert await store.checkpointer.aget_tuple(saved_config) is None
    finally:
        await store.close()
        get_settings.cache_clear()


async def test_cancel_repair_clears_same_session_without_replacement_thread(
    db_engine, monkeypatch
) -> None:
    monkeypatch.setenv("AI_DATABASE_URL", os.environ["AI_TEST_DATABASE_URL"])
    get_settings.cache_clear()
    store = LangGraphCheckpointStore()
    session_id = uuid4()

    try:
        await store.setup()
        saved_config = await _put_checkpoint(store, session_id)
        assert await store.checkpointer.aget_tuple(saved_config) is not None

        await store.repair_cancelled_run(session_id)

        assert await store.checkpointer.aget_tuple(saved_config) is None
        assert store.configurable(session_id) == {"thread_id": str(session_id)}
    finally:
        await store.close()
        get_settings.cache_clear()
