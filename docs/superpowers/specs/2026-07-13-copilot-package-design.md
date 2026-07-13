# Copilot 可發布套件前置整理設計

- 日期：2026-07-13
- 狀態：Draft，待文件審閱
- 現階段交付：整理現有 frontend chatbot 模組，建立可抽離邊界；不建立 npm package、不搬出 repository
- 長期交付：可發布、可移植到其他 React 產品的 Copilot package，內含 hooks、states、UI 與 ports

## 1. 背景

QJudge 已有可運作的 AI chat：支援多 session、run stream、HITL、附件、artifact、全頁聊天與嵌入式側欄。這些能力目前集中在 frontend feature，主要 orchestration hook `useChatbot.ts` 為 1,114 行，直接依賴 QJudge repository、i18next、localStorage 與 React Router 周邊狀態。

現有程式可以服務 QJudge，但還不是可移植的 SDK。若直接搬成 package，會把 QJudge API、URL 規則、翻譯與 UI 假設一起固化。因此本設計採漸進式收斂：先在現有程式建立 package boundary，補齊行為測試，再考慮實際抽出與發布。

## 2. 設計目標

1. 定義穩定的公開 hooks、states、UI 與 ports。
2. 把聊天狀態演算從 React hook 與外部 I/O 拆開。
3. 讓 full page、embed、workspace 三種 UI 共用同一個全域 session selection。
4. 後端協定由 transport 注入，可使用 REST、SSE、WebSocket 或其他實作。
5. 預設 UI 只依賴 React 與 package 自有樣式，不要求 Carbon。
6. QJudge 在整理期間維持既有行為，現有 consumer 不需一次改寫。
7. 等 public contract 與 adapter contract 穩定後，抽成 npm package 只剩 package 結構、build 與發布工作。

## 3. 非目標

- 本階段不建立 workspace package。
- 本階段不發布 npm package。
- 本階段不重做聊天視覺。
- 本階段不移除 `useChatbot`。
- 本階段不改後端 session/run API。
- 本階段不要求所有產品實作 artifact、HITL 或附件功能。
- 本設計不處理 npm scope、授權條款、版本發布或 changelog 流程。

## 4. 現況盤點

### 4.1 Hooks 與 hook-like state owners

| 現有位置 | 行數 | 目前責任 | 問題 |
| --- | ---: | --- | --- |
| `frontend/src/features/chatbot/hooks/useChatbot.ts` | 1,114 | session CRUD、初始化、model、run、SSE、HITL、附件、取消、錯誤、localStorage | 責任過多，直接依賴具體 repositories 與 i18n |
| `frontend/src/features/chatbot/hooks/useChatScrollToBottom.ts` | 140 | session 切換、串流跟隨、scroll button | 邏輯相對獨立，但型別直接引用 QJudge core types |
| `frontend/src/features/chatbot/contexts/ChatbotProvider.tsx` | 76 | Auth enable、URL/session 雙向同步、provider wiring | 直接依賴 QJudge Auth 與 React Router adapter；同步邏輯以 refs 避免互扭 |
| `frontend/src/features/chatbot/contexts/ArtifactPanelContext.tsx` | 245 | artifact list、selection、refresh debounce、tool completion watch | feature context 直接呼叫 infrastructure repository，且依賴 chatbot context |
| `frontend/src/features/chatbot/contexts/ChatSessionContext.tsx` | 20 | 舊 session context compatibility | 明確為歷史相容層，仍由 barrel export 公開 |
| `frontend/src/features/chatbot/lib/aiSessionUrl.ts` | 44 | `ai_session_id` search param | React Router 實作與抽象契約混在同一 hook |
| `frontend/src/features/chatbot/components/chat-ui/SessionBadges.tsx` | 152 | badge UI 與 `useSessionBadgeSummary` | selector hook 藏在 UI component file，難以單獨測試與重用 |
| `frontend/src/features/ai-tasks/hooks/useTaskSession.ts` | 142 | AI task 與 session 自動綁定 | 屬 QJudge workflow，不應進通用 package core |

### 4.2 核心型別與 I/O

| 現有位置 | 責任 | 整理方向 |
| --- | --- | --- |
| `frontend/src/core/types/chatbot.types.ts` | ChatMessage、ChatRun、ChatSession、stream callbacks | 轉成產品無關 Copilot types；公開 message 採 parts model |
| `frontend/src/core/ports/chatbot.repository.ts` | QJudge chatbot repository interface | 拆成 Copilot transport contract 與 QJudge-specific adapter |
| `frontend/src/infrastructure/api/repositories/chatbot.repository.ts` | REST/SSE、DTO 轉換、event normalization | 保留在 QJudge infrastructure，實作 `CopilotTransport` |
| `frontend/src/infrastructure/api/repositories/artifact.repository.ts` | QJudge artifact I/O | 不納入必要 transport；以 optional capability 或 UI slot 整合 |

### 4.3 UI 框架

目前 `WorkspaceShell`、`ChatContainer` 與 `ChatStandalonePage` 已覆蓋 workspace、embed、full-page 使用情境，但仍含 QJudge layout、Carbon、Router 與 feature context 假設。整理時先固定 shell contract，再逐步降低依賴；不先追求完整樣式重寫。

### 4.4 測試現況

chatbot 相關 Vitest 目前只有 5 個案例：4 個驗證 `applyRunMessageUpdate`，1 個驗證 `chatText`。它們會通過，但沒有涵蓋：

- 初始化與空 session 建立
- session URL 同步
- session 快速切換造成的 request race
- SSE 重播、斷線、重連與 stale event
- HITL 多輪 resume
- awaiting answer
- cancel 與 subscription abort 的差異
- 附件上傳失敗與 optimistic message rollback
- unmount 後的非同步更新
- artifact refresh coalescing

整理順序必須先建立 characterization tests，再改變 hook 結構。

## 5. 採用方案

採漸進式收斂，不平行重寫第二套 chatbot，也不立即建立 workspace package。

1. 先固定純資料型別、事件與狀態機。
2. 定義 ports，讓外部 I/O 可以替換。
3. 以細粒度 hooks 組合現有功能。
4. 保留 `useChatbot` 作為 QJudge compatibility facade。
5. 整理三種 Copilot shell 與 UI slots。
6. 等 contracts 穩定後，再決定 package build 與發布。

## 6. 目標架構

```text
產品應用（QJudge / Next.js / Vite）
  ├─ 產品 adapters
  │    ├─ CopilotTransport
  │    ├─ CopilotSessionLocation
  │    ├─ CopilotStorage
  │    └─ CopilotTranslations
  │
  └─ Copilot UI
       ├─ CopilotWorkspaceShell
       ├─ CopilotFullPageShell
       └─ CopilotEmbedShell
             │
             ▼
       React runtime
       ├─ CopilotProvider
       ├─ public hooks
       └─ scoped stores/contexts
             │
             ▼
       Pure core
       ├─ types
       ├─ reducer/state machine
       ├─ event normalization
       └─ selectors
```

### 6.1 Pure core

- 不 import React、DOM、Router、i18n 或 repositories。
- 不讀寫 localStorage。
- 不發 HTTP request。
- 使用純 function 處理 session/run/message events。
- event sequence、delta merge、tool parts 與 stale event 判斷在此層完成。

### 6.2 React runtime

- 組合 pure core 與 ports。
- 擁有 lifecycle、subscription 與 effect cleanup。
- 以細粒度 state owner 降低無關 re-render。
- 對外只提供 readonly state 與具語意的 commands，不公開 reducer dispatch 或 React setters。

### 6.3 UI

- 提供可直接使用的預設 UI。
- 只依賴 React、runtime 與 package styles。
- 透過 CSS variables、`className`、slots 與 renderer registry 客製化。
- QJudge 以 theme/adapter 對齊 Carbon，不把 Carbon 列為 package peer dependency。

### 6.4 QJudge wiring

- Auth 決定 Provider 是否 enabled。
- QJudge REST/SSE repository 實作 transport。
- React Router 實作 session location。
- i18next 實作 translations。
- artifact、AI Task 與品牌 layout 留在 QJudge feature。

## 7. 公開命名規則

公開 domain 統一使用 `Copilot`，不再使用 `AIChat`。package 內部欄位維持簡潔，不重複前綴。

```ts
import {
  CopilotProvider,
  CopilotWorkspaceShell,
  useCopilot,
  useCopilotSessions,
  type CopilotActiveSessionState,
  type CopilotTransport,
} from "@scope/copilot";
```

規則：

- Component、hook、type、interface 與 factory 等 public exports 使用 `Copilot`。
- Hook 依 React 慣例使用 `useCopilot*`。
- Adapter class/function 將環境名稱放在前面，例如 `QJudgeCopilotTransport`、`BrowserCopilotSessionLocation`。
- 型別內欄位使用 `id`、`data`、`status`，不使用 `copilotSessionId` 這類重複名稱。
- 現有 `Chat*` 與 `useChatbot*` 名稱在相容期保留，之後依 deprecation policy 移除。

## 8. 公開資料模型

### 8.1 Session

```ts
export interface CopilotSessionSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CopilotSession extends CopilotSessionSummary {
  messages: CopilotMessage[];
}
```

### 8.2 Active session state

`currentSessionId`、`currentSession` 與 `sessionStatus` 合併成 discriminated union，避免 consumer 收到互相矛盾的組合。

```ts
export type CopilotActiveSessionState =
  | {
      status: "empty";
      id: null;
      data: null;
      error: null;
    }
  | {
      status: "loading";
      id: string;
      data: CopilotSession | null;
      error: null;
    }
  | {
      status: "ready";
      id: string;
      data: CopilotSession;
      error: null;
    }
  | {
      status: "error";
      id: string | null;
      data: CopilotSession | null;
      error: CopilotError;
    };
```

`loading.data` 可以保留前一份 session 資料，供 UI 顯示 stale-while-revalidate 狀態；consumer 仍須以 `status` 判斷是否可執行寫入操作。

### 8.3 Message parts

公開訊息採 parts model，不再把 `content`、`thinkingInfo`、`toolExecutions`、`todoItems` 固定成平行欄位。

```ts
export interface CopilotMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: CopilotMessagePart[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export type CopilotMessagePart =
  | CopilotTextPart
  | CopilotReasoningPart
  | CopilotToolPart
  | CopilotAttachmentPart
  | CopilotDataPart;

export interface CopilotTextPart {
  type: "text";
  text: string;
}

export interface CopilotReasoningPart {
  type: "reasoning";
  text: string;
  state: "streaming" | "complete";
}

export interface CopilotToolPart {
  type: "tool";
  toolCallId: string;
  toolName: string;
  state: "input-streaming" | "input-ready" | "output-ready" | "error";
  input?: unknown;
  output?: unknown;
  error?: CopilotError;
}

export interface CopilotAttachmentPart {
  type: "attachment";
  id: string;
  name: string;
  mediaType?: string;
  url?: string;
}

export interface CopilotDataPart {
  type: `data-${string}`;
  data: unknown;
}
```

QJudge adapter 負責把現有 DTO 與 SSE events 轉成 parts。Renderer registry 依 `part.type` 或 `toolName` 掛入產品 UI；package 不理解 QJudge artifact 或考試卡片的資料內容。

### 8.4 Run state

`isLoading`、`isStreaming`、`pendingApproval` 與 `pendingQuestion` 合併成單一狀態。

```ts
export type CopilotRunState =
  | { status: "ready"; run: null }
  | { status: "submitted"; run: CopilotRun }
  | { status: "streaming"; run: CopilotRun }
  | {
      status: "awaiting-approval";
      run: CopilotRun;
      request: CopilotApprovalRequest;
    }
  | {
      status: "awaiting-answer";
      run: CopilotRun;
      request: CopilotQuestionRequest;
    }
  | {
      status: "error";
      run: CopilotRun | null;
      error: CopilotError;
    };
```

`submitted` 表示 request 已送出但尚未收到第一個 stream event；`streaming` 表示已開始接收內容。這個區分讓 UI 可以顯示不同 loading state。

### 8.5 Error

```ts
export interface CopilotError {
  code: CopilotErrorCode;
  operation:
    | "load-sessions"
    | "load-session"
    | "create-session"
    | "update-session"
    | "start-run"
    | "subscribe-run"
    | "cancel-run"
    | "submit-approval"
    | "submit-answer"
    | "upload-attachment";
  message?: string;
  recoverable: boolean;
  cause?: unknown;
}

export type CopilotErrorCode =
  | "transport-error"
  | "validation-error"
  | "stream-disconnected"
  | "stream-sequence-error"
  | "unsupported-capability"
  | "run-failed"
  | "run-timeout"
  | "unknown";
```

預設 UI 顯示 translation key 對應的安全文案，不直接把 backend error 顯示給使用者。`cause` 供產品 logging 使用。

## 9. 公開 Hooks

### 9.1 `useCopilot`

提供快速導入所需的聚合介面：

```ts
export interface UseCopilotResult {
  activeSession: CopilotActiveSessionState;
  run: CopilotRunState;
  sessions: readonly CopilotSessionSummary[];
  send(input: CopilotSendInput): Promise<CopilotSendResult>;
  stop(): Promise<void>;
  clearError(): void;
}
```

它是便利 facade，不是唯一入口。大型 UI 應使用下列細粒度 hooks，避免每個 stream chunk 讓所有 consumer re-render。

### 9.2 `useCopilotSessions`

```ts
export interface UseCopilotSessionsResult {
  sessions: readonly CopilotSessionSummary[];
  listStatus: "idle" | "loading" | "ready" | "error";
  activeSession: CopilotActiveSessionState;
  create(input?: CopilotCreateSessionInput): Promise<string>;
  select(id: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
  refresh(): Promise<void>;
}
```

### 9.3 `useCopilotRun`

```ts
export interface UseCopilotRunResult {
  state: CopilotRunState;
  stop(): Promise<void>;
  submitApproval(decision: "approve" | "reject"): Promise<void>;
  submitAnswer(answer: string): Promise<void>;
  retry(): Promise<void>;
}
```

### 9.4 `useCopilotComposer`

```ts
export interface UseCopilotComposerResult {
  draft: string;
  attachments: readonly CopilotPendingAttachment[];
  selectedModelId: string | null;
  canSend: boolean;
  setDraft(value: string): void;
  setSelectedModel(id: string | null): void;
  addAttachments(files: readonly File[]): Promise<void>;
  removeAttachment(id: string): void;
  send(): Promise<CopilotSendResult>;
  reset(): void;
}
```

### 9.5 `useCopilotSessionLocation`

```ts
export interface UseCopilotSessionLocationResult {
  id: string | null;
  set(id: string | null, options?: { replace?: boolean }): void;
}
```

它只代表全域 session selection，不負責 session data fetch。

### 9.6 `useCopilotScroll`

保留現有 scroll 行為：session 切換後到底、使用者送出後跟隨、assistant streaming 時只在 near-bottom 自動捲動、手動回到最新訊息。

## 10. Ports 與 Adapters

Port 是 package 對外部能力的介面。Package 呼叫 port，不知道實際後端、Router、儲存或翻譯工具。產品提供 adapter，將自己的環境接到 port。

### 10.1 `CopilotTransport`

唯一必要 port，負責 session、run 與 stream I/O。

```ts
export interface CopilotTransport {
  readonly capabilities: CopilotTransportCapabilities;

  listSessions(options?: CopilotRequestOptions): Promise<CopilotSessionSummary[]>;
  getSession(id: string, options?: CopilotRequestOptions): Promise<CopilotSession>;
  createSession(
    input?: CopilotCreateSessionInput,
    options?: CopilotRequestOptions,
  ): Promise<CopilotSession>;
  renameSession(id: string, title: string): Promise<CopilotSessionSummary>;
  deleteSession(id: string): Promise<void>;

  startRun(input: CopilotStartRunInput): Promise<CopilotRun>;
  listActiveRuns(options?: CopilotRequestOptions): Promise<CopilotRun[]>;
  subscribeRun(
    run: CopilotRun,
    observer: CopilotRunObserver,
    options?: CopilotSubscribeOptions,
  ): CopilotSubscription;
  cancelRun(runId: string): Promise<CopilotRun>;
  submitApproval(
    runId: string,
    decision: "approve" | "reject",
  ): Promise<CopilotRun>;
  submitAnswer(runId: string, answer: string): Promise<CopilotRun>;

  uploadAttachment?(
    sessionId: string,
    file: File,
    options?: CopilotRequestOptions,
  ): Promise<CopilotAttachmentPart>;
}
```

`subscribeRun` 回傳 subscription object，而不是只回傳長時間 pending 的 Promise，讓 runtime 可以同步終止本地監聽：

```ts
export interface CopilotSubscription {
  close(): void;
  closed: boolean;
}
```

### 10.2 `CopilotTransportCapabilities`

```ts
export interface CopilotTransportCapabilities {
  resumableStreams: boolean;
  cancellableRuns: boolean;
  attachments: boolean;
  approvals: boolean;
  questions: boolean;
}
```

UI 依 capability 顯示操作，不假設所有後端都支援完整 QJudge 功能。Resume 與 cancel 的相容性由 adapter contract 明確說明；runtime 不把關閉本地 subscription 當成取消後端 run。

### 10.3 `CopilotSessionLocation`

保存全域 session ID。Package 提供使用 `URLSearchParams` 與 History API 的 browser adapter；QJudge 可提供 React Router adapter。

```ts
export interface CopilotSessionLocation {
  get(): string | null;
  set(id: string | null, options?: { replace?: boolean }): void;
  subscribe(listener: (id: string | null) => void): () => void;
}
```

預設 search param 為 `ai_session_id`，Provider 可設定其他名稱。

### 10.4 `CopilotStorage`

保存最後 session、model 與 UI preference，不儲存權威 chat history。

```ts
export interface CopilotStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
```

Package 可提供 browser localStorage 與 memory adapters。權威 messages/session persistence 屬 transport 與產品後端責任。

### 10.5 `CopilotTranslations`

```ts
export interface CopilotTranslations {
  t(key: CopilotTranslationKey, values?: Record<string, unknown>): string;
}
```

Package 提供預設英文文案；QJudge adapter 接 i18next。Public state 保留 error code，不儲存翻譯後字串。

## 11. Provider

```tsx
<CopilotProvider
  transport={transport}
  sessionLocation={sessionLocation}
  storage={storage}
  translations={translations}
  initialSession="create"
>
  {children}
</CopilotProvider>
```

```ts
export interface CopilotProviderProps {
  transport: CopilotTransport;
  sessionLocation?: CopilotSessionLocation;
  storage?: CopilotStorage;
  translations?: CopilotTranslations;
  initialSession?: "create" | "first" | "none";
  enabled?: boolean;
  children: React.ReactNode;
}
```

- QJudge 使用 `initialSession="create"`。
- `enabled=false` 時不發 request，也不建立 session。
- 沒提供 location 時只維持 memory selection。
- 沒提供 storage 時不保存 preference。
- Provider 不讀取 Auth；產品從外部決定 `enabled`。

## 12. 公開 UI

### 12.1 `CopilotWorkspaceShell`

應用主內容搭配 Copilot panel：

- Desktop side panel
- Mobile bottom sheet
- main content、chat、header、history、artifact 等 slots
- panel open/close 與 size state
- 可宣告停用 chat panel

### 12.2 `CopilotFullPageShell`

完整頁面聊天：

- 標準 header、history、message list、composer
- 可選擇 history drawer 或固定欄
- 使用全域 session selection
- 不負責產品 routing

### 12.3 `CopilotEmbedShell`

嵌入 dashboard、editor 或任意容器：

- 不接管 viewport 高度
- 不渲染產品 navigation
- 使用 container 尺寸決定 responsive mode
- 可隱藏 history 與 header

### 12.4 公開 building blocks

- `CopilotHeader`
- `CopilotHistoryPanel`
- `CopilotMessageList`
- `CopilotMessage`
- `CopilotComposer`
- `CopilotApprovalCard`
- `CopilotQuestionCard`
- `CopilotScrollToLatestButton`

### 12.5 UI 客製化

```ts
export interface CopilotUISlots {
  header?: React.ComponentType<CopilotHeaderProps>;
  message?: React.ComponentType<CopilotMessageProps>;
  composer?: React.ComponentType<CopilotComposerProps>;
  approval?: React.ComponentType<CopilotApprovalCardProps>;
  question?: React.ComponentType<CopilotQuestionCardProps>;
  emptyState?: React.ComponentType<CopilotEmptyStateProps>;
  errorState?: React.ComponentType<CopilotErrorStateProps>;
}
```

CSS variables 控制 spacing、color、radius、font 與 panel size。Package class 不覆寫 `.cds-*`；QJudge theme 在應用端包裝。

## 13. Session 與資料流

### 13.1 Provider 啟動

```text
Provider mount
  → SessionLocation.get()
  → transport.listSessions() 與 listActiveRuns()
  → 依 location / storage / initialSession policy 選擇 session
  → transport.getSession(id)
  → 若有 active run，依 capability 恢復 subscription
```

選擇優先序：

1. SessionLocation 指定的有效 ID
2. Storage 記錄且仍存在的 ID
3. `initialSession="first"` 時的列表第一筆
4. `initialSession="create"` 時建立新 session
5. `initialSession="none"` 時維持 empty

每次非同步載入持有 selection revision。回應抵達時 revision 不符就丟棄，避免快速切換 session 時舊資料覆蓋新畫面。

### 13.2 Session selection

```text
CopilotHistoryPanel.select(id)
  → runtime 更新 active selection revision
  → SessionLocation.set(id)
  → activeSession = loading
  → transport.getSession(id)
  → activeSession = ready
```

外部 URL 改變時，SessionLocation 發出相同 selection command。Runtime 是唯一 state owner，不讓 URL effect 與 session effect 互相回寫。

### 13.3 Send

```text
Composer.send()
  → validation
  → optional attachment upload
  → optimistic user message
  → run = submitted
  → transport.startRun()
  → subscribeRun()
  → run events 進 pure reducer
  → message parts 更新
  → completed 後與 server session 校正
```

Transport 啟動失敗時保留 draft 或提供 retry input，不留下無法辨識的 optimistic assistant message。是否保留 optimistic user message由 send result 標示，預設保留並顯示 failed state，讓使用者可以重送。

### 13.4 Stream

Pure reducer 負責：

- 依 run ID 與 sequence 去重
- 合併 cumulative value 與 delta
- 保留跨 subscription 的 tool history
- 將 reasoning、tool、data 與 text 映射成 parts
- 忽略已切換 session 或已替換 run 的 stale event
- 將 awaiting approval/answer 轉成 `CopilotRunState`

React runtime 負責 subscription 建立、cleanup、retry timer 與 Provider unmount。Transport 負責協定解析、驗證與 reconnect 實作。

### 13.5 Stop

```text
stop()
  → 同步 close 本地 subscription
  → UI 離開 streaming
  → capability 支援時呼叫 cancelRun()
  → 重新載入 server session 校正狀態
```

關閉 subscription 與取消後端 run 是兩件事。Transport 不支援 cancellation 時，UI 不顯示會造成錯誤期待的 stop action；可以提供「停止追蹤」作為另一個明確 action。

## 14. 錯誤與恢復

| 情境 | State | 預設恢復方式 |
| --- | --- | --- |
| Session list 失敗 | listStatus = error | `refresh()` |
| 指定 session 不存在 | activeSession = error | 清除 location，回到 selection policy |
| Session 快速切換 | loading revision 更新 | 丟棄舊 response |
| startRun 失敗 | run = error | 保留輸入並 `retry()` |
| Stream 暫時斷線 | run 維持 streaming，帶 reconnect metadata | transport reconnect |
| Stream 無法恢復 | run = error | 重新載入 session 或重送 |
| Approval 提交失敗 | 維持 awaiting-approval | 保留卡片供重試 |
| Answer 提交失敗 | 維持 awaiting-answer | 保留答案與卡片供重試 |
| cancel 失敗 | 顯示 recoverable error | 重新載入 session 校正 |
| Attachment 失敗 | composer 保留 failed attachment | 移除或重試 |

錯誤 state 不包含翻譯後的 UI 決策。預設元件使用 `CopilotTranslations` 顯示安全訊息，產品可透過 callback 記錄 `cause`。

## 15. 測試策略

### 15.1 Pure core tests

至少覆蓋：

- 第一個 stream event 建立 assistant message
- cumulative text 不重複
- delta text 正確追加
- reasoning 與 text 各自維護 stream cursor
- tool event 依 toolCallId 更新且保留順序
- sequence replay 被忽略
- stale run/session event 被忽略
- awaiting approval → resume → 第二次 approval
- awaiting answer → resume
- cancel、failed、completed terminal states
- data part 與未知 part 保留

### 15.2 Transport contract tests

提供可重用 test suite。每個 adapter 必須驗證：

- session CRUD 形狀一致
- Date 與 ID normalization
- startRun 回傳必要識別資料
- subscription 可同步 close
- close 後不再觸發 observer
- event sequence 單調或正確標示缺號
- capabilities 與實際 methods 一致
- backend error 轉成 `CopilotError`

### 15.3 Hooks integration tests

使用 `MemoryCopilotTransport`、`MemoryCopilotSessionLocation`、fake timers：

- Provider disabled 時不發 request
- location ID 優先於 storage
- invalid location fallback
- session race 不覆蓋目前 selection
- URL 外部更新與 UI selection 共用單一流程
- unmount 關閉 subscription
- stream chunk 只更新相關 state consumer
- submit/streaming/ready status transitions
- approval/answer 失敗保留互動入口
- stop 不會取消下一個新 subscription

### 15.4 UI tests

- Workspace、FullPage、Embed 共用 session selection
- shell slots 可替換
- capability 關閉時不顯示不支援操作
- keyboard submit、focus return、ARIA labels
- 使用者讀舊訊息時 streaming 不強制拉到底
- user send 後強制跟隨最新訊息
- desktop panel 與 mobile sheet 行為
- CSS variables 生效且無 Carbon selector 依賴

### 15.5 QJudge integration tests

- 現有 chatbot repository 通過 transport contract suite
- `useChatbot` facade 的既有 return contract 不變
- `ai_session_id` 切換不產生來回覆寫
- reload 後可辨識 active runs
- HITL、question、artifact tool events 行為不退化
- AI Task auto-bind 留在 QJudge，透過公開 session actions 整合

## 16. 漸進遷移順序

### Gate 1：Characterization

- 為目前 `useChatbot` 補 session、run、SSE、HITL、cancel 與 race 測試。
- 測試固定現有可接受行為，不先改 public API。
- 將已知 bug 與刻意保留的相容行為分開記錄。

### Gate 2：Pure runtime

- 抽出 event reducer、message part mapping、selectors 與 state unions。
- `useChatbot` 先呼叫 pure functions，外部 return shape 不變。
- Pure runtime 禁止 import React 與 `@/infrastructure`。

### Gate 3：Ports 與 QJudge adapters

- 定義 transport、location、storage、translations contracts。
- 現有 repositories 與 Router hooks 改成 adapters。
- Provider 只接收 ports，不直接 import Auth、Router、i18next 或 repository。

### Gate 4：細粒度 hooks

- 建立 sessions、run、composer、location、scroll hooks。
- `useChatbot` 改成 compatibility facade。
- Context value 分割或採 selector-friendly store，避免 stream chunk 讓整棵 workspace re-render。

### Gate 5：Copilot UI contracts

- 先整理 `CopilotWorkspaceShell`、`CopilotFullPageShell`、`CopilotEmbedShell` props 與 slots。
- 再逐步把 Carbon-specific styling 留在 QJudge theme/wrapper。
- Building blocks 補 Storybook 與 accessibility tests。

### Gate 6：Package readiness

- 確認 package-candidate 程式沒有 QJudge absolute imports。
- 確認 public exports、peer dependencies、CSS entry 與 test adapters。
- 完成至少一個非 QJudge example app 的導入驗證。
- 通過後再另開 package extraction 與 publishing spec。

每個 gate 都能獨立測試與回滾，不要求一次完成全部整理。

## 17. Public API 穩定性

- `useChatbot` 是 QJudge compatibility API，不是未來 package API。
- 新 `Copilot*` API 在 Gate 4 前視為 internal candidate，不由 feature barrel 對外承諾。
- Gate 4 完成後才建立單一 public entrypoint。
- Public API 不 export reducer actions、DTO、HTTP response 或 QJudge metadata keys。
- Adapter-specific exports 使用 subpath，避免主 entrypoint 拉入 Router、i18next 或測試程式。
- Package extraction 前建立 API snapshot，review breaking changes。

## 18. 成功條件

進入實際 package extraction 前，必須同時符合：

1. `useChatbot` 不再直接處理 event merge、URL sync 或 repository import。
2. Pure core 不依賴 React、DOM 與外部 I/O。
3. QJudge backend 只透過 `CopilotTransport` 接入 runtime。
4. 三種 shell 使用同一個 `CopilotActiveSessionState`。
5. Public message 使用 parts model。
6. Session 與 run 不再以多個可能矛盾的 booleans 公開。
7. Transport contract、hooks integration 與 shell contract tests 通過。
8. 至少一個最小 Vite example 能以 adapter + Provider + shell 運作。
9. Package-candidate source 不 import QJudge Auth、Router、i18next、Carbon 或 infrastructure paths。
10. QJudge 現有 full page、embed、workspace、HITL、question 與 attachment 流程沒有行為退化。

## 19. 參考設計

- Vercel AI SDK UI Chatbot：`useChat` 聚合 messages、send、status、error，並以 message parts 支援工具與自訂資料。  
  <https://ai-sdk.dev/docs/ai-sdk-ui/chatbot>
- Vercel AI SDK UI Transport：將傳輸協定與 UI state 分離，可替換 endpoint、驗證與協定。  
  <https://ai-sdk.dev/docs/ai-sdk-ui/transport>
- Vercel AI SDK UI Message Persistence：區分 UI message 與 model message，並說明持久化與 message ID 一致性。  
  <https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence>
- Vercel AI SDK UI Resume Streams：stream resume 需要持久化配合，且與 abort 行為存在取捨。  
  <https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams>
- CopilotKit React UI：headless hooks、預設 UI、actions 與 generative UI 的 Copilot vocabulary。  
  <https://www.npmjs.com/package/@copilotkit/react-ui>
- assistant-ui React：runtime、composable primitives 與 backend adapters 的分層方式。  
  <https://www.npmjs.com/package/@assistant-ui/react>

## 20. 後續文件

本文件核准後，再建立 implementation plan。Plan 需把 Gate 1 至 Gate 6 拆成可獨立驗證的任務，標示建立、修改與測試檔案，以及每個任務的執行命令與預期結果。
