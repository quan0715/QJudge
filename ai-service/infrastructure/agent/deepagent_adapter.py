"""DeepAgent runner — orchestrates LangGraph agent execution with streaming."""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator, Mapping
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, AsyncGenerator, Protocol
from uuid import UUID

from deepagents import create_deep_agent
from deepagents.backends.composite import CompositeBackend
from deepagents.backends.filesystem import FilesystemBackend
from deepagents.backends.state import StateBackend
from deepagents.middleware.summarization import SummarizationMiddleware
from langgraph.types import Command

from application.artifacts import ArtifactService
from infrastructure.checkpoints.langgraph_store import LangGraphCheckpointStore
from infrastructure.agent.event_adapter import (
    AgentMessageDelta,
    AwaitingApproval,
    AwaitingUserAnswer,
    RunCompleted,
    RunFailed,
    RunStarted,
    SummarizationEnded,
    SummarizationStarted,
    UsageReport,
    adapt_langgraph_event,
    to_sse_dict,
)
from infrastructure.agent.ask_user_tool import build_ask_user_tool
from infrastructure.agent.next_turn_tool import build_suggest_next_actions_tool
from infrastructure.agent.interrupt_state_adapter import (
    extract_approval_payload,
    extract_interrupt_type,
    extract_question_payload,
)
from infrastructure.agent.hitl_middleware import ActionAwareHITLMiddleware
from infrastructure.agent.model_factory import (
    ModelFactory,
    SUMMARIZATION_TRIGGER_FRACTION,
    _DEFAULT_MODEL_ID as _REPAIR_MODEL_ID,
)
from infrastructure.agent.approval_policy import WRITE_ACTIONS
from infrastructure.agent.checkpoint_recovery_manager import CheckpointRecoveryManager
from infrastructure.agent.recursion_failure_handler import RecursionFailureHandler
from infrastructure.agent.usage_accumulator import UsageAccumulator
from infrastructure.artifacts.tools import build_artifact_tools
from infrastructure.mcp.provider import MCPToolProvider

logger = logging.getLogger(__name__)


class AgentOperation(StrEnum):
    START = "start"
    RESUME = "resume"
    APPROVE = "approve"
    ANSWER = "answer"


@dataclass(frozen=True, slots=True)
class AgentCommand:
    run_id: UUID
    session_id: UUID
    operation: AgentOperation
    prompt: str | None
    model_id: str
    mcp_token: str
    approval: dict[str, Any] | None
    answer: str | None


class AgentRunner(Protocol):
    def execute(
        self,
        *,
        command: AgentCommand,
        tools: list[Any],
        configurable: dict[str, str],
    ) -> AsyncIterator[dict[str, Any]]: ...


class CheckpointIdentity(Protocol):
    def configurable(self, session_id: UUID) -> dict[str, str]: ...


class McpToolConnection(Protocol):
    def connect(
        self, mcp_token: str
    ) -> AbstractAsyncContextManager[list[Any]]: ...


class McpToolConnectionProvider:
    """Bind an exchanged MCP access token to the MCP tool transport."""

    def __init__(
        self,
        *,
        server_url: str,
        tool_policy: dict[str, Any] | None = None,
    ) -> None:
        self._server_url = server_url
        self._tool_policy = tool_policy

    @asynccontextmanager
    async def connect(self, mcp_token: str) -> AsyncIterator[list[Any]]:
        authorization = (
            mcp_token if mcp_token.startswith("Bearer ") else f"Bearer {mcp_token}"
        )
        async with MCPToolProvider(
            server_url=self._server_url,
            authorization_header=authorization,
            tool_policy=self._tool_policy,
        ) as provider:
            yield list(await provider.load_tools())

_SUMMARIZATION_EVENT_QUEUE: ContextVar[asyncio.Queue | None] = ContextVar(
    "deepagent_summarization_event_queue",
    default=None,
)


def _qjudge_backend_factory(rt: Any) -> CompositeBackend:
    """Scratch/temp in agent state; skills + AGENTS.md read from mounted `/app/.deepagents/`.

    Pure `StateBackend` lists skills from empty in-memory `files` — SkillsMiddleware then
    shows no skills and `read_file` cannot see SKILL.md on disk. Route that tree to disk.
    """
    deepagents_fs = FilesystemBackend(
        root_dir="/app/.deepagents",
        virtual_mode=True,
    )
    return CompositeBackend(
        default=StateBackend(rt),
        routes={"/app/.deepagents/": deepagents_fs},
    )


# LangGraph recursion limit for a single run. A recursive budget covers each
# agent<->tool round trip plus middleware hops; test-case generation and
# multi-tool plans routinely burn 30-40 iterations, so keep headroom. Past
# scratch-space loops (write_file/read_file churn) used to hit 60 easily.
_AGENT_RECURSION_LIMIT = 100


class _SafeSummarizationMiddleware(SummarizationMiddleware):
    """Patches deepagents 0.5.3's SummarizationMiddleware tool_call pair bug.

    deepagents calls _lc_helper._partition_messages(messages, cutoff_index) directly
    without first adjusting the cutoff via _find_safe_cutoff_point. This causes
    ToolMessages to be split from their parent AIMessage, resulting in 400 errors.

    langchain 1.2.15 already has the fix in _lc_helper._find_safe_cutoff_point.
    This subclass simply wires it up until deepagents releases a fix.
    See: https://github.com/langchain-ai/langchain/issues/34282

    Also emits SummarizationStarted / SummarizationEnded via an asyncio.Queue
    side-channel so callers can show/clear UI when compaction runs.
    """

    _FALLBACK_TRIGGER_TOKENS = 170_000
    _SAFE_TRIGGER_FRACTION = SUMMARIZATION_TRIGGER_FRACTION
    _DEFAULT_SUMMARY_TRIM_TOKENS = 12_000

    def __init__(self, *args: Any, event_queue: asyncio.Queue | None = None, **kwargs: Any) -> None:
        self._normalize_summarization_config(args=args, kwargs=kwargs)
        super().__init__(*args, **kwargs)
        self._event_queue: asyncio.Queue | None = (
            event_queue if event_queue is not None else _SUMMARIZATION_EVENT_QUEUE.get()
        )

    @classmethod
    def _extract_model_name(cls, model: Any) -> str:
        for attr in ("model_name", "model", "name"):
            value = getattr(model, attr, None)
            if isinstance(value, str) and value.strip():
                return value.strip().lower()
        return ""

    @classmethod
    def _infer_model_max_input_tokens(cls, model: Any) -> int | None:
        max_input_hint = getattr(model, "_qjudge_max_input_tokens", None)
        if isinstance(max_input_hint, int) and max_input_hint > 0:
            return max_input_hint

        profile = getattr(model, "profile", None)
        if isinstance(profile, Mapping):
            max_input = profile.get("max_input_tokens")
            if isinstance(max_input, int) and max_input > 0:
                return max_input

        # Some integrations expose profile as an object instead of dict.
        max_input_obj = getattr(profile, "max_input_tokens", None)
        if isinstance(max_input_obj, int) and max_input_obj > 0:
            return max_input_obj

        # Final fallback for OpenAI GPT-5 family.
        model_name = cls._extract_model_name(model)
        if model_name.startswith("gpt-5"):
            return 400_000
        return None

    @classmethod
    def _safe_trigger_from_max_tokens(cls, max_input_tokens: int) -> tuple[str, int]:
        safe_trigger = int(max_input_tokens * cls._SAFE_TRIGGER_FRACTION)
        if safe_trigger <= 0:
            safe_trigger = 1
        return ("tokens", safe_trigger)

    @classmethod
    def _normalize_summarization_config(cls, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        model = kwargs.get("model")
        if model is None and args:
            model = args[0]

        max_input_tokens = cls._infer_model_max_input_tokens(model)

        trigger = kwargs.get("trigger")
        # DeepAgents fallback trigger is 170k when model profile is missing.
        # This can exceed model input limits and prevent
        # summarization from firing before OpenAI returns 400.
        if (
            isinstance(trigger, tuple)
            and len(trigger) == 2
            and trigger[0] == "tokens"
            and isinstance(trigger[1], (int, float))
        ):
            trigger_tokens = int(trigger[1])
            if max_input_tokens is not None and (
                trigger_tokens == cls._FALLBACK_TRIGGER_TOKENS or trigger_tokens >= max_input_tokens
            ):
                safe_trigger = cls._safe_trigger_from_max_tokens(max_input_tokens)
                logger.warning(
                    "SummarizationMiddleware trigger adjusted from %s to %s for model max_input_tokens=%d",
                    trigger,
                    safe_trigger,
                    max_input_tokens,
                )
                kwargs["trigger"] = safe_trigger

        # Avoid oversized summarization requests; without trimming, the
        # summarization model call can fail before compaction is applied.
        if kwargs.get("trim_tokens_to_summarize") is None:
            model_trim_hint = getattr(model, "_qjudge_summarization_trim_tokens", None)
            if isinstance(model_trim_hint, int) and model_trim_hint > 0:
                kwargs["trim_tokens_to_summarize"] = model_trim_hint
            else:
                kwargs["trim_tokens_to_summarize"] = cls._DEFAULT_SUMMARY_TRIM_TOKENS

    def _partition_messages(
        self,
        conversation_messages: list[AnyMessage],
        cutoff_index: int,
    ) -> tuple[list[AnyMessage], list[AnyMessage]]:
        safe_cutoff = self._lc_helper._find_safe_cutoff_point(
            conversation_messages, cutoff_index
        )
        return self._lc_helper._partition_messages(conversation_messages, safe_cutoff)

    async def awrap_model_call(self, request: Any, handler: Any) -> Any:
        emitted_start = False
        # Mirror the parent's token-count check (read-only) to detect when
        # compaction will fire so we can emit a side-channel SSE event.
        try:
            counted = ([request.system_message, *request.messages]
                       if request.system_message is not None
                       else list(request.messages))
            try:
                total_tokens = self.token_counter(counted, tools=request.tools)
            except TypeError:
                total_tokens = self.token_counter(counted)
            should = self._should_summarize(list(request.messages), total_tokens)
            logger.debug(
                "SummarizationMiddleware: total_tokens=%d should_summarize=%s trigger=%s",
                total_tokens,
                should,
                getattr(self, "trigger", "?"),
            )
            if should:
                logger.info("SummarizationMiddleware: compaction triggered")
                if self._event_queue is not None:
                    await self._event_queue.put(to_sse_dict(SummarizationStarted()))
                    emitted_start = True
        except Exception as e:
            logger.warning("SummarizationMiddleware observability error: %s", e)

        try:
            return await super().awrap_model_call(request, handler)
        finally:
            if emitted_start and self._event_queue is not None:
                try:
                    await self._event_queue.put(to_sse_dict(SummarizationEnded()))
                except Exception as e:
                    logger.warning("SummarizationMiddleware: SummarizationEnded emit failed: %s", e)

# Force DeepAgent's default stack to use our safe summarization middleware.
#
# graph.py imports the *factory* `create_summarization_middleware`, not the
# class — so patching `deepagents.graph.SummarizationMiddleware` is inert.
# The factory body is `return SummarizationMiddleware(...)` where
# `SummarizationMiddleware` resolves against the `summarization` module's
# own scope. Patching THAT binding is what actually swaps the class.
from deepagents.middleware import summarization as _summarization_module
_summarization_module.SummarizationMiddleware = _SafeSummarizationMiddleware


# Default system prompt for the TA agent（細節見 AGENTS.md 與 skills/*/SKILL.md）
_DEFAULT_SYSTEM_PROMPT = """你是 QJudge 的 AI 助教，對話對象是老師（出題者）。

回覆：繁體中文、簡短直接、條列優先；不用 emoji，不要客套開場。

原則：
- 先讀平台資料再回答，不臆測。
- 僅處理 QJudge 出題／測驗／批改相關任務；無關請求簡短拒絕並導回範圍。

執行細則不在此重複，請遵守：
- `/app/.deepagents/AGENTS.md`
- `/app/.deepagents/skills/qjudge-ta-protocol/SKILL.md`
- `/app/.deepagents/skills/qjudge-mcp-tool-operator/SKILL.md`
- `/app/.deepagents/skills/coding-problem-ta-skill/SKILL.md`
- `/app/.deepagents/skills/qjudge-exam-grading-sop/SKILL.md`（open-ended 題批改 SOP；遇到老師要評分/改分時讀此）

如工具錯誤或路由不確定，先呼叫：
`qjudge_browse(action="get_help", tool_name="<tool_name>")`
"""


class _DeepAgentRuntime:
    """Internal LangGraph implementation owned by :class:`DeepAgentAdapter`."""

    def __init__(
        self,
        skills_paths: list[str] | None = None,
        memory_paths: list[str] | None = None,
        checkpoint_store: LangGraphCheckpointStore | None = None,
    ) -> None:
        self._skills_paths = skills_paths or ["/app/.deepagents/skills/"]
        self._memory_paths = memory_paths or ["/app/.deepagents/AGENTS.md"]
        self._checkpoint_store = checkpoint_store or LangGraphCheckpointStore()
        self._checkpointer: Any | None = None
        self._recursion_handler = RecursionFailureHandler()

    async def setup(self) -> None:
        """Initialize the Postgres checkpointer using a connection pool.

        A pool (min=1, max=10) prevents the "another command is already in
        progress" OperationalError that occurs when multiple concurrent
        requests—or a CancelledError that leaves a connection dirty—all share
        a single psycopg AsyncConnection.
        """
        await self._checkpoint_store.setup()
        self._checkpointer = self._checkpoint_store.checkpointer
        logger.info("DeepAgent checkpointer initialized with connection pool.")

    async def shutdown(self) -> None:
        """Clean up resources."""
        await self._checkpoint_store.close()
        self._checkpointer = None
        logger.info("DeepAgent runner shut down.")

    async def delete_thread(self, thread_id: str) -> None:
        """Delete all checkpoint state for a thread (used to recover broken sessions)."""
        if self._checkpointer is None:
            raise RuntimeError("Checkpointer not initialized")
        await self._checkpointer.adelete_thread(thread_id)
        logger.info("Deleted LangGraph checkpoint for thread %s", thread_id)

    async def repair_thread(self, thread_id: str) -> bool:
        """Proactively repair dangling tool_calls after a run is cancelled.

        Builds a minimal agent (no MCP tools) solely for checkpoint state
        read/write — the model is never invoked. Returns True if any repair
        messages were injected.
        """
        if self._checkpointer is None:
            raise RuntimeError("Checkpointer not initialized")
        agent = self._build_agent(
            model_id=_REPAIR_MODEL_ID,
            system_prompt=None,
            tools=[],
        )
        config = {"configurable": {"thread_id": thread_id}}
        return await self._repair_dangling_tool_calls(agent, config)

    def _build_agent(
        self,
        model_id: str,
        system_prompt: str | None,
        tools: list[Any],
        event_queue: asyncio.Queue | None = None,
    ):
        """Build a DeepAgent with tools.

        create_deep_agent already injects the standard DeepAgents stack
        (TodoList, Skills, Filesystem, Summarization, etc.). Only append
        custom middleware that is not already included.
        """
        model = ModelFactory.create_model(model_id=model_id)
        prompt = system_prompt or _DEFAULT_SYSTEM_PROMPT
        skills = [p for p in self._skills_paths if p]
        memory = [p for p in self._memory_paths if p]

        for path in skills + memory:
            if not os.path.exists(path):
                logger.warning("DeepAgents path not found: %s", path)

        agent_kwargs: dict[str, Any] = {
            "model": model,
            "tools": tools,
            "system_prompt": prompt,
            "backend": _qjudge_backend_factory,
            "skills": skills,
            "memory": memory,
            "middleware": [
                # Must be the last middleware: inspects the final tool_calls produced by
                # the model turn and pauses execution for human approval on write actions.
                ActionAwareHITLMiddleware(
                    write_actions=WRITE_ACTIONS,
                    allowed_decisions=["approve", "reject"],
                ),
            ],
            "checkpointer": self._checkpointer,
        }
        queue_token = _SUMMARIZATION_EVENT_QUEUE.set(event_queue)
        try:
            agent = create_deep_agent(**agent_kwargs)
        finally:
            _SUMMARIZATION_EVENT_QUEUE.reset(queue_token)
        return agent

    @staticmethod
    def _build_run_config(thread_id: str, run_id: str) -> dict[str, Any]:
        return {
            "configurable": {"thread_id": thread_id, "run_id": run_id},
            "metadata": {"thread_id": thread_id, "run_id": run_id},
            "recursion_limit": _AGENT_RECURSION_LIMIT,
        }

    async def execute(
        self,
        *,
        command: AgentCommand,
        tools: list[Any],
        configurable: dict[str, str],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Execute exactly one caller-owned run on its caller-owned session."""
        expected_configurable = {
            "thread_id": str(command.session_id),
            "run_id": str(command.run_id),
        }
        if configurable != expected_configurable:
            raise ValueError("Agent configurable IDs must match the domain command")

        operation = command.operation.value
        if operation == "start":
            if not command.prompt:
                raise ValueError("A start operation requires a prompt")
            agent_input: dict[str, Any] | Command = {
                "messages": [{"role": "user", "content": command.prompt}]
            }
        elif operation in {"resume", "approve"}:
            resume = dict(command.approval or {})
            decision = resume.pop("decision", None)
            if decision is not None and "decisions" not in resume:
                resume["decisions"] = [{"type": decision}]
            agent_input = Command(resume=resume)
        elif operation == "answer":
            if command.answer is None:
                raise ValueError("An answer operation requires an answer")
            agent_input = Command(resume={"answer": command.answer})
        else:  # pragma: no cover - StrEnum exhaustiveness guard
            raise ValueError(f"Unsupported agent operation: {command.operation}")

        event_queue: asyncio.Queue = asyncio.Queue()
        agent = self._build_agent(
            model_id=command.model_id,
            system_prompt=None,
            tools=[*tools, build_ask_user_tool(), build_suggest_next_actions_tool()],
            event_queue=event_queue,
        )
        config = self._build_run_config(
            thread_id=str(command.session_id),
            run_id=str(command.run_id),
        )
        async for event in self._stream_events(
            agent,
            agent_input,
            config,
            str(command.run_id),
            str(command.session_id),
            command.model_id,
            event_queue=event_queue,
        ):
            yield event

    # ------------------------------------------------------------------
    # Shared streaming loop
    # ------------------------------------------------------------------

    @staticmethod
    async def _repair_dangling_tool_calls(agent: Any, config: dict[str, Any]) -> bool:
        """Fix checkpoints whose tool_calls lack matching tool responses.

        Scans the **entire** message history (not only the last AIMessage),
        because multiple AI turns can leave dangling tool_calls behind when an
        earlier turn is cut short (recursion limit, cancel, HITL abort). If
        any tool_call_id has no paired ToolMessage, a synthetic error
        ToolMessage is injected so the next LLM call stops failing with
        "insufficient tool messages following tool_calls".

        Returns True if at least one repair was injected.
        """
        from langchain_core.messages import ToolMessage

        try:
            state = await agent.aget_state(config)
            messages = state.values.get("messages", [])
            if not messages:
                return False

            # Gather every AIMessage that carries tool_calls anywhere in history.
            ai_messages_with_tools = [
                msg for msg in messages
                if hasattr(msg, "tool_calls") and msg.tool_calls
            ]
            if not ai_messages_with_tools:
                return False

            existing_responses = {
                msg.tool_call_id
                for msg in messages
                if isinstance(msg, ToolMessage) and getattr(msg, "tool_call_id", None)
            }

            repair_messages: list[ToolMessage] = []
            seen: set[str] = set()
            for ai_msg in ai_messages_with_tools:
                for tc in ai_msg.tool_calls:
                    tc_id = tc.get("id")
                    if not tc_id or tc_id in existing_responses or tc_id in seen:
                        continue
                    seen.add(tc_id)
                    repair_messages.append(
                        ToolMessage(
                            content="[Tool call failed: previous session error. Please retry.]",
                            tool_call_id=tc_id,
                            name=tc.get("name", "unknown"),
                        )
                    )

            if not repair_messages:
                return False

            logger.warning(
                "Repairing checkpoint: injecting %d missing tool responses "
                "across %d AIMessage(s) for thread %s",
                len(repair_messages),
                len(ai_messages_with_tools),
                config.get("configurable", {}).get("thread_id", "?"),
            )

            await agent.aupdate_state(config, {"messages": repair_messages})
            return True

        except Exception as repair_exc:
            logger.warning("Checkpoint repair failed: %s", repair_exc)
            return False

    async def _stream_raw_events(
        self,
        *,
        agent: Any,
        agent_input: dict[str, Any] | Command,
        config: dict[str, Any],
        event_queue: asyncio.Queue | None,
        usage_accumulator: UsageAccumulator,
    ) -> AsyncGenerator[dict[str, Any], None]:
        async for event in agent.astream_events(
            agent_input,
            config=config,
            version="v2",
        ):
            # Drain side-channel events (e.g. summarization_started/ended) before
            # each LangGraph event so they arrive in roughly the right order.
            if event_queue is not None:
                while not event_queue.empty():
                    yield event_queue.get_nowait()

            usage_accumulator.ingest_langgraph_event(event)

            internal_events = adapt_langgraph_event(event)
            if internal_events is None:
                continue
            for internal_event in internal_events:
                yield to_sse_dict(internal_event)

        # After the graph stream ends, any side-channel events (e.g. summarization_ended
        # queued in a middleware finally) must still be forwarded.
        if event_queue is not None:
            while not event_queue.empty():
                yield event_queue.get_nowait()

    async def _finalize_stream_events(
        self,
        *,
        agent: Any,
        config: dict[str, Any],
        run_id: str,
        thread_id: str,
        usage_event: UsageReport,
    ) -> AsyncGenerator[dict[str, Any], None]:
        # Check whether the agent paused for human approval.
        # LangGraph stores pending interrupts on StateSnapshot.interrupts
        # (tuple of Interrupt objects) after astream_events exhausts.
        state = await agent.aget_state(config)
        has_interrupt = bool(getattr(state, "interrupts", None))

        if has_interrupt:
            interrupt_type = extract_interrupt_type(state)

            if interrupt_type == "ask_user":
                question, options, input_type = extract_question_payload(state)
                if not question:
                    logger.error(
                        "Agent interrupt payload missing question for thread %s",
                        thread_id,
                    )
                    yield to_sse_dict(usage_event)
                    yield to_sse_dict(
                        RunFailed(
                            run_id=run_id,
                            error_code="INTERRUPT_PAYLOAD_INVALID",
                            message="Invalid question payload from agent interrupt",
                        )
                    )
                    return
                logger.info("Agent interrupted to ask user: %s", question[:80])
                yield to_sse_dict(usage_event)
                yield to_sse_dict(
                    AwaitingUserAnswer(
                        thread_id=thread_id,
                        question=question,
                        options=options,
                        input_type=input_type,
                    )
                )
                return

            # Default: approval interrupt
            action_requests, review_configs = extract_approval_payload(state)
            if not action_requests:
                logger.error(
                    "Agent interrupt payload missing action_requests for thread %s",
                    thread_id,
                )
                yield to_sse_dict(usage_event)
                yield to_sse_dict(
                    RunFailed(
                        run_id=run_id,
                        error_code="INTERRUPT_PAYLOAD_INVALID",
                        message="Invalid approval payload from agent interrupt",
                    )
                )
                return
            logger.info(
                "Agent interrupted for approval: %s",
                [r.get("name") for r in action_requests],
            )
            yield to_sse_dict(usage_event)
            yield to_sse_dict(
                AwaitingApproval(
                    thread_id=thread_id,
                    action_requests=action_requests,
                    review_configs=review_configs,
                )
            )
            return

        yield to_sse_dict(usage_event)
        yield to_sse_dict(RunCompleted(run_id=run_id))

    async def _build_recursion_failure_events(
        self,
        *,
        agent: Any,
        config: dict[str, Any],
        run_id: str,
        usage_event: UsageReport,
    ) -> list[dict[str, Any]]:
        """Build fallback events when recursion budget is exhausted."""
        try:
            summary = await self._recursion_handler.summarize_interruption(
                agent=agent,
                config=config,
            )
            if not summary:
                summary = self._recursion_handler.fallback_recursion_summary()
            recursion_options = [
                {"label": "繼續任務", "message": "繼續任務"},
                {"label": "重新開始", "message": "請重新開始這個任務，用不同的方法試試"},
            ]
            return [
                to_sse_dict(AgentMessageDelta(content=summary)),
                to_sse_dict(usage_event),
                to_sse_dict(RunCompleted(
                    run_id=run_id,
                    next_turn_options=recursion_options,
                )),
            ]
        except Exception:
            logger.exception("Failed to emit recursion summary event")
            return []

    async def _stream_events(
        self,
        agent: Any,
        agent_input: dict[str, Any] | Command,
        config: dict[str, Any],
        run_id: str,
        thread_id: str,
        model_id: str,
        event_queue: asyncio.Queue | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stream agent execution events as SSE-serialisable dicts.

        If the LLM rejects the checkpoint due to dangling tool_calls,
        automatically repairs the state and retries once.
        """
        yield to_sse_dict(RunStarted(run_id=run_id, thread_id=thread_id))

        usage_accumulator = UsageAccumulator()
        recovery_manager = CheckpointRecoveryManager(
            checkpointer=self._checkpointer,
            repair_dangling_tool_calls=self._repair_dangling_tool_calls,
        )

        def _build_usage_event() -> UsageReport:
            return usage_accumulator.build_usage_report()

        try:
            try:
                async for sse_dict in recovery_manager.stream_with_recovery(
                    run_stream=lambda: self._stream_raw_events(
                        agent=agent,
                        agent_input=agent_input,
                        config=config,
                        event_queue=event_queue,
                        usage_accumulator=usage_accumulator,
                    ),
                    agent=agent,
                    config=config,
                    thread_id=thread_id,
                    passthrough_predicate=self._recursion_handler.is_graph_recursion_error,
                ):
                    yield sse_dict
            except Exception as exc:
                if self._recursion_handler.is_graph_recursion_error(exc):
                    handled_events = await self._build_recursion_failure_events(
                        agent=agent,
                        config=config,
                        run_id=run_id,
                        usage_event=_build_usage_event(),
                    )
                    if handled_events:
                        for recursion_event in handled_events:
                            yield recursion_event
                        return
                raise

            async for sse_dict in self._finalize_stream_events(
                agent=agent,
                config=config,
                run_id=run_id,
                thread_id=thread_id,
                usage_event=_build_usage_event(),
            ):
                yield sse_dict

        except Exception as exc:
            logger.exception("DeepAgent execution failed: %s", exc)
            yield to_sse_dict(
                RunFailed(
                    run_id=run_id,
                    error_code="AGENT_ERROR",
                    message="Agent execution failed",
                )
            )


class DeepAgentAdapter:
    """The sole public orchestration boundary for Worker agent execution."""

    def __init__(
        self,
        *,
        mcp_provider: McpToolConnection,
        artifact_service: ArtifactService,
        checkpoint_store: CheckpointIdentity,
        runner: AgentRunner | None = None,
        skills_paths: list[str] | None = None,
        memory_paths: list[str] | None = None,
    ) -> None:
        self._mcp_provider = mcp_provider
        self._artifact_service = artifact_service
        self._checkpoint_store = checkpoint_store
        self._runner = runner or _DeepAgentRuntime(
            skills_paths=skills_paths,
            memory_paths=memory_paths,
            checkpoint_store=checkpoint_store,
        )

    async def setup(self) -> None:
        setup = getattr(self._runner, "setup", None)
        if setup is not None:
            await setup()

    async def shutdown(self) -> None:
        shutdown = getattr(self._runner, "shutdown", None)
        if shutdown is not None:
            await shutdown()

    async def execute(
        self, command: AgentCommand
    ) -> AsyncGenerator[dict[str, Any], None]:
        configurable = {
            **self._checkpoint_store.configurable(command.session_id),
            "run_id": str(command.run_id),
        }
        async with self._mcp_provider.connect(command.mcp_token) as mcp_tools:
            tools = [
                *mcp_tools,
                *build_artifact_tools(
                    session_id=command.session_id,
                    run_id=command.run_id,
                    artifact_service=self._artifact_service,
                ),
            ]
            async for raw_event in self._runner.execute(
                command=command,
                tools=tools,
                configurable=configurable,
            ):
                yield {**raw_event, "run_id": str(command.run_id)}
