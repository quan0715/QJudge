import type { ChatMessage, ChatSession, ApprovalRequest, ToolInfo } from "@/core/types/chatbot.types";

// ── Mock Messages ──────────────────────────────────────────────────

export const mockUserMessage: ChatMessage = {
  id: "msg-user-1",
  role: "user",
  content: "列出我的教室",
  timestamp: new Date("2026-04-17T14:00:00"),
};

export const mockAiSimple: ChatMessage = {
  id: "msg-ai-simple",
  role: "assistant",
  content: "您的教室清單（共 3 間）：\n\n1. **搶救 C++ 大作戰**（ID: abc123）\n   - 會員：3 人\n2. **MG14 計算機概論**（ID: def456）\n   - 會員：56 人\n3. **114 作業系統**（ID: ghi789）\n   - 會員：130 人",
  timestamp: new Date("2026-04-17T14:00:05"),
};

export const mockAiWithThinking: ChatMessage = {
  id: "msg-ai-thinking",
  role: "assistant",
  content: "分析完成，以下是結果。",
  timestamp: new Date("2026-04-17T14:01:00"),
  thinkingInfo: {
    thinking: "使用者想查詢教室資訊，我需要使用 `qjudge_discover` 工具來列出教室。\n\n\n\n根據工具說明，我需要呼叫 `qjudge_discover` 並指定 action 為 `list_classrooms`。\n\n\n- action: `list_classrooms`\n- 目標：列出可存取教室",
    signature: "",
  },
};

export const mockToolSteps: ToolInfo[] = [
  {
    toolName: "qjudge_discover",
    toolCallId: "call-1",
    inputData: { action: "list_classrooms" },
    result: { classrooms: [{ id: "abc", name: "搶救 C++" }] },
  },
  {
    toolName: "qjudge_browse",
    toolCallId: "call-2",
    inputData: { action: "get_classroom", classroom_id: "abc" },
    result: { id: "abc", name: "搶救 C++", member_count: 3 },
  },
];

export const mockAiWithCoT: ChatMessage = {
  id: "msg-ai-cot",
  role: "assistant",
  content: "查到 3 間教室，最大的是 **114 作業系統**（130 人）。",
  timestamp: new Date("2026-04-17T14:01:30"),
  toolExecutions: mockToolSteps,
};

export const mockAiStreaming: ChatMessage = {
  id: "msg-ai-streaming",
  role: "assistant",
  content: "",
  timestamp: new Date("2026-04-17T14:02:00"),
  isThinking: true,
};

export const mockRunTodoItems = [
  {
    id: "summarization",
    label: "對話過長，截取摘要中",
    status: "pending" as const,
  },
  {
    id: "tool-qjudge_discover",
    label: "呼叫 qjudge_discover",
    status: "success" as const,
  },
  {
    id: "tool-qjudge_submit",
    label: "呼叫 qjudge_submit",
    status: "fail" as const,
  },
];

export const mockAiWithMarkdown: ChatMessage = {
  id: "msg-ai-md",
  role: "assistant",
  content: `## 競賽題目總覽

| 類型 | 數量 | 總分 |
|------|------|------|
| 程式題 | 3 | 300 |
| 考試題 | 10 | 18 |

### 程式題
- A: Hello World
- B: 超簡單數學題
- C: 簡單加法題

\`\`\`python
def solve(a, b):
    return a + b
\`\`\`
`,
  timestamp: new Date("2026-04-17T14:03:00"),
};

// ── Mock Sessions ──────────────────────────────────────────────────

export const mockSessions: ChatSession[] = [
  {
    id: "session-1",
    title: "列出我的教室",
    messages: [mockUserMessage, mockAiWithCoT],
    createdAt: new Date("2026-04-17T14:00:00"),
    updatedAt: new Date("2026-04-17T14:01:30"),
  },
  {
    id: "session-2",
    title: "搜尋我的教室",
    messages: [],
    createdAt: new Date("2026-04-16T10:00:00"),
    updatedAt: new Date("2026-04-16T10:05:00"),
  },
  {
    id: "session-3",
    title: "幫我在 test 競賽隨便建立一題題目",
    messages: [],
    createdAt: new Date("2026-04-15T09:00:00"),
    updatedAt: new Date("2026-04-15T09:30:00"),
  },
];

// ── Mock Approval Request ──────────────────────────────────────────

export const mockApprovalRequest: ApprovalRequest = {
  actionRequests: [
    {
      name: "qjudge_coding",
      args: {
        action: "create_problem",
        contest_id: "abc-123",
        title: "Two Sum",
        difficulty: "easy",
      },
    },
  ],
};
