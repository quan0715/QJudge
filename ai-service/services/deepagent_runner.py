"""DeepAgent runner — orchestrates LangGraph agent execution with streaming."""

from __future__ import annotations

import asyncio
from contextvars import ContextVar
import logging
import os
import uuid
from typing import Any, AsyncGenerator
from collections.abc import Mapping

import httpx
from deepagents import create_deep_agent
from deepagents.backends.composite import CompositeBackend
from deepagents.backends.filesystem import FilesystemBackend
from deepagents.backends.state import StateBackend
from deepagents.middleware.summarization import SummarizationMiddleware
from langchain_core.messages import AnyMessage
from langgraph.errors import GraphRecursionError
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool
from langgraph.types import Command

from services.event_adapter import (
    AgentMessageDelta,
    AwaitingApproval,
    RunCompleted,
    RunFailed,
    RunStarted,
    SummarizationEnded,
    SummarizationStarted,
    UsageReport,
    adapt_langgraph_event,
    to_sse_dict,
)
from config import get_settings
from models.schemas import RequestContext
from services.artifact_tools import build_artifact_tools
from services.hitl_middleware import ActionAwareHITLMiddleware
from services.mcp_tool_provider import MCPToolProvider
from services.model_factory import (
    ModelFactory,
    SUMMARIZATION_TRIGGER_FRACTION,
    _DEFAULT_MODEL_ID as _REPAIR_MODEL_ID,
)

logger = logging.getLogger(__name__)

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


def _build_session_artifact_tools(
    request_context: RequestContext | None,
    *,
    shared_client: httpx.AsyncClient | None = None,
) -> list[Any]:
    """Construct session-private artifact tools using ai-service config."""
    cfg = get_settings()
    session_id = request_context.session_id if request_context else None
    run_id = request_context.run_id if request_context else None
    return build_artifact_tools(
        session_id=session_id,
        run_id=run_id,
        backend_base_url=cfg.qjudge_backend_url,
        internal_token=cfg.ai_internal_token,
        shared_client=shared_client,
    )


# LangGraph recursion limit for a single run. A recursive budget covers each
# agent<->tool round trip plus middleware hops; test-case generation and
# multi-tool plans routinely burn 30-40 iterations, so keep headroom. Past
# scratch-space loops (write_file/read_file churn) used to hit 60 easily.
_AGENT_RECURSION_LIMIT = 100
_RECURSION_SUMMARY_MODEL_ID = "openai-nano"
_RECURSION_TAIL_MESSAGES = 12


# Write-class MCP tool actions that require human approval before execution.
# Any tool_call whose name is a key AND whose args["action"] is in the
# corresponding set triggers an interrupt handled by ActionAwareHITLMiddleware.
_WRITE_ACTIONS: dict[str, set[str]] = {
    "qjudge_grading": {"grade", "batch_grade", "ungrade"},
    "qjudge_contest_manager": {"reorder"},
    "qjudge_coding_problems": {
        "create",
        "update",
        "delete",
    },
    "qjudge_exam": {
        "create",
        "update",
        "delete",
        "reorder",
        "import_from_bank",
        "batch_create",
    },
}


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


class DeepAgentRunner:
    """Manages DeepAgent lifecycle, checkpointing, and event streaming."""

    def __init__(
        self,
        checkpoint_db_url: str,
        mcp_server_url: str,
        skills_paths: list[str] | None = None,
        memory_paths: list[str] | None = None,
    ) -> None:
        self._checkpoint_db_url = checkpoint_db_url
        self._mcp_server_url = mcp_server_url
        self._skills_paths = skills_paths or ["/app/.deepagents/skills/"]
        self._memory_paths = memory_paths or ["/app/.deepagents/AGENTS.md"]
        self._checkpointer: AsyncPostgresSaver | None = None
        self._pool: AsyncConnectionPool | None = None

    async def setup(self) -> None:
        """Initialize the Postgres checkpointer using a connection pool.

        A pool (min=1, max=10) prevents the "another command is already in
        progress" OperationalError that occurs when multiple concurrent
        requests—or a CancelledError that leaves a connection dirty—all share
        a single psycopg AsyncConnection.
        """
        self._pool = AsyncConnectionPool(
            conninfo=self._checkpoint_db_url,
            min_size=1,
            max_size=10,
            kwargs={"autocommit": True, "prepare_threshold": 0},
            open=False,
        )
        await self._pool.open()
        self._checkpointer = AsyncPostgresSaver(self._pool)
        await self._checkpointer.setup()
        logger.info("DeepAgent checkpointer initialized with connection pool.")

    async def shutdown(self) -> None:
        """Clean up resources."""
        if self._pool:
            await self._pool.close()
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
                    write_actions=_WRITE_ACTIONS,
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
            "configurable": {"thread_id": thread_id},
            "metadata": {"thread_id": thread_id, "run_id": run_id},
            "recursion_limit": _AGENT_RECURSION_LIMIT,
        }

    async def _stream_with_provider(
        self,
        *,
        thread_id: str,
        run_id: str,
        model_id: str,
        system_prompt: str | None,
        request_context: RequestContext | None,
        agent_input: dict[str, Any] | Command,
        event_queue: asyncio.Queue,
    ) -> AsyncGenerator[dict[str, Any], None]:
        async with MCPToolProvider(
            server_url=self._mcp_server_url,
            authorization_header=(
                request_context.user_authorization if request_context else None
            ),
        ) as tool_provider, httpx.AsyncClient(timeout=10.0) as artifact_client:
            tools = await tool_provider.load_tools()
            tools = list(tools) + _build_session_artifact_tools(
                request_context,
                shared_client=artifact_client,
            )
            agent = self._build_agent(
                model_id=model_id,
                system_prompt=system_prompt,
                tools=tools,
                event_queue=event_queue,
            )
            config = self._build_run_config(thread_id=thread_id, run_id=run_id)
            async for sse_dict in self._stream_events(
                agent,
                agent_input,
                config,
                run_id,
                thread_id,
                model_id,
                event_queue=event_queue,
            ):
                yield sse_dict

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

        total_input_tokens = 0
        total_output_tokens = 0
        retried = False

        async def _emit_recursion_summary():
            """Emit a plain assistant message when recursion budget is exhausted."""
            try:
                summary = await self._summarize_recursion_interruption(
                    agent=agent,
                    config=config,
                )
                if not summary:
                    summary = self._fallback_recursion_summary()
                yield to_sse_dict(AgentMessageDelta(content=summary))
                yield to_sse_dict(
                    UsageReport(
                        input_tokens=total_input_tokens,
                        output_tokens=total_output_tokens,
                        cost_cents=self._calculate_cost(
                            model_id,
                            total_input_tokens,
                            total_output_tokens,
                        ),
                        model_used=model_id,
                    )
                )
                yield to_sse_dict(RunCompleted(run_id=run_id))
            except Exception:
                logger.exception("Failed to emit recursion summary event")

        async def _run_stream():
            nonlocal total_input_tokens, total_output_tokens
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

            # After the graph stream ends, any side-channel events (e.g. summarization_ended
            # queued in a middleware finally) must still be forwarded.
            if event_queue is not None:
                while not event_queue.empty():
                    yield event_queue.get_nowait()

        try:
            try:
                async for sse_dict in _run_stream():
                    yield sse_dict
            except asyncio.CancelledError:
                # Client disconnected (backend dropped the SSE connection).
                # Repair the checkpoint immediately so the next message on
                # the same session doesn't hit "insufficient tool messages".
                logger.warning(
                    "Stream cancelled for thread %s, repairing checkpoint", thread_id
                )
                await self._repair_dangling_tool_calls(agent, config)
                raise
            except Exception as exc:
                if self._is_graph_recursion_error(exc):
                    handled = False
                    async for recursion_event in _emit_recursion_summary():
                        handled = True
                        yield recursion_event
                    if handled:
                        return

                # Detect dangling tool_calls error → repair and retry once
                error_str = str(exc)
                # Also check nested ExceptionGroup sub-exceptions
                if hasattr(exc, "exceptions"):
                    error_str += " ".join(str(e) for e in exc.exceptions)
                if not retried and "insufficient tool messages" in error_str:
                    logger.warning("Dangling tool_calls detected, attempting repair...")
                    repaired = await self._repair_dangling_tool_calls(agent, config)
                    if repaired:
                        retried = True
                        try:
                            async for sse_dict in _run_stream():
                                yield sse_dict
                        except Exception as retry_exc:
                            # Repair didn't help — nuclear option: delete checkpoint
                            retry_str = str(retry_exc)
                            if hasattr(retry_exc, "exceptions"):
                                retry_str += " ".join(str(e) for e in retry_exc.exceptions)
                            if "insufficient tool messages" in retry_str:
                                logger.warning(
                                    "Repair insufficient, deleting checkpoint for thread %s",
                                    thread_id,
                                )
                                await self._checkpointer.adelete_thread(thread_id)
                            raise retry_exc
                    else:
                        # Repair found nothing to fix in raw messages — the problem
                        # is likely in _summarization_event state (bad cutoff_index).
                        # Delete the checkpoint so the next request starts clean.
                        if "insufficient tool messages" in error_str:
                            logger.warning(
                                "Cannot repair dangling tool_calls (summarization state corrupt), "
                                "deleting checkpoint for thread %s",
                                thread_id,
                            )
                            await self._checkpointer.adelete_thread(thread_id)
                        raise
                else:
                    raise

            cost_cents = self._calculate_cost(
                model_id, total_input_tokens, total_output_tokens
            )
            usage_event = UsageReport(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                cost_cents=cost_cents,
                model_used=model_id,
            )

            # Check whether the agent paused for human approval.
            # LangGraph stores pending interrupts on StateSnapshot.interrupts
            # (tuple of Interrupt objects) after astream_events exhausts.
            state = await agent.aget_state(config)
            if state.interrupts:
                interrupt_val = state.interrupts[0].value
                action_requests = (
                    interrupt_val.get("action_requests", [])
                    if isinstance(interrupt_val, dict)
                    else []
                )
                review_configs = (
                    interrupt_val.get("review_configs", [])
                    if isinstance(interrupt_val, dict)
                    else []
                )
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
            else:
                yield to_sse_dict(usage_event)
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

    @staticmethod
    def _is_graph_recursion_error(exc: BaseException) -> bool:
        if isinstance(exc, GraphRecursionError):
            return True
        nested = getattr(exc, "exceptions", None)
        if nested:
            return any(isinstance(item, GraphRecursionError) for item in nested)
        return False

    @staticmethod
    def _format_message_for_summary(message: AnyMessage) -> str:
        role = getattr(message, "type", message.__class__.__name__).lower()
        name = getattr(message, "name", "")
        header = f"{role}:{name}" if name else role

        content = getattr(message, "content", "")
        if isinstance(content, list):
            content_text = " ".join(str(part) for part in content)
        else:
            content_text = str(content or "")
        content_text = content_text.replace("\n", " ").strip()
        if len(content_text) > 350:
            content_text = f"{content_text[:350]}..."

        tool_call_id = getattr(message, "tool_call_id", "")
        status = getattr(message, "status", "")
        extras: list[str] = []
        if tool_call_id:
            extras.append(f"tool_call_id={tool_call_id}")
        if status:
            extras.append(f"status={status}")
        suffix = f" [{' '.join(extras)}]" if extras else ""
        return f"- {header}{suffix}: {content_text}"

    @classmethod
    def _build_recursion_summary_prompt(cls, transcript: str) -> str:
        return (
            "你是 AI 助手的故障摘要器。主代理在 LangGraph 達到遞迴上限而中止。\n"
            "請使用繁體中文，回覆 2-4 句，語氣直接。\n"
            "格式要求：\n"
            "1) 先說明剛剛嘗試要做的事情。\n"
            "2) 明確指出卡住原因（根據錯誤訊息）。\n"
            "3) 最後引導使用者：請調整提示後再送出，或直接回覆「繼續任務」。\n"
            "不要使用 markdown、不要使用 emoji。\n\n"
            "最近訊息：\n"
            f"{transcript}"
        )

    @staticmethod
    def _fallback_recursion_summary() -> str:
        return (
            "我剛剛在執行任務時重複嘗試過多次，暫時卡住了。"
            "目前無法從現有資訊突破，請補充更明確的指示或修正條件。"
            "請調整提示後再送出，或直接回覆「繼續任務」。"
        )

    async def _summarize_recursion_interruption(
        self,
        *,
        agent: Any,
        config: dict[str, Any],
    ) -> str:
        state = await agent.aget_state(config)
        messages = state.values.get("messages", []) if state else []
        if not isinstance(messages, list) or not messages:
            return self._fallback_recursion_summary()

        tail = messages[-_RECURSION_TAIL_MESSAGES:]
        lines = [self._format_message_for_summary(msg) for msg in tail]
        transcript = "\n".join(lines)
        if len(transcript) > 6000:
            transcript = transcript[-6000:]

        summary_model = ModelFactory.create_model(_RECURSION_SUMMARY_MODEL_ID)
        summary_prompt = self._build_recursion_summary_prompt(transcript)
        response = await summary_model.ainvoke(summary_prompt)
        content = getattr(response, "content", "")
        if isinstance(content, list):
            content = " ".join(str(part) for part in content)
        summary = str(content).strip()
        return summary or self._fallback_recursion_summary()

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

        event_queue: asyncio.Queue = asyncio.Queue()
        agent_input: dict[str, Any] = {"messages": messages}
        async for sse_dict in self._stream_with_provider(
            thread_id=thread_id,
            run_id=run_id,
            model_id=model_id,
            system_prompt=system_prompt,
            request_context=request_context,
            agent_input=agent_input,
            event_queue=event_queue,
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

        event_queue: asyncio.Queue = asyncio.Queue()
        resume_value = Command(resume={"decisions": [{"type": decision}]})
        async for sse_dict in self._stream_with_provider(
            thread_id=thread_id,
            run_id=run_id,
            model_id=model_id,
            system_prompt=system_prompt,
            request_context=request_context,
            agent_input=resume_value,
            event_queue=event_queue,
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
