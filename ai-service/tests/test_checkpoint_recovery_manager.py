from __future__ import annotations

import asyncio
import sys
import types

_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")
_deepseek_stub.ChatDeepSeek = type("ChatDeepSeek", (), {})
_openai_stub.ChatOpenAI = type("ChatOpenAI", (), {})
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)
sys.modules.setdefault("langchain_openai", _openai_stub)

from services.runtime.checkpoint_recovery_manager import CheckpointRecoveryManager


class _Checkpointer:
    def __init__(self) -> None:
        self.deleted_threads: list[str] = []

    async def adelete_thread(self, thread_id: str) -> None:
        self.deleted_threads.append(thread_id)


def test_stream_with_recovery_retries_once_after_repair():
    checkpointer = _Checkpointer()

    async def repair(_agent, _config):
        return True

    manager = CheckpointRecoveryManager(
        checkpointer=checkpointer,
        repair_dangling_tool_calls=repair,
    )

    calls = {"count": 0}

    async def run_stream():
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("insufficient tool messages following tool_calls")
        yield {"type": "ok"}

    async def collect():
        out = []
        async for item in manager.stream_with_recovery(
            run_stream=run_stream,
            agent=object(),
            config={},
            thread_id="t1",
        ):
            out.append(item)
        return out

    result = asyncio.run(collect())
    assert result == [{"type": "ok"}]
    assert calls["count"] == 2
    assert checkpointer.deleted_threads == []


def test_stream_with_recovery_deletes_checkpoint_when_repair_fails():
    checkpointer = _Checkpointer()

    async def repair(_agent, _config):
        return False

    manager = CheckpointRecoveryManager(
        checkpointer=checkpointer,
        repair_dangling_tool_calls=repair,
    )

    async def run_stream():
        raise RuntimeError("insufficient tool messages following tool_calls")
        yield  # pragma: no cover

    async def collect():
        async for _ in manager.stream_with_recovery(
            run_stream=run_stream,
            agent=object(),
            config={},
            thread_id="t2",
        ):
            pass

    try:
        asyncio.run(collect())
    except RuntimeError:
        pass
    else:  # pragma: no cover
        assert False, "expected RuntimeError"

    assert checkpointer.deleted_threads == ["t2"]


def test_recovery_manager_requires_initialized_checkpointer():
    async def repair(_agent, _config):
        return True

    try:
        CheckpointRecoveryManager(
            checkpointer=None,
            repair_dangling_tool_calls=repair,
        )
    except RuntimeError as exc:
        assert "requires initialized checkpointer" in str(exc)
    else:  # pragma: no cover
        assert False, "expected RuntimeError"
