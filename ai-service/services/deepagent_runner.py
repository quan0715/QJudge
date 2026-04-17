"""DeepAgent runner — orchestrates LangGraph agent execution with streaming."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, AsyncGenerator

from deepagents.backends import StateBackend
from deepagents.graph import create_agent, TodoListMiddleware
from deepagents.middleware.filesystem import FilesystemMiddleware
from deepagents.middleware.summarization import SummarizationMiddleware
from langchain_core.messages import AnyMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command

from services.event_adapter import (
    AwaitingApproval,
    RunCompleted,
    RunFailed,
    RunStarted,
    SummarizationStarted,
    UsageReport,
    adapt_langgraph_event,
    to_sse_dict,
)
from models.schemas import RequestContext
from services.hitl_middleware import ActionAwareHITLMiddleware
from services.mcp_tool_provider import MCPToolProvider
from services.model_factory import ModelFactory, _SUMMARIZATION_MODEL_ID

logger = logging.getLogger(__name__)


# LangGraph recursion limit for a single run. A recursive budget covers each
# agent<->tool round trip plus middleware hops; test-case generation and
# multi-tool plans routinely burn 30-40 iterations, so keep headroom. Past
# scratch-space loops (write_file/read_file churn) used to hit 60 easily.
_AGENT_RECURSION_LIMIT = 100


# Write-class MCP tool actions that require human approval before execution.
# Any tool_call whose name is a key AND whose args["action"] is in the
# corresponding set triggers an interrupt handled by ActionAwareHITLMiddleware.
_WRITE_ACTIONS: dict[str, set[str]] = {
    "qjudge_grading": {"grade", "batch_grade", "ungrade"},
    "qjudge_coding": {
        "create",
        "update",
        "delete",
        "import_from_bank",
        "update_score",
    },
    "qjudge_exam": {
        "create",
        "update",
        "delete",
        "reorder",
        "import_from_bank",
        "batch_create",
    },
    "qjudge_bank": {
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

    Also emits a SummarizationStarted event via an asyncio.Queue side-channel
    so callers can surface a visible SSE event when compaction fires.
    """

    def __init__(self, *args: Any, event_queue: asyncio.Queue | None = None, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._event_queue: asyncio.Queue | None = event_queue

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
        logger.info("_SafeSummarizationMiddleware.awrap_model_call called")
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
            logger.info("SummarizationMiddleware: total_tokens=%d should_summarize=%s trigger=%s", total_tokens, should, getattr(self, 'trigger', '?'))
            if should:
                logger.info("SummarizationMiddleware: compaction triggered")
                if self._event_queue is not None:
                    await self._event_queue.put(to_sse_dict(SummarizationStarted()))
        except Exception as e:
            logger.warning("SummarizationMiddleware observability error: %s", e)

        return await super().awrap_model_call(request, handler)


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

虛擬檔案工具（write_file / read_file / ls / glob / grep / edit_file）：
- 僅作為暫存筆記（scratch space），內容存在對話內部 state，外部看不到、也不會被測資系統讀到。
- 絕對不要把「寫虛擬檔案」當成「更新題目/測資」。真實落地必須走：
  * qjudge_coding(action="update") 修改題目描述 / test_cases / language_configs
  * qjudge_code_runner 執行 reference solution（參數是 code 字串，不讀虛擬檔案）
- 同一個檔案不要連續 read 超過一次；已讀過就從對話記憶取用。

測資生成工作流（當用戶要求生成或驗證測資時遵循）：
1. qjudge_coding(action="get") 讀題目描述與限制。
2. 視需要讀取題目細節中的 sample cases，或基於既有內容整理測資需求。
3. 撰寫 reference solution（使用題目指定語言或 Python），直接在訊息或虛擬檔案中暫存。
4. 設計測資集：sample cases（基本範例）+ hidden cases（邊界、壓力測試）。
5. **必須**使用 qjudge_code_runner 以 code 字串送入實際執行 reference solution 驗證。
   絕對不可跳過此步驟或自行手推 expected output；test_run 不在 qjudge_coding 裡。
6. 驗證後用 qjudge_coding(action="update") 把新的 test_cases 寫回題目；不可假裝已寫入。

寫入核准（HITL）：
下列工具的寫入類 action 會自動中斷等核准，直接呼叫即可：
- qjudge_grading：grade / batch_grade / ungrade
  （唯讀：list_answers / question_detail / dashboard）
- qjudge_coding：create / update / delete / import_from_bank / update_score
  （唯讀：list / get；test_run 不在此工具，執行程式碼請用 qjudge_code_runner）
- qjudge_exam：create / update / delete / reorder / import_from_bank / batch_create
  （唯讀：list / get）
- qjudge_bank：create / update / delete / reorder / import_from_bank / batch_create

不要自行加「請確認」這類開場。使用者拒絕時工具會回傳 error ToolMessage，
請據此調整回覆，不要重試相同寫入。
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

    async def delete_thread(self, thread_id: str) -> None:
        """Delete all checkpoint state for a thread (used to recover broken sessions)."""
        if self._checkpointer is None:
            raise RuntimeError("Checkpointer not initialized")
        await self._checkpointer.adelete_thread(thread_id)
        logger.info("Deleted LangGraph checkpoint for thread %s", thread_id)

    def _build_agent(
        self,
        model_id: str,
        system_prompt: str | None,
        tools: list[Any],
        event_queue: asyncio.Queue | None = None,
    ):
        """Build a DeepAgent with tools.

        Keeps create_agent (not create_deep_agent) to avoid the default
        SubAgentMiddleware / SummarizationMiddleware overhead.

        Middleware stack (in order):
          1. TodoListMiddleware             — task planning, ~700 tokens
          2. FilesystemMiddleware           — auto-evicts tool results >20k tokens to StateBackend
          3. _SafeSummarizationMiddleware   — compresses history at 85% context; patches deepagents
                                             0.5.3 bug where _partition_messages didn't call
                                             _find_safe_cutoff_point (langchain#34282)
          3. SummarizationMiddleware   — compresses conversation at 85% context window,
                                        prevents long sessions from hitting DeepSeek R1's 131k limit
        """
        model = ModelFactory.create_model(model_id=model_id)
        summarization_model = ModelFactory.create_model(model_id=_SUMMARIZATION_MODEL_ID)
        prompt = system_prompt or _DEFAULT_SYSTEM_PROMPT
        backend = StateBackend()

        agent = create_agent(
            model=model,
            tools=tools,
            system_prompt=prompt,
            middleware=[
                TodoListMiddleware(),
                FilesystemMiddleware(backend=backend),
                # Trigger at ~95k local tokens ≈ ~108k actual tokens (DeepSeek R1 limit: 131k).
                # count_tokens_approximately underestimates by ~12%, so 95k local ≈ 108k actual,
                # giving enough headroom for the summarization LLM call output before hitting the limit.
                _SafeSummarizationMiddleware(model=summarization_model, backend=backend, event_queue=event_queue, trigger=("tokens", 95000)),
                # Must be the last middleware: inspects the final tool_calls produced by
                # the model turn and pauses execution for human approval on write actions.
                ActionAwareHITLMiddleware(
                    write_actions=_WRITE_ACTIONS,
                    allowed_decisions=["approve", "reject"],
                ),
            ],
            checkpointer=self._checkpointer,
        )
        return agent

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

        async def _run_stream():
            nonlocal total_input_tokens, total_output_tokens
            async for event in agent.astream_events(
                agent_input,
                config=config,
                version="v2",
            ):
                # Drain side-channel events (e.g. summarization_started) before
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

        try:
            try:
                async for sse_dict in _run_stream():
                    yield sse_dict
            except Exception as exc:
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
        async with MCPToolProvider(
            server_url=self._mcp_server_url,
            authorization_header=(
                request_context.user_authorization if request_context else None
            ),
        ) as tool_provider:
            tools = await tool_provider.load_tools()
            agent = self._build_agent(model_id, system_prompt, tools, event_queue=event_queue)

            config = {
                "configurable": {"thread_id": thread_id},
                "metadata": {"thread_id": thread_id, "run_id": run_id},
                "recursion_limit": _AGENT_RECURSION_LIMIT,
            }

            agent_input: dict[str, Any] = {"messages": messages}

            async for sse_dict in self._stream_events(
                agent, agent_input, config, run_id, thread_id, model_id, event_queue=event_queue
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
        async with MCPToolProvider(
            server_url=self._mcp_server_url,
            authorization_header=(
                request_context.user_authorization if request_context else None
            ),
        ) as tool_provider:
            tools = await tool_provider.load_tools()
            agent = self._build_agent(model_id, system_prompt, tools, event_queue=event_queue)

            config = {
                "configurable": {"thread_id": thread_id},
                "metadata": {"thread_id": thread_id, "run_id": run_id},
                "recursion_limit": _AGENT_RECURSION_LIMIT,
            }

            resume_value = Command(resume={"decisions": [{"type": decision}]})

            async for sse_dict in self._stream_events(
                agent, resume_value, config, run_id, thread_id, model_id, event_queue=event_queue
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
