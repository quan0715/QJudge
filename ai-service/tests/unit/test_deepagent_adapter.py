"""Authoritative identifier contract for the DeepAgent boundary."""

from __future__ import annotations

import asyncio

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

import pytest

from infrastructure.agent.deepagent_adapter import (
    AgentCommand,
    AgentOperation,
    DeepAgentAdapter,
)


RUN_ID = UUID("11111111-1111-4111-8111-111111111111")
SESSION_ID = UUID("22222222-2222-4222-8222-222222222222")


class FakeRunner:
    def __init__(self) -> None:
        self.commands: list[AgentCommand] = []
        self.configurable: dict[str, str] | None = None
        self.tools: list[Any] = []

    async def execute(
        self,
        *,
        command: AgentCommand,
        tools: list[Any],
        configurable: dict[str, str],
    ) -> AsyncIterator[dict[str, Any]]:
        self.commands.append(command)
        self.configurable = configurable
        self.tools = tools
        yield {"type": "agent_message_delta", "content": "hello"}
        # The boundary must replace even a conflicting dependency-provided ID.
        yield {"type": "run_completed", "run_id": "generated-by-dependency"}


class FakeCheckpointStore:
    def __init__(self) -> None:
        self.thread_ids: list[str] = []

    def configurable(self, session_id: UUID) -> dict[str, str]:
        self.thread_ids.append(str(session_id))
        return {"thread_id": str(session_id)}


class FakeMcpProvider:
    def __init__(self) -> None:
        self.tokens: list[str] = []

    @asynccontextmanager
    async def connect(self, mcp_token: str):
        self.tokens.append(mcp_token)
        yield [object()]


class FakeArtifactService:
    pass


def command_for(operation: AgentOperation) -> AgentCommand:
    return AgentCommand(
        run_id=RUN_ID,
        session_id=SESSION_ID,
        operation=operation,
        prompt="hello" if operation is AgentOperation.START else None,
        model_id="deepseek-flash",
        mcp_token="mcp-token",
        approval={"decisions": [{"type": "approve"}]}
        if operation in {AgentOperation.APPROVE, AgentOperation.RESUME}
        else None,
        answer="because" if operation is AgentOperation.ANSWER else None,
    )


@pytest.fixture
def adapter_parts():
    runner = FakeRunner()
    checkpoints = FakeCheckpointStore()
    mcp = FakeMcpProvider()
    adapter = DeepAgentAdapter(
        runner=runner,
        mcp_provider=mcp,
        artifact_service=FakeArtifactService(),
        checkpoint_store=checkpoints,
    )
    return adapter, runner, checkpoints, mcp


async def test_adapter_uses_domain_ids_for_run_and_checkpoint(adapter_parts) -> None:
    adapter, runner, checkpoints, mcp = adapter_parts
    command = command_for(AgentOperation.START)

    events = [event async for event in adapter.execute(command)]

    assert runner.configurable == {
        "thread_id": str(command.session_id),
        "run_id": str(command.run_id),
    }
    assert {event["run_id"] for event in events} == {str(command.run_id)}
    assert checkpoints.thread_ids == [str(command.session_id)]
    assert mcp.tokens == ["mcp-token"]
    assert "artifact_write" in {
        getattr(tool, "name", None) for tool in runner.tools
    }


@pytest.mark.parametrize(
    "operation",
    [AgentOperation.RESUME, AgentOperation.APPROVE, AgentOperation.ANSWER],
)
async def test_resume_operations_reuse_the_same_domain_ids(
    adapter_parts, operation: AgentOperation
) -> None:
    adapter, runner, checkpoints, _mcp = adapter_parts
    command = command_for(operation)

    events = [event async for event in adapter.execute(command)]

    assert runner.commands == [command]
    assert runner.configurable == {
        "thread_id": str(SESSION_ID),
        "run_id": str(RUN_ID),
    }
    assert checkpoints.thread_ids == [str(SESSION_ID)]
    assert all(event["run_id"] == str(RUN_ID) for event in events)


@pytest.mark.parametrize('operation', [AgentOperation.START, AgentOperation.APPROVE])
async def test_run_bound_tools_are_rebuilt_for_start_and_resume(operation):
    runner = FakeRunner()
    received = []
    scoped_tool = object()

    async def run_tools(command):
        received.append(command)
        return [scoped_tool]

    adapter = DeepAgentAdapter(
        runner=runner, mcp_provider=FakeMcpProvider(),
        artifact_service=FakeArtifactService(), checkpoint_store=FakeCheckpointStore(),
        run_tools=run_tools,
    )
    command = command_for(operation)
    _ = [event async for event in adapter.execute(command)]
    assert received == [command]
    assert scoped_tool in runner.tools
    assert 'artifact_write' in {getattr(tool, 'name', None) for tool in runner.tools}


class EventRunner(FakeRunner):
    def __init__(self, events):
        super().__init__()
        self.events = events
        self.closed = False

    async def execute(self, **kwargs):
        try:
            for event in self.events:
                yield event
        finally:
            self.closed = True


def adapter_for_runner(runner):
    return DeepAgentAdapter(
        runner=runner, mcp_provider=FakeMcpProvider(),
        artifact_service=FakeArtifactService(), checkpoint_store=FakeCheckpointStore(),
    )


async def test_token_backlog_is_coalesced_before_worker_persistence():
    source = [{"type": "thinking_delta", "content": "字"} for _ in range(21_000)]
    runner = EventRunner([*source, {"type": "run_completed"}])
    events = [event async for event in adapter_for_runner(runner).execute(command_for(AgentOperation.START))]

    assert len(events) < 100  # At least 99.5% fewer worker persistence cycles.
    assert ''.join(event.get('content', '') for event in events) == '字' * 21_000
    assert events[-1]['type'] == 'run_completed'
    assert all(event['run_id'] == str(RUN_ID) for event in events)
    assert source[0] == {"type": "thinking_delta", "content": "字"}


async def test_coalescing_preserves_each_parent_type_order_and_tool_boundaries():
    source = [
        {"type": "thinking_delta", "content": "a", "parent_tool_call_id": "A"},
        {"type": "thinking_delta", "content": "b", "parent_tool_call_id": "A"},
        {"type": "thinking_delta", "content": "c", "parent_tool_call_id": "B"},
        {"type": "agent_message_delta", "content": "d", "parent_tool_call_id": "B"},
        {"type": "tool_call_started", "tool_call_id": "T", "tool_name": "read_file"},
        {"type": "agent_message_delta", "content": "e"},
        {"type": "agent_message_delta", "content": "f"},
        {"type": "tool_call_finished", "tool_call_id": "T", "result": "ok"},
        {"type": "usage_report", "input_tokens": 42, "output_tokens": 7},
        {"type": "run_completed"},
    ]
    events = [event async for event in adapter_for_runner(EventRunner(source)).execute(command_for(AgentOperation.START))]
    first_tool = next(i for i, event in enumerate(events) if event['type'] == 'tool_call_started')
    before_tool = events[:first_tool]
    assert [(e['type'], e['content']) for e in before_tool if e.get('parent_tool_call_id') == 'A'] == [('thinking_delta', 'ab')]
    assert [(e['type'], e['content']) for e in before_tool if e.get('parent_tool_call_id') == 'B'] == [('thinking_delta', 'c'), ('agent_message_delta', 'd')]
    assert [{k: v for k, v in event.items() if k != 'run_id'} for event in events[first_tool:]] == [
        source[4], {"type": "agent_message_delta", "content": "ef"}, *source[7:],
    ]


async def test_buffered_text_flushes_while_model_is_idle_and_close_releases_source():
    release = asyncio.Event()

    class IdleRunner(EventRunner):
        async def execute(self, **kwargs):
            try:
                yield {"type": "agent_message_delta", "content": "visible"}
                await release.wait()
            finally:
                self.closed = True

    runner = IdleRunner([])
    events = adapter_for_runner(runner).execute(command_for(AgentOperation.START))
    try:
        event = await asyncio.wait_for(anext(events), 0.5)
        assert event['content'] == 'visible'
        assert not release.is_set()
    finally:
        await events.aclose()
    assert runner.closed


async def test_source_failure_flushes_preceding_text_before_propagating():
    class FailedRunner(EventRunner):
        async def execute(self, **kwargs):
            yield {"type": "agent_message_delta", "content": "before"}
            yield {"type": "agent_message_delta", "content": " failure"}
            raise RuntimeError("stream failed")

    events = adapter_for_runner(FailedRunner([])).execute(command_for(AgentOperation.START))
    assert (await anext(events))['content'] == 'before failure'
    with pytest.raises(RuntimeError, match="stream failed"):
        await anext(events)


async def test_cancelling_pending_read_awaits_the_producer_and_closes_source():
    started = asyncio.Event()
    source_tasks = []

    class WaitingRunner(EventRunner):
        async def execute(self, **kwargs):
            source_tasks.append(asyncio.current_task())
            try:
                started.set()
                await asyncio.Event().wait()
                yield {"type": "run_completed"}
            finally:
                self.closed = True

    runner = WaitingRunner([])
    events = adapter_for_runner(runner).execute(command_for(AgentOperation.START))
    reader = asyncio.create_task(anext(events))
    await asyncio.wait_for(started.wait(), 0.5)
    reader.cancel()
    with pytest.raises(asyncio.CancelledError):
        await reader
    assert runner.closed
    assert all(task.done() for task in source_tasks)


async def test_closing_stream_cancels_producer_blocked_on_bounded_queue():
    source_tasks = []

    class BurstRunner(EventRunner):
        async def execute(self, **kwargs):
            source_tasks.append(asyncio.current_task())
            try:
                yield {"type": "run_started"}
                while True:
                    yield {"type": "thinking_delta", "content": "x"}
            finally:
                self.closed = True

    runner = BurstRunner([])
    events = adapter_for_runner(runner).execute(command_for(AgentOperation.START))
    assert (await anext(events))['type'] == 'run_started'
    await asyncio.sleep(0)
    await events.aclose()
    assert runner.closed
    assert all(task.done() for task in source_tasks)


async def test_interleaved_real_length_parent_streams_coalesce_21000_events():
    # Observed live sequences 5310-5320 alternate Q3 reasoning and Q1 prose;
    # every fragment has content, so dropping empty events cannot fix this.
    reasoning_lengths = [1, 17, 21, 5, 1, 4]
    message_lengths = [3, 11, 3, 2, 1]
    source = []
    expected = {'Q3': [], 'Q1': []}
    for i in range(10_500):
        thinking = '思' * reasoning_lengths[i % len(reasoning_lengths)]
        message = '答' * message_lengths[i % len(message_lengths)]
        source.extend([
            {'type': 'thinking_delta', 'content': thinking, 'parent_tool_call_id': 'Q3'},
            {'type': 'agent_message_delta', 'content': message, 'parent_tool_call_id': 'Q1'},
        ])
        expected['Q3'].append(thinking)
        expected['Q1'].append(message)
    runner = EventRunner([*source, {'type': 'tool_call_finished', 'tool_call_id': 'Q1'}, {'type': 'run_completed'}])
    events = [event async for event in adapter_for_runner(runner).execute(command_for(AgentOperation.START))]

    assert len(events) < 100
    for parent, chunks in expected.items():
        assert ''.join(e.get('content', '') for e in events if e.get('parent_tool_call_id') == parent) == ''.join(chunks)
    assert {e['type'] for e in events if e.get('parent_tool_call_id') == 'Q3'} == {'thinking_delta'}
    assert {e['type'] for e in events if e.get('parent_tool_call_id') == 'Q1'} == {'agent_message_delta'}
    assert [e['type'] for e in events[-2:]] == ['tool_call_finished', 'run_completed']


async def test_interleaved_parents_flush_all_text_before_tool_and_lifecycle_events():
    source = [
        {'type': 'thinking_delta', 'content': 'a', 'parent_tool_call_id': 'A'},
        {'type': 'agent_message_delta', 'content': 'b', 'parent_tool_call_id': 'B'},
        {'type': 'thinking_delta', 'content': 'c', 'parent_tool_call_id': 'A'},
        {'type': 'agent_message_delta', 'content': 'd', 'parent_tool_call_id': 'B'},
        {'type': 'tool_call_started', 'tool_call_id': 'T'},
        {'type': 'agent_message_delta', 'content': 'e'},
        {'type': 'agent_message_delta', 'content': 'f', 'parent_tool_call_id': 'A'},
        {'type': 'agent_message_delta', 'content': 'g'},
        {'type': 'agent_message_delta', 'content': 'h', 'parent_tool_call_id': 'A'},
        {'type': 'usage_report', 'input_tokens': 1, 'output_tokens': 2},
        {'type': 'run_completed'},
    ]
    events = [event async for event in adapter_for_runner(EventRunner(source)).execute(command_for(AgentOperation.START))]
    assert [{k: v for k, v in e.items() if k != 'run_id'} for e in events] == [
        {'type': 'thinking_delta', 'content': 'ac', 'parent_tool_call_id': 'A'},
        {'type': 'agent_message_delta', 'content': 'bd', 'parent_tool_call_id': 'B'},
        source[4],
        {'type': 'agent_message_delta', 'content': 'eg'},
        {'type': 'agent_message_delta', 'content': 'fh', 'parent_tool_call_id': 'A'},
        *source[9:],
    ]


async def test_grading_prompt_keeps_scope_for_tool_factory_but_hides_machine_headers_from_model():
    from dataclasses import replace
    runner = FakeRunner()
    scoped = []
    class UnitTool:
        name = 'get_grading_unit'
    async def run_tools(command):
        scoped.append(command.prompt)
        return [UnitTool()]
    adapter = DeepAgentAdapter(runner=runner, mcp_provider=FakeMcpProvider(),
        artifact_service=FakeArtifactService(), checkpoint_store=FakeCheckpointStore(), run_tools=run_tools)
    prompt = 'batch_units: [{"id":"private-unit"}]\n請批改考卷。'
    command = replace(command_for(AgentOperation.START), prompt=prompt)
    _ = [event async for event in adapter.execute(command)]
    assert scoped == [prompt]
    assert runner.commands[0].prompt == '請批改考卷。'
    assert command.prompt == prompt


async def test_tool_grading_does_not_connect_mcp_or_offer_artifact_tools():
    class UnitTool:
        name = "get_grading_unit"
    class ForbiddenMcp:
        def connect(self, token):
            raise AssertionError("tool grading must not open MCP")
    async def scoped(command):
        return [UnitTool()]
    runner = FakeRunner()
    adapter = DeepAgentAdapter(runner=runner,mcp_provider=ForbiddenMcp(),
        artifact_service=FakeArtifactService(),checkpoint_store=FakeCheckpointStore(),run_tools=scoped)
    _ = [event async for event in adapter.execute(command_for(AgentOperation.START))]
    assert [tool.name for tool in runner.tools] == ["get_grading_unit"]


async def test_server_export_finishes_before_run_completed_without_model_tool():
    calls = []
    async def finalize(command):
        calls.append(command.run_id)
    adapter = DeepAgentAdapter(runner=FakeRunner(), mcp_provider=FakeMcpProvider(),
        artifact_service=FakeArtifactService(), checkpoint_store=FakeCheckpointStore(), finalize_run=finalize)
    async for event in adapter.execute(command_for(AgentOperation.START)):
        if event["type"] == "run_completed":
            assert calls == [RUN_ID]


async def test_export_failure_does_not_fail_completed_grading():
    async def finalize(command):
        raise OSError("object store unavailable")
    adapter = DeepAgentAdapter(runner=FakeRunner(), mcp_provider=FakeMcpProvider(),
        artifact_service=FakeArtifactService(), checkpoint_store=FakeCheckpointStore(), finalize_run=finalize)
    events = [event async for event in adapter.execute(command_for(AgentOperation.START))]
    assert events[-1]["type"] == "run_completed"
    assert "匯出失敗" in events[-2]["content"]


def exporting_adapter(events, calls, *, fail=False):
    async def finalize(command):
        calls.append(command.run_id)
        if fail:
            raise OSError("object store unavailable")
    return DeepAgentAdapter(runner=EventRunner(events), mcp_provider=FakeMcpProvider(),
        artifact_service=FakeArtifactService(), checkpoint_store=FakeCheckpointStore(), finalize_run=finalize)


@pytest.mark.parametrize("fail", [False, True], ids=["exported", "export-failed"])
async def test_failed_run_exports_before_its_terminal_event_and_keeps_failing(fail):
    calls = []
    adapter = exporting_adapter(
        [{"type": "run_failed", "error_code": "MODEL_CONNECTION_ERROR", "message": "lost"}], calls, fail=fail)
    events = []
    async for event in adapter.execute(command_for(AgentOperation.START)):
        if event["type"] == "run_failed":
            assert calls == [RUN_ID]
        events.append(event)
    assert events[-1]["type"] == "run_failed"
    assert events[-1]["error_code"] == "MODEL_CONNECTION_ERROR"
    assert any("匯出失敗" in event.get("content", "") for event in events) is fail


@pytest.mark.parametrize("fail", [False, True], ids=["exported", "export-failed"])
async def test_cancelled_run_exports_when_the_worker_closes_its_stream(fail):
    calls = []
    adapter = exporting_adapter([{"type": "tool_call_started", "tool_call_id": "t"},
                                 {"type": "tool_call_finished", "tool_call_id": "t"}], calls, fail=fail)
    stream = adapter.execute(command_for(AgentOperation.START))
    await stream.__anext__()
    # The worker appends run_cancelled itself, then closes the agent stream.
    await stream.aclose()
    assert calls == [RUN_ID]


async def test_terminal_export_runs_once_when_the_worker_closes_the_stream_afterwards():
    calls = []
    adapter = exporting_adapter([{"type": "run_completed"}], calls)
    stream = adapter.execute(command_for(AgentOperation.START))
    assert (await stream.__anext__())["type"] == "run_completed"
    await stream.aclose()
    assert calls == [RUN_ID]
