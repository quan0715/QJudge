"""HTTP Client for AI Service.

This module provides an HTTP client to communicate with the AI Service container.
It replaces direct usage of claude-agent-sdk in the Django backend.
"""

import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


class SessionMode(str, Enum):
    """Session handling mode."""

    NEW = "new"
    RESUME = "resume"
    AUTO = "auto"


@dataclass
class SessionContext:
    """Session context for state management."""

    claude_session_id: Optional[str] = None
    current_stage: Optional[str] = None
    current_skill: Optional[str] = None
    gate_data: Optional[dict] = None
    custom_data: Optional[dict] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for API request."""
        return {
            "claude_session_id": self.claude_session_id,
            "current_stage": self.current_stage,
            "current_skill": self.current_skill,
            "gate_data": self.gate_data,
            "custom_data": self.custom_data,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "SessionContext":
        """Create from dictionary."""
        return cls(
            claude_session_id=data.get("claude_session_id"),
            current_stage=data.get("current_stage"),
            current_skill=data.get("current_skill"),
            gate_data=data.get("gate_data"),
            custom_data=data.get("custom_data"),
        )


@dataclass
class ChatResponse:
    """Response from AI Service chat endpoint."""

    content: str
    session_context: SessionContext
    metadata: dict = field(default_factory=dict)

    # Legacy fields
    claude_session_id: Optional[str] = None
    stage: Optional[str] = None


class AIServiceClient:
    """HTTP client for communicating with AI Service."""

    def __init__(self, base_url: Optional[str] = None, timeout: float = 120.0):
        """Initialize the AI Service client.

        Args:
            base_url: Base URL for AI Service (default from settings)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url or getattr(
            settings, "AI_SERVICE_URL", "http://ai-service:8001"
        )
        self.timeout = timeout

    def _auth_headers(self) -> dict[str, str]:
        token = getattr(settings, "AI_SERVICE_INTERNAL_TOKEN", "").strip()
        if not token:
            raise AIServiceError("AI_SERVICE_INTERNAL_TOKEN is not configured")
        return {"X-AI-Internal-Token": token}

    def _build_request_payload(
        self,
        conversation: list[dict],
        system_prompt: Optional[str] = None,
        skill: Optional[str] = None,
        session_mode: SessionMode = SessionMode.AUTO,
        session_context: Optional[SessionContext] = None,
        claude_session_id: Optional[str] = None,
        max_tokens: int = 4096,
        model_override: Optional[str] = None,
        reference: Optional[dict] = None,
        user_api_key: Optional[str] = None,
    ) -> dict:
        """Build request payload for AI Service.

        Args:
            conversation: List of message dicts with 'role' and 'content'
            system_prompt: Optional system prompt override
            skill: Optional skill name to use
            session_mode: How to handle session (new/resume/auto)
            session_context: Full session context (preferred)
            claude_session_id: Legacy session ID field
            max_tokens: Maximum response tokens
            model_override: Optional model override
            reference: Optional problem reference context
            user_api_key: User's Anthropic API Key

        Returns:
            Request payload dictionary
        """
        payload = {
            "conversation": conversation,
            "session_mode": session_mode.value,
            "max_tokens": max_tokens,
        }

        if system_prompt:
            payload["system_prompt"] = system_prompt
        if skill:
            payload["skill"] = skill
        if session_context:
            payload["session_context"] = session_context.to_dict()
        if claude_session_id:
            payload["claude_session_id"] = claude_session_id
        if model_override:
            payload["model_override"] = model_override
        if reference:
            payload["reference"] = reference
        if user_api_key:
            payload["user_api_key"] = user_api_key

        return payload

    async def chat(
        self,
        conversation: list[dict],
        system_prompt: Optional[str] = None,
        skill: Optional[str] = None,
        session_mode: SessionMode = SessionMode.AUTO,
        session_context: Optional[SessionContext] = None,
        claude_session_id: Optional[str] = None,
        max_tokens: int = 4096,
        model_override: Optional[str] = None,
        reference: Optional[dict] = None,
        user_api_key: Optional[str] = None,
    ) -> ChatResponse:
        """Send a chat request to AI Service (non-streaming).

        Args:
            conversation: List of message dicts with 'role' and 'content'
            system_prompt: Optional system prompt override
            skill: Optional skill name to use
            session_mode: How to handle session (new/resume/auto)
            session_context: Full session context (preferred)
            claude_session_id: Legacy session ID field
            max_tokens: Maximum response tokens
            model_override: Optional model override
            reference: Optional problem reference context
            user_api_key: User's Anthropic API Key

        Returns:
            ChatResponse with content and updated session context
        """
        payload = self._build_request_payload(
            conversation=conversation,
            system_prompt=system_prompt,
            skill=skill,
            session_mode=session_mode,
            session_context=session_context,
            claude_session_id=claude_session_id,
            max_tokens=max_tokens,
            model_override=model_override,
            reference=reference,
            user_api_key=user_api_key,
        )

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json=payload,
                    headers=self._auth_headers(),
                )
                response.raise_for_status()
                data = response.json()

                # Parse session context from response
                ctx_data = data.get("session_context", {})
                response_context = SessionContext.from_dict(ctx_data)

                return ChatResponse(
                    content=data.get("content", ""),
                    session_context=response_context,
                    metadata=data.get("metadata", {}),
                    claude_session_id=data.get("claude_session_id"),
                    stage=data.get("stage"),
                )

            except httpx.HTTPStatusError as e:
                logger.error(f"AI Service HTTP error: {e.response.status_code}")
                error_detail = "AI Service error"
                try:
                    error_data = e.response.json()
                    error_detail = error_data.get("detail", error_detail)
                except Exception:
                    pass
                raise AIServiceError(error_detail) from e

            except httpx.RequestError as e:
                logger.error(f"AI Service request error: {e}")
                raise AIServiceError(f"Cannot connect to AI Service: {e}") from e

    async def health_check(self) -> dict:
        """Check AI Service health status.

        Returns:
            Health status dict
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/health",
                    headers=self._auth_headers(),
                )
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"AI Service health check failed: {e}")
                return {"status": "unhealthy", "error": str(e)}

    async def list_skills(self) -> list[dict]:
        """List available skills from AI Service.

        Returns:
            List of skill info dicts
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/api/skills",
                    headers=self._auth_headers(),
                )
                response.raise_for_status()
                data = response.json()
                return data.get("skills", [])
            except Exception as e:
                logger.error(f"Failed to list skills: {e}")
                return []

    async def submit_user_answer(
        self, request_id: str, answers: dict[str, str]
    ) -> dict:
        """Submit user's answer to a pending AskUserQuestion request.

        Args:
            request_id: The request ID to answer
            answers: Mapping of question text to selected option label(s)

        Returns:
            Response dict with success status
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/chat/answer",
                    json={"request_id": request_id, "answers": answers},
                    headers=self._auth_headers(),
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Failed to submit user answer: {e.response.status_code}")
                error_detail = "Failed to submit answer"
                try:
                    error_data = e.response.json()
                    error_detail = error_data.get("detail", error_detail)
                except Exception:
                    pass
                raise AIServiceError(error_detail) from e
            except Exception as e:
                logger.error(f"Error submitting user answer: {e}")
                raise AIServiceError(f"Cannot connect to AI Service: {e}") from e


class AIServiceError(Exception):
    """Exception raised for AI Service errors."""

    pass


# Default client instance
_default_client: Optional[AIServiceClient] = None


def get_ai_client() -> AIServiceClient:
    """Get or create the default AI Service client instance."""
    global _default_client
    if _default_client is None:
        _default_client = AIServiceClient()
    return _default_client
