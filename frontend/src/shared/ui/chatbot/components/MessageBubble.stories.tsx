import type { StoryModule } from "@/shared/types/story.types";
import type { ChatMessage } from "@/core/types/chatbot.types";
import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";

// Mock chat messages for different scenarios
const mockUserMessage: ChatMessage = {
  id: "1",
  role: "user",
  content: "請幫我解決這個演算法問題",
  timestamp: new Date(Date.now() - 60000),
};

const mockAIMessage: ChatMessage = {
  id: "2",
  role: "assistant",
  content: `這是一個經典的動態規劃問題。我們可以：

1. **定義狀態**：dp[i] 表示...
2. **轉移方程**：dp[i] = dp[i-1] + ...
3. **邊界條件**：dp[0] = 1

\`\`\`python
def solution(n):
    dp = [0] * (n + 1)
    dp[0] = 1
    for i in range(1, n + 1):
        dp[i] = dp[i-1] + dp[i-2]
    return dp[n]
\`\`\`

時間複雜度是 O(n)，空間複雜度是 O(n)。`,
  timestamp: new Date(Date.now() - 30000),
};

const mockThinkingMessage: ChatMessage = {
  id: "3",
  role: "assistant",
  content: "",
  timestamp: new Date(),
  isThinking: true,
};

const mockAIMessageWithThinking: ChatMessage = {
  id: "4",
  role: "assistant",
  content: "根據分析，這個解決方案的時間複雜度是 O(n²)。",
  timestamp: new Date(),
  thinkingInfo: {
    thinking:
      "用戶問到時間複雜度。讓我分析一下這個演算法...巢狀迴圈是 O(n²)，內部操作是常數時間。所以總時間複雜度是 O(n²)。",
    signature: "thinking-001",
  },
};

const mockAIMessageWithToolExecution: ChatMessage = {
  id: "5",
  role: "assistant",
  content: "我已經驗證了你的代碼。測試通過了所有用例。",
  timestamp: new Date(),
  toolExecutions: [
    {
      toolName: "RunCode",
      toolCallId: "tool-1",
      inputData: {
        language: "python",
        code: "def solution(n):\n    return n * 2",
      },
      result: "Success: All tests passed",
      isError: false,
      durationMs: 250,
    },
  ],
};

const storyModule: StoryModule<MessageBubbleProps> = {
  meta: {
    title: "shared/ui/chatbot/MessageBubble",
    component: MessageBubble,
    category: "features",
    description: "聊天訊息氣泡組件，支援用戶/AI 訊息、思考過程、工具執行等狀態。",
  },
  stories: [
    {
      name: "User Message",
      description: "用戶訊息 - 右對齊，藍色背景",
      render: () => <MessageBubble message={mockUserMessage} />,
    },
    {
      name: "AI Message",
      description: "AI 回覆訊息 - 左對齊，文件風格，含左邊短線指示",
      render: () => <MessageBubble message={mockAIMessage} />,
    },
    {
      name: "Thinking Status",
      description: "思考中狀態 - 呼吸燈動畫加文字",
      render: () => <MessageBubble message={mockThinkingMessage} />,
    },
    {
      name: "AI Message with Thinking",
      description: "包含思考過程的 AI 訊息 - 可折疊的思考過程",
      render: () => <MessageBubble message={mockAIMessageWithThinking} />,
    },
    {
      name: "AI Message with Tool Execution",
      description: "包含工具執行記錄的 AI 訊息 - 展示代碼運行結果",
      render: () => <MessageBubble message={mockAIMessageWithToolExecution} />,
    },
    {
      name: "Typing Effect",
      description: "訊息流式傳輸中 - 帶有閃爍游標",
      render: () => <MessageBubble message={{ ...mockAIMessage, id: "typing" }} isTyping />,
    },
    {
      name: "Conversation Flow",
      description: "完整的對話流程",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <MessageBubble message={mockUserMessage} />
          <MessageBubble message={mockThinkingMessage} />
          <MessageBubble message={mockAIMessageWithThinking} />
          <MessageBubble message={mockUserMessage} />
          <MessageBubble message={mockAIMessage} />
        </div>
      ),
    },
  ],
};

export default storyModule;
