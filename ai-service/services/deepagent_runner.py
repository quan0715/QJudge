"""DeepAgent runner — orchestrates LangGraph agent execution with streaming."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator

from deepagents import create_deep_agent
from deepagents.backends.utils import create_file_data
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

_ALLOWED_SKILL_FILE_EXTENSIONS = {".md", ".json", ".yaml", ".yml", ".txt"}
_MAX_SKILL_FILE_BYTES = 256 * 1024

# Default system prompt for the TA agent
_DEFAULT_SYSTEM_PROMPT = """你是 QJudge 的 AI 助教，對話對象是老師（出題者）。

回覆要求：
- 繁體中文，簡短直接，條列優先。
- 不用 emoji，不要客套開場。

工作原則：
- 內容設計階段優先使用 `contest-problem-authoring-guide`。
- 資料落地階段（MCP payload/action）優先使用 `qjudge-code-problem-format-and-ops`。
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
        skills_dir: str = "skills",
    ) -> None:
        self._checkpoint_db_url = checkpoint_db_url
        self._mcp_server_url = mcp_server_url
        self._checkpointer: AsyncPostgresSaver | None = None
        self._checkpointer_cm: Any = None  # context manager
        service_root = Path(__file__).resolve().parent.parent
        configured_skills_dir = Path(skills_dir)
        self._skills_root = (
            configured_skills_dir
            if configured_skills_dir.is_absolute()
            else (service_root / configured_skills_dir).resolve()
        )
        self._skills_source = "/skills/"
        self._skill_content_cache: dict[str, str] | None = None

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
        api_key: str | None,
        system_prompt: str | None,
        tools: list[Any],
    ):
        """Build a DeepAgent with tools and optional interrupt_on."""
        model = ModelFactory.create_model(model_id=model_id, api_key=api_key)
        prompt = system_prompt or _DEFAULT_SYSTEM_PROMPT

        agent = create_deep_agent(
            model=model,
            tools=tools,
            system_prompt=prompt,
            skills=[self._skills_source],
            checkpointer=self._checkpointer,
        )
        return agent

    def _load_skill_contents(self) -> dict[str, str]:
        """Load and cache text skill files from disk."""
        if self._skill_content_cache is not None:
            return self._skill_content_cache

        if not self._skills_root.exists() or not self._skills_root.is_dir():
            logger.warning("Skills directory not found: %s", self._skills_root)
            self._skill_content_cache = {}
            return {}

        contents: dict[str, str] = {}
        for path in self._skills_root.rglob("*"):
            if not path.is_file():
                continue

            if path.suffix.lower() not in _ALLOWED_SKILL_FILE_EXTENSIONS:
                continue

            try:
                if path.stat().st_size > _MAX_SKILL_FILE_BYTES:
                    logger.warning("Skipping oversized skill file: %s", path)
                    continue
            except OSError as exc:
                logger.warning("Skipping unreadable skill file %s: %s", path, exc)
                continue

            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                logger.warning("Skipping non-utf8 skill file: %s", path)
                continue
            except OSError as exc:
                logger.warning("Skipping unreadable skill file %s: %s", path, exc)
                continue

            relative = path.relative_to(self._skills_root).as_posix()
            virtual_path = f"{self._skills_source}{relative}"
            contents[virtual_path] = content

        self._skill_content_cache = contents
        return contents

    def _build_skill_state_files(self) -> dict[str, Any]:
        """Build `/skills/*` virtual files for DeepAgents SkillsMiddleware."""
        contents = self._load_skill_contents()
        return {
            virtual_path: create_file_data(content)
            for virtual_path, content in contents.items()
        }

    async def run_stream(
        self,
        thread_id: str | None,
        messages: list[dict[str, str]],
        model_id: str = "claude-sonnet",
        api_key: str | None = None,
        system_prompt: str | None = None,
        session_id: str | None = None,
        user_id: int | None = None,
        request_context: RequestContext | None = None,
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

        async with MCPToolProvider(
            server_url=self._mcp_server_url,
            authorization_header=(
                request_context.user_authorization if request_context else None
            ),
        ) as tool_provider:
            tools = await tool_provider.load_tools()
            agent = self._build_agent(model_id, api_key, system_prompt, tools)

            config = {
                "configurable": {
                    "thread_id": thread_id,
                },
                "metadata": {
                    "thread_id": thread_id,
                    "run_id": run_id,
                },
                "recursion_limit": 80,
            }

            agent_input = {"messages": messages}
            skill_files = self._build_skill_state_files()
            if skill_files:
                agent_input["files"] = skill_files

            # Emit run_started
            yield to_sse_dict(RunStarted(run_id=run_id, thread_id=thread_id))

            total_input_tokens = 0
            total_output_tokens = 0

            try:
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
                logger.exception("DeepAgent run failed: %s", exc)
                yield to_sse_dict(
                    RunFailed(
                        run_id=run_id,
                        error_code="AGENT_ERROR",
                        message="Agent execution failed",
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
        request_context: RequestContext | None = None,
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

        async with MCPToolProvider(
            server_url=self._mcp_server_url,
            authorization_header=(
                request_context.user_authorization if request_context else None
            ),
        ) as tool_provider:
            tools = await tool_provider.load_tools()
            agent = self._build_agent(model_id, api_key, system_prompt, tools)

            config = {
                "configurable": {
                    "thread_id": thread_id,
                },
                "metadata": {
                    "thread_id": thread_id,
                    "run_id": run_id,
                },
                "recursion_limit": 80,
            }

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
                        message="Agent execution failed",
                    )
                )

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
