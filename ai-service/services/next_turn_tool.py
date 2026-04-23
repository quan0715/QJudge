"""LangChain tool: suggest next-turn actions to the user.

After completing a task, the agent can call ``suggest_next_actions`` to
provide clickable quick-action buttons in the chat UI.  Unlike ``ask_user``,
this tool does **not** interrupt the agent — it returns immediately so the
agent can finish normally.  The options are surfaced to the frontend via
``tool_call_finished`` metadata and the ``run_completed`` event.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)


def build_suggest_next_actions_tool() -> StructuredTool:
    """Return a ``StructuredTool`` that emits next-turn option metadata."""

    async def _suggest_next_actions(
        options: list[dict[str, str]],
    ) -> dict[str, Any]:
        """Suggest follow-up actions the user can take after this turn.

        Parameters
        ----------
        options:
            A list of option objects, each with:
            - ``label``: Short button text shown to the user (e.g. "繼續批改").
            - ``message``: The full message sent on behalf of the user when
              they click the button.
        """
        validated: list[dict[str, str]] = []
        for opt in options:
            if isinstance(opt, dict) and "label" in opt and "message" in opt:
                validated.append({
                    "label": str(opt["label"]),
                    "message": str(opt["message"]),
                })
            else:
                logger.warning("Invalid next-turn option ignored: %s", opt)

        logger.info("suggest_next_actions: %d options", len(validated))
        return {"next_turn_options": validated}

    return StructuredTool.from_function(
        coroutine=_suggest_next_actions,
        name="suggest_next_actions",
        description=(
            "Suggest follow-up actions the user can take after this turn. "
            "Call this at the END of your response when there are obvious "
            "next steps the user might want. Each option has a 'label' "
            "(button text) and 'message' (what gets sent as a new user message "
            "when clicked). Do not use this to ask questions — use ask_user instead."
        ),
    )
