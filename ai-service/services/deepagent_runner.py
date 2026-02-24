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
    ApprovalRequired,
    RunCompleted,
    RunFailed,
    RunStarted,
    UsageReport,
    adapt_langgraph_event,
    to_sse_dict,
)
from services.model_factory import ModelFactory
from services.tool_client import InternalToolClient
from services.tool_registry import create_read_tools, create_write_tools

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
- 資料落地階段（payload/patch/prepare-commit）優先使用 `qjudge-code-problem-format-and-ops`。
- 題目資料先讀取再回答，不要臆測。
- 任何 commit 都必須先展示 preview，且得到使用者確認。

可用工具：
- load_problem_context：讀題目與翻譯內容。
- prepare_problem_create / prepare_problem_patch：準備變更並產生 preview。
- commit_problem_action：提交變更（需用戶審核）。
"""


class DeepAgentRunner:
    """Manages DeepAgent lifecycle, checkpointing, and event streaming."""

    def __init__(
        self,
        tool_client: InternalToolClient,
        checkpoint_db_url: str,
        skills_dir: str = "skills",
    ) -> None:
        self._tool_client = tool_client
        self._checkpoint_db_url = checkpoint_db_url
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
            skills=[self._skills_source],
            checkpointer=self._checkpointer,
            interrupt_on=interrupt_on,
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
        skill_files = self._build_skill_state_files()
        if skill_files:
            agent_input["files"] = skill_files

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
                    message="Agent execution failed",
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
