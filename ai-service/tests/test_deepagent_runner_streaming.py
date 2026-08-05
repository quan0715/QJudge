from __future__ import annotations

import asyncio
import sys
import types
from types import SimpleNamespace
from uuid import UUID

import pytest
from langgraph.errors import GraphRecursionError
from langgraph.types import Command

_deepseek_stub = types.ModuleType("langchain_deepseek")
_openai_stub = types.ModuleType("langchain_openai")
_deepseek_stub.ChatDeepSeek = type("ChatDeepSeek", (), {})
_openai_stub.ChatOpenAI = type("ChatOpenAI", (), {})
sys.modules.setdefault("langchain_deepseek", _deepseek_stub)
sys.modules.setdefault("langchain_openai", _openai_stub)

from infrastructure.agent.deepagent_adapter import AgentCommand, AgentOperation
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
    runner = DeepAgentRunner(mcp_server_url="http://example.test/mcp")
    runner._checkpointer = _Checkpointer()
    return runner


async def test_legacy_stream_generators_iterate_with_caller_owned_ids(monkeypatch):
    runner = _build_runner()
    session_id = "22222222-2222-4222-8222-222222222222"
    run_id = "11111111-1111-4111-8111-111111111111"
    captured = []

    async def fake_compatibility_stream(**kwargs):
        captured.append(kwargs)
        yield {
            "type": "run_started",
            "run_id": kwargs["run_id"],
            "thread_id": kwargs["thread_id"],
        }

    monkeypatch.setattr(runner, "_compatibility_stream", fake_compatibility_stream)
    context = SimpleNamespace(
        run_id=run_id,
        session_id=session_id,
        user_authorization="Bearer user-token",
        tool_policy=None,
    )

    start_events = [
        event
        async for event in runner.run_stream(
            thread_id=session_id,
            messages=[{"role": "user", "content": "hello"}],
            request_context=context,
        )
    ]
    resume_events = [
        event
        async for event in runner.resume_stream(
            thread_id=session_id,
            decision="approve",
            request_context=context,
        )
    ]
    answer_events = [
        event
        async for event in runner.answer_stream(
            thread_id=session_id,
            answer="yes",
            request_context=context,
        )
    ]

    assert [events[0]["run_id"] for events in (start_events, resume_events, answer_events)] == [
        run_id,
        run_id,
        run_id,
    ]
    assert [call["thread_id"] for call in captured] == [session_id] * 3
    assert [call["run_id"] for call in captured] == [run_id] * 3


async def test_legacy_stream_rejects_missing_or_mismatched_caller_ids():
    runner = _build_runner()
    context = SimpleNamespace(
        run_id=None,
        session_id="22222222-2222-4222-8222-222222222222",
        user_authorization="Bearer user-token",
        tool_policy=None,
    )

    with pytest.raises(ValueError, match="run_id"):
        _ = [
            event
            async for event in runner.run_stream(
                thread_id=context.session_id,
                messages=[{"role": "user", "content": "hello"}],
                request_context=context,
            )
        ]

    context.run_id = "11111111-1111-4111-8111-111111111111"
    with pytest.raises(ValueError, match="session_id"):
        _ = [
            event
            async for event in runner.run_stream(
                thread_id="33333333-3333-4333-8333-333333333333",
                messages=[{"role": "user", "content": "hello"}],
                request_context=context,
            )
        ]


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


def test_runner_execute_uses_caller_configurable_ids(monkeypatch):
    runner = _build_runner()
    captured: dict = {}
    command = AgentCommand(
        run_id=UUID("11111111-1111-4111-8111-111111111111"),
        session_id=UUID("22222222-2222-4222-8222-222222222222"),
        operation=AgentOperation.START,
        prompt="hello",
        model_id="deepseek-v4",
        mcp_token="mcp-token",
        approval=None,
        answer=None,
    )

    async def fake_stream_events(
        agent, agent_input, config, run_id, thread_id, model_id, event_queue=None
    ):
        captured.update(
            agent_input=agent_input,
            config=config,
            run_id=run_id,
            thread_id=thread_id,
            model_id=model_id,
        )
        yield {"type": "run_completed", "run_id": run_id}

    monkeypatch.setattr(runner, "_build_agent", lambda **_kwargs: object())
    monkeypatch.setattr(runner, "_stream_events", fake_stream_events)

    async def collect():
        return [
            event
            async for event in runner.execute(
                command=command,
                tools=[],
                configurable={
                    "thread_id": str(command.session_id),
                    "run_id": str(command.run_id),
                },
            )
        ]

    events = asyncio.run(collect())

    assert events == [{"type": "run_completed", "run_id": str(command.run_id)}]
    assert captured == {
        "agent_input": {"messages": [{"role": "user", "content": "hello"}]},
        "config": {
            "configurable": {
                "thread_id": str(command.session_id),
                "run_id": str(command.run_id),
            },
            "metadata": {
                "thread_id": str(command.session_id),
                "run_id": str(command.run_id),
            },
            "recursion_limit": 100,
        },
        "run_id": str(command.run_id),
        "thread_id": str(command.session_id),
        "model_id": "deepseek-v4",
    }


@pytest.mark.parametrize(
    ("operation", "approval", "answer", "expected_resume"),
    [
        (
            AgentOperation.RESUME,
            {"decisions": [{"type": "approve"}]},
            None,
            {"decisions": [{"type": "approve"}]},
        ),
        (
            AgentOperation.APPROVE,
            {"decision": "reject"},
            None,
            {"decisions": [{"type": "reject"}]},
        ),
        (AgentOperation.ANSWER, None, "because", {"answer": "because"}),
    ],
)
def test_runner_resume_operations_keep_caller_ids(
    monkeypatch, operation, approval, answer, expected_resume
):
    runner = _build_runner()
    captured: dict = {}
    command = AgentCommand(
        run_id=UUID("11111111-1111-4111-8111-111111111111"),
        session_id=UUID("22222222-2222-4222-8222-222222222222"),
        operation=operation,
        prompt=None,
        model_id="deepseek-v4",
        mcp_token="mcp-token",
        approval=approval,
        answer=answer,
    )

    async def fake_stream_events(
        agent, agent_input, config, run_id, thread_id, model_id, event_queue=None
    ):
        captured.update(
            agent_input=agent_input,
            config=config,
            run_id=run_id,
            thread_id=thread_id,
        )
        yield {"type": "run_completed", "run_id": run_id}

    monkeypatch.setattr(runner, "_build_agent", lambda **_kwargs: object())
    monkeypatch.setattr(runner, "_stream_events", fake_stream_events)

    async def collect():
        return [
            event
            async for event in runner.execute(
                command=command,
                tools=[],
                configurable={
                    "thread_id": str(command.session_id),
                    "run_id": str(command.run_id),
                },
            )
        ]

    asyncio.run(collect())

    assert isinstance(captured["agent_input"], Command)
    assert captured["agent_input"].resume == expected_resume
    assert captured["run_id"] == str(command.run_id)
    assert captured["thread_id"] == str(command.session_id)
    assert captured["config"]["configurable"] == {
        "thread_id": str(command.session_id),
        "run_id": str(command.run_id),
    }
