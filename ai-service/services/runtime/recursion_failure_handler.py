"""Recursion-failure handling and summary generation for agent runs."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from langchain_core.messages import AnyMessage
from langgraph.errors import GraphRecursionError

from services.model_factory import ModelFactory

_DEFAULT_RECURSION_SUMMARY_MODEL_ID = "openai-nano"
_DEFAULT_RECURSION_TAIL_MESSAGES = 12


class RecursionFailureHandler:
    """Detect recursion failures and produce user-facing interruption summaries."""

    def __init__(
        self,
        *,
        summary_model_id: str = _DEFAULT_RECURSION_SUMMARY_MODEL_ID,
        tail_messages: int = _DEFAULT_RECURSION_TAIL_MESSAGES,
        model_factory: Callable[[str], Any] | None = None,
    ) -> None:
        self._summary_model_id = summary_model_id
        self._tail_messages = tail_messages
        self._model_factory = model_factory or ModelFactory.create_model

    @staticmethod
    def is_graph_recursion_error(exc: BaseException) -> bool:
        if isinstance(exc, GraphRecursionError):
            return True
        nested = getattr(exc, "exceptions", None)
        if nested:
            return any(isinstance(item, GraphRecursionError) for item in nested)
        return False

    @staticmethod
    def format_message_for_summary(message: AnyMessage) -> str:
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

    @staticmethod
    def build_recursion_summary_prompt(transcript: str) -> str:
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
    def fallback_recursion_summary() -> str:
        return (
            "我剛剛在執行任務時重複嘗試過多次，暫時卡住了。"
            "目前無法從現有資訊突破，請補充更明確的指示或修正條件。"
            "請調整提示後再送出，或直接回覆「繼續任務」。"
        )

    async def summarize_interruption(
        self,
        *,
        agent: Any,
        config: dict[str, Any],
    ) -> str:
        state = await agent.aget_state(config)
        messages = state.values.get("messages", []) if state else []
        if not isinstance(messages, list) or not messages:
            return self.fallback_recursion_summary()

        tail = messages[-self._tail_messages:]
        lines = [self.format_message_for_summary(msg) for msg in tail]
        transcript = "\n".join(lines)
        if len(transcript) > 6000:
            transcript = transcript[-6000:]

        summary_model = self._model_factory(self._summary_model_id)
        summary_prompt = self.build_recursion_summary_prompt(transcript)
        response = await summary_model.ainvoke(summary_prompt)
        content = getattr(response, "content", "")
        if isinstance(content, list):
            content = " ".join(str(part) for part in content)
        summary = str(content).strip()
        return summary or self.fallback_recursion_summary()
