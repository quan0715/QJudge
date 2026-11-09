"""Compaction keeps complete tool-call groups with the pinned agent stack."""

import asyncio

import pytest
from deepagents.backends.filesystem import FilesystemBackend
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from infrastructure.agent import deepagent_adapter as module


@pytest.mark.parametrize("keep", [("messages", 2), ("tokens", 2), ("fraction", 0.2)])
@pytest.mark.parametrize("configured", [False, True], ids=["native", "qjudge"])
async def test_compaction_retains_tool_requests_with_both_results(tmp_path, keep, configured):
    history = [
        HumanMessage("Old question"), AIMessage("Old answer"), HumanMessage("Look up both"),
        AIMessage(content="", tool_calls=[
            {"name": "lookup", "args": {"id": 1}, "id": "first"},
            {"name": "lookup", "args": {"id": 2}, "id": "second"},
        ]),
        ToolMessage("First result", tool_call_id="first"),
        ToolMessage("Second result", tool_call_id="second"),
        AIMessage("Both results received"),
    ]
    model = GenericFakeChatModel(messages=iter([]), profile={"max_input_tokens": 10})
    events = asyncio.Queue()
    middleware_type = module._SafeSummarizationMiddleware if configured else module.SummarizationMiddleware
    middleware = middleware_type(
        model=model,
        backend=FilesystemBackend(root_dir=tmp_path, virtual_mode=True),
        trigger=("messages", 4), keep=keep,
        token_counter=lambda messages: len(messages),
        summarizer=lambda messages: "Summary of the old conversation",
        **({"event_queue": events} if configured else {}),
    )
    requests = []

    async def handle(request):
        requests.append(request)
        return ModelResponse(result=[AIMessage("Complete")])

    await middleware.awrap_model_call(
        ModelRequest(model=model, messages=history, state={"messages": history}, tools=[]),
        handle,
    )

    assert len(requests) == 1
    compacted = requests[0].messages
    assert "Summary of the old conversation" in compacted[0].content
    assert [call["id"] for call in compacted[1].tool_calls] == ["first", "second"]
    assert [message.tool_call_id for message in compacted if isinstance(message, ToolMessage)] == ["first", "second"]
    assert compacted[-1].content == "Both results received"
    if configured:
        assert [events.get_nowait()["type"] for _ in range(events.qsize())] == [
            "summarization_started", "summarization_ended",
        ]
