"""Claude Agent SDK service wrapper."""

import logging
from functools import lru_cache
from typing import AsyncGenerator, Optional

from config import get_settings
from models.schemas import ChatMessage, MessageRole

logger = logging.getLogger(__name__)


class ClaudeService:
    """Service for interacting with Claude via claude-agent-sdk."""

    # 定價表（每百萬 tokens 的 USD）
    PRICING = {
        'haiku': (0.80, 4.00),      # (input, output)
        'sonnet': (3.00, 15.00),
        'opus': (15.00, 75.00),
    }

    def __init__(self, model: str = "sonnet", max_turns: int = 10):
        """Initialize the Claude service.

        Args:
            model: The Claude model to use
            max_turns: Maximum conversation turns
        """
        self.model = model
        self.max_turns = max_turns

    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> int:
        """計算費用（美分）

        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            model: Model name

        Returns:
            Cost in cents (rounded)
        """
        pricing = self.PRICING.get(model, self.PRICING['haiku'])
        input_price, output_price = pricing

        cost_usd = (
            (input_tokens / 1_000_000) * input_price +
            (output_tokens / 1_000_000) * output_price
        )
        return int(round(cost_usd * 100))

    async def chat_stream(
        self,
        conversation: list[ChatMessage],
        system_prompt: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> AsyncGenerator[dict, None]:
        """Send a query and stream the response.

        Args:
            conversation: List of conversation messages
            system_prompt: Optional system prompt
            session_id: Optional session ID to resume

        Yields:
            Dictionary events with keys: type, content, session_id, usage
        """

        try:
            from claude_agent_sdk import ClaudeAgentOptions, query
            from claude_agent_sdk.types import (
                AssistantMessage,
                ResultMessage,
                SystemMessage,
                ToolUseBlock,
                ToolResultBlock,
            )
        except ImportError as e:
            error_msg = (
                "Claude Agent SDK 未安裝。"
                "請執行: pip install -r requirements/base.txt 或 pip install claude-agent-sdk"
            )
            logger.error(f"claude-agent-sdk not installed: {e}")
            yield {
                "type": "error",
                "content": error_msg,
            }
            return

        # Build prompt: get the last user message
        prompt = ""
        for msg in reversed(conversation):
            if msg.role == MessageRole.USER:
                prompt = msg.content
                break

        if not prompt:
            yield {
                "type": "error",
                "content": "No user message found in conversation",
            }
            return

        logger.info(f"Processing prompt: {prompt[:100]}...")
        if system_prompt:
            logger.debug(f"System prompt length: {len(system_prompt)} chars")

        # SDK options
        # Note: cwd should point to the agent directory which contains .claude/skills
        # In Docker: /app/agent
        # Locally: ./agent (relative to ai-service root)
        import os
        agent_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agent")

        options = ClaudeAgentOptions(
            cwd=agent_dir,
            max_turns=self.max_turns,
            allowed_tools=["Skill"],
            system_prompt=system_prompt,
            model=self.model,
            # Resume parameter: use it to restore previous session context
            # If session_id is provided, use resume to continue the previous conversation
            # If session_id is None, SDK will create a new session automatically
            resume=session_id if session_id else None,
            setting_sources=["user", "project"],
        )

        logger.debug(f"Claude Agent working directory: {agent_dir}")

        current_session_id = session_id
        query_gen = None

        try:
            logger.info(f"Calling Claude with model: {self.model}, session: {session_id}")
            query_gen = query(prompt=prompt, options=options)

            async for message in query_gen:
                # 1. SystemMessage - extract session ID
                if isinstance(message, SystemMessage):
                    if hasattr(message, "subtype") and message.subtype == "init":
                        current_session_id = message.data.get("session_id")
                        logger.info(f"Session initialized: {current_session_id}")
                        yield {
                            "type": "session",
                            "session_id": current_session_id,
                        }

                # 2. AssistantMessage - extract text and tool blocks
                elif isinstance(message, AssistantMessage):
                    for block in message.content:
                        # 2a. Text block
                        if hasattr(block, "text"):
                            text = getattr(block, "text", "")
                            if text:
                                logger.debug(f"Delta: {text[:50]}...")
                                yield {
                                    "type": "delta",
                                    "content": text,
                                    "session_id": current_session_id,
                                }

                        # 2b. ToolUseBlock - tool 開始執行
                        elif isinstance(block, ToolUseBlock):
                            tool_name = getattr(block, 'name', 'unknown')
                            tool_input = getattr(block, 'input', {})
                            tool_id = getattr(block, 'id', None)

                            logger.info(f"Tool use: {tool_name} (id: {tool_id})")
                            yield {
                                "type": "tool_use",
                                "tool_name": tool_name,
                                "tool_input": tool_input,
                                "tool_id": tool_id,
                                "session_id": current_session_id,
                            }

                        # 2c. ToolResultBlock - tool 執行結果
                        elif isinstance(block, ToolResultBlock):
                            tool_id = getattr(block, 'tool_use_id', None)
                            content_blocks = getattr(block, 'content', [])
                            is_error = getattr(block, 'is_error', False)

                            # 提取 content (可能是字串或 block 列表)
                            if isinstance(content_blocks, str):
                                content = content_blocks
                            elif isinstance(content_blocks, list):
                                # 提取所有 text block 的內容
                                content = " ".join(
                                    getattr(cb, 'text', '')
                                    for cb in content_blocks
                                    if hasattr(cb, 'text')
                                )
                            else:
                                content = str(content_blocks)

                            logger.info(f"Tool result for {tool_id}: {'error' if is_error else 'success'}")
                            yield {
                                "type": "tool_result",
                                "tool_id": tool_id,
                                "content": content,
                                "is_error": is_error,
                                "session_id": current_session_id,
                            }

                # 3. ResultMessage - completion
                elif isinstance(message, ResultMessage):
                    logger.info(f"Query completed with session: {current_session_id}")

                    # 提取 usage 數據
                    if hasattr(message, 'usage') and message.usage:
                        usage = message.usage
                        input_tokens = usage.get('input_tokens', 0)
                        output_tokens = usage.get('output_tokens', 0)
                        cost_cents = self._calculate_cost(input_tokens, output_tokens, self.model)

                        logger.info(f"Usage: {input_tokens} input + {output_tokens} output tokens, ${cost_cents/100:.4f}")

                        # 返回 usage event
                        yield {
                            "type": "usage",
                            "usage": {
                                "input_tokens": input_tokens,
                                "output_tokens": output_tokens,
                                "cost_cents": cost_cents,
                                "model": self.model,
                            }
                        }

                    yield {
                        "type": "done",
                        "session_id": current_session_id,
                    }

        except Exception as e:
            error_msg = str(e)
            logger.exception(f"Error during Claude query: {e}")

            # 提供更有用的錯誤訊息
            if "Command failed" in error_msg or "exit code" in error_msg:
                error_msg = (
                    f"Claude CLI 執行失敗。可能原因："
                    f"1. Claude Code 未正確安裝"
                    f"2. Skill 檔案格式有誤"
                    f"3. 系統 prompt 包含不支援的格式\n"
                    f"詳細錯誤: {error_msg}"
                )
            elif "JSON" in error_msg or "parsing" in error_msg.lower():
                error_msg = f"SDK 訊息格式錯誤。詳細: {error_msg}"

            yield {
                "type": "error",
                "content": error_msg if error_msg else "未知錯誤，請檢查日誌",
            }
        finally:
            if query_gen:
                try:
                    await query_gen.aclose()
                except Exception:
                    pass


@lru_cache
def get_claude_service() -> ClaudeService:
    """Get cached Claude service instance."""
    settings = get_settings()
    return ClaudeService(
        model=settings.claude_model,
        max_turns=settings.claude_max_turns,
    )
