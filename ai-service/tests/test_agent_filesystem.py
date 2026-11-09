"""The agent backend keeps scratch files in state and mounted guidance read-only."""

from typing import Any
from unittest.mock import MagicMock

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, ToolMessage

from infrastructure.agent.deepagent_adapter import DeepAgentAdapter


class FilesystemModel(GenericFakeChatModel):
    def bind_tools(self, tools: Any, **kwargs: Any):
        return self


async def test_agent_can_read_its_scratch_file_but_cannot_overwrite_mounted_guidance():
    model = FilesystemModel(
        disable_streaming=True,
        messages=iter([
            AIMessage(content="", tool_calls=[{
                "name": "write_file", "id": "protected-write",
                "args": {"file_path": "/app/.deepagents/AGENTS.md", "content": "replaced"},
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "write_file", "id": "scratch-write",
                "args": {"file_path": "/scratch.txt", "content": "scratch survives the next tool call"},
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "read_file", "id": "scratch-read",
                "args": {"file_path": "/scratch.txt"},
            }]),
            AIMessage(content="Done."),
        ]),
    )
    adapter = DeepAgentAdapter(
        mcp_provider=MagicMock(), artifact_service=MagicMock(), checkpoint_store=MagicMock(),
        skills_paths=[], memory_paths=[],
    )
    agent = adapter._runner._build_agent(model=model, system_prompt=None, tools=[])

    result = await agent.ainvoke({"messages": [{"role": "user", "content": "Check file access."}]})

    tool_results = {
        message.tool_call_id: message
        for message in result["messages"] if isinstance(message, ToolMessage)
    }
    assert tool_results["protected-write"].status == "error"
    assert "denied" in str(tool_results["protected-write"].content).lower()
    assert tool_results["scratch-write"].status == "success"
    assert tool_results["scratch-read"].status == "success"
    assert "scratch survives the next tool call" in str(tool_results["scratch-read"].content)
    assert "/app/.deepagents/AGENTS.md" not in result["files"]
