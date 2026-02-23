"""LangChain tool definitions for the QJudge deep agent.

Tools are created via create_read_tools() and create_write_tools() which bind
them to a shared InternalToolClient instance via closure.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import BaseTool, tool

from services.tool_client import InternalToolClient

logger = logging.getLogger(__name__)


def create_read_tools(tool_client: InternalToolClient) -> list[BaseTool]:
    """Return read-only tools (no prepare/commit)."""

    @tool
    async def load_problem_context(problem_id: int) -> dict[str, Any]:
        """Load the full context for an existing problem.

        Returns the problem's metadata, description, constraints, test cases,
        etc. Use this to understand the current state before proposing edits.

        Args:
            problem_id: The ID of the problem to load.
        """
        logger.info("load_problem_context problem_id=%s", problem_id)
        return await tool_client.load_problem_context(problem_id=problem_id)

    return [load_problem_context]


def create_write_tools(
    tool_client: InternalToolClient,
    session_id: str,
    user_id: int,
) -> list[BaseTool]:
    """Return write tools with session_id/user_id bound via closure.

    These tools stage and commit problem mutations.  The agent does NOT need
    to supply session_id or user_id — they are captured at construction time.
    """

    @tool
    async def prepare_problem_create(
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Prepare a new problem creation action.

        Stages a 'create' action on the backend and returns a preview
        with an action_id.  The action is NOT committed yet — you must
        call commit_problem_action after presenting the preview to the user.

        Args:
            payload: Full problem data (title, description, test cases, etc.).
        """
        logger.info("prepare_problem_create session=%s user=%s", session_id, user_id)
        return await tool_client.prepare_action(
            session_id=session_id,
            user_id=user_id,
            action_type="create",
            payload=payload,
        )

    @tool
    async def prepare_problem_patch(
        target_problem_id: int,
        json_patch_ops: list[dict[str, Any]],
        preview: dict[str, Any],
    ) -> dict[str, Any]:
        """Prepare a patch (partial update) for an existing problem.

        Stages a 'patch' action and returns a preview with an action_id.

        Args:
            target_problem_id: The problem to patch.
            json_patch_ops: List of JSON Patch operations (RFC 6902).
            preview: Human-readable preview of the changes.
        """
        logger.info(
            "prepare_problem_patch session=%s user=%s problem=%s",
            session_id, user_id, target_problem_id,
        )
        return await tool_client.prepare_action(
            session_id=session_id,
            user_id=user_id,
            action_type="patch",
            payload={
                "target_problem_id": target_problem_id,
                "json_patch_ops": json_patch_ops,
                "preview": preview,
            },
        )

    @tool
    async def commit_problem_action(action_id: str) -> dict[str, Any]:
        """Commit a previously prepared problem action.

        This tool is gated by human-in-the-loop approval.  When you call it,
        execution will pause and the user will be asked to approve or reject.
        If approved, the action is committed; if rejected, it is skipped.

        Args:
            action_id: The action ID returned by a prepare call.
        """
        logger.info("commit_problem_action action_id=%s", action_id)
        return await tool_client.commit_action(action_id=action_id)

    return [prepare_problem_create, prepare_problem_patch, commit_problem_action]
