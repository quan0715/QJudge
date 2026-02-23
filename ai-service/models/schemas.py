"""Pydantic schemas for API request/response models."""

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    """Role of a message in conversation."""

    USER = "user"
    ASSISTANT = "assistant"


class ChatMessage(BaseModel):
    """A single message in the conversation."""

    role: MessageRole
    content: str


class ChatRequest(BaseModel):
    """Request body for chat endpoint."""

    conversation: list[ChatMessage] = Field(
        ...,
        description="Conversation history",
        min_length=1,
    )
    system_prompt: Optional[str] = Field(
        default=None,
        description="Optional system prompt override",
    )
    skill: Optional[str] = Field(
        default=None,
        description="Optional skill name to use (e.g., 'parse-problem-request')",
    )
    session_id: Optional[str] = Field(
        default=None,
        description="Claude SDK session ID for resuming context",
    )
    user_api_key: Optional[str] = Field(
        default=None,
        description="User's Anthropic API key (optional for testing)",
    )


class UsageInfo(BaseModel):
    """Usage information for a request."""

    input_tokens: int = Field(..., description="Number of input tokens used")
    output_tokens: int = Field(..., description="Number of output tokens used")
    cost_cents: int = Field(..., description="Cost in cents (USD * 100)")
    model: str = Field(..., description="Model used for the request")


class StreamEvent(BaseModel):
    """SSE event for streaming response.

    Event types:
    - delta: Text content (streaming)
    - session: Session ID information
    - tool_use: Tool execution started
    - tool_result: Tool execution completed
    - done: Completion signal
    - error: Error message
    - usage: Usage information (tokens, cost)
    """

    type: Literal["delta", "session", "tool_use", "tool_result", "done", "error", "usage"]
    content: Optional[str] = Field(default=None, description="Text content for delta/error events")
    session_id: Optional[str] = Field(default=None, description="Session ID for session/done/delta events")
    usage: Optional[UsageInfo] = Field(default=None, description="Usage info for usage events")

    # Tool-related fields
    tool_name: Optional[str] = Field(default=None, description="Tool name for tool_use events")
    tool_input: Optional[dict[str, Any]] = Field(default=None, description="Tool input for tool_use events")
    tool_id: Optional[str] = Field(default=None, description="Tool ID for tool_use/tool_result events")
    is_error: Optional[bool] = Field(default=None, description="Error flag for tool_result events")


class HealthStatus(str, Enum):
    """Health check status."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class HealthResponse(BaseModel):
    """Response for health check endpoint."""

    status: HealthStatus
    claude_api: Literal["connected", "disconnected", "unknown"]
    skills_loaded: int
    version: str
