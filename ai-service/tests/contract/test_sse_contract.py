"""Persisted SSE is a byte-level replay of authoritative run events."""

from __future__ import annotations

import json
from uuid import UUID

import pytest

from api.routers.runs import encode_sse, persisted_events
from domain.models import Principal, Run, RunKind, RunStatus, StreamEvent

OWNER = Principal("issuer", "owner")
RUN_ID = UUID("22222222-2222-4222-8222-222222222222")
SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")


def event(sequence: int, event_type: str, payload: dict) -> StreamEvent:
    return StreamEvent(RUN_ID, sequence, event_type, payload)


def test_encode_sse_preserves_sequence_type_and_stored_json_payload() -> None:
    stored = event(7, "agent_message_delta", {"content": "你好", "seq": 7})
    assert (
        encode_sse(stored)
        == (
            "id: 7\n"
            "event: agent_message_delta\n"
            f"data: {json.dumps(stored.payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        ).encode()
    )


class FakeReader:
    def __init__(self, events, status=RunStatus.RUNNING):
        self.events = events
        self.status = status
        self.after_values = []

    async def get_run(self, principal, run_id):
        return Run(RUN_ID, SESSION_ID, self.status, RunKind.CHAT, "model")

    async def list_after(self, principal, run_id, after):
        self.after_values.append(after)
        return [item for item in self.events if item.sequence > after]


@pytest.mark.asyncio
async def test_reconnect_after_replays_sequence_three_without_renumbering() -> None:
    reader = FakeReader(
        [
            event(1, "run_started", {"stored": 1}),
            event(2, "thinking_delta", {"stored": 2}),
            event(3, "agent_message_delta", {"stored": 3}),
            event(4, "run_completed", {"stored": 4}),
        ]
    )
    frames = [
        frame
        async for frame in persisted_events(OWNER, RUN_ID, 2, reader, poll_seconds=0)
    ]
    assert frames == [encode_sse(reader.events[2]), encode_sse(reader.events[3])]
    assert reader.after_values == [2]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "closing_type",
    [
        "run_completed",
        "run_failed",
        "run_cancelled",
        "awaiting_approval",
        "awaiting_user_answer",
    ],
)
async def test_terminal_and_paused_events_close_stream(closing_type: str) -> None:
    reader = FakeReader([event(9, closing_type, {"type": closing_type})])
    frames = [
        frame
        async for frame in persisted_events(OWNER, RUN_ID, 8, reader, poll_seconds=0)
    ]
    assert frames == [encode_sse(reader.events[0])]


@pytest.mark.asyncio
async def test_active_empty_tail_emits_comment_heartbeat() -> None:
    reader = FakeReader([])
    stream = persisted_events(OWNER, RUN_ID, 4, reader, poll_seconds=3600)
    assert await anext(stream) == b": heartbeat\n\n"
    await stream.aclose()


@pytest.mark.asyncio
async def test_already_paused_run_closes_without_synthetic_event() -> None:
    reader = FakeReader([], status=RunStatus.AWAITING_USER_ANSWER)
    frames = [
        frame
        async for frame in persisted_events(OWNER, RUN_ID, 4, reader, poll_seconds=0)
    ]
    assert frames == []
