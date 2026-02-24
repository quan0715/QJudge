#!/usr/bin/env python3
"""Simple AI service test client for the v2 SSE contract."""

import asyncio
import json
import os
import sys

import httpx

BASE_URL = "http://localhost:8001"


class SimpleChatClient:
    """Simple chat client for manual local verification."""

    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.user_api_key: str | None = None
        self.internal_token = os.getenv("AI_INTERNAL_TOKEN", "")

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.internal_token:
            headers["X-AI-Internal-Token"] = self.internal_token
        return headers

    async def chat(self, message: str) -> bool:
        if not message.strip():
            return True

        payload: dict[str, object] = {
            "content": message,
            "conversation": [],
        }
        if self.user_api_key:
            payload["api_key_override"] = self.user_api_key

        print(f"\n[send] {message}")

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat/stream",
                    json=payload,
                    headers=self._headers(),
                ) as response:
                    if response.status_code != 200:
                        print(f"[error] HTTP {response.status_code}: {await response.atext()}")
                        return False

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        try:
                            data = json.loads(line[6:])
                        except json.JSONDecodeError as exc:
                            print(f"[error] invalid event json: {exc}")
                            continue

                        event_type = data.get("type", "unknown")
                        if event_type == "agent_message_delta":
                            print(data.get("content", ""), end="", flush=True)
                        elif event_type == "thinking_delta":
                            # Keep client output focused on final assistant text.
                            continue
                        elif event_type == "tool_call_started":
                            print(f"\n[tool:start] {data.get('tool_name')} id={data.get('tool_call_id')}")
                        elif event_type == "tool_call_finished":
                            print(f"\n[tool:end] id={data.get('tool_call_id')} error={data.get('is_error')}")
                        elif event_type == "approval_required":
                            print(f"\n[approval] action_id={data.get('action_id')} type={data.get('action_type')}")
                        elif event_type == "usage_report":
                            print(
                                "\n[usage]"
                                f" in={data.get('input_tokens', 0)}"
                                f" out={data.get('output_tokens', 0)}"
                                f" cost={data.get('cost_cents', 0)}"
                                f" model={data.get('model_used', 'unknown')}"
                            )
                        elif event_type == "run_failed":
                            print(f"\n[failed] {data.get('message', 'unknown error')}")
                            return False
                        elif event_type == "run_completed":
                            print("\n[done]")
                            return True

            return True
        except Exception as exc:  # noqa: BLE001
            print(f"[error] connection failed: {type(exc).__name__}: {exc}")
            return False

    async def interactive_loop(self):
        print("QJudge AI Service test client (v2)")
        print("Commands:")
        print("  /apikey <key>  - set api_key_override")
        print("  /token <token> - set X-AI-Internal-Token")
        print("  /exit          - quit")

        while True:
            try:
                user_input = input("> ").strip()
                if not user_input:
                    continue

                if user_input.startswith("/"):
                    if not self.handle_command(user_input):
                        break
                    continue

                await self.chat(user_input)
            except KeyboardInterrupt:
                print("\nbye")
                break
            except EOFError:
                break

    def handle_command(self, command: str) -> bool:
        parts = command.split(maxsplit=1)
        cmd = parts[0].lower()

        if cmd == "/apikey":
            if len(parts) < 2:
                print("Usage: /apikey <api-key>")
            else:
                self.user_api_key = parts[1]
                print("api_key_override updated")
            return True

        if cmd == "/token":
            if len(parts) < 2:
                print("Usage: /token <internal-token>")
            else:
                self.internal_token = parts[1]
                print("internal token updated")
            return True

        if cmd == "/exit":
            return False

        print("Unknown command. Available: /apikey, /token, /exit")
        return True


async def main():
    client = SimpleChatClient(BASE_URL)

    if len(sys.argv) > 1:
        if sys.argv[1] in ["-h", "--help"]:
            print("Usage:")
            print(f"  {sys.argv[0]}          - interactive mode")
            print(f"  {sys.argv[0]} <msg>    - send one message")
            sys.exit(0)

        ok = await client.chat(sys.argv[1])
        sys.exit(0 if ok else 1)

    await client.interactive_loop()


if __name__ == "__main__":
    asyncio.run(main())
