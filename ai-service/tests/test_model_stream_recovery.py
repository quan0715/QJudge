"""A broken model stream must not replay completed grading tools."""

from typing import Any

import httpx
import pytest
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessageChunk, ToolMessage
from langchain_core.outputs import ChatGenerationChunk
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import PrivateAttr

from infrastructure.agent.deepagent_adapter import DeepAgentAdapter


class BrokenStreamModel(BaseChatModel):
    failures: int = 1
    failure_type: type[Exception] = httpx.ReadError
    _attempts: int = PrivateAttr(default=0)

    @property
    def _llm_type(self) -> str:
        return "broken-stream-test"

    def bind_tools(self, tools: Any, **kwargs: Any):
        return self

    def _generate(self, *args: Any, **kwargs: Any):
        raise NotImplementedError("This test exercises async streaming only")

    async def _astream(self, messages, **kwargs):
        last = messages[-1]
        if isinstance(last, ToolMessage):
            if last.name == "save_grading_draft":
                self._attempts += 1
                if self._attempts <= self.failures:
                    # The failed response contains incomplete tool arguments.
                    yield ChatGenerationChunk(message=AIMessageChunk(
                        content="", tool_call_chunks=[{
                            "name": "save_grading_draft", "args": '{"score":',
                            "id": "incomplete-write", "index": 0,
                        }],
                    ))
                    raise self.failure_type("incomplete chunked read")
            yield ChatGenerationChunk(message=AIMessageChunk(content="Complete"))
            return
        if last.content == "delegate grading":
            name, args = "task", {
                "description": "grade answers", "subagent_type": "general-purpose",
            }
        else:
            name, args = "save_grading_draft", {"score": 2}
        yield ChatGenerationChunk(message=AIMessageChunk(
            content="", tool_calls=[{"name": name, "args": args, "id": "grade-call"}],
        ))


async def run_grading(model, *, delegated=False):
    saved = []

    @tool
    def save_grading_draft(score: int) -> str:
        """Persist a grade in the test's in-memory answer store."""
        saved.append(score)
        return "Saved"

    adapter = DeepAgentAdapter(
        mcp_provider=object(), artifact_service=object(), checkpoint_store=object(),
        skills_paths=[], memory_paths=[],
    )
    runtime = adapter._runner
    runtime._checkpointer = InMemorySaver()
    agent = runtime._build_agent(model=model, system_prompt=None, tools=[save_grading_draft])
    events = [event async for event in runtime._stream_events(
        agent=agent,
        agent_input={"messages": [{
            "role": "user", "content": "delegate grading" if delegated else "grade answers",
        }]},
        config={"configurable": {"thread_id": "stream-recovery"}},
        run_id="run-1", thread_id="stream-recovery", model_id="test-model",
    )]
    return saved, events


@pytest.mark.parametrize("delegated", [False, True], ids=["main", "subagent"])
@pytest.mark.parametrize("failure_type", [httpx.ReadError, httpx.RemoteProtocolError])
async def test_model_stream_recovers_without_replaying_saved_grades(delegated, failure_type):
    model = BrokenStreamModel(failure_type=failure_type)

    saved, events = await run_grading(model, delegated=delegated)

    assert events[-1]["type"] == "run_completed"
    assert saved == [2]
    assert model._attempts == 2


@pytest.mark.parametrize("delegated", [False, True], ids=["main", "subagent"])
async def test_persistent_stream_failure_stops_after_two_retries_with_saved_grades_intact(delegated):
    model = BrokenStreamModel(failures=10)

    saved, events = await run_grading(model, delegated=delegated)

    assert model._attempts == 3
    assert saved == [2]
    assert events[-1]["type"] == "run_failed"
    assert events[-1]["error_code"] == "MODEL_CONNECTION_ERROR"
    assert "已完成的操作已保留" in events[-1]["message"]


async def test_non_connection_error_is_not_retried():
    model = BrokenStreamModel(failure_type=ValueError)

    saved, events = await run_grading(model)

    assert model._attempts == 1
    assert saved == [2]
    assert events[-1]["type"] == "run_failed"
    assert events[-1]["error_code"] == "AGENT_ERROR"
