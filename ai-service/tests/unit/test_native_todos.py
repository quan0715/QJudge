"""The production agent must expose and execute native todo updates."""
import asyncio
import unittest
from unittest.mock import MagicMock

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from infrastructure.agent.deepagent_adapter import DeepAgentAdapter


class ToolModel(GenericFakeChatModel):
    def bind_tools(self, tools, **kwargs):
        assert "write_todos" in {tool.name for tool in tools}
        return self


class NativeTodoTest(unittest.TestCase):
    def test_native_todos_can_be_created_and_completed(self):
        pending = [{"content": "檢查題目", "status": "in_progress"}]
        completed = [{"content": "檢查題目", "status": "completed"}]
        model = ToolModel(disable_streaming=True, messages=iter([
            AIMessage(content="", tool_calls=[{"name": "write_todos", "args": {"todos": pending}, "id": "todo1"}]),
            AIMessage(content="", tool_calls=[{"name": "write_todos", "args": {"todos": completed}, "id": "todo2"}]),
            AIMessage(content="完成"),
        ]))
        adapter = DeepAgentAdapter(mcp_provider=MagicMock(), artifact_service=MagicMock(), checkpoint_store=MagicMock())
        runner = adapter._runner
        runner._checkpointer = None
        agent = runner._build_agent(model=model, system_prompt=None, tools=[])
        result = asyncio.run(agent.ainvoke({"messages": [{"role": "user", "content": "建立原生待辦並更新完成狀態"}]}))
        self.assertEqual(result["todos"], completed)
        tool_messages = [m for m in result["messages"] if m.type == "tool"]
        self.assertEqual(len(tool_messages), 2)
        self.assertTrue(all(m.status == "success" for m in tool_messages))

if __name__ == "__main__":
    unittest.main()
