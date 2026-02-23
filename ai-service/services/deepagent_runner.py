"""DeepAgent runner — orchestrates LangGraph agent execution with streaming."""

from __future__ import annotations

import logging
import uuid
from typing import Any, AsyncGenerator

from deepagents import create_deep_agent
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command

from services.event_adapter import (
    AgentMessageDelta,
    ApprovalRequired,
    RunCompleted,
    RunFailed,
    RunStarted,
    ThinkingDelta,
    UsageReport,
    adapt_langgraph_event,
    to_sse_dict,
)
from services.model_factory import ModelFactory
from services.tool_client import InternalToolClient
from services.tool_registry import create_read_tools, create_write_tools

logger = logging.getLogger(__name__)

# Default system prompt for the TA agent
_DEFAULT_SYSTEM_PROMPT = """你是 QJudge 的 AI 助教。你的對話對象是老師（出題者）。

回覆風格：
- 繁體中文，口語化，簡短直接。像同事對話，不要寫成文章。
- 不要用 emoji。不要用「您好」「很高興」之類的客套話。
- 回答盡量精簡。能一句講完就不要分三段。
- 用條列式而非長篇敘述。Markdown 格式可用但不要過度裝飾。

你能做的事：
- 用 load_problem_context 讀取題目資料（描述、測資、限制等）。
- 協助分析題目、建議改進、設計測資、檢查完整性。
- 回答程式設計教學相關問題。
- 用 prepare_problem_create 建立新題目（草稿）。
- 用 prepare_problem_patch 修改現有題目。
- 用 commit_problem_action 提交變更（需要用戶審核確認）。

寫入流程：
1. 先用 prepare_problem_create 或 prepare_problem_patch 準備變更，取得 action_id 和 preview。
2. 在回覆中向用戶展示 preview，說明你打算做什麼。
3. 呼叫 commit_problem_action(action_id) 提交。系統會自動暫停並請用戶確認。
4. 用戶確認後系統會自動執行 commit，你不需要再做任何事。
5. 如果用戶拒絕，commit 會被跳過，你只需回覆確認取消即可。

多語言翻譯：
題目支援多語言（zh-TW、en 等）。資料結構中有 translations 陣列，每筆包含 language, title, description, input_description, output_description, hint。

建立題目時，在 payload 中用 translations 陣列提供多語言：
  {"title": "...", "translations": [
    {"language": "zh-TW", "title": "...", "description": "...", ...},
    {"language": "en", "title": "...", "description": "...", ...}
  ]}

修改題目時，JSON Patch 路徑支援：
  - /translations/0/description — 修改第一個翻譯的描述
  - /translations/1/description — 修改第二個翻譯的描述
  - /translations/- — 新增一個語言翻譯（op: "add"）
    例如: {"op": "add", "path": "/translations/-", "value": {"language": "en", "title": "...", ...}}

如果用戶要求翻譯題目，先用 load_problem_context 讀取現有翻譯，再用 prepare_problem_patch 新增或更新目標語言。

限制：
- 不要編造題目資料，先用工具讀取再回答。
- 所有寫入操作都需要用戶確認才會執行。
"""


class DeepAgentRunner:
    """Manages DeepAgent lifecycle, checkpointing, and event streaming."""

    def __init__(
        self,
        tool_client: InternalToolClient,
        checkpoint_db_url: str,
    ) -> None:
        self._tool_client = tool_client
        self._checkpoint_db_url = checkpoint_db_url
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
        if self._tool_client:
            await self._tool_client.close()
        logger.info("DeepAgent runner shut down.")

    def _build_agent(
        self,
        model_id: str,
        api_key: str | None,
        system_prompt: str | None,
        session_id: str | None,
        user_id: int | None,
    ):
        """Build a DeepAgent with tools and optional interrupt_on."""
        model = ModelFactory.create_model(model_id=model_id, api_key=api_key)
        prompt = system_prompt or _DEFAULT_SYSTEM_PROMPT

        # Always include read tools
        tools = create_read_tools(self._tool_client)

        # Include write tools only if session_id and user_id are provided
        interrupt_on = None
        if session_id and user_id:
            write_tools = create_write_tools(self._tool_client, session_id, user_id)
            tools = tools + write_tools
            interrupt_on = {"commit_problem_action": True}

        agent = create_deep_agent(
            model=model,
            tools=tools,
            system_prompt=prompt,
            checkpointer=self._checkpointer,
            interrupt_on=interrupt_on,
        )
        return agent

    async def run_stream(
        self,
        thread_id: str | None,
        messages: list[dict[str, str]],
        model_id: str = "claude-sonnet",
        api_key: str | None = None,
        system_prompt: str | None = None,
        session_id: str | None = None,
        user_id: int | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Run the agent and stream SSE events.

        Args:
            thread_id: Existing thread ID to resume, or None for new thread.
            messages: List of {"role": ..., "content": ...} messages.
            model_id: Canonical model ID (claude-haiku/sonnet/opus).
            api_key: Optional API key override (not persisted).
            system_prompt: Optional system prompt override.
            session_id: Backend session ID (for write tool binding).
            user_id: Backend user ID (for write tool binding).

        Yields:
            SSE-serialisable dicts matching the v2 event contract.
        """
        run_id = uuid.uuid4().hex
        if thread_id is None:
            thread_id = uuid.uuid4().hex

        agent = self._build_agent(model_id, api_key, system_prompt, session_id, user_id)

        config = {
            "configurable": {
                "thread_id": thread_id,
            },
            "metadata": {
                "thread_id": thread_id,
                "run_id": run_id,
            },
        }

        agent_input = {"messages": messages}

        # Emit run_started
        yield to_sse_dict(RunStarted(run_id=run_id, thread_id=thread_id))

        # Stream events
        total_input_tokens = 0
        total_output_tokens = 0

        try:
            async for event in agent.astream_events(
                agent_input,
                config=config,
                version="v2",
            ):
                # Track token usage from metadata
                if event.get("event") == "on_chat_model_end":
                    usage_meta = event.get("data", {}).get("output", None)
                    if usage_meta and hasattr(usage_meta, "usage_metadata"):
                        um = usage_meta.usage_metadata
                        total_input_tokens += um.get("input_tokens", 0)
                        total_output_tokens += um.get("output_tokens", 0)

                # Adapt event through Layer 1
                internal_event = adapt_langgraph_event(event)
                if internal_event is None:
                    continue

                yield to_sse_dict(internal_event)

            # After streaming, check for pending interrupt
            async for ev in self._check_interrupt(agent, config):
                yield ev

            # Emit usage report
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

            # Emit run_completed
            yield to_sse_dict(RunCompleted(run_id=run_id))

        except Exception as exc:
            logger.exception("DeepAgent run failed: %s", exc)
            yield to_sse_dict(
                RunFailed(
                    run_id=run_id,
                    error_code="AGENT_ERROR",
                    message=str(exc),
                )
            )

    async def resume_stream(
        self,
        thread_id: str,
        decision: str,
        model_id: str = "claude-sonnet",
        api_key: str | None = None,
        system_prompt: str | None = None,
        session_id: str | None = None,
        user_id: int | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Resume an interrupted agent with a user decision and stream events.

        Args:
            thread_id: The thread ID of the interrupted agent.
            decision: "approve" or "reject".
            model_id: Canonical model ID.
            api_key: Optional API key override.
            system_prompt: Optional system prompt override.
            session_id: Backend session ID (for write tool binding).
            user_id: Backend user ID (for write tool binding).

        Yields:
            SSE-serialisable dicts.
        """
        run_id = uuid.uuid4().hex

        agent = self._build_agent(model_id, api_key, system_prompt, session_id, user_id)

        config = {
            "configurable": {
                "thread_id": thread_id,
            },
            "metadata": {
                "thread_id": thread_id,
                "run_id": run_id,
            },
        }

        # Build resume command — deepagents interrupt_on expects:
        # {"decisions": [{"type": "approve"|"reject"}]}
        resume_value = Command(resume={"decisions": [{"type": decision}]})

        yield to_sse_dict(RunStarted(run_id=run_id, thread_id=thread_id))

        total_input_tokens = 0
        total_output_tokens = 0

        try:
            async for event in agent.astream_events(
                resume_value,
                config=config,
                version="v2",
            ):
                if event.get("event") == "on_chat_model_end":
                    usage_meta = event.get("data", {}).get("output", None)
                    if usage_meta and hasattr(usage_meta, "usage_metadata"):
                        um = usage_meta.usage_metadata
                        total_input_tokens += um.get("input_tokens", 0)
                        total_output_tokens += um.get("output_tokens", 0)

                internal_event = adapt_langgraph_event(event)
                if internal_event is None:
                    continue

                yield to_sse_dict(internal_event)

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
            logger.exception("DeepAgent resume failed: %s", exc)
            yield to_sse_dict(
                RunFailed(
                    run_id=run_id,
                    error_code="AGENT_ERROR",
                    message=str(exc),
                )
            )

    async def _check_interrupt(
        self,
        agent,
        config: dict[str, Any],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Check if the agent has a pending interrupt and emit ApprovalRequired.

        deepagents interrupt_on produces an interrupt value shaped like:
        {
            "action_requests": [
                {"name": "commit_problem_action", "args": {"action_id": "..."}, ...}
            ],
            "review_configs": [...]
        }
        """
        try:
            state = await agent.aget_state(config)
            if not state.interrupts:
                return

            for intr in state.interrupts:
                intr_value = intr.value if hasattr(intr, "value") else {}
                if not isinstance(intr_value, dict):
                    logger.warning("Unexpected interrupt value type: %s", type(intr_value))
                    continue

                # Extract action_id from deepagents' action_requests format
                action_id = None
                action_requests = intr_value.get("action_requests", [])
                for req in action_requests:
                    if isinstance(req, dict) and req.get("name") == "commit_problem_action":
                        args = req.get("args", {})
                        action_id = args.get("action_id")
                        break

                if action_id:
                    # Fetch pending action details for preview
                    try:
                        action_detail = await self._tool_client.get_pending_action(action_id)
                        preview = action_detail.get("preview", {})
                        action_type = action_detail.get("action_type", "unknown")
                    except Exception:
                        logger.warning("Could not fetch pending action %s", action_id)
                        preview = {}
                        action_type = "unknown"

                    yield to_sse_dict(
                        ApprovalRequired(
                            action_id=action_id,
                            action_type=action_type,
                            preview=preview,
                        )
                    )
                else:
                    logger.warning("Interrupt detected but no action_id found: %s", intr_value)

        except Exception as exc:
            logger.warning("Failed to check interrupt state: %s", exc)

    @staticmethod
    def _calculate_cost(
        model_id: str,
        input_tokens: int,
        output_tokens: int,
    ) -> int:
        """Calculate cost in cents based on model pricing."""
        pricing = {
            "claude-haiku": {"input": 100, "output": 500},
            "claude-sonnet": {"input": 300, "output": 1500},
            "claude-opus": {"input": 500, "output": 2500},
        }
        rates = pricing.get(model_id, pricing["claude-sonnet"])
        cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
        return round(cost)
