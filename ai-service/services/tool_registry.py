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

    @tool
    async def get_test_cases(problem_id: int) -> dict[str, Any]:
        """Load ALL test cases for a problem, including hidden ones.

        Returns every test case with id, input_data, output_data,
        is_sample, is_hidden, score, and order fields.

        Args:
            problem_id: The ID of the problem.
        """
        logger.info("get_test_cases problem_id=%s", problem_id)
        return await tool_client.get_test_cases(problem_id=problem_id)

    @tool
    async def run_code(
        code: str,
        language: str,
        test_cases: list[dict[str, str]],
        time_limit: int = 1000,
        memory_limit: int = 128,
    ) -> dict[str, Any]:
        """Execute code in a sandbox and check against test cases.

        Runs the given code against each test case sequentially. Stops on
        compilation error (CE). Returns per-case results and a summary.

        Max 20 test cases per call, time_limit max 10000ms, code max 100KB.

        Args:
            code: Source code to execute.
            language: Programming language ("cpp", "c++", "python", "py").
            test_cases: List of {"input": "...", "expected_output": "..."}.
            time_limit: Time limit in milliseconds (default 1000).
            memory_limit: Memory limit in MB (default 128).
        """
        logger.info("run_code language=%s cases=%d", language, len(test_cases))
        return await tool_client.run_code(
            code=code,
            language=language,
            test_cases=test_cases,
            time_limit=time_limit,
            memory_limit=memory_limit,
        )

    return [load_problem_context, get_test_cases, run_code]


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
            payload: Full problem data. Required structure:
                - title (str): Problem title.
                - difficulty (str): "easy", "medium", or "hard".
                - time_limit (int): Time limit in ms (default 1000).
                - memory_limit (int): Memory limit in MB (default 128).
                - translations (list, REQUIRED): At least one translation object with:
                    - language (str): "zh-TW" or "en".
                    - title (str): Translated title.
                    - description (str): Problem description.
                    - input_description (str): Input format description.
                    - output_description (str): Output format description.
                    - hint (str, optional): Hint text.
                - test_cases (list, optional): Test case objects with
                  input_data, output_data, is_sample, is_hidden, score, order.
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

    @tool
    async def prepare_test_cases_update(
        target_problem_id: int,
        test_cases: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Prepare a full replacement of all test cases for a problem.

        Stages a 'patch' action that replaces the entire test_cases array.
        Each test case must have: input, output, is_sample, is_hidden, score, order.

        This does NOT commit — you must call commit_problem_action afterward.

        Args:
            target_problem_id: The problem to update test cases for.
            test_cases: Full list of test case objects to replace existing ones.
        """
        logger.info(
            "prepare_test_cases_update session=%s user=%s problem=%s cases=%d",
            session_id, user_id, target_problem_id, len(test_cases),
        )

        # Build preview summary
        sample_count = sum(1 for tc in test_cases if tc.get("is_sample"))
        hidden_count = sum(1 for tc in test_cases if tc.get("is_hidden"))
        preview = {
            "action": "replace_all_test_cases",
            "target_problem_id": target_problem_id,
            "total": len(test_cases),
            "sample_count": sample_count,
            "hidden_count": hidden_count,
            "test_cases_summary": [
                {
                    "order": tc.get("order", i),
                    "is_sample": tc.get("is_sample", False),
                    "is_hidden": tc.get("is_hidden", False),
                    "input_preview": tc.get("input", "")[:100],
                    "output_preview": tc.get("output", "")[:100],
                }
                for i, tc in enumerate(test_cases)
            ],
        }

        json_patch_ops = [
            {"op": "replace", "path": "/test_cases", "value": test_cases},
        ]

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

    return [prepare_problem_create, prepare_problem_patch, commit_problem_action, prepare_test_cases_update]
