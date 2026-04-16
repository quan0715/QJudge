# AI Exam Preview Card — Design Spec

## 目標

AI chatbot 透過 `qjudge_exam` tool 建立筆試題目後，在聊天訊息中渲染 preview card，讓使用者直覺看到建立結果。

## 範圍

- 僅處理 `qjudge_exam` tool（create / batch_create）
- Card 為純展示，不帶導頁
- 多題時每題一張 card，垂直排列
- 失敗不渲染 card（由 AI 文字說明）

## 現有 Pipeline（不改動）

```
MCP tool (qjudge_exam) → tool result
  → ai-service SSE: tool_call_finished { tool_call_id, result, is_error }
  → backend proxy（透傳 + persist 到 metadata.tools_executed）
  → 前端 ChatbotWidget.handleEvent()
```

Tool result 已包含所有需要的欄位，不需要在 MCP 或後端層額外組裝。

## Exam Tool Result 格式

### create（單題）

```json
{
  "id": "uuid",
  "question_type": "single_choice",
  "prompt": "以下哪個是正確的...",
  "score": 10,
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct_answer": "A",
  "explanation": "因為..."
}
```

### batch_create（多題）

```json
{
  "created": [
    { "id": "uuid", "question_type": "single_choice", "prompt": "...", "score": 10, "options": [...] },
    { "id": "uuid", "question_type": "true_false", "prompt": "...", "score": 5, "options": [...] }
  ],
  "deleted_count": 0
}
```

## 前端變更

### 1. 新增元件：`AIExamQuestionCard`

**位置**：`frontend/src/features/chatbot/components/AIExamQuestionCard.tsx`

**Props**：

```typescript
interface AIExamQuestionCardProps {
  questionType: ExamQuestionType;  // single_choice | multiple_choice | true_false | short_answer | essay
  prompt: string;
  score?: number;
  optionCount?: number;            // options.length（選擇題 / 是非題）
}
```

**視覺結構**（參考 `QuestionBankPreviewCard` 風格，簡化版）：

```
┌──────────────────────────────────┐
│  [RadioIcon] 單選題        10 分 │
│                                  │
│  以下哪個是正確的 TCP 三次       │
│  握手流程...                     │
│                                  │
│  4 個選項                        │
└──────────────────────────────────┘
```

- 頂部：題型 icon（複用 `EXAM_QUESTION_TYPE_ICON`）+ 題型 label（複用 `getQuestionTypeLabel`）+ 分數
- 中間：prompt 截斷顯示（2 行 clamp）
- 底部：選項數量（僅選擇題/是非題有 options 時顯示）
- 整體使用 Carbon design tokens 保持視覺一致（`--cds-layer-01` 背景等）
- 無 click handler

### 2. 修改：`ChatbotWidget.handleEvent()`

**檔案**：`frontend/src/features/chatbot/components/ChatbotWidget.tsx`

在 `handleEvent` 函式中：

#### 2a. 新增暫存陣列

在 streaming 開始時（與 `cotSteps` 同層）新增：

```typescript
const pendingCards: AIExamQuestionCardProps[] = [];
```

#### 2b. 擴充 `tool_call_finished` case

在現有 CoT 更新邏輯之後，加入 card 收集：

```typescript
case "tool_call_finished": {
  // ... 現有 CoT step 更新邏輯（不動） ...

  // 收集 exam card data
  if (
    e.tool_name === "qjudge_exam" &&
    !e.is_error &&
    e.result &&
    typeof e.result === "object"
  ) {
    const result = e.result as Record<string, unknown>;

    if (result.id && result.question_type) {
      // create — 單題
      pendingCards.push(extractExamCardProps(result));
    } else if (Array.isArray(result.created)) {
      // batch_create — 多題
      for (const item of result.created) {
        if (item && typeof item === "object" && item.id) {
          pendingCards.push(extractExamCardProps(item));
        }
      }
    }
  }
  break;
}
```

#### 2c. 擴充 `run_completed` case

在 `sendFinal` 之後、`onProblemUpdated` 之前，注入 cards：

```typescript
case "run_completed": {
  sendFinal(false);

  if (pendingCards.length > 0) {
    const cardItems = pendingCards.map(props => ({
      response_type: "user_defined" as const,
      user_defined: {
        type: "ai-exam-question-card",
        ...props,
      },
    }));
    inst.messaging.addMessage({
      output: { generic: cardItems },
    });
  }

  onProblemUpdated?.();
  break;
}
```

### 3. 新增 helper：`extractExamCardProps`

**位置**：同檔或獨立 util（視複雜度決定）

```typescript
function extractExamCardProps(result: Record<string, unknown>): AIExamQuestionCardProps {
  const options = Array.isArray(result.options) ? result.options : [];
  return {
    questionType: (result.question_type as ExamQuestionType) || "single_choice",
    prompt: typeof result.prompt === "string" ? result.prompt : "",
    score: typeof result.score === "number" ? result.score : undefined,
    optionCount: options.length > 0 ? options.length : undefined,
  };
}
```

### 4. Carbon `user_defined` 渲染註冊

需要在 `ChatCustomElement` 的設定中註冊 `ai-exam-question-card` 的 renderer，使用 React portal 將 `AIExamQuestionCard` 渲染到 Carbon Web Component 的 slot 中。

具體做法依 `@carbon/ai-chat` 的 `user_defined` rendering API：
- 監聽 `BusEventType.MESSAGE_ITEM_USER_DEFINED`（或等效事件）
- 根據 `user_defined.type === "ai-exam-question-card"` 渲染對應 React 元件

## 複用的現有資源

| 資源 | 來源 | 用途 |
|------|------|------|
| `EXAM_QUESTION_TYPE_ICON` | `shared/ui/examQuestionTypeVisual.ts` | 題型 icon |
| `getQuestionTypeLabel()` | `features/contest/constants/examLabels.ts` | 題型中文 label |
| `ExamQuestionType` | `core/entities/contest.entity.ts` | TypeScript 型別 |
| Carbon design tokens | `@carbon/react` | 樣式一致性 |

## 不做的事

- 不改 MCP tool 回傳格式
- 不改 ai-service SSE event 格式
- 不改後端 persist 邏輯
- 不做導頁功能
- 不處理 `qjudge_coding` tool（後續擴充）
- 不處理 exam 的 `update` / `delete` / `import_from_bank` action

## 產出檔案

| 檔案 | 動作 |
|------|------|
| `frontend/src/features/chatbot/components/AIExamQuestionCard.tsx` | 新增 |
| `frontend/src/features/chatbot/components/AIExamQuestionCard.module.scss` | 新增 |
| `frontend/src/features/chatbot/components/ChatbotWidget.tsx` | 修改 |
