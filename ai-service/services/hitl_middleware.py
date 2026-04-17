"""Action-aware Human-in-the-loop middleware.

Extends langchain's `HumanInTheLoopMiddleware` pattern with an additional
filter on `tool_call["args"]["action"]`, so only write-class actions on the
QJudge MCP tools (grading/coding/exam/bank) trigger interrupts. Read-only
actions (`list`, `get`, etc.) and non-QJudge tools pass through automatically.

Reference implementation:
  langchain/agents/middleware/human_in_the_loop.py (HumanInTheLoopMiddleware)
"""

from __future__ import annotations

from typing import Any, Iterable, Literal, Mapping

from langchain.agents.middleware.types import (
    AgentMiddleware,
    AgentState,
    ContextT,
    StateT,
)
from langchain_core.messages import AIMessage, ToolCall, ToolMessage
from langgraph.runtime import Runtime
from langgraph.types import interrupt

DecisionType = Literal["approve", "edit", "reject"]


class ActionAwareHITLMiddleware(AgentMiddleware[StateT, ContextT]):
    """Interrupt only when a tool call targets a known write action.

    The middleware inspects the final ``AIMessage.tool_calls`` of each model
    turn. For every call, it skips the interrupt unless both:

    1. ``tool_call["name"]`` is a key of ``write_actions``.
    2. ``tool_call["args"]["action"]`` is in the corresponding set.

    Any call that matches triggers a single ``interrupt()`` whose value
    matches the structure already consumed by the ai-service event adapter
    (``action_requests`` + ``review_configs``).

    Only ``approve`` and ``reject`` decisions are enabled by default to match
    the existing frontend HITLCard. ``edit`` is accepted if explicitly passed
    via ``allowed_decisions`` for future use.
    """

    def __init__(
        self,
        *,
        write_actions: Mapping[str, Iterable[str]],
        allowed_decisions: Iterable[DecisionType] | None = None,
        description_prefix: str = "Tool execution requires approval",
    ) -> None:
        super().__init__()
        self.write_actions: dict[str, frozenset[str]] = {
            name: frozenset(actions) for name, actions in write_actions.items()
        }
        self.allowed_decisions: list[DecisionType] = list(
            allowed_decisions or ("approve", "reject")
        )
        self.description_prefix = description_prefix

    def _needs_interrupt(self, tool_call: ToolCall) -> bool:
        actions = self.write_actions.get(tool_call["name"])
        if actions is None:
            return False
        args = tool_call.get("args") or {}
        return args.get("action") in actions

    def _build_action_request(self, tool_call: ToolCall) -> dict[str, Any]:
        name = tool_call["name"]
        args = tool_call.get("args") or {}
        return {
            "name": name,
            "args": args,
            "description": f"{self.description_prefix}\n\nTool: {name}\nArgs: {args}",
        }

    def _build_review_config(self, tool_call: ToolCall) -> dict[str, Any]:
        return {
            "action_name": tool_call["name"],
            "allowed_decisions": list(self.allowed_decisions),
        }

    def _process_decision(
        self,
        decision: dict[str, Any],
        tool_call: ToolCall,
    ) -> tuple[ToolCall | None, ToolMessage | None]:
        decision_type = decision.get("type")

        if decision_type == "approve" and "approve" in self.allowed_decisions:
            return tool_call, None

        if decision_type == "reject" and "reject" in self.allowed_decisions:
            content = decision.get("message") or (
                f"User rejected the tool call for `{tool_call['name']}` "
                f"with id {tool_call['id']}"
            )
            msg = ToolMessage(
                content=content,
                name=tool_call["name"],
                tool_call_id=tool_call["id"],
                status="error",
            )
            return tool_call, msg

        if decision_type == "edit" and "edit" in self.allowed_decisions:
            edited = decision["edited_action"]
            return (
                ToolCall(
                    type="tool_call",
                    name=edited["name"],
                    args=edited["args"],
                    id=tool_call["id"],
                ),
                None,
            )

        raise ValueError(
            f"Unexpected human decision: {decision!r}. Decision type "
            f"'{decision_type}' is not allowed for tool "
            f"'{tool_call['name']}'. Expected one of {self.allowed_decisions}."
        )

    def after_model(
        self, state: AgentState[Any], runtime: Runtime[ContextT]
    ) -> dict[str, Any] | None:
        messages = state["messages"]
        if not messages:
            return None
        last_ai = next(
            (m for m in reversed(messages) if isinstance(m, AIMessage)), None
        )
        if last_ai is None or not last_ai.tool_calls:
            return None

        action_requests: list[dict[str, Any]] = []
        review_configs: list[dict[str, Any]] = []
        interrupt_indices: list[int] = []

        for idx, tool_call in enumerate(last_ai.tool_calls):
            if self._needs_interrupt(tool_call):
                action_requests.append(self._build_action_request(tool_call))
                review_configs.append(self._build_review_config(tool_call))
                interrupt_indices.append(idx)

        if not action_requests:
            return None

        hitl_request = {
            "action_requests": action_requests,
            "review_configs": review_configs,
        }
        response = interrupt(hitl_request)
        decisions: list[dict[str, Any]] = list(response["decisions"])

        # Frontend currently sends a single decision; fan it out when the AI
        # issued multiple write tool_calls in one turn so approve/reject
        # applies uniformly.
        if len(decisions) == 1 and len(interrupt_indices) > 1:
            decisions = decisions * len(interrupt_indices)

        if len(decisions) != len(interrupt_indices):
            raise ValueError(
                f"Number of human decisions ({len(decisions)}) does not match "
                f"number of hanging tool calls ({len(interrupt_indices)})."
            )

        revised_tool_calls: list[ToolCall] = []
        artificial_tool_messages: list[ToolMessage] = []
        decision_idx = 0

        for idx, tool_call in enumerate(last_ai.tool_calls):
            if idx in interrupt_indices:
                decision = decisions[decision_idx]
                decision_idx += 1
                revised, msg = self._process_decision(decision, tool_call)
                if revised is not None:
                    revised_tool_calls.append(revised)
                if msg is not None:
                    artificial_tool_messages.append(msg)
            else:
                revised_tool_calls.append(tool_call)

        last_ai.tool_calls = revised_tool_calls
        return {"messages": [last_ai, *artificial_tool_messages]}

    async def aafter_model(
        self, state: AgentState[Any], runtime: Runtime[ContextT]
    ) -> dict[str, Any] | None:
        return self.after_model(state, runtime)
