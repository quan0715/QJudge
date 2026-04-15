"""DeepAgent runner — orchestrates LangGraph agent execution with streaming."""

from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Any, AsyncGenerator

from deepagents.graph import create_agent, TodoListMiddleware
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command

from services.event_adapter import (
    RunCompleted,
    RunFailed,
    RunStarted,
    UsageReport,
    adapt_langgraph_event,
    to_sse_dict,
)
from models.schemas import RequestContext
from services.mcp_tool_provider import MCPToolProvider
from services.model_factory import ModelFactory

logger = logging.getLogger(__name__)

# Default system prompt for the TA agent
_DEFAULT_SYSTEM_PROMPT = """你是 QJudge 的 AI 助教，對話對象是老師（出題者）。

回覆要求：
- 繁體中文，簡短直接，條列優先。
- 不用 emoji，不要客套開場。

工作原則：
- 題目資料先讀取再回答，不要臆測。
- 若工具本身會直接寫入，先明確告知將執行的變更內容，再呼叫工具。

可用工具：
- qjudge_discover：查教室、競賽、題庫與題庫題。
- qjudge_exam：管理試題型題目。
- qjudge_grading：查看與批改作答。
- qjudge_coding：管理程式題、匯入題庫題、調整分數、test run。
- 所有寫入都直接走 MCP tool；先讀現況再修改，不要臆測。

測資生成工作流（當用戶要求生成或驗證測資時遵循）：
1. qjudge_coding(action="get") 讀題目描述與限制。
2. 視需要讀取題目細節中的 sample cases，或基於既有內容整理測資需求。
3. 撰寫 reference solution（使用題目指定語言或 Python）。
4. 設計測資集：sample cases（基本範例）+ hidden cases（邊界、壓力測試）。
5. **必須**使用 qjudge_coding(action="test_run") 實際執行 reference solution 驗證。絕對不可跳過此步驟或自行手推 expected output。
6. 若 MCP 目前不支援直接更新測資，必須明確告知限制，不要假裝已寫入。
"""


class DeepAgentRunner:
    """Manages DeepAgent lifecycle, checkpointing, and event streaming."""

    def __init__(
        self,
        checkpoint_db_url: str,
        mcp_server_url: str,
    ) -> None:
        self._checkpoint_db_url = checkpoint_db_url
        self._mcp_server_url = mcp_server_url
        self._checkpointer: AsyncPostgresSaver | None = None
        self._checkpointer_cm: Any = None  # context manager

    async def setup(self) -> None:
        """Initialize the Postgres checkpointer and create tables if needed."""
        self._checkpointer_cm = AsyncPostgresSaver.from_conn_string(
            self._checkpoint_db_url,
        )
        self._checkpointer = await self._checkpointer_cm.__aenter__()
        await self._checkpointer.setup()
        logger.info("DeepAgent checkpointer initialized and tables ensured.")

    async def shutdown(self) -> None:
        """Clean up resources."""
        if self._checkpointer_cm:
            await self._checkpointer_cm.__aexit__(None, None, None)
        logger.info("DeepAgent runner shut down.")

    def _build_agent(
        self,
        model_id: str,
        system_prompt: str | None,
        tools: list[Any],
    ):
        """Build a DeepAgent with tools."""
        model = ModelFactory.create_model(model_id=model_id)
        prompt = system_prompt or _DEFAULT_SYSTEM_PROMPT

        agent = create_agent(
            model=model,
            tools=tools,
            system_prompt=prompt,
            middleware=[TodoListMiddleware()],
            checkpointer=self._checkpointer,
        )
        return agent

    # ------------------------------------------------------------------
    # Shared streaming loop
    # ------------------------------------------------------------------

    @staticmethod
    async def _repair_dangling_tool_calls(agent: Any, config: dict[str, Any]) -> bool:
        """Fix checkpoint with tool_calls that lack tool responses.

        Returns True if a repair was made, False otherwise.
        """
        from langchain_core.messages import ToolMessage

        try:
            state = await agent.aget_state(config)
            messages = state.values.get("messages", [])
            if not messages:
                return False

            # Find the last AI message with tool_calls
            last_ai = None
            for msg in reversed(messages):
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    last_ai = msg
                    break

            if last_ai is None:
                return False

            # Collect tool_call_ids that already have responses
            existing_responses = {
                msg.tool_call_id
                for msg in messages
                if isinstance(msg, ToolMessage) and hasattr(msg, "tool_call_id")
            }

            # Find dangling tool_calls (no matching response)
            missing = [
                tc for tc in last_ai.tool_calls
                if tc.get("id") and tc["id"] not in existing_responses
            ]

            if not missing:
                return False

            # Inject synthetic error responses for each missing tool_call
            repair_messages = [
                ToolMessage(
                    content=f"[Tool call failed: previous session error. Please retry.]",
                    tool_call_id=tc["id"],
                    name=tc.get("name", "unknown"),
                )
                for tc in missing
            ]

            logger.warning(
                "Repairing checkpoint: injecting %d missing tool responses for thread %s",
                len(repair_messages),
                config.get("configurable", {}).get("thread_id", "?"),
            )

            await agent.aupdate_state(config, {"messages": repair_messages})
            return True

        except Exception as repair_exc:
            logger.warning("Checkpoint repair failed: %s", repair_exc)
            return False

    async def _stream_events(
        self,
        agent: Any,
        agent_input: dict[str, Any] | Command,
        config: dict[str, Any],
        run_id: str,
        thread_id: str,
        model_id: str,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stream agent execution events as SSE-serialisable dicts.

        If the LLM rejects the checkpoint due to dangling tool_calls,
        automatically repairs the state and retries once.
        """
        yield to_sse_dict(RunStarted(run_id=run_id, thread_id=thread_id))

        total_input_tokens = 0
        total_output_tokens = 0
        retried = False

        async def _run_stream():
            nonlocal total_input_tokens, total_output_tokens
            async for event in agent.astream_events(
                agent_input,
                config=config,
                version="v2",
            ):
                if event.get("event") == "on_chat_model_end":
                    usage_meta = event.get("data", {}).get("output", None)
                    if usage_meta and hasattr(usage_meta, "usage_metadata"):
                        um = usage_meta.usage_metadata
                        total_input_tokens += um.get("input_tokens", 0)
                        total_output_tokens += um.get("output_tokens", 0)

                internal_events = adapt_langgraph_event(event)
                if internal_events is None:
                    continue
                for internal_event in internal_events:
                    yield to_sse_dict(internal_event)

        try:
            try:
                async for sse_dict in _run_stream():
                    yield sse_dict
            except Exception as exc:
                # Detect dangling tool_calls error → repair and retry once
                if not retried and "insufficient tool messages" in str(exc):
                    logger.warning("Dangling tool_calls detected, attempting repair...")
                    repaired = await self._repair_dangling_tool_calls(agent, config)
                    if repaired:
                        retried = True
                        async for sse_dict in _run_stream():
                            yield sse_dict
                    else:
                        raise
                else:
                    raise

            cost_cents = self._calculate_cost(
                model_id, total_input_tokens, total_output_tokens
            )
            yield to_sse_dict(
                UsageReport(
                    input_tokens=total_input_tokens,
                    output_tokens=total_output_tokens,
                    cost_cents=cost_cents,
                    model_used=model_id,
                )
            )
            yield to_sse_dict(RunCompleted(run_id=run_id))

        except Exception as exc:
            logger.exception("DeepAgent execution failed: %s", exc)
            yield to_sse_dict(
                RunFailed(
                    run_id=run_id,
                    error_code="AGENT_ERROR",
                    message="Agent execution failed",
                )
            )

    # ------------------------------------------------------------------
    # Public streaming API
    # ------------------------------------------------------------------

    async def run_stream(
        self,
        thread_id: str | None,
        messages: list[dict[str, str]],
        model_id: str = "deepseek-r1",
        system_prompt: str | None = None,
        request_context: RequestContext | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run the agent and stream SSE events."""
        run_id = uuid.uuid4().hex
        if thread_id is None:
            thread_id = uuid.uuid4().hex

        async with MCPToolProvider(
            server_url=self._mcp_server_url,
            authorization_header=(
                request_context.user_authorization if request_context else None
            ),
        ) as tool_provider:
            tools = await tool_provider.load_tools()
            agent = self._build_agent(model_id, system_prompt, tools)

            config = {
                "configurable": {"thread_id": thread_id},
                "metadata": {"thread_id": thread_id, "run_id": run_id},
                "recursion_limit": 30,
            }

            agent_input: dict[str, Any] = {"messages": messages}

            async for sse_dict in self._stream_events(
                agent, agent_input, config, run_id, thread_id, model_id
            ):
                yield sse_dict

    async def resume_stream(
        self,
        thread_id: str,
        decision: str,
        model_id: str = "deepseek-r1",
        system_prompt: str | None = None,
        request_context: RequestContext | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Resume an interrupted agent with a user decision and stream events."""
        run_id = uuid.uuid4().hex

        async with MCPToolProvider(
            server_url=self._mcp_server_url,
            authorization_header=(
                request_context.user_authorization if request_context else None
            ),
        ) as tool_provider:
            tools = await tool_provider.load_tools()
            agent = self._build_agent(model_id, system_prompt, tools)

            config = {
                "configurable": {"thread_id": thread_id},
                "metadata": {"thread_id": thread_id, "run_id": run_id},
                "recursion_limit": 30,
            }

            resume_value = Command(resume={"decisions": [{"type": decision}]})

            async for sse_dict in self._stream_events(
                agent, resume_value, config, run_id, thread_id, model_id
            ):
                yield sse_dict

    @staticmethod
    def _calculate_cost(
        model_id: str,
        input_tokens: int,
        output_tokens: int,
    ) -> int:
        """Calculate cost in cents based on model pricing."""
        from services.model_factory import PRICING, _DEFAULT_MODEL_ID

        rates = PRICING.get(model_id, PRICING[_DEFAULT_MODEL_ID])
        cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
        return round(cost)
