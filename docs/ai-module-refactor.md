# AI 模組重構計畫：Provider 化與多頁面複用

> **目標**：參考 [carbon-ai-chat](https://github.com/carbon-design-system/carbon-ai-chat) 的架構思想，將現有 chatbot 功能從「側邊面板元件」重構為「可在任意頁面複用的 AI 模組」，同時保持完整 backward-compatibility。
>
> **影響範圍**：`frontend/src/features/chatbot/`、`frontend/src/shared/ui/chatbot/`（不動）
>
> **預估工作量**：Phase 1 約 4–6h；Phase 2 約 2h；Phase 3 選做

---

## 目錄

1. [現狀痛點](#1-現狀痛點)
2. [架構對照：carbon-ai-chat vs QJudge](#2-架構對照)
3. [目標目錄結構](#3-目標目錄結構)
4. [使用方式對比（Before / After）](#4-使用方式對比)
5. [型別設計](#5-型別設計)
6. [各檔案實作說明](#6-各檔案實作說明)
7. [三個 Phase 的執行步驟](#7-執行步驟)
8. [Migration Guide（呼叫端）](#8-migration-guide)
9. [注意事項與風險](#9-注意事項與風險)

---

## 1. 現狀痛點

### 1.1 Props threading 地獄

每個新頁面都必須在 screen 層手動組裝 chatbot 所需的所有 props：

```tsx
// ProblemEditScreen.tsx — 需要知道 chatbot 的所有內部需求
<ChatbotWidget
  defaultExpanded={false}
  problemContext={{ id: problem.id, title: problem.title }}
  backgroundInfo={{
    user: { username: user.username, role: user.role },
    problem: { id: problem.id, title: problem.title, difficulty },
  }}
  onProblemUpdated={onProblemUpdated}
/>
```

新增一個「AI 可用頁面」= 重複這段模板，且容易漏傳 props。

### 1.2 Layout 與 State 綁死

`ChatbotWidget` 同時負責：
- 收合/展開 UI state
- 透過 `useChatbot` 管理所有 AI 狀態
- 渲染 `ChatWindow`

無法將同樣的 AI 邏輯換成其他 layout（如浮動 launcher、全螢幕、行動裝置 drawer）。

### 1.3 `useChatbot` 708 行 God Hook

單一 hook 混合了四種職責：

| 職責 | 代碼區段 |
|------|----------|
| Session CRUD（create/delete/switch/rename）| ~L210–290 |
| SSE 串流 + 訊息狀態管理 | ~L291–490 |
| Approval flow（confirm/cancel/resumeAgent）| ~L495–620 |
| User input request（pendingUserInput）| ~L440–445, L621–680 |

難以局部測試，任何修改都要讀懂整個 hook。

### 1.4 兩套 context 型別並存

```ts
// Legacy（仍在所有 screen 使用）
interface BackgroundInformation { context?, problemId?, user?, problem?, ... }

// 新版（hook 內部才用）
interface ChatContext { user?: UserContext, page?: PageContext, custom?: Record<string, unknown> }
```

Hook 在第 98–107 行悄悄轉換，外部呼叫端不知道應該用哪套。

### 1.5 深層元件無法存取 AI 狀態

如果未來有個按鈕在某個深層元件裡需要觸發 `sendMessage`，只能靠 prop drilling 傳到那裡。

---

## 2. 架構對照

參考 carbon-ai-chat，提取三個核心思想：

| carbon-ai-chat 概念 | QJudge 對應設計 | 解決的問題 |
|---------------------|-----------------|------------|
| `<ChatContainer config={...}>` | `<AIChatProvider config={...}>` | 把頁面相關 context 從 widget 分離 |
| `PublicConfig` 單一 config 物件 | `AIChatConfig` + per-page factory 函式 | 統一介面，廢棄 BackgroundInformation |
| `instance` object（imperative API）| `useAIChat()` context consumer hook | 任意深層元件取得 AI 控制權 |
| float / embedded layout shells | `<ChatbotPanel>` / `<ChatbotFloat>` | 相同 Provider，換 shell 就能換 layout |
| `customSendMessage` | `chatbotRepository`（**已存在，不動**）| — |
| Event bus | `AIChatEvents` callbacks in config | 頁面級別的 side-effect（如 reload data）|

**不採用的部分**：carbon-ai-chat 的 `response_types` 格式（與我們的 SSE v2 contract 不相容）；其 web component / IBM Telemetry 也不需要。

---

## 3. 目標目錄結構

```
frontend/src/features/chatbot/
│
├── index.ts                          ← 公開 API surface（只 export 這裡的東西）
│
├── context/
│   ├── AIChatContext.tsx             ← React Context 定義（AIChatContextValue 型別）
│   └── AIChatProvider.tsx            ← Provider 實作（包裝 useChatbot，吃 AIChatConfig）
│
├── config/
│   └── chatConfigs.ts                ← AIChatConfig 型別 + per-page factory 函式
│
├── hooks/
│   ├── useAIChat.ts                  ← 公開 consumer hook（via context）
│   ├── useChatbot.ts                 ← 核心 state hook（內部，不從 index.ts export）
│   │
│   │   ── 以下為 Phase 3 分拆（選做）──
│   ├── useSessions.ts                ← Session CRUD 子 hook
│   ├── useStreaming.ts               ← SSE 串流子 hook
│   └── usePendingActions.ts          ← Approval / UserInput 子 hook
│
└── components/
    ├── ChatbotPanel.tsx              ← 側邊面板 shell（原 ChatbotWidget 重構）
    ├── ChatbotWidget.tsx             ← Deprecated alias → re-export ChatbotPanel
    └── ChatbotFloat.tsx              ← 浮動 launcher shell（Phase 2 新增）

frontend/src/shared/ui/chatbot/       ← 不動（UI primitives 已足夠乾淨）
    └── components/
        ├── ChatWindow.tsx
        ├── ChatInput.tsx
        ├── MessageBubble.tsx
        ├── MessageList.tsx
        ├── UserInputModal.tsx
        ├── WelcomeScreen.tsx
        └── AgentAvatar.tsx
```

---

## 4. 使用方式對比

### 現有頁面（Phase 1 後）

```tsx
// ✅ ProblemEditScreen.tsx — after
import { AIChatProvider, ChatbotPanel } from "@/features/chatbot";
import { problemEditConfig } from "@/features/chatbot/config/chatConfigs";

// 在 screen 層：
<AIChatProvider config={problemEditConfig({ problem, user, onProblemUpdated })}>
  <ChatbotPanel defaultExpanded={false} />
</AIChatProvider>
```

```tsx
// ✅ TeacherDashboardScreen.tsx — after
import { AIChatProvider, ChatbotPanel } from "@/features/chatbot";
import { teacherConfig } from "@/features/chatbot/config/chatConfigs";

<AIChatProvider config={teacherConfig({ user })}>
  <ChatbotPanel defaultExpanded={false} />
</AIChatProvider>
```

### 新頁面（Phase 2 後）

```tsx
// ✅ ContestSolvePage.tsx — 浮動 launcher
import { AIChatProvider, ChatbotFloat } from "@/features/chatbot";
import { contestConfig } from "@/features/chatbot/config/chatConfigs";

<AIChatProvider config={contestConfig({ contestId, user })}>
  <ChatbotFloat />
</AIChatProvider>
```

### 深層元件取得控制權（Phase 1 後）

```tsx
// ✅ 任意子元件，不需 prop drilling
import { useAIChat } from "@/features/chatbot";

function AIHelpButton({ problemTitle }: { problemTitle: string }) {
  const { sendMessage, isStreaming } = useAIChat();

  return (
    <Button
      disabled={isStreaming}
      onClick={() => sendMessage(`請幫我解釋這題：${problemTitle}`)}
    >
      AI 解釋
    </Button>
  );
}
```

---

## 5. 型別設計

### `AIChatConfig`（取代散落的 props）

```ts
// features/chatbot/config/chatConfigs.ts

import type { ChatContext } from "@/core/types/chatbot.types";

/** 傳給 AIChatProvider 的單一設定物件 */
export interface AIChatConfig {
  /**
   * 傳給後端的頁面脈絡（取代舊 BackgroundInformation）
   * 對應後端 API 的 context 欄位
   */
  context?: ChatContext;

  /**
   * Agent 成功 commit 資源後的 callback
   * 只有有「AI 可改資料」功能的頁面需要提供（如 ProblemEditScreen）
   */
  onResourceUpdated?: () => void;

  /**
   * 延遲初始化控制（預設 true）
   * 設為 false 時 hook 不會初始化（適用於 lazy mount）
   */
  enabled?: boolean;
}
```

### Per-page Config Factory 函式

```ts
// 每個頁面只需呼叫對應的 factory，不需要知道 ChatContext 的內部結構

export function problemEditConfig(params: {
  problem: { id: number | string; title: string; difficulty?: string };
  user?: { username: string; role: string } | null;
  onProblemUpdated?: () => void;
}): AIChatConfig {
  return {
    context: {
      page: { pageType: "problem-edit" },
      custom: {
        problem: params.problem,
        user: params.user,
      },
    },
    onResourceUpdated: params.onProblemUpdated,
  };
}

export function teacherConfig(params: {
  user?: { username: string; role: string } | null;
}): AIChatConfig {
  return {
    context: {
      page: { pageType: "teacher-dashboard" },
      custom: { user: params.user },
    },
  };
}

export function contestConfig(params: {
  contestId: number | string;
  user?: { username: string; role: string } | null;
}): AIChatConfig {
  return {
    context: {
      page: { pageType: "contest", pageData: { contestId: params.contestId } },
      custom: { user: params.user },
    },
  };
}
```

### `AIChatContextValue`（Context 暴露給消費者的介面）

```ts
// features/chatbot/context/AIChatContext.tsx

export interface AIChatContextValue {
  // State
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  isLoading: boolean;
  isStreaming: boolean;
  isInitializing: boolean;
  error: string | null;
  pendingUserInput: UserInputRequest | null;
  pendingApproval: ApprovalRequest | null;

  // Session actions
  createSession: () => Promise<string | null>;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;

  // Message actions
  sendMessage: (content: string, modelId?: ChatModel) => Promise<void>;
  stopStreaming: () => void;

  // Approval / user input
  submitUserInput: (requestId: string, answers: Record<string, string>) => Promise<void>;
  cancelUserInput: () => void;
  confirmAction: () => Promise<void>;
  cancelAction: () => Promise<void>;

  // Utilities
  clearError: () => void;
}
```

---

## 6. 各檔案實作說明

### 6.1 `AIChatContext.tsx`

```tsx
// features/chatbot/context/AIChatContext.tsx
import { createContext, useContext } from "react";
import type { AIChatContextValue } from "./AIChatProvider";

export const AIChatContext = createContext<AIChatContextValue | null>(null);

/** 取得 AIChatContext，必須在 AIChatProvider 內使用 */
export function useAIChatContext(): AIChatContextValue {
  const ctx = useContext(AIChatContext);
  if (!ctx) {
    throw new Error("useAIChatContext must be used within <AIChatProvider>");
  }
  return ctx;
}
```

### 6.2 `AIChatProvider.tsx`

```tsx
// features/chatbot/context/AIChatProvider.tsx
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useChatbot } from "../hooks/useChatbot";
import { AIChatContext } from "./AIChatContext";
import type { AIChatConfig } from "../config/chatConfigs";

interface AIChatProviderProps {
  config?: AIChatConfig;
  children: ReactNode;
}

/**
 * AI 聊天功能的 Context Provider。
 * 用法：在頁面 layout 層包裹，所有子元件可透過 useAIChat() 取得狀態與操作。
 *
 * @example
 * <AIChatProvider config={problemEditConfig({ problem, user, onProblemUpdated })}>
 *   <ChatbotPanel />
 * </AIChatProvider>
 */
export function AIChatProvider({ config = {}, children }: AIChatProviderProps) {
  const chatbot = useChatbot({
    enabled: config.enabled ?? true,
    // 將 AIChatConfig.context 直接傳入（統一用新版 ChatContext，不再走 BackgroundInformation）
    context: config.context ?? null,
    onProblemUpdated: config.onResourceUpdated,
  });

  // 用 useMemo 穩定 context value，避免不必要的重繪
  const value = useMemo(() => chatbot, [chatbot]);

  return (
    <AIChatContext.Provider value={value}>
      {children}
    </AIChatContext.Provider>
  );
}
```

### 6.3 `useAIChat.ts`（公開 consumer hook）

```ts
// features/chatbot/hooks/useAIChat.ts
import { useAIChatContext } from "../context/AIChatContext";

/**
 * 取得 AI 聊天的所有狀態與操作。
 * 必須在 <AIChatProvider> 內使用。
 *
 * @example
 * const { sendMessage, isStreaming, currentSession } = useAIChat();
 */
export function useAIChat() {
  return useAIChatContext();
}
```

### 6.4 `ChatbotPanel.tsx`（layout shell）

原本的 `ChatbotWidget` 自己持有 `useChatbot`。重構後改成**純 layout shell**，狀態全部從 `useAIChat()` 取得。

```tsx
// features/chatbot/components/ChatbotPanel.tsx
import type { FC } from "react";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loading } from "@carbon/react";
import { useAIChat } from "../hooks/useAIChat";
import { AgentAvatar } from "@/shared/ui/chatbot/components/AgentAvatar";
import { ChatWindow } from "@/shared/ui/chatbot/components/ChatWindow";
import styles from "@/shared/ui/chatbot/ChatbotWidget.module.scss";

interface ChatbotPanelProps {
  defaultExpanded?: boolean;
}

/**
 * 側邊面板 layout shell。
 * 狀態來自 AIChatProvider（useAIChat），此元件只負責收合/展開 UI。
 */
export const ChatbotPanel: FC<ChatbotPanelProps> = ({ defaultExpanded = true }) => {
  const { t } = useTranslation("chatbot");
  const { t: tc } = useTranslation("common");
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [hasBeenExpanded, setHasBeenExpanded] = useState(defaultExpanded);

  const {
    sessions,
    currentSession,
    isLoading,
    isStreaming,
    isInitializing,
    error,
    pendingUserInput,
    pendingApproval,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    sendMessage,
    stopStreaming,
    submitUserInput,
    cancelUserInput,
    confirmAction,
    cancelAction,
    clearError,
  } = useAIChat();

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next && !hasBeenExpanded) setHasBeenExpanded(true);
      return next;
    });
  }, [hasBeenExpanded]);

  return (
    <>
      {!isExpanded && (
        <button
          className={styles.collapsedButton}
          onClick={handleToggle}
          aria-label={t("widget.expandLabel")}
          title={t("widget.expandLabel")}
        >
          <AgentAvatar size="md" />
        </button>
      )}
      {isExpanded && (
        <div className={styles.chatbotPanel}>
          {isInitializing ? (
            <div className={styles.loadingContainer}>
              <Loading withOverlay={false} small />
              <span>{tc("message.loading")}</span>
            </div>
          ) : (
            <ChatWindow
              sessions={sessions}
              currentSession={currentSession}
              isLoading={isLoading}
              isStreaming={isStreaming}
              error={error}
              onSend={sendMessage}
              onStopStreaming={stopStreaming}
              onCreateSession={createSession}
              onSwitchSession={switchSession}
              onDeleteSession={deleteSession}
              onRenameSession={renameSession}
              onCollapse={handleToggle}
              onClearError={clearError}
              pendingUserInput={pendingUserInput}
              onSubmitUserInput={submitUserInput}
              onCancelUserInput={cancelUserInput}
              pendingApproval={pendingApproval}
              onConfirmAction={confirmAction}
              onCancelAction={cancelAction}
            />
          )}
        </div>
      )}
    </>
  );
};
```

### 6.5 `ChatbotWidget.tsx`（Deprecated alias）

舊的 `ChatbotWidget` 包裝成 backward-compatible shim，避免破壞現有使用端（移除時再清理）：

```tsx
// features/chatbot/components/ChatbotWidget.tsx
/**
 * @deprecated 請改用 <AIChatProvider config={...}><ChatbotPanel /></AIChatProvider>
 * 此 shim 保持 backward-compatibility，將在下個重大版本移除。
 */
import type { FC } from "react";
import type { BackgroundInformation } from "@/core/types/chatbot.types";
import { AIChatProvider } from "../context/AIChatProvider";
import { ChatbotPanel } from "./ChatbotPanel";

interface ChatbotWidgetProps {
  defaultExpanded?: boolean;
  problemContext?: { id: number | string; title: string } | null;
  backgroundInfo?: BackgroundInformation | null;
  onProblemUpdated?: () => void;
}

export const ChatbotWidget: FC<ChatbotWidgetProps> = ({
  defaultExpanded = true,
  backgroundInfo = null,
  onProblemUpdated,
}) => {
  const config = {
    context: backgroundInfo
      ? { custom: { backgroundInfo } }
      : undefined,
    onResourceUpdated: onProblemUpdated,
  };

  return (
    <AIChatProvider config={config}>
      <ChatbotPanel defaultExpanded={defaultExpanded} />
    </AIChatProvider>
  );
};

export default ChatbotWidget;
```

### 6.6 `ChatbotFloat.tsx`（Phase 2，浮動 launcher）

```tsx
// features/chatbot/components/ChatbotFloat.tsx
import type { FC } from "react";
import { useState } from "react";
import { useAIChat } from "../hooks/useAIChat";
import { AgentAvatar } from "@/shared/ui/chatbot/components/AgentAvatar";
import { ChatWindow } from "@/shared/ui/chatbot/components/ChatWindow";
import styles from "./ChatbotFloat.module.scss"; // 需新增

/**
 * 浮動 launcher layout shell（右下角按鈕 + overlay 視窗）
 * 適用於不需要側邊面板的頁面（如 Contest 解題頁）
 */
export const ChatbotFloat: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const chatbot = useAIChat();

  return (
    <div className={styles.floatRoot}>
      {isOpen && (
        <div className={styles.floatWindow}>
          <ChatWindow
            {...chatbot}
            onSend={chatbot.sendMessage}
            onStopStreaming={chatbot.stopStreaming}
            onCreateSession={chatbot.createSession}
            onSwitchSession={chatbot.switchSession}
            onDeleteSession={chatbot.deleteSession}
            onRenameSession={chatbot.renameSession}
            onCollapse={() => setIsOpen(false)}
            onClearError={chatbot.clearError}
            onSubmitUserInput={chatbot.submitUserInput}
            onCancelUserInput={chatbot.cancelUserInput}
            onConfirmAction={chatbot.confirmAction}
            onCancelAction={chatbot.cancelAction}
          />
        </div>
      )}
      <button
        className={styles.launcher}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="開啟 AI 助教"
      >
        <AgentAvatar size="lg" />
      </button>
    </div>
  );
};
```

### 6.7 `index.ts`（公開 API surface）

```ts
// features/chatbot/index.ts

// Layout shells（頁面使用）
export { ChatbotPanel } from "./components/ChatbotPanel";
export { ChatbotFloat } from "./components/ChatbotFloat";
export { ChatbotWidget } from "./components/ChatbotWidget"; // deprecated

// Provider（頁面使用）
export { AIChatProvider } from "./context/AIChatProvider";

// Consumer hook（子元件使用）
export { useAIChat } from "./hooks/useAIChat";

// Config factories（頁面使用）
export {
  problemEditConfig,
  teacherConfig,
  contestConfig,
} from "./config/chatConfigs";
export type { AIChatConfig } from "./config/chatConfigs";
```

---

## 7. 執行步驟

### Phase 1：Provider + Config（必做，核心價值）

**目標**：解決 props threading，讓任意深層元件能 `useAIChat()`。

```
Step 1  建立 features/chatbot/config/chatConfigs.ts
        - 定義 AIChatConfig 介面
        - 實作 problemEditConfig, teacherConfig
        - 驗證：TypeScript 編譯通過

Step 2  建立 features/chatbot/context/AIChatContext.tsx
        - 定義 AIChatContextValue（從現有 UseChatbotReturn 複製）
        - createContext + useAIChatContext（帶 guard）

Step 3  建立 features/chatbot/context/AIChatProvider.tsx
        - 包裝現有 useChatbot（只改呼叫介面，不改內部邏輯）
        - useMemo 穩定 context value

Step 4  建立 features/chatbot/hooks/useAIChat.ts
        - 單行：return useAIChatContext()

Step 5  建立 features/chatbot/components/ChatbotPanel.tsx
        - 複製現有 ChatbotWidget，把 useChatbot 換成 useAIChat()
        - 拿掉 backgroundInfo / problemContext / onProblemUpdated props

Step 6  改寫 features/chatbot/components/ChatbotWidget.tsx 為 shim
        - 加 @deprecated JSDoc
        - 包一層 AIChatProvider + ChatbotPanel

Step 7  更新 features/chatbot/index.ts

Step 8  更新 ProblemEditScreen.tsx
        - import AIChatProvider, ChatbotPanel, problemEditConfig
        - 驗證：頁面功能完全不變

Step 9  更新 TeacherDashboardScreen.tsx
        - import AIChatProvider, ChatbotPanel, teacherConfig
        - 驗證：頁面功能完全不變

Step 10 Run: docker compose -f docker-compose.dev.yml exec -T frontend npm run lint
```

### Phase 2：ChatbotFloat（新 Layout）

```
Step 1  建立 features/chatbot/components/ChatbotFloat.module.scss
        - 定義 .floatRoot, .launcher, .floatWindow 樣式
        - launcher 固定在右下角，floatWindow 在其上方展開

Step 2  建立 features/chatbot/components/ChatbotFloat.tsx
        - 使用 useAIChat() 取得狀態
        - 渲染 ChatWindow（ChatWindow props 跟 ChatbotPanel 一樣）

Step 3  更新 index.ts export

Step 4  在 Storybook 加 ChatbotFloat story 驗證
```

### Phase 3：Hook 分拆（選做，改善可測試性）

**前提**：Phase 1 完成，且有餘裕想增加可測試性

```
Step 1  建立 features/chatbot/hooks/useSessions.ts
        - 抽出：sessions state, createSession, deleteSession,
                switchSession, renameSession, refreshSessions, init logic

Step 2  建立 features/chatbot/hooks/useStreaming.ts
        - 抽出：isStreaming, isLoading, abortControllerRef,
                sendMessage, stopStreaming, resumeAgent

Step 3  建立 features/chatbot/hooks/usePendingActions.ts
        - 抽出：pendingUserInput, pendingApproval,
                submitUserInput, cancelUserInput, confirmAction, cancelAction

Step 4  重構 useChatbot.ts 為 orchestrator
        const sessions = useSessions({ ... });
        const streaming = useStreaming({ currentSessionId, currentSession, effectiveContext });
        const pending = usePendingActions({ currentSessionId });
        return { ...sessions, ...streaming, ...pending };
```

---

## 8. Migration Guide

> 給未來在其他頁面掛 AI 模組的開發者

### 最簡掛載（無特殊 context）

```tsx
import { AIChatProvider, ChatbotPanel } from "@/features/chatbot";

function MyPage() {
  return (
    <div className={styles.layout}>
      <div className={styles.content}>...</div>
      <AIChatProvider>
        <ChatbotPanel defaultExpanded={false} />
      </AIChatProvider>
    </div>
  );
}
```

### 帶 context（頁面相關資訊）

```tsx
import { AIChatProvider, ChatbotPanel, myPageConfig } from "@/features/chatbot";

function MyPage({ resourceId, user }) {
  return (
    <AIChatProvider config={myPageConfig({ resourceId, user })}>
      <div className={styles.layout}>
        <div className={styles.content}>...</div>
        <ChatbotPanel defaultExpanded={false} />
      </div>
    </AIChatProvider>
  );
}
```

> **提示**：`AIChatProvider` 不需要包在最外層，只需要在 `ChatbotPanel`/`ChatbotFloat`/任何使用 `useAIChat()` 的元件的**共同祖先**即可。

### 新增 config factory

在 `features/chatbot/config/chatConfigs.ts` 加一個 factory 函式：

```ts
export function myPageConfig(params: {
  resourceId: number;
  user?: { username: string; role: string } | null;
}): AIChatConfig {
  return {
    context: {
      page: { pageType: "my-page", pageData: { resourceId: params.resourceId } },
      custom: { user: params.user },
    },
  };
}
```

然後在 `index.ts` 加到 export。

### 深層元件取得控制

```tsx
import { useAIChat } from "@/features/chatbot";

function InlineHelpButton({ prompt }: { prompt: string }) {
  const { sendMessage, isStreaming } = useAIChat();
  return (
    <IconButton
      label="詢問 AI"
      disabled={isStreaming}
      onClick={() => sendMessage(prompt)}
    >
      <Idea />
    </IconButton>
  );
}
```

---

## 9. 注意事項與風險

| 項目 | 說明 |
|------|------|
| **Backward-compatibility** | Phase 1 完成後，舊的 `<ChatbotWidget backgroundInfo={...}>` 仍可運作（透過 shim）。不需要一次改完所有呼叫端。 |
| **`BackgroundInformation` 廢棄時機** | Phase 1 後可逐步廢棄，但不急。只要 shim 還在，舊碼不會壞。 |
| **`useChatbot` 不 export** | 重構後 `useChatbot` 變成 internal hook，只由 `AIChatProvider` 使用，外部不應直接呼叫。 |
| **Provider 位置** | 每個「使用 AI 功能的頁面」需要自己的 `AIChatProvider`（獨立 session 狀態）。如果想要跨頁面共享 session，需要在更高層（如 Router level）掛 Provider，但目前不建議。 |
| **`ChatWindow` props 冗余** | `ChatWindow` 目前接收大量個別 props，Phase 3 後可考慮讓它直接 `useAIChat()` 取狀態，進一步簡化 shell 的程式碼，但這屬於更大範圍的重構。 |
| **Lazy initialization** | `AIChatProvider` 的 `config.enabled` 預設 `true`（立即初始化）。如需延遲初始化（如原本 `hasBeenExpanded` 的邏輯），將 `enabled` 控制權留在 `ChatbotPanel` 內部即可。 |
| **型別安全** | `AIChatConfig` 和 factory 函式全部有 TypeScript 型別，新加頁面時 TypeScript 會提示必填欄位。 |
