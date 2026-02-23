#!/usr/bin/env python3
"""簡單測試客戶端 - 只用於驗證 message logging"""

import asyncio
import json
import sys

import httpx

BASE_URL = "http://localhost:8001"


class SimpleChatClient:
    """簡單聊天客戶端 - 無狀態管理"""

    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.user_api_key = None

    async def chat(self, message: str) -> bool:
        """發送一條訊息並接收回應。

        Args:
            message: 使用者訊息

        Returns:
            True 如果成功，False 如果出錯
        """
        if not message.strip():
            return True

        url = f"{self.base_url}/api/chat/stream"

        payload = {"conversation": [{"role": "user", "content": message}]}
        if self.user_api_key:
            payload["user_api_key"] = self.user_api_key

        print("\n" + "=" * 80)
        print(f"📤 發送訊息: {message}")
        print("=" * 80)

        # 🔍 DEBUG: 打印發送的 payload
        print("\n[DEBUG] 發送 Payload:")
        payload_copy = payload.copy()
        if "user_api_key" in payload_copy:
            key = payload_copy["user_api_key"]
            payload_copy["user_api_key"] = f"{key[:10]}...{key[-10:]}" if len(key) > 20 else "***"
        print(json.dumps(payload_copy, indent=2, ensure_ascii=False))
        print("-" * 80)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        error_text = await response.atext()
                        print(f"❌ HTTP {response.status_code}: {error_text}")
                        return False

                    print("\n📥 接收回應:")
                    print("-" * 80)

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue

                        try:
                            data = json.loads(line[6:])
                            event_type = data.get("type")

                            # 🔍 DEBUG: 打印所有收到的 message
                            print(f"\n[DEBUG] 事件類型: {event_type}")
                            print(f"[DEBUG] 完整數據:")
                            print(json.dumps(data, indent=2, ensure_ascii=False))
                            print("-" * 80)

                            # 處理不同類型的事件
                            if event_type == "delta":
                                content = data.get("content", "")
                                session_id = data.get("session_id")
                                print(f"[DELTA][Session: {session_id}] {content}", end="", flush=True)

                            elif event_type == "session":
                                session_id = data.get("session_id")
                                print(f"[SESSION] Session ID: {session_id}")

                            elif event_type == "tool_use":
                                tool_name = data.get("tool_name")
                                tool_input = data.get("tool_input", {})
                                tool_id = data.get("tool_id")
                                print(f"\n[TOOL USE] 🔧 {tool_name} (ID: {tool_id})")
                                print(f"  Input: {json.dumps(tool_input, indent=2, ensure_ascii=False)}")

                            elif event_type == "tool_result":
                                tool_id = data.get("tool_id")
                                content = data.get("content", "")
                                is_error = data.get("is_error", False)
                                status = "❌ ERROR" if is_error else "✅ SUCCESS"
                                print(f"\n[TOOL RESULT] {status} (ID: {tool_id})")
                                print(f"  Result: {content[:200]}{'...' if len(content) > 200 else ''}")

                            elif event_type == "done":
                                session_id = data.get("session_id")
                                print(f"\n[DONE] 對話完成 (Session: {session_id})")

                            elif event_type == "error":
                                error_content = data.get("content") or "未知錯誤"
                                print(f"\n[ERROR] {error_content}")
                                return False

                            elif event_type == "usage":
                                usage = data.get("usage", {})
                                print(f"\n[USAGE] 用量統計:")
                                print(f"  - Input Tokens:  {usage.get('input_tokens', 0)}")
                                print(f"  - Output Tokens: {usage.get('output_tokens', 0)}")
                                print(f"  - Cost (cents):  {usage.get('cost_cents', 0)}")
                                print(f"  - Model:         {usage.get('model', 'unknown')}")

                            else:
                                print(f"\n[UNKNOWN] 未知事件類型: {event_type}")

                        except json.JSONDecodeError as e:
                            print(f"[ERROR] JSON 解析失敗: {e}")
                            print(f"[ERROR] 原始行: {line}")

            print("\n" + "=" * 80)
            print("✅ 完成")
            print("=" * 80)
            return True

        except Exception as e:
            print(f"\n❌ 連線錯誤: {type(e).__name__}: {e}")
            return False

    async def interactive_loop(self):
        """交互式對話迴圈"""
        print("=" * 80)
        print("🤖 QJudge AI Service 簡化測試客戶端")
        print("=" * 80)
        print("\n指令:")
        print("  /apikey <key>  - 設定 user API key")
        print("  /exit          - 結束程序")
        print("  (其他輸入)     - 傳送訊息給 AI")
        print()

        while True:
            try:
                user_input = input("> ").strip()

                if not user_input:
                    continue

                # 處理指令
                if user_input.startswith("/"):
                    if not await self.handle_command(user_input):
                        break
                else:
                    # 發送訊息
                    await self.chat(user_input)

            except KeyboardInterrupt:
                print("\n\n👋 再見!")
                break
            except EOFError:
                break

    async def handle_command(self, command: str) -> bool:
        """處理使用者指令。

        Returns:
            False 如果應該退出，True 繼續
        """
        parts = command.split(maxsplit=1)
        cmd = parts[0].lower()

        if cmd == "/apikey":
            if len(parts) < 2:
                print("用法: /apikey <api-key>")
                print("範例: /apikey sk-ant-api03-...")
            else:
                self.user_api_key = parts[1]
                masked_key = f"{self.user_api_key[:10]}...{self.user_api_key[-10:]}" if len(self.user_api_key) > 20 else "***"
                print(f"✓ User API Key 已設定: {masked_key}")

        elif cmd == "/exit":
            return False

        else:
            print(f"❌ 未知指令: {cmd}")
            print('可用指令: /apikey, /exit')

        return True


async def main():
    """主程序"""
    client = SimpleChatClient(BASE_URL)

    # 檢查命令列參數
    if len(sys.argv) > 1:
        if sys.argv[1] in ["-h", "--help"]:
            print("使用方式:")
            print(f"  {sys.argv[0]}          - 交互式模式")
            print(f"  {sys.argv[0]} <message> - 發送單條訊息")
            sys.exit(0)

        # 非交互式模式：單條訊息
        message = sys.argv[1]
        success = await client.chat(message)
        sys.exit(0 if success else 1)

    # 交互式模式
    await client.interactive_loop()


if __name__ == "__main__":
    asyncio.run(main())
