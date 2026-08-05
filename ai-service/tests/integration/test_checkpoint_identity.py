"""Real PostgreSQL contract for LangGraph checkpoint identity and schema."""

from __future__ import annotations

import os
from uuid import uuid4

from langgraph.checkpoint.base import empty_checkpoint
from langgraph.types import Interrupt
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


async def _put_completed_history(store: LangGraphCheckpointStore, session_id) -> dict:
    checkpoint = empty_checkpoint()
    version = "00000000000000000000000000000001.0.1"
    checkpoint["channel_values"] = {"messages": ["completed assistant response"]}
    checkpoint["channel_versions"] = {"messages": version}
    configurable = {
        **store.configurable(session_id),
        "checkpoint_ns": "",
    }
    return await store.checkpointer.aput(
        {"configurable": configurable},
        checkpoint,
        {"source": "loop", "step": 1, "parents": {}},
        {"messages": version},
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


async def test_cancel_repair_clears_only_pending_interrupt_and_preserves_history(
    db_engine, monkeypatch
) -> None:
    monkeypatch.setenv("AI_DATABASE_URL", os.environ["AI_TEST_DATABASE_URL"])
    get_settings.cache_clear()
    store = LangGraphCheckpointStore()
    session_id = uuid4()

    try:
        await store.setup()
        saved_config = await _put_completed_history(store, session_id)
        await store.checkpointer.aput_writes(
            saved_config,
            [
                ("__interrupt__", [Interrupt(value={"question": "continue?"})]),
                ("safe_channel", "pending non-interrupt write"),
            ],
            task_id="cancelled-task",
        )
        before = await store.checkpointer.aget_tuple(saved_config)
        assert before is not None
        assert {write[1] for write in before.pending_writes or []} == {
            "__interrupt__",
            "safe_channel",
        }

        await store.repair_cancelled_run(session_id)

        after = await store.checkpointer.aget_tuple(saved_config)
        assert after is not None
        assert after.checkpoint["channel_values"]["messages"] == [
            "completed assistant response"
        ]
        assert [write[1] for write in after.pending_writes or []] == ["safe_channel"]
        assert store.configurable(session_id) == {"thread_id": str(session_id)}
    finally:
        await store.close()
        get_settings.cache_clear()
