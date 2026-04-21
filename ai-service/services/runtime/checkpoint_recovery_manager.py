"""Recovery manager for dangling tool-call checkpoint failures."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Any


logger = logging.getLogger(__name__)


class CheckpointRecoveryManager:
    """Handle checkpoint repair/retry strategy for streaming execution."""

    def __init__(
        self,
        *,
        checkpointer: Any,
        repair_dangling_tool_calls: Callable[[Any, dict[str, Any]], Awaitable[bool]],
    ) -> None:
        if checkpointer is None:
            raise RuntimeError("CheckpointRecoveryManager requires initialized checkpointer")
        self._checkpointer = checkpointer
        self._repair_dangling_tool_calls = repair_dangling_tool_calls

    async def stream_with_recovery(
        self,
        *,
        run_stream: Callable[[], AsyncGenerator[dict[str, Any], None]],
        agent: Any,
        config: dict[str, Any],
        thread_id: str,
        passthrough_predicate: Callable[[BaseException], bool] | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        try:
            async for sse_dict in run_stream():
                yield sse_dict
        except asyncio.CancelledError:
            logger.warning(
                "Stream cancelled for thread %s, repairing checkpoint", thread_id
            )
            await self._repair_dangling_tool_calls(agent, config)
            raise
        except Exception as exc:
            if passthrough_predicate and passthrough_predicate(exc):
                raise
            if not self._is_insufficient_tool_messages(exc):
                raise

            logger.warning("Dangling tool_calls detected, attempting repair...")
            repaired = await self._repair_dangling_tool_calls(agent, config)
            if not repaired:
                logger.warning(
                    "Cannot repair dangling tool_calls (summarization state corrupt), "
                    "deleting checkpoint for thread %s",
                    thread_id,
                )
                await self._checkpointer.adelete_thread(thread_id)
                raise

            try:
                async for sse_dict in run_stream():
                    yield sse_dict
            except Exception as retry_exc:
                if self._is_insufficient_tool_messages(retry_exc):
                    logger.warning(
                        "Repair insufficient, deleting checkpoint for thread %s",
                        thread_id,
                    )
                    await self._checkpointer.adelete_thread(thread_id)
                raise

    @staticmethod
    def _is_insufficient_tool_messages(exc: BaseException) -> bool:
        error_str = str(exc)
        nested = getattr(exc, "exceptions", None)
        if nested:
            error_str += " ".join(str(item) for item in nested)
        return "insufficient tool messages" in error_str
