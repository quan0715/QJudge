# QJudge Chat UI — 自製 AI Chat 生態設計 spec

**日期：** 2026-04-17
**目標：** 移除 `@carbon/ai-chat` 與 `@carbon/ai-chat-components`，改用 `@carbon/react` 元件 + 自製 chat 元件，建立完全可控的 QJudge AI chat UI。

---

## 背景與動機

現有 `ChatbotWidget` 以 Carbon 的 `ChatCustomElement`（web component）為核心，造成以下問題：

- Shadow DOM 封裝導致樣式幾乎無法客製化
- `ChatInstance` imperative API（`inst.messaging.*`）黑箱、升版容易壞
- Input 由 web component 管理，IME（中文輸入法）問題永遠無法從外部修
- `forceClear` / `MutationObserver` 等 hack 無法根治
- bundle size 包含大量未使用功能
- `user_defined` 自訂卡片渲染從未成功運作

---

## 設計目標

1. 移除 `@carbon/ai-chat`、`@carbon/ai-chat-components`
2. 用 `@carbon/react` 現有元件（Button、TextArea、Accordion、OverflowMenu 等）作積木
3. 所有業務邏輯（SSE、HITL、session）抽成獨立 React hooks，UI 與邏輯完全解耦
4. 視覺複製 Carbon AI chat 風格（藍色漸層背景、訊息泡泡、AI avatar）
5. Input 改用原生 textarea（Carbon TextArea），根治 IME 問題
6. Composer 架構：input 預留 file upload、@mention 擴充點

---

## 架構：三層設計

### Layer 1 — Hooks（純邏輯）

```
useSessionManager
  sessions[]            所有歷史 session
  currentSessionId      當前 session
  selectSession(id)     載入歷史訊息 → 更新 messages[]
  createSession()       建立新 session，清空 messages[]
  deleteSession(id)
  renameSession(id, name)

useStreamingChat(sessionId)
  messages[]            訊息陣列（React state，UI 直接讀）
  sendMessage(text)     建立/複用 session → 呼叫 SSE → 更新 messages[]
  isStreaming           boolean，控制 input disabled / stop button
  cancel()              AbortController，停止 SSE

useHITL
  submitDecision(decision: "approve"|"reject", sessionId)
    → 呼叫 resume_stream API → SSE 事件繼續更新 messages[]
```

### Layer 2 — 訊息型別（shared type）

```typescript
type Message =
  | { type: "user";      id: string; text: string; timestamp: Date }
  | { type: "ai";        id: string; text: string; cotSteps?: CoTStep[];
      reasoning?: string; streaming?: boolean }
  | { type: "hitl-card"; id: string; sessionId: string; toolName: string;
      args: Record<string, unknown> }
  | { type: "exam-card"; id: string; cards: ExamCardProps[] }

type CoTStep = {
  title: string;
  status: "processing" | "success" | "failure";
  input?: string;
  output?: string;
}
```

### Layer 3 — UI 元件

見下方「元件清單」。

---

## 元件清單

### 沿用 `@carbon/react` 的地方（不自己刻）

- `TextArea` → input 區域（原生 IME 支援）
- `Button` / `IconButton` → 送出、approve/reject、新對話、history toggle
- `OverflowMenu` / `MenuItem` → 歷史記錄三點選單（rename、delete）
- `Layer` / `Tile` → HITL 確認卡片背景
- `Accordion` / `AccordionItem` → CoT 步驟展開收合
- `InlineLoading` → 串流等待 spinner

### 自製 chat 專用元件

```
ChatContainer              主容器，組合所有 hooks，管理 layout 模式
  ChatTopBar               mobile 頂部 bar（history icon | title | compose icon）
  ChatHistoryPanel         歷史 session 側欄，時間分組
    HistorySessionItem     單筆（inline rename + OverflowMenu）
  MessageList              可捲動訊息列表，自動 scroll to bottom
    MessageBubble          單則訊息（user / ai 樣式分支）
      MarkdownRenderer     複用 shared/ui/markdown/MarkdownRenderer
      ChainOfThought       CoT 步驟（Carbon Accordion）
      ReasoningBlock       thinking/reasoning 區塊，可折疊
    HITLCard               approve/reject 確認卡（Tile + Button）
    ExamQuestionCard       現有 AIExamQuestionCard，掛載方式改變
  ComposerBar              輸入區容器，預留 attach/mention slot
    ChatInput              Carbon TextArea + 送出 IconButton
```

---

## Layout

### ChatFullPage（全頁模式，`/chat` route）

**Desktop（>768px）：**
```
┌─────────────────────────────────────────────┐
│  ChatHistoryPanel (280px)  │  ChatMain (1fr) │
│  ┌─────────────────────┐   │  ┌───────────┐  │
│  │ 今天                │   │  │MessageList│  │
│  │  session 1 (active) │   │  │           │  │
│  │  session 2          │   │  │           │  │
│  │ 昨天                │   │  │           │  │
│  │  session 3          │   │  ├───────────┤  │
│  │                     │   │  │ComposerBar│  │
│  └─────────────────────┘   │  └───────────┘  │
└─────────────────────────────────────────────┘
```

- flex row，history panel 固定寬度（可收合，width transition）
- history panel 在 document flow，不用 `position: fixed/absolute`

**Mobile（<=768px）：**
```
┌───────────────────────┐
│ ChatTopBar            │
│ [history] title [new] │
├───────────────────────┤
│                       │
│   MessageList         │
│   (full screen)       │
│                       │
├───────────────────────┤
│ ComposerBar           │
└───────────────────────┘
```

- 無 sidebar，history icon 按鈕開啟 slide-over panel
- compose icon 按鈕 → 新對話

### ChatbotWidget（sidebar widget，teacher/admin 專用）

維持現有 sidebar 行為（FAB toggle + 側邊滑入），內部 `ChatCustomElement` 換成 `ChatContainer` 的 sidebar 模式：

- 不顯示 history panel（空間不足）
- 只有 MessageList + ComposerBar
- FAB toggle + 開關動畫沿用現有 `ChatbotSidePanel.module.scss`

---

## 樣式策略

**原則：** CSS Module + Carbon token（`var(--cds-*)`），不引入額外 CSS framework。

### 背景漸層（複製 Carbon AI 風格）
```css
.chatBackground {
  background:
    radial-gradient(
      ellipse at 15% 50%,
      rgba(69, 137, 255, 0.10) 0%,
      transparent 55%
    ),
    var(--cds-background);
}

/* 深色模式 alpha 調高 */
:global([data-carbon-theme="g100"]) .chatBackground {
  background:
    radial-gradient(
      ellipse at 15% 50%,
      rgba(69, 137, 255, 0.15) 0%,
      transparent 55%
    ),
    var(--cds-background);
}
```

### 訊息泡泡
```css
.userBubble {
  background: var(--cds-layer-accent-01);
  border-radius: 12px 12px 2px 12px;
  padding: var(--cds-spacing-03) var(--cds-spacing-04);
}
```
- User：右對齊，accent 背景，圓角泡泡
- AI：左對齊，無背景框，帶 AI avatar icon

### Markdown 樣式
- 對 `.markdown-body` 套 Carbon 字型 token（`--cds-body-01`）
- code block 沿用現有 `github-dark.css` + Carbon `Tag` language label
- 表格使用 Carbon table token

### 串流游標
- AI message `streaming: true` 時，末尾加閃爍 cursor（CSS `@keyframes blink`）

---

## 資料流

```
useSessionManager
  ├─ sessions[]、currentSessionId
  ├─ selectSession(id) → 從 API 載歷史訊息 → 更新 messages[]
  └─ deleteSession / renameSession

useStreamingChat(sessionId)
  ├─ messages[]          ← React state，UI 直接讀
  ├─ sendMessage(text)   ← 呼叫 SSE，更新 messages[]
  ├─ isStreaming          ← 控制 input disabled / stop button
  └─ cancel()            ← AbortController

useHITL
  ├─ pendingApproval     ← awaiting_approval 事件 → 注入 hitl-card message
  └─ submitDecision()    → 呼叫 resume_stream，繼續更新 messages[]

ChatContainer 把三個 hook 組合起來 → props 傳給 UI 元件
```

---

## 移除清單

**移除套件（`package.json`）：**
- `@carbon/ai-chat`
- `@carbon/ai-chat-components`

**移除/改寫檔案：**

| 舊檔案 | 處理方式 |
|--------|---------|
| `ChatbotWidget.tsx` | 拆成 `ChatContainer.tsx` + hooks |
| `ChatFullPage.tsx` | 改用 `ChatContainer`（full-page 模式） |
| `ChatHistory.tsx` | 改寫為 `ChatHistoryPanel.tsx` |
| `ChatbotSidePanel.module.scss` | sidebar layout 部分沿用 |

**保留不動：**

| 檔案 | 原因 |
|------|------|
| `AIExamQuestionCard.tsx` | 只換掛載方式（從 `user_defined` → 直接 props） |
| `extractExamCards.ts` | 邏輯不變 |
| `shared/ui/markdown/MarkdownRenderer.tsx` | 直接複用 |

---

## 新增依賴

無。`react-markdown`、`remark-gfm`、`rehype-highlight` 等已全部安裝。

---

## 不在此次範圍內

- 檔案上傳功能（ComposerBar 預留 slot，實作留後）
- @mention 功能（同上）
- Storybook story 更新（之後補）
