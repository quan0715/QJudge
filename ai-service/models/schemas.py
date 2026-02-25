"""Pydantic schemas for the v2 AI Service API contract."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    """Role of a message in conversation."""
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessage(BaseModel):
    """A single message in the conversation."""
    role: MessageRole
    content: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Conversation message content",
    )


class ChatRequest(BaseModel):
    """Request body for POST /api/chat/stream (v2 contract)."""
    content: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="User message content",
    )
    model_id: str = Field(
        default="claude-sonnet",
        pattern=r"^claude-(haiku|sonnet|opus)$",
        description="Canonical model ID",
    )
    api_key_override: str | None = Field(
        default=None,
        description="Single-use API key override (never persisted)",
    )
    system_prompt: str | None = Field(
        default=None,
        max_length=10000,
        description="Optional system prompt override",
    )
    skill: str | None = Field(
        default=None,
        max_length=100,
        pattern=r"^[a-z0-9][a-z0-9-]{0,99}$",
        description="Optional skill name",
    )
    thread_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="DeepAgent thread ID for resume (None = new thread)",
    )
    session_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
        description="Backend session ID (for write tool binding)",
    )
    user_id: int | None = Field(
        default=None,
        description="Backend user ID (for write tool binding)",
    )
    conversation: list[ChatMessage] = Field(
        default_factory=list,
        max_length=50,
        description="Conversation history for context",
    )


class ResumeRequest(BaseModel):
    """Request body for POST /api/chat/resume."""
    thread_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="DeepAgent thread ID to resume",
    )
    decision: str = Field(
        ...,
        pattern=r"^(approve|reject)$",
        description="User decision: 'approve' or 'reject'",
    )
    api_key_override: str | None = Field(
        default=None,
        description="Single-use API key override (never persisted)",
    )
    session_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
        description="Backend session ID (for write tool binding on resume)",
    )
    user_id: int | None = Field(
        default=None,
        description="Backend user ID (for write tool binding on resume)",
    )


class ModelInfo(BaseModel):
    """Model information for GET /api/models."""
    model_id: str
    display_name: str
    description: str
    is_default: bool


class ModelsResponse(BaseModel):
    """Response for model list endpoint."""
    models: list[ModelInfo]


class HealthResponse(BaseModel):
    """Response for health check endpoint."""
    status: str
    version: str = "2.0.0"
    checkpoint_db: str = "unknown"
