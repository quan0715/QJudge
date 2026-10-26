"""Bound token persistence while preserving per-parent text and tool boundaries."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any


_TEXT_EVENTS = frozenset({"agent_message_delta", "thinking_delta"})


def _text_identity(event: dict[str, Any]) -> dict[str, Any] | None:
    if event.get("type") not in _TEXT_EVENTS or not isinstance(event.get("content"), str):
        return None
    # Includes parent/tool IDs and any future routing metadata. Only content may
    # differ inside one parent stream; controls always flush the whole window.
    return {key: value for key, value in event.items() if key != "content"}


@dataclass
class _PendingText:
    identity: dict[str, Any]
    chunks: list[str] = field(default_factory=list)
    size: int = 0

    def event(self) -> dict[str, Any]:
        return {**self.identity, "content": "".join(self.chunks)}


async def coalesce_text_events(
    events: AsyncIterator[dict[str, Any]],
    *,
    max_chars: int = 8192,
    max_delay: float = 0.05,
) -> AsyncIterator[dict[str, Any]]:
    """Merge each parent's text in a bounded window, preserving its type order.

    Different parent streams render independently and may be interleaved by the
    model. They share a 50ms / total-character budget, not a global adjacency
    requirement. Every non-text event flushes all parents before it is emitted.
    The bounded producer drains bursts without a database round-trip per token.
    One producer task owns the upstream iterator for its entire lifetime, so
    async context managers and ContextVars are entered and exited in one task.
    """
    queue: asyncio.Queue[dict[str, Any] | Exception | None] = asyncio.Queue(maxsize=64)
    iterator = events.__aiter__()

    async def produce() -> None:
        try:
            try:
                async for event in iterator:
                    await queue.put(event)
            finally:
                close = getattr(iterator, "aclose", None)
                if close is not None:
                    await close()
        except Exception as error:
            await queue.put(error)
        else:
            await queue.put(None)

    producer = asyncio.create_task(produce())
    loop = asyncio.get_running_loop()
    pending: dict[str | None, _PendingText] = {}
    size = 0
    deadline = 0.0

    def flush_window() -> list[dict[str, Any]]:
        nonlocal size
        flushed = [batch.event() for batch in pending.values()]
        pending.clear()
        size = 0
        return flushed

    try:
        while True:
            if pending and (size >= max_chars or loop.time() >= deadline):
                for event in flush_window():
                    yield event
                continue
            try:
                item = queue.get_nowait()
            except asyncio.QueueEmpty:
                if not pending:
                    item = await queue.get()
                else:
                    try:
                        item = await asyncio.wait_for(queue.get(), max(0, deadline - loop.time()))
                    except TimeoutError:
                        continue

            if item is None or isinstance(item, Exception):
                for event in flush_window():
                    yield event
                if isinstance(item, Exception):
                    raise item
                return

            identity = _text_identity(item)
            if identity is None:
                for event in flush_window():
                    yield event
                yield item
                continue
            if not item["content"]:
                continue

            parent = item.get("parent_tool_call_id")
            batch = pending.get(parent)
            if batch is not None and batch.identity != identity:
                # Reasoning/prose (or routing metadata) changes are ordered
                # within this parent, without flushing unrelated subagents.
                pending.pop(parent)
                size -= batch.size
                yield batch.event()
                batch = None
            if batch is None:
                if not pending:
                    deadline = loop.time() + max_delay
                batch = _PendingText(identity)
                pending[parent] = batch
            batch.chunks.append(item["content"])
            batch.size += len(item["content"])
            size += len(item["content"])
    finally:
        producer.cancel()
        with suppress(asyncio.CancelledError):
            await producer
