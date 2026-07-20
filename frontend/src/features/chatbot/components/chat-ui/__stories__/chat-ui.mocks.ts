import type {
  CopilotApprovalRequest,
  CopilotMessage,
  CopilotSession,
  CopilotToolPart,
} from "@copilot";

// ── Mock Messages ──────────────────────────────────────────────────

export const mockUserMessage: CopilotMessage = {
  id: "msg-user-1",
  role: "user",
  parts: [{ type: "text", text: "列出我的教室" }],
  createdAt: new Date("2026-04-17T14:00:00"),
};

export const mockAiSimple: CopilotMessage = {
  id: "msg-ai-simple",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "您的教室清單（共 3 間）：\n\n1. **搶救 C++ 大作戰**（ID: abc123）\n   - 會員：3 人\n2. **MG14 計算機概論**（ID: def456）\n   - 會員：56 人\n3. **114 作業系統**（ID: ghi789）\n   - 會員：130 人",
    },
  ],
  createdAt: new Date("2026-04-17T14:00:05"),
};

export const mockAiWithThinking: CopilotMessage = {
  id: "msg-ai-thinking",
  role: "assistant",
  parts: [
    {
      type: "reasoning",
      text: "使用者想查詢教室資訊，我需要使用 `qjudge_discover` 工具來列出教室。\n\n根據工具說明，我需要呼叫 `qjudge_discover` 並指定 action 為 `list_classrooms`。\n\n- action: `list_classrooms`\n- 目標：列出可存取教室",
      state: "complete",
    },
    { type: "text", text: "分析完成，以下是結果。" },
  ],
  createdAt: new Date("2026-04-17T14:01:00"),
};

export const mockToolSteps: CopilotToolPart[] = [
  {
    type: "tool",
    toolName: "qjudge_discover",
    toolCallId: "call-1",
    state: "output-ready",
    input: { action: "list_classrooms" },
    output: { classrooms: [{ id: "abc", name: "搶救 C++" }] },
  },
  {
    type: "tool",
    toolName: "qjudge_browse",
    toolCallId: "call-2",
    state: "output-ready",
    input: { action: "get_classroom", classroom_id: "abc" },
    output: { id: "abc", name: "搶救 C++", member_count: 3 },
  },
];

export const mockAiWithCoT: CopilotMessage = {
  id: "msg-ai-cot",
  role: "assistant",
  parts: [
    ...mockToolSteps,
    {
      type: "text",
      text: "查到 3 間教室，最大的是 **114 作業系統**（130 人）。",
    },
  ],
  createdAt: new Date("2026-04-17T14:01:30"),
};

export const mockAiStreaming: CopilotMessage = {
  id: "msg-ai-streaming",
  role: "assistant",
  parts: [{ type: "reasoning", text: "", state: "streaming" }],
  createdAt: new Date("2026-04-17T14:02:00"),
};

export const mockAiWithMarkdown: CopilotMessage = {
  id: "msg-ai-md",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: `## 競賽題目總覽

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
    },
  ],
  createdAt: new Date("2026-04-17T14:03:00"),
};

// These history fixtures satisfy the public session contract. Message arrays
// stay empty because history renderers consume summaries only.
export const mockSessions = [
  {
    id: "session-1",
    title: "列出我的教室",
    messages: [],
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
] satisfies CopilotSession[];

export const mockApprovalRequest: CopilotApprovalRequest = {
  actions: [
    {
      name: "qjudge_coding_problems",
      arguments: {
        action: "create_problem",
        contest_id: "abc-123",
        title: "Two Sum",
        difficulty: "easy",
      },
    },
  ],
  allowedDecisions: ["approve", "reject"],
};
