"""LangChain tool: ask the user a clarifying question.

When the agent lacks information to proceed, it can invoke ``ask_user`` to
pause execution (via LangGraph ``interrupt``) and present a question to the
user in the chat UI.  The frontend renders a ``QuestionCard``; the user's
answer is returned as the tool's output when the run resumes.

This tool is session-scoped and does NOT go through the MCP approval
pipeline — it has its own interrupt type (``"ask_user"``) so the backend
and frontend can distinguish it from write-action approvals.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import StructuredTool
from langgraph.types import interrupt

logger = logging.getLogger(__name__)


def build_ask_user_tool() -> StructuredTool:
    """Return a ``StructuredTool`` that pauses the agent to ask the user."""

    async def _ask_user(
        question: str,
        options: list[str] | None = None,
        input_type: str = "text",
    ) -> dict[str, Any]:
        """Pause execution and present a question to the user.

        Parameters
        ----------
        question:
            The question text shown to the user.
        options:
            Optional list of predefined choices (used when *input_type* is
            ``"choice"``).  Ignored when *input_type* is ``"text"``.
        input_type:
            ``"text"`` for free-form input, ``"choice"`` for picking from
            *options*.
        """
        logger.info("ask_user tool invoked: %s", question)

        response = interrupt({
            "type": "ask_user",
            "question": question,
            "options": options or [],
            "input_type": input_type,
        })

        answer = response.get("answer", "") if isinstance(response, dict) else str(response)
        logger.info("ask_user received answer (len=%d)", len(answer))
        return {"answer": answer}

    return StructuredTool.from_function(
        coroutine=_ask_user,
        name="ask_user",
        description=(
            "Pause execution and ask the user a clarifying question. "
            "Use this when you need additional information from the user "
            "before you can proceed. Set input_type to 'choice' and supply "
            "options when the answer must be one of a fixed set."
        ),
    )
