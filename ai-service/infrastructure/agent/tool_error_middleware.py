"""Return tool failures to the model instead of failing the whole run.

LangGraph only hands argument-validation errors back to the model. Tools whose
schema is a JSON dict are not validated, so a wrong argument becomes a
``TypeError`` that would end the run; so would any other exception a tool raises.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain.agents.middleware.types import AgentMiddleware, ContextT, StateT
from langchain_core.messages import ToolMessage
from langgraph.errors import GraphBubbleUp

from domain.ports import McpReadinessError

logger = logging.getLogger(__name__)

# Interrupts and run-level MCP failures must still stop the run.
_PROPAGATE = (GraphBubbleUp, McpReadinessError)


def _error_message(request: Any, exc: Exception) -> ToolMessage:
    call = request.tool_call
    logger.warning("Tool %s failed; returning the error to the model: %s", call.get("name"), exc)
    return ToolMessage(
        content=(
            f"Error: {type(exc).__name__}: {exc}\n"
            "Check the tool's arguments against its schema and try again."
        ),
        name=call.get("name"),
        tool_call_id=call["id"],
        status="error",
    )


class ToolErrorFeedbackMiddleware(AgentMiddleware[StateT, ContextT]):
    def wrap_tool_call(self, request: Any, handler: Any) -> Any:
        try:
            return handler(request)
        except _PROPAGATE:
            raise
        except Exception as exc:  # noqa: BLE001 - every other tool failure goes back to the model
            return _error_message(request, exc)

    async def awrap_tool_call(self, request: Any, handler: Any) -> Any:
        try:
            return await handler(request)
        except _PROPAGATE:
            raise
        except Exception as exc:  # noqa: BLE001 - every other tool failure goes back to the model
            return _error_message(request, exc)
