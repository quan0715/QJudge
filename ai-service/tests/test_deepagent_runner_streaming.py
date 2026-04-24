from __future__ import annotations

import asyncio
import sys
import types
from types import SimpleNamespace

from langgraph.errors import GraphRecursionError

_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")
_deepseek_stub.ChatDeepSeek = type("ChatDeepSeek", (), {})
_openai_stub.ChatOpenAI = type("ChatOpenAI", (), {})
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)
sys.modules.setdefault("langchain_openai", _openai_stub)

from services.deepagent_runner import DeepAgentRunner


class _UsageOutput:
    def __init__(self, usage_metadata: dict[str, int]) -> None:
        self.usage_metadata = usage_metadata


class _Checkpointer:
    async def adelete_thread(self, _thread_id: str) -> None:
        return None


class _FakeAgent:
    def __init__(self, events: list[dict], state: SimpleNamespace, *, fail_with: Exception | None = None) -> None:
        self._events = events
        self._state = state
        self._fail_with = fail_with

    async def astream_events(self, _agent_input, *, config, version):
        assert config is not None
        assert version == "v2"
        if self._fail_with is not None:
            raise self._fail_with
        for event in self._events:
            yield event

    async def aget_state(self, _config):
        return self._state


class _FakeRecursionHandler:
    @staticmethod
    def is_graph_recursion_error(exc: BaseException) -> bool:
        return isinstance(exc, GraphRecursionError)

    @staticmethod
    def fallback_recursion_summary() -> str:
        return "fallback"

    async def summarize_interruption(self, *, agent, config) -> str:
        assert agent is not None
        assert config is not None
        return "recursion summary"


async def _collect_events(runner: DeepAgentRunner, agent: _FakeAgent):
    events = []
    async for item in runner._stream_events(
        agent=agent,
        agent_input={"messages": []},
        config={"configurable": {"thread_id": "thread-1"}},
        run_id="run-1",
        thread_id="thread-1",
        model_id="deepseek-v4",
        event_queue=None,
    ):
        events.append(item)
    return events


def _build_runner() -> DeepAgentRunner:
    runner = DeepAgentRunner(checkpoint_db_url="", mcp_server_url="http://example.test/mcp")
    runner._checkpointer = _Checkpointer()
    return runner


def _event_types(events: list[dict]) -> list[str]:
    return [event["type"] for event in events]


def test_stream_events_orders_usage_before_run_completed_on_normal_path():
    runner = _build_runner()
    agent = _FakeAgent(
        events=[
            {
                "event": "on_chat_model_end",
                "data": {"output": _UsageOutput({"input_tokens": 2, "output_tokens": 3})},
            }
        ],
        state=SimpleNamespace(interrupts=()),
    )

    events = asyncio.run(_collect_events(runner, agent))
    types = _event_types(events)

    assert types.count("usage_report") == 1
    assert types.count("run_completed") == 1
    assert types.index("usage_report") < types.index("run_completed")


def test_stream_events_orders_usage_before_awaiting_approval_on_interrupt_path():
    runner = _build_runner()
    interrupt = SimpleNamespace(
        value={
            "action_requests": [{"name": "qjudge_exam", "args": {"action": "create"}}],
            "review_configs": [{"action_name": "qjudge_exam", "allowed_decisions": ["approve", "reject"]}],
        }
    )
    agent = _FakeAgent(
        events=[
            {
                "event": "on_chat_model_end",
                "data": {"output": _UsageOutput({"input_tokens": 5, "output_tokens": 7})},
            }
        ],
        state=SimpleNamespace(interrupts=(interrupt,)),
    )

    events = asyncio.run(_collect_events(runner, agent))
    types = _event_types(events)

    assert types.count("usage_report") == 1
    assert types.count("awaiting_approval") == 1
    assert types.index("usage_report") < types.index("awaiting_approval")


def test_stream_events_fail_closed_when_interrupt_payload_has_no_actions():
    runner = _build_runner()
    interrupt = SimpleNamespace(value={"action_requests": [], "review_configs": []})
    agent = _FakeAgent(
        events=[
            {
                "event": "on_chat_model_end",
                "data": {"output": _UsageOutput({"input_tokens": 1, "output_tokens": 1})},
            }
        ],
        state=SimpleNamespace(interrupts=(interrupt,)),
    )

    events = asyncio.run(_collect_events(runner, agent))
    types = _event_types(events)

    assert types.count("usage_report") == 1
    assert "awaiting_approval" not in types
    assert types[-1] == "run_failed"
    assert events[-1]["error_code"] == "INTERRUPT_PAYLOAD_INVALID"


def test_stream_events_recursion_path_emits_summary_then_usage_then_completed():
    runner = _build_runner()
    runner._recursion_handler = _FakeRecursionHandler()
    agent = _FakeAgent(
        events=[],
        state=SimpleNamespace(interrupts=(), values={"messages": []}),
        fail_with=GraphRecursionError("boom"),
    )

    events = asyncio.run(_collect_events(runner, agent))
    types = _event_types(events)

    assert "agent_message_delta" in types
    assert types.count("usage_report") == 1
    assert types.count("run_completed") == 1
    assert types.index("agent_message_delta") < types.index("usage_report")
    assert types.index("usage_report") < types.index("run_completed")
