"""Responses tool history must remain usable after switching providers."""

import copy

import pytest
from langchain_core.messages import AIMessage, ChatMessage, HumanMessage, SystemMessage, ToolMessage

from domain.model_catalog import EndpointSpec, ModelSpec
from infrastructure.agent.provider_adapters import build_chat_model


@pytest.mark.parametrize("provider,effort", [
    ("openai_compatible", None), ("openai", None),
    ("deepseek", None), ("deepseek", "high"),
])
@pytest.mark.parametrize("has_tool_calls", [False, True])
@pytest.mark.parametrize("has_text", [False, True])
def test_responses_history_becomes_chat_completions_without_mutation(provider, effort, has_tool_calls, has_text):
    call = {"name": "lookup", "args": {"value": 7}, "id": "call_1", "type": "tool_call"}
    assistant = AIMessage(
        content=[
            {"type": "reasoning", "id": "rs_1", "summary": []},
            *([{"type": "text", "text": "Checking", "annotations": []}] if has_text else []),
            {"type": "function_call", "id": "fc_1", "call_id": "call_1",
             "name": "lookup", "arguments": '{"value":7}'},
        ],
        tool_calls=[call] if has_tool_calls else [],
        additional_kwargs={"reasoning_content": "prior reasoning"},
    )
    history = [HumanMessage("Check 7"), assistant, ToolMessage("7", tool_call_id="call_1")]
    original = copy.deepcopy(history)
    endpoint = EndpointSpec("test", provider, "http://example.test/v1", "TEST_API_KEY")
    spec = ModelSpec("test", "test", "test-model", "Test", "", effort, 1000)
    model = build_chat_model(endpoint, spec, "test-key")

    messages = model._get_request_payload(history)["messages"]

    if has_text:
        expected_content = "Checking" if provider == "deepseek" else [{"type": "text", "text": "Checking"}]
        assert messages[1]["content"] == expected_content
    else:
        assert not messages[1]["content"]
    assert len(messages[1]["tool_calls"]) == 1
    assert messages[1]["tool_calls"][0]["id"] == "call_1"
    assert messages[1]["tool_calls"][0]["function"]["name"] == "lookup"
    assert messages[2]["tool_call_id"] == "call_1"
    if provider == "deepseek" and effort:
        assert messages[1]["reasoning_content"] == "prior reasoning"
    assert history == original


def test_openai_responses_retains_native_tool_history():
    endpoint = EndpointSpec("openai", "openai", None, "OPENAI_API_KEY")
    spec = ModelSpec("luna", "openai", "gpt-6-luna", "Luna", "", "medium", 272000)
    model = build_chat_model(endpoint, spec, "test-key")
    assistant = AIMessage(content=[
        {"type": "function_call", "id": "fc_1", "call_id": "call_1",
         "name": "lookup", "arguments": '{}'},
    ])
    payload = model._get_request_payload([
        HumanMessage("Check"), assistant, ToolMessage("OK", tool_call_id="call_1"),
    ])
    assert "messages" not in payload
    assert any(item.get("type") == "function_call" for item in payload["input"])


@pytest.mark.parametrize("provider,effort", [
    ("openai_compatible", None), ("openai", None), ("openai", "medium"),
    ("deepseek", None), ("deepseek", "high"),
])
@pytest.mark.parametrize("block_content", [False, True])
def test_application_instructions_reach_every_provider_as_one_user_prompt(provider, effort, block_content):
    instructions = [
        {"type": "text", "text": "Follow the grading SOP."},
        {"type": "text", "text": "Apply the core principles."},
    ]
    system = SystemMessage(content=instructions if block_content else "Follow the grading SOP.")
    human = HumanMessage(content=[
        {"type": "text", "text": "Grade unit_1."},
        {"type": "image_url", "image_url": {"url": "https://example.test/answer.png"}},
    ] if block_content else "Grade unit_1.")
    history = [
        system, ChatMessage(role="developer", content="Use independent subagents."), human,
        AIMessage(content="", tool_calls=[{
            "name": "lookup", "args": {}, "id": "call_1", "type": "tool_call",
        }]),
        ToolMessage("Synthetic result", tool_call_id="call_1"),
    ]
    original = copy.deepcopy(history)
    endpoint = EndpointSpec("test", provider, "http://example.test/v1", "TEST_API_KEY")
    spec = ModelSpec("test", "test", "test-model", "Test", "", effort, 1000)
    model = build_chat_model(endpoint, spec, "test-key")

    payload = model._get_request_payload(history)
    wire = payload.get("messages", payload.get("input"))
    assert not any(message.get("role") in {"system", "developer"} for message in wire)
    assert wire[0]["role"] == "user"
    content = wire[0]["content"]
    text = content if isinstance(content, str) else "\n".join(
        block.get("text", "") for block in content
    )
    assert text.count("Follow the grading SOP.") == 1
    assert text.count("Use independent subagents.") == 1
    assert text.count("Grade unit_1.") == 1
    if block_content:
        assert "https://example.test/answer.png" in str(content)
    assert len(wire) == 3
    if block_content:
        assert "Follow the grading SOP.\n\nApply the core principles." in text
    if provider == "openai" and effort:
        assert wire[1]["type"] == "function_call"
        assert wire[2]["type"] == "function_call_output"
        assert wire[1]["call_id"] == wire[2]["call_id"] == "call_1"
    else:
        assert wire[1]["tool_calls"][0]["id"] == wire[2]["tool_call_id"] == "call_1"
    assert history == original
    assert model._get_request_payload(history) == payload
