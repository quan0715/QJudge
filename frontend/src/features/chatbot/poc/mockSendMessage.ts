/**
 * Carbon AI Chat PoC — Mock customSendMessage
 *
 * 根據用戶輸入關鍵字觸發不同場景，完全不需要後端：
 *   - 預設          → Markdown 文字串流
 *   - 含「搜尋/工具」→ chain_of_thought + 工具呼叫
 *   - 含「新增/確認」→ OptionItem 確認流程
 *   - 含「錯誤」     → InlineErrorItem
 *   - 含「選擇/modal」→ user_defined Selection Modal
 */
import type {
  ChatInstance,
  CustomSendMessageOptions,
  MessageRequest,
  ChainOfThoughtStep,
  HistoryItem,
} from "@carbon/ai-chat";
import {
  ChainOfThoughtStepStatus,
  MessageResponseTypes,
  OptionItemPreference,
} from "@carbon/ai-chat";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ──────────────────────────────────────────────
// Scenario 1: Streaming text (default)
// ──────────────────────────────────────────────
async function scenarioTextStream(
  instance: ChatInstance,
  responseId: string,
  signal: AbortSignal,
) {
  const chunks = [
    "好的，",
    "讓我解釋一下",
    "**動態規劃**",
    "的核心概念。\n\n",
    "## 什麼是動態規劃？\n\n",
    "動態規劃是一種將複雜問題",
    "分解為子問題的演算法技巧。",
    "它適用於有**重疊子問題**",
    "且具備**最優子結構**的問題。\n\n",
    "## 經典例題\n\n",
    "- **LIS**（最長遞增子序列）\n",
    "- **背包問題**\n",
    "- **矩陣鏈乘法**\n\n",
    "需要看具體解題範例嗎？",
  ];

  for (const chunk of chunks) {
    if (signal.aborted) break;
    await delay(70);
    await instance.messaging.addMessageChunk({
      partial_item: {
        response_type: MessageResponseTypes.TEXT,
        text: chunk,
        streaming_metadata: { id: "1", cancellable: true },
      },
      streaming_metadata: { response_id: responseId },
    });
  }

  if (!signal.aborted) {
    await instance.messaging.addMessageChunk({
      final_response: {
        id: responseId,
        output: {
          generic: [
            {
              response_type: MessageResponseTypes.TEXT,
              text: chunks.join(""),
              streaming_metadata: { id: "1" },
            },
          ],
        },
      },
    });
  }
}

// ──────────────────────────────────────────────
// Scenario 2: Tool call with chain_of_thought
// ──────────────────────────────────────────────
async function scenarioToolCall(
  instance: ChatInstance,
  responseId: string,
  signal: AbortSignal,
) {
  const processingSteps: ChainOfThoughtStep[] = [
    {
      title: "qjudge_exam",
      tool_name: "qjudge_exam",
      description: "搜尋題庫中的動態規劃相關題目...",
      status: ChainOfThoughtStepStatus.PROCESSING,
      request: { args: { query: "動態規劃 LIS", limit: 5 } },
    },
  ];

  // Start streaming with "PROCESSING" step visible
  await instance.messaging.addMessageChunk({
    partial_item: {
      response_type: MessageResponseTypes.TEXT,
      text: "",
      streaming_metadata: { id: "1", cancellable: true },
    },
    streaming_metadata: { response_id: responseId },
    partial_response: {
      message_options: { chain_of_thought: processingSteps },
    },
  });

  await delay(1400);
  if (signal.aborted) return;

  // Tool finished — update to SUCCESS
  const doneSteps: ChainOfThoughtStep[] = [
    {
      ...processingSteps[0],
      status: ChainOfThoughtStepStatus.SUCCESS,
      response: { content: "找到 3 道相關題目：P001, P002, P047" },
    },
  ];

  // Stream result text while showing completed step
  const resultChunks = [
    "根據搜尋結果，",
    "以下題目與動態規劃 LIS 相關：\n\n",
    "- **P001** 最長遞增子序列（LIS）\n",
    "- **P002** 俄羅斯套娃信封問題\n",
    "- **P047** 最大子陣列\n\n",
    "建議從 P001 開始練習。",
  ];

  let fullText = "";
  for (const chunk of resultChunks) {
    if (signal.aborted) break;
    fullText += chunk;
    await delay(80);
    await instance.messaging.addMessageChunk({
      partial_item: {
        response_type: MessageResponseTypes.TEXT,
        text: chunk,
        streaming_metadata: { id: "1" },
      },
      streaming_metadata: { response_id: responseId },
      partial_response: {
        message_options: { chain_of_thought: doneSteps },
      },
    });
  }

  if (!signal.aborted) {
    await instance.messaging.addMessageChunk({
      final_response: {
        id: responseId,
        output: {
          generic: [
            {
              response_type: MessageResponseTypes.TEXT,
              text: fullText,
              streaming_metadata: { id: "1" },
            },
          ],
        },
        message_options: { chain_of_thought: doneSteps },
      },
    });
  }
}

// ──────────────────────────────────────────────
// Scenario 3: Approval — OptionItem
// ──────────────────────────────────────────────
async function scenarioApproval(instance: ChatInstance, responseId: string) {
  await delay(350);
  await instance.messaging.addMessage({
    id: responseId,
    output: {
      generic: [
        {
          response_type: MessageResponseTypes.TEXT,
          text: "我準備執行以下操作，請確認：\n\n**新增題目**\n- 標題：最長遞增子序列\n- 難度：`Medium`\n- 分類：動態規劃",
        },
        {
          response_type: MessageResponseTypes.OPTION,
          title: "是否確認執行？",
          preference: OptionItemPreference.BUTTON,
          options: [
            {
              label: "✓ 確認執行",
              value: { input: { text: "confirm" } },
            },
            {
              label: "✗ 取消",
              value: { input: { text: "cancel" } },
            },
          ],
        },
      ],
    },
  });
}

// ──────────────────────────────────────────────
// Scenario 4: InlineErrorItem
// ──────────────────────────────────────────────
async function scenarioError(instance: ChatInstance, responseId: string) {
  await delay(300);
  await instance.messaging.addMessage({
    id: responseId,
    output: {
      generic: [
        {
          response_type: MessageResponseTypes.INLINE_ERROR,
          text: "無法連線至 AI 服務：服務暫時不可用，請稍後再試。",
          debug: { statusCode: 503, text: "Service Unavailable" },
        },
      ],
    },
  });
}

// ──────────────────────────────────────────────
// Mock history sessions (simulates Django sessions API)
// ──────────────────────────────────────────────

/** Session 2 — approval flow conversation */
export const MOCK_HISTORY_ITEMS_S2: HistoryItem[] = [
  {
    time: new Date(Date.now() - 86_400_000).toISOString(),
    message: { input: { text: "新增一道二元樹題目" } },
  },
  {
    time: new Date(Date.now() - 86_390_000).toISOString(),
    message: {
      id: "hist-s2-resp-1",
      output: {
        generic: [
          {
            response_type: MessageResponseTypes.TEXT,
            text: "確認要新增「二元樹層序遍歷」到題庫嗎？",
          },
        ],
      },
    },
  },
];

/** Session 1 — DP discussion */
export const MOCK_HISTORY_ITEMS: HistoryItem[] = [
      {
        time: new Date(Date.now() - 7200_000).toISOString(),
        message: {
          id: "hist-resp-1",
          output: {
            generic: [
              {
                response_type: MessageResponseTypes.TEXT,
                text: "最長遞增子序列（LIS）是一個經典的動態規劃問題...\n\n時間複雜度：O(n log n)",
              },
            ],
          },
        },
      },
      {
        time: new Date(Date.now() - 7195_000).toISOString(),
        message: {
          input: { text: "什麼是最長遞增子序列？" },
        },
      },
      {
        time: new Date(Date.now() - 7100_000).toISOString(),
        message: {
          input: { text: "搜尋相關題目" },
        },
      },
      {
        time: new Date(Date.now() - 7095_000).toISOString(),
        message: {
          id: "hist-resp-2",
          output: {
            generic: [
              {
                response_type: MessageResponseTypes.TEXT,
                text: "找到 3 道相關題目：P001, P002, P047",
              },
            ],
          },
        },
      },
];

// ──────────────────────────────────────────────
// Scenario 5: user_defined — Model Picker
// ──────────────────────────────────────────────
export const USER_DEFINED_TYPE_SELECTION = "qjudge_model_picker";

export interface SelectionModalPayload {
  type: typeof USER_DEFINED_TYPE_SELECTION;
  models: { value: string; label: string; description: string }[];
}

export async function scenarioSelectionModal(
  instance: ChatInstance,
  responseId: string,
): Promise<void> {
  const payload: SelectionModalPayload = {
    type: USER_DEFINED_TYPE_SELECTION,
    models: [
      { value: "gpt-4o", label: "GPT-4o", description: "OpenAI · 快速、多模態" },
      { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", description: "Anthropic · 擅長程式與分析" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", description: "Google · 長上下文" },
      { value: "deepseek-v3", label: "DeepSeek V3", description: "DeepSeek · 高效中文理解" },
    ],
  };

  await instance.messaging.addMessage({
    id: responseId,
    output: {
      generic: [
        {
          response_type: MessageResponseTypes.USER_DEFINED,
          user_defined: payload,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    },
  });
}


export async function mockCustomSendMessage(
  req: MessageRequest,
  opts: CustomSendMessageOptions,
  instance: ChatInstance,
): Promise<void> {
  instance.input.updateRawValue(() => "");
  const text = (req.input as { text?: string }).text?.toLowerCase() ?? "";
  const responseId = crypto.randomUUID();
  const signal = opts.signal;

  if (text.includes("搜尋") || text.includes("工具") || text.includes("tool")) {
    return scenarioToolCall(instance, responseId, signal);
  }
  if (
    text.includes("新增") ||
    text.includes("確認") ||
    text.includes("approval") ||
    text.includes("confirm")
  ) {
    return scenarioApproval(instance, responseId);
  }
  if (
    text.includes("錯誤") ||
    text.includes("error") ||
    text.includes("fail")
  ) {
    return scenarioError(instance, responseId);
  }
  if (text.includes("選擇") || text.includes("modal") || text.includes("select")) {
    return scenarioSelectionModal(instance, responseId);
  }
  return scenarioTextStream(instance, responseId, signal);
}
