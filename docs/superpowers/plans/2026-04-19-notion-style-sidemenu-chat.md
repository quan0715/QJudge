# Notion 風格 SideMenu + Chat Session URL Routing 實作計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 ChatHistoryPanel 整合進全域 SideMenu（三 tab：教室/題庫/Chat），重設計 ChatTopBar（full-page），並加上 `/chat/:sessionId` URL routing。

**Architecture:** 新增 `ChatSessionContext` 作為 session 清單的共享 source of truth（僅清單，不含 streaming 狀態）；SideMenu 的 Chat tab 和 ChatContainer full-page 均消費此 context。`useChatbot` 在 CRUD 後呼叫 `context.refreshSessions()`，並透過 `externalSessionId` prop 與 URL 同步。

**Tech Stack:** React 18, Carbon Design System (`@carbon/react`), React Router v6, Vitest, SCSS Modules, TypeScript

---

## 檔案地圖

| 檔案 | 動作 |
|---|---|
| `frontend/src/features/chatbot/contexts/ChatSessionContext.tsx` | **新建** — session 清單 context + provider |
| `frontend/src/features/chatbot/hooks/useChatbot.ts` | **修改** — 加 `externalSessionId` 同步 + CRUD 後 refreshSessions |
| `frontend/src/App.tsx` | **修改** — 加 `/chat/:sessionId` route，加 `ChatSessionProvider` |
| `frontend/src/features/chatbot/components/ChatStandalonePage.tsx` | **修改** — 讀 URL params，傳 sessionId + 導航 callbacks |
| `frontend/src/features/chatbot/components/ChatFullPage.tsx` | **修改** — 接收 sessionId prop |
| `frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx` | **修改** — 移除 history panels，接收 sessionId prop |
| `frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss` | **修改** — 移除 historyColumn/Overlay 樣式 |
| `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx` | **修改** — 重設計 full-page header |
| `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.module.scss` | **修改** — 新增 titleBtn, dropdown 等樣式 |
| `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx` | **修改** — 移除搜尋，加 icon + 時間，可選底部 new chat |
| `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss` | **修改** — 加 itemIcon, itemTime, footer 樣式 |
| `frontend/src/features/app/components/SideMenu.tsx` | **修改** — 加 tab bar，整合 Chat tab |
| `frontend/src/features/app/components/SideMenu.scss` | **修改** — 加 tab bar 樣式 |

---

## Task 1: 建立 `ChatSessionContext`

**Files:**
- Create: `frontend/src/features/chatbot/contexts/ChatSessionContext.tsx`

- [ ] **Step 1: 建立 context 檔案**

```tsx
// frontend/src/features/chatbot/contexts/ChatSessionContext.tsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ChatSession } from "@/core/types/chatbot.types";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { useAuth } from "@/features/auth/contexts/AuthContext";

interface ChatSessionContextValue {
  sessions: ChatSession[];
  isLoadingSessions: boolean;
  refreshSessions: () => Promise<void>;
}

const ChatSessionContext = createContext<ChatSessionContextValue>({
  sessions: [],
  isLoadingSessions: false,
  refreshSessions: async () => {},
});

export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const refreshSessions = useCallback(async () => {
    if (!isTeacherOrAdmin) return;
    setIsLoadingSessions(true);
    try {
      const result = await chatbotRepository.getSessions();
      setSessions(result);
    } catch {
      // silently fail — SideMenu will show empty list
    } finally {
      setIsLoadingSessions(false);
    }
  }, [isTeacherOrAdmin]);

  useEffect(() => {
    if (isTeacherOrAdmin) {
      void refreshSessions();
    }
  }, [isTeacherOrAdmin, refreshSessions]);

  return (
    <ChatSessionContext.Provider value={{ sessions, isLoadingSessions, refreshSessions }}>
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSessionContext() {
  return useContext(ChatSessionContext);
}
```

- [ ] **Step 2: 加入 index export**

在 `frontend/src/features/chatbot/index.ts` 加入（或確認有 export）：

```ts
export { ChatSessionProvider, useChatSessionContext } from "./contexts/ChatSessionContext";
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/chatbot/contexts/ChatSessionContext.tsx frontend/src/features/chatbot/index.ts
git commit -m "feat(chatbot): add ChatSessionContext for shared session list"
```

---

## Task 2: 在 `App.tsx` 加入 `ChatSessionProvider` 與 `/chat/:sessionId` route

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 加入 import**

在 `App.tsx` 現有 import 區段，加入：

```ts
import { ChatSessionProvider } from "@/features/chatbot/contexts/ChatSessionContext";
```

- [ ] **Step 2: 將 `ChatSessionProvider` 包在 `AIWorkspaceProvider` 內層**

找到：
```tsx
<AIWorkspaceProvider>
  <PageHeaderActionsProvider>
```
改為：
```tsx
<AIWorkspaceProvider>
  <ChatSessionProvider>
  <PageHeaderActionsProvider>
```
並在對應的 `</PageHeaderActionsProvider>` 後加上 `</ChatSessionProvider>`。

- [ ] **Step 3: 加入 `/chat/:sessionId` route**

找到：
```tsx
<Route
  path="/chat"
  element={
    <Suspense fallback={null}>
      <ChatStandalonePage />
    </Suspense>
  }
/>
```
改為：
```tsx
<Route
  path="/chat"
  element={
    <Suspense fallback={null}>
      <ChatStandalonePage />
    </Suspense>
  }
/>
<Route
  path="/chat/:sessionId"
  element={
    <Suspense fallback={null}>
      <ChatStandalonePage />
    </Suspense>
  }
/>
```

- [ ] **Step 4: 確認 dev server 啟動無型別錯誤**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: 無 TypeScript error（警告可忽略）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(chatbot): add /chat/:sessionId route and ChatSessionProvider"
```

---

## Task 3: `ChatStandalonePage` 讀 URL params 並傳遞 sessionId

**Files:**
- Modify: `frontend/src/features/chatbot/components/ChatStandalonePage.tsx`
- Modify: `frontend/src/features/chatbot/components/ChatFullPage.tsx`

- [ ] **Step 1: 更新 `ChatStandalonePage.tsx`**

```tsx
// frontend/src/features/chatbot/components/ChatStandalonePage.tsx
import { useNavigate, useParams } from "react-router-dom";
import { GlobalHeader } from "@/features/app/components/GlobalHeader";
import ChatFullPage from "./ChatFullPage";
import styles from "./ChatStandalonePage.module.scss";

export default function ChatStandalonePage() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();

  const handleSessionChange = (newId: string) => {
    navigate(`/chat/${newId}`, { replace: false });
  };

  const handleSessionDeleted = (fallbackId: string | null) => {
    if (fallbackId) {
      navigate(`/chat/${fallbackId}`, { replace: true });
    } else {
      navigate("/chat", { replace: true });
    }
  };

  return (
    <div className={styles.pageRoot}>
      <GlobalHeader />
      <main className={styles.main}>
        <ChatFullPage
          sessionId={sessionId ?? null}
          onSessionChange={handleSessionChange}
          onSessionDeleted={handleSessionDeleted}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: 更新 `ChatFullPage.tsx`**

```tsx
// frontend/src/features/chatbot/components/ChatFullPage.tsx
import { ChatContainer } from "./chat-ui/ChatContainer";
import styles from "./ChatFullPage.module.scss";

interface ChatFullPageProps {
  sessionId?: string | null;
  onSessionChange?: (newId: string) => void;
  onSessionDeleted?: (fallbackId: string | null) => void;
}

export default function ChatFullPage({ sessionId, onSessionChange, onSessionDeleted }: ChatFullPageProps) {
  return (
    <ChatContainer
      mode="full"
      className={styles.fullPage}
      externalSessionId={sessionId ?? undefined}
      onSessionChange={onSessionChange}
      onSessionDeleted={onSessionDeleted}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/chatbot/components/ChatStandalonePage.tsx \
        frontend/src/features/chatbot/components/ChatFullPage.tsx
git commit -m "feat(chatbot): pass URL sessionId into ChatFullPage"
```

---

## Task 4: 修改 `useChatbot` — 加 `externalSessionId` 同步 + context refreshSessions

**Files:**
- Modify: `frontend/src/features/chatbot/hooks/useChatbot.ts`

- [ ] **Step 1: 在 `UseChatbotOptions` 加新欄位**

找到 `interface UseChatbotOptions` 定義，加入：

```ts
interface UseChatbotOptions {
  enabled?: boolean;
  backgroundInfo?: BackgroundInformation | null;
  context?: ChatContext | null;
  onProblemUpdated?: () => void;
  /** 從 URL 傳入的 session ID，useChatbot 會在初始化後切換到此 session */
  externalSessionId?: string;
  /** 當 session 被建立/刪除/改名時的回調（用於 URL navigation） */
  onSessionChange?: (newId: string) => void;
  onSessionDeleted?: (fallbackId: string | null) => void;
}
```

- [ ] **Step 2: 在 `useChatbot` 函式頂端加入 context 消費**

在 `export function useChatbot(options: UseChatbotOptions = {}): UseChatbotReturn {` 之後的解構行，加入 `externalSessionId` 和 callbacks：

```ts
const {
  enabled = true,
  backgroundInfo = null,
  context = null,
  onProblemUpdated: _onProblemUpdated,
  externalSessionId,
  onSessionChange,
  onSessionDeleted,
} = options;
```

在 state 宣告之後，加入 context 消費：

```ts
// ChatSessionContext — notify SideMenu when session list changes
const chatSessionCtx = useChatSessionContext();
```

需要在頂部加入 import：
```ts
import { useChatSessionContext } from "../contexts/ChatSessionContext";
```

- [ ] **Step 3: 加入 `externalSessionId` 同步 effect**

在 `useEffect(() => { init(); }, [...]);` 之後加入：

```ts
// Sync to URL-provided session ID after init
useEffect(() => {
  if (!externalSessionId || isInitializing) return;
  if (currentSessionId !== externalSessionId) {
    void switchSession(externalSessionId);
  }
}, [externalSessionId, isInitializing, currentSessionId, switchSession]);
```

- [ ] **Step 4: 在 `createSession` 加入 context refresh + 導航**

找到 `createSession` 的 `return newSession.id;` 之前，加入：

```ts
void chatSessionCtx.refreshSessions();
onSessionChange?.(newSession.id);
```

- [ ] **Step 5: 在 `deleteSession` 加入 context refresh**

找到 `deleteSession` 的 `setSessions((prev) => {` 後的邏輯，改為：

```ts
setSessions((prev) => {
  const filtered = prev.filter((session) => session.id !== sessionId);

  if (sessionId === currentSessionId) {
    const fallback = filtered[0]?.id ?? null;
    if (filtered.length > 0) {
      setCurrentSessionId(filtered[0].id);
    } else {
      void createSession();
    }
    onSessionDeleted?.(fallback);
  } else if (filtered.length === 0) {
    void createSession();
    onSessionDeleted?.(null);
  }

  return filtered;
});
void chatSessionCtx.refreshSessions();
```

- [ ] **Step 6: 在 `renameSession` 加入 context refresh**

找到 `renameSession` 成功後的 `setSessions(...)` 之後加入：

```ts
void chatSessionCtx.refreshSessions();
```

- [ ] **Step 7: 型別檢查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 errors（或只有 pre-existing errors）

- [ ] **Step 8: 現有測試通過**

```bash
cd frontend && npx vitest run src/features/chatbot/hooks/useChatbot.test.ts
```

Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/chatbot/hooks/useChatbot.ts
git commit -m "feat(chatbot): sync useChatbot with URL sessionId and refresh ChatSessionContext on CRUD"
```

---

## Task 5: `ChatContainer` full-page — 移除歷史面板，接收 sessionId props

**Files:**
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss`

- [ ] **Step 1: 更新 `ChatContainerProps`**

找到 `interface ChatContainerProps`，加入：

```ts
interface ChatContainerProps {
  mode: "full" | "sidebar";
  context?: ChatContext | null;
  onProblemUpdated?: () => void;
  onClose?: () => void;
  className?: string;
  /** full-page 模式：當前 URL session ID */
  externalSessionId?: string;
  /** full-page 模式：session 建立/切換後的導航回調 */
  onSessionChange?: (newId: string) => void;
  /** full-page 模式：session 刪除後的導航回調 */
  onSessionDeleted?: (fallbackId: string | null) => void;
}
```

- [ ] **Step 2: 將新 props 傳入 `useChatbot`**

在 `useChatbot({...})` 呼叫中加入：

```ts
const { ..., } = useChatbot({
  enabled: true,
  context,
  onProblemUpdated,
  externalSessionId: mode === "full" ? externalSessionId : undefined,
  onSessionChange: mode === "full" ? onSessionChange : undefined,
  onSessionDeleted: mode === "full" ? onSessionDeleted : undefined,
});
```

- [ ] **Step 3: 移除 historyOpen state 和 history 相關 JSX（full mode）**

找到：
```ts
const [historyOpen, setHistoryOpen] = useState(mode === "full" && !isMobile);
```
改為：
```ts
const [historyOpen, setHistoryOpen] = useState(mode === "sidebar");
```

移除以下 JSX 區塊（full mode 的 historyColumn 和 historyOverlay for full mode）：

刪除：
```tsx
{/* Desktop full-page: history as side column */}
{mode === "full" && !isMobile && (
  <div className={`${styles.historyColumn} ${showDesktopHistory ? "" : styles.historyCollapsed}`}>
    <ChatHistoryPanel
      sessions={sessions}
      currentSessionId={currentSessionId}
      onSelectSession={handleSelectSession}
      onDeleteSession={deleteSession}
      onRenameSession={renameSession}
    />
  </div>
)}
```

- [ ] **Step 4: 更新 `ChatTopBar` for full mode 傳入 sessions**

找到 full mode 的 ChatTopBar：
```tsx
{mode === "full" && (
  <ChatTopBar
    title={sessionTitle}
    historyOpen={historyOpen}
    onToggleHistory={() => setHistoryOpen((v) => !v)}
    onNewChat={handleNewChat}
  />
)}
```
改為：
```tsx
{mode === "full" && (
  <ChatTopBar
    mode="full"
    title={sessionTitle}
    sessions={sessions}
    currentSessionId={currentSessionId}
    onSelectSession={handleSelectSession}
    onNewChat={handleNewChat}
    onRenameSession={renameSession}
    onDeleteSession={deleteSession}
  />
)}
```

- [ ] **Step 5: 保留 sidebar mode ChatTopBar 不變**

確認 sidebar mode 的 ChatTopBar 仍使用原有 props（title、historyOpen、onToggleHistory、onNewChat、onClose）。

- [ ] **Step 6: 清理 ChatContainer.module.scss**

移除 `.historyColumn`、`.historyCollapsed`、`.historyOverlay`、`.historyOverlayOpen` 樣式區塊。

- [ ] **Step 7: 型別檢查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx \
        frontend/src/features/chatbot/components/chat-ui/ChatContainer.module.scss
git commit -m "feat(chatbot): remove history panel from full-page mode, wire session props"
```

---

## Task 6: 重設計 `ChatTopBar`（full-page 模式）

**Files:**
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.module.scss`

- [ ] **Step 1: 更新 `ChatTopBarProps`**

```tsx
// 完整更新 ChatTopBar.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { IconButton, OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Add, Close, ChevronDown, Chat as ChatIcon } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ChatSession } from "@/core/types/chatbot.types";
import styles from "./ChatTopBar.module.scss";

// 相對時間工具（不依賴外部套件）
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Just now";
    return `${diffHours}h`;
  }
  if (diffDays === 1) return "1d";
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ChatTopBarFullProps {
  mode: "full";
  title?: string;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
}

interface ChatTopBarSidebarProps {
  mode?: "sidebar";
  title?: string;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  onNewChat: () => void;
  onClose?: () => void;
}

type ChatTopBarProps = ChatTopBarFullProps | ChatTopBarSidebarProps;

export function ChatTopBar(props: ChatTopBarProps) {
  const { t } = useTranslation("chatbot");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setDropdownOpen(false), []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, closeDropdown]);

  // ── Sidebar mode ──────────────────────────────────────────────
  if (!props.mode || props.mode === "sidebar") {
    const { title, historyOpen = false, onToggleHistory, onNewChat, onClose } = props as ChatTopBarSidebarProps;
    const displayTitle = title || t("ui.chatbotTitle");
    const { RecentlyViewed } = require("@carbon/icons-react");
    return (
      <div className={styles.bar}>
        <div className={styles.left}>
          {onToggleHistory && (
            <IconButton kind="ghost" label={historyOpen ? t("ui.collapse") : t("ui.history")} onClick={onToggleHistory}>
              {historyOpen ? <Close size={20} /> : <RecentlyViewed size={20} />}
            </IconButton>
          )}
        </div>
        <span className={styles.title}>{displayTitle}</span>
        <div className={styles.right}>
          <IconButton kind="ghost" label={t("ui.newChat")} onClick={onNewChat}>
            <Add size={20} />
          </IconButton>
          {onClose && (
            <IconButton kind="ghost" label={t("ui.close")} onClick={onClose}>
              <Close size={20} />
            </IconButton>
          )}
        </div>
      </div>
    );
  }

  // ── Full-page mode ────────────────────────────────────────────
  const { title, sessions, currentSessionId, onSelectSession, onNewChat, onRenameSession, onDeleteSession } = props as ChatTopBarFullProps;
  const displayTitle = title || t("ui.newChat");

  const startRename = (session: ChatSession) => {
    setRenamingId(session.id);
    setRenameValue(session.title || "");
    setDropdownOpen(false);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className={styles.bar}>
      {/* Left: title dropdown */}
      <div className={styles.left} ref={dropdownRef}>
        {renamingId === currentSessionId ? (
          <input
            className={styles.renameInput}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className={styles.titleBtn}
            onClick={() => setDropdownOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
          >
            <span className={styles.titleText}>{displayTitle}</span>
            <ChevronDown size={16} className={`${styles.titleChevron} ${dropdownOpen ? styles.open : ""}`} />
          </button>
        )}

        {dropdownOpen && (
          <div className={styles.dropdown} role="listbox">
            {sessions.slice(0, 15).map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === currentSessionId}
                className={`${styles.dropdownItem} ${s.id === currentSessionId ? styles.dropdownItemActive : ""}`}
                onClick={() => { onSelectSession(s.id); setDropdownOpen(false); }}
              >
                <ChatIcon size={14} className={styles.dropdownItemIcon} />
                <span className={styles.dropdownItemTitle}>
                  {s.title || t("ui.newChat")}
                </span>
                <span className={styles.dropdownItemTime}>
                  {formatRelativeTime(s.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: actions */}
      <div className={styles.right}>
        <IconButton kind="ghost" label={t("ui.newChat")} onClick={onNewChat}>
          <Add size={20} />
        </IconButton>
        {currentSessionId && (
          <OverflowMenu size="sm" flipped>
            <OverflowMenuItem
              itemText={t("ui.rename")}
              onClick={() => {
                const session = sessions.find((s) => s.id === currentSessionId);
                if (session) startRename(session);
              }}
            />
            <OverflowMenuItem
              itemText={t("ui.delete")}
              isDelete
              hasDivider
              onClick={() => currentSessionId && onDeleteSession(currentSessionId)}
            />
          </OverflowMenu>
        )}
      </div>
    </div>
  );
}
```

> **注意**：`RecentlyViewed` 改用靜態 import，將上方的 `require(...)` 改成在 import 區：
> ```ts
> import { Add, Close, ChevronDown, Chat as ChatIcon, RecentlyViewed } from "@carbon/icons-react";
> ```
> 並移除 `const { RecentlyViewed } = require(...)` 行。

- [ ] **Step 2: 更新 `ChatTopBar.module.scss`**

```scss
@use "./variables" as *;

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  max-width: $chat-content-max-width;
  width: 100%;
  margin: 0 auto;
  background: transparent;
  flex-shrink: 0;
  z-index: 5;
  position: relative;
}

.left {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
  position: relative;
}

.right {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
}

.title {
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
  font-weight: 400;
  color: var(--cds-text-secondary, #525252);
}

// Full-page: title dropdown button
.titleBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  color: var(--cds-text-primary, #161616);
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
  font-weight: 500;
  max-width: 28rem;
  min-width: 0;
  transition: background 150ms ease;

  &:hover {
    background: var(--cds-layer-hover, #e8e8e8);
  }
}

.titleText {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.titleChevron {
  flex-shrink: 0;
  color: var(--cds-icon-secondary, #525252);
  transition: transform 150ms ease;

  &.open {
    transform: rotate(180deg);
  }
}

.renameInput {
  font-size: var(--cds-body-compact-01-font-size, 0.875rem);
  font-weight: 500;
  border: 1px solid var(--cds-focus, #0f62fe);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  background: var(--cds-field-01, #fff);
  color: var(--cds-text-primary, #161616);
  outline: none;
  width: 20rem;
  max-width: 100%;
}

// Dropdown panel
.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 16rem;
  max-width: 24rem;
  max-height: 20rem;
  overflow-y: auto;
  background: var(--cds-layer-01, #f4f4f4);
  border: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 200;
  padding: 0.25rem 0;
}

.dropdownItem {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--cds-text-primary, #161616);
  transition: background 100ms ease;

  &:hover {
    background: var(--cds-layer-hover-01, #e8e8e8);
  }
}

.dropdownItemActive {
  background: var(--cds-layer-selected-01, #e0e0e0);

  &:hover {
    background: var(--cds-layer-selected-hover-01, #d1d1d1);
  }
}

.dropdownItemIcon {
  flex-shrink: 0;
  color: var(--cds-icon-secondary, #525252);
}

.dropdownItemTitle {
  flex: 1;
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.dropdownItemTime {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--cds-text-secondary, #525252);
}
```

- [ ] **Step 3: 確認 stories 不 break（可選）**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep ChatTopBar | head -10
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx \
        frontend/src/features/chatbot/components/chat-ui/ChatTopBar.module.scss
git commit -m "feat(chatbot): redesign ChatTopBar full-page with title dropdown and actions"
```

---

## Task 7: 重設計 `ChatHistoryPanel`（Notion 風格，Carbon style）

**Files:**
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx`
- Modify: `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss`

- [ ] **Step 1: 更新 `ChatHistoryPanel.tsx`**

```tsx
// frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx
import { useState, useMemo, useCallback } from "react";
import { OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Chat as ChatIcon, Add } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ChatSession } from "@/core/types/chatbot.types";
import styles from "./ChatHistoryPanel.module.scss";

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    return diffHours === 0 ? "Just now" : `${diffHours}h`;
  }
  if (diffDays === 1) return "1d";
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ChatHistoryPanelProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onClose?: () => void;
  /** 顯示底部「新增對話」按鈕 */
  showNewChatButton?: boolean;
  onNewChat?: () => void;
}

interface HistoryGroup {
  key: "today" | "yesterday" | "lastWeek" | "older";
  sessions: ChatSession[];
}

function groupSessions(sessions: ChatSession[]): HistoryGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 7 * 86_400_000;

  const groups: Record<string, ChatSession[]> = {
    today: [], yesterday: [], lastWeek: [], older: [],
  };

  for (const s of sessions) {
    const ts = s.updatedAt.getTime();
    if (ts >= todayStart) groups["today"].push(s);
    else if (ts >= yesterdayStart) groups["yesterday"].push(s);
    else if (ts >= weekStart) groups["lastWeek"].push(s);
    else groups["older"].push(s);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key: key as HistoryGroup["key"], sessions: list }));
}

export function ChatHistoryPanel({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onClose: _onClose,
  showNewChatButton = false,
  onNewChat,
}: ChatHistoryPanelProps) {
  const { t } = useTranslation("chatbot");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  const groupLabels = useMemo(() => ({
    today: t("ui.groupToday"),
    yesterday: t("ui.groupYesterday"),
    lastWeek: t("ui.groupLast7Days"),
    older: t("ui.groupOlder"),
  }), [t]);

  const startRename = useCallback((session: ChatSession) => {
    setRenamingId(session.id);
    setRenameValue(session.title || "");
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, onRenameSession]);

  return (
    <div className={styles.panel}>
      <div className={styles.list}>
        {groups.length === 0 && (
          <div className={styles.empty}>{t("ui.noHistory")}</div>
        )}

        {groups.map((group) => (
          <div key={group.key} className={styles.group}>
            <div className={styles.groupLabel}>{groupLabels[group.key]}</div>
            {group.sessions.map((session) => (
              <div
                key={session.id}
                className={`${styles.item} ${session.id === currentSessionId ? styles.active : ""}`}
                onClick={() => onSelectSession(session.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSession(session.id);
                  }
                }}
              >
                <ChatIcon size={16} className={styles.itemIcon} />

                {renamingId === session.id ? (
                  <input
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className={styles.itemName}>
                      {session.title || t("ui.defaultSessionTitle", { id: session.id.slice(0, 8) })}
                    </span>
                    <span className={styles.itemTime}>
                      {formatRelativeTime(session.updatedAt)}
                    </span>
                  </>
                )}

                <OverflowMenu
                  size="sm"
                  flipped
                  className={styles.overflow}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <OverflowMenuItem
                    itemText={t("ui.rename")}
                    onClick={() => startRename(session)}
                  />
                  <OverflowMenuItem
                    itemText={t("ui.delete")}
                    isDelete
                    hasDivider
                    onClick={() => onDeleteSession(session.id)}
                  />
                </OverflowMenu>
              </div>
            ))}
          </div>
        ))}
      </div>

      {showNewChatButton && onNewChat && (
        <div className={styles.footer}>
          <button type="button" className={styles.newChatBtn} onClick={onNewChat}>
            <Add size={16} />
            <span>{t("ui.newChat")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 更新 `ChatHistoryPanel.module.scss`**

```scss
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cds-layer-01, #f4f4f4);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.empty {
  padding: 1rem;
  font-size: 0.875rem;
  color: var(--cds-text-secondary, #525252);
}

.group {
  margin-bottom: 0.25rem;
}

.groupLabel {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--cds-text-secondary, #525252);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.5rem 1rem 0.25rem;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
  cursor: pointer;
  transition: background 100ms ease;
  border-radius: 4px;
  margin: 0 0.25rem;

  &:hover {
    background: var(--cds-layer-hover-01, #e8e8e8);

    .overflow {
      opacity: 1;
    }

    .itemTime {
      display: none;
    }
  }
}

.active {
  background: var(--cds-layer-selected-01, #e0e0e0);

  &:hover {
    background: var(--cds-layer-selected-hover-01, #d1d1d1);
  }
}

.itemIcon {
  flex-shrink: 0;
  color: var(--cds-icon-secondary, #525252);
}

.itemName {
  flex: 1;
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  color: var(--cds-text-primary, #161616);
}

.itemTime {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--cds-text-secondary, #525252);
  white-space: nowrap;
}

.overflow {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 150ms ease;
}

.renameInput {
  flex: 1;
  font-size: 0.8125rem;
  border: 1px solid var(--cds-focus, #0f62fe);
  border-radius: 2px;
  padding: 0.125rem 0.25rem;
  background: var(--cds-field-01, #fff);
  outline: none;
}

// Footer: new chat button
.footer {
  padding: 0.5rem;
  border-top: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  flex-shrink: 0;
}

.newChatBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  border-radius: 4px;
  cursor: pointer;
  color: var(--cds-text-secondary, #525252);
  font-size: 0.875rem;
  transition: background 100ms ease, color 100ms ease;

  &:hover {
    background: var(--cds-layer-hover-01, #e8e8e8);
    color: var(--cds-text-primary, #161616);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx \
        frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss
git commit -m "feat(chatbot): redesign ChatHistoryPanel in Notion style with Carbon tokens"
```

---

## Task 8: `SideMenu` 升級 — tab bar + Chat tab

**Files:**
- Modify: `frontend/src/features/app/components/SideMenu.tsx`
- Modify: `frontend/src/features/app/components/SideMenu.scss`

- [ ] **Step 1: 更新 `SideMenu.tsx` — 加入 tab 邏輯與 Chat tab**

```tsx
// frontend/src/features/app/components/SideMenu.tsx
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Dashboard, Education, Book, Checkmark, Globe, Chat as ChatIcon, Add,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import { getQuestionBanks as listMyBanks } from "@/infrastructure/api/repositories/questionBank.repository";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import type { Classroom } from "@/core/entities/classroom.entity";
import type { QuestionBank } from "@/core/entities/question-bank.entity";
import { useChatSessionContext } from "@/features/chatbot/contexts/ChatSessionContext";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { ChatHistoryPanel } from "@/features/chatbot/components/chat-ui/ChatHistoryPanel";
import "./SideMenu.scss";

type TabKey = "classrooms" | "banks" | "chat";

function getDefaultTab(pathname: string): TabKey {
  if (pathname.startsWith("/classrooms")) return "classrooms";
  if (pathname.startsWith("/question-banks")) return "banks";
  if (pathname.startsWith("/chat")) return "chat";
  return "classrooms";
}

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SideMenu: React.FC<SideMenuProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const drawerRef = useRef<HTMLElement | null>(null);
  const [, startTransition] = useTransition();

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const [activeTab, setActiveTab] = useState<TabKey>(() => getDefaultTab(location.pathname));
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [fetched, setFetched] = useState(false);

  // Chat sessions from shared context
  const { sessions, refreshSessions } = useChatSessionContext();
  const currentSessionId = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/([^/]+)/);
    return match?.[1] ?? null;
  }, [location.pathname]);

  // Update active tab when route changes
  useEffect(() => {
    setActiveTab(getDefaultTab(location.pathname));
  }, [location.pathname]);

  // Refresh chat sessions when Chat tab becomes visible
  useEffect(() => {
    if (isOpen && activeTab === "chat" && isTeacherOrAdmin) {
      void refreshSessions();
    }
  }, [isOpen, activeTab, isTeacherOrAdmin, refreshSessions]);

  const classroomId = useMemo(() => {
    const match = location.pathname.match(/^\/classrooms\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);

  const bankId = useMemo(() => {
    const match = location.pathname.match(/^\/question-banks\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const classroomRows = await getClassrooms();
      let bankRows: QuestionBank[] = [];
      if (isTeacherOrAdmin) bankRows = await listMyBanks();
      startTransition(() => {
        setClassrooms(classroomRows);
        setBanks(bankRows);
        setFetched(true);
      });
    } catch {
      startTransition(() => { setFetched(true); });
    }
  }, [user, isTeacherOrAdmin]);

  useEffect(() => {
    if (isOpen && !fetched) void fetchData();
  }, [isOpen, fetched, fetchData]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (drawerRef.current?.contains(target)) return;
      const toggle = document.querySelector(`[data-side-menu-toggle]`);
      if (toggle?.contains(target)) return;
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const go = (path: string) => { onClose(); navigate(path); };
  const isActive = (prefix: string) => location.pathname.startsWith(prefix);

  const handleNewChat = async () => {
    try {
      const newSession = await chatbotRepository.createSession();
      void refreshSessions();
      onClose();
      navigate(`/chat/${newSession.id}`);
    } catch {
      onClose();
      navigate("/chat");
    }
  };

  const handleSelectSession = (id: string) => {
    onClose();
    navigate(`/chat/${id}`);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await chatbotRepository.deleteSession(id);
      void refreshSessions();
      if (id === currentSessionId) {
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0) {
          navigate(`/chat/${remaining[0].id}`, { replace: true });
        } else {
          navigate("/chat", { replace: true });
        }
      }
    } catch {
      // silently ignore
    }
  };

  const handleRenameSession = async (id: string, title: string) => {
    try {
      await chatbotRepository.renameSession(id, title);
      void refreshSessions();
    } catch {
      // silently ignore
    }
  };

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: "classrooms", label: t("nav.classrooms"), show: true },
    { key: "banks", label: t("nav.questionBanks"), show: isTeacherOrAdmin },
    { key: "chat", label: t("nav.chat", "Chat"), show: isTeacherOrAdmin },
  ].filter((tab) => tab.show);

  return (
    <>
      <div className={`side-menu-backdrop${isOpen ? " side-menu-backdrop--visible" : ""}`} aria-hidden="true" />
      <nav
        ref={drawerRef}
        className={`side-menu${isOpen ? " side-menu--open" : ""}`}
        aria-label={t("header.sideNav", "Side navigation")}
      >
        {/* Tab bar */}
        <div className="side-menu__tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`side-menu__tab${activeTab === tab.key ? " side-menu__tab--active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "classrooms" && (
          <>
            {/* Quick links */}
            <div className="side-menu__section">
              <button
                type="button"
                className={`side-menu__link${isActive("/dashboard") ? " side-menu__link--active" : ""}`}
                onClick={() => go("/dashboard")}
              >
                <Dashboard size={16} />
                <span>{t("nav.dashboard")}</span>
              </button>
              {isTeacherOrAdmin && (
                <button
                  type="button"
                  className={`side-menu__link${isActive("/marketplace") ? " side-menu__link--active" : ""}`}
                  onClick={() => go("/marketplace")}
                >
                  <Globe size={16} />
                  <span>{t("nav.marketplace", "Marketplace")}</span>
                </button>
              )}
            </div>
            {classrooms.length > 0 && (
              <>
                <div className="side-menu__divider" />
                <div className="side-menu__section">
                  <div className="side-menu__section-header">
                    <Education size={16} />
                    <span>{t("nav.classrooms")}</span>
                  </div>
                  <div className="side-menu__classroom-list">
                    {classrooms.map((c) => {
                      const isCurrent = c.id === classroomId;
                      const Icon = getClassroomIcon(c.icon);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`side-menu__classroom${isCurrent ? " side-menu__classroom--active" : ""}`}
                          onClick={() => go(`/classrooms/${c.id}`)}
                        >
                          <Icon size={16} />
                          <span className="side-menu__classroom-name">{c.name}</span>
                          {isCurrent && <Checkmark size={16} className="side-menu__classroom-check" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "banks" && banks.length > 0 && (
          <div className="side-menu__section">
            <div className="side-menu__section-header">
              <Book size={16} />
              <span>{t("nav.questionBanks")}</span>
            </div>
            <div className="side-menu__bank-list">
              {banks.map((b) => {
                const isCurrent = b.id === bankId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`side-menu__bank${isCurrent ? " side-menu__bank--active" : ""}`}
                    onClick={() => go(`/question-banks/${b.id}`)}
                  >
                    <span className="side-menu__bank-name">{b.name}</span>
                    <span className="side-menu__bank-meta">
                      {b.category === "coding" ? "Coding" : "Exam"} · {b.questionCount}
                    </span>
                    {isCurrent && <Checkmark size={14} className="side-menu__bank-check" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="side-menu__chat-tab">
            <ChatHistoryPanel
              sessions={sessions}
              currentSessionId={currentSessionId}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              showNewChatButton
              onNewChat={handleNewChat}
            />
          </div>
        )}
      </nav>
    </>
  );
};

export default SideMenu;
```

- [ ] **Step 2: 在 `SideMenu.scss` 加入 tab bar 樣式**

在現有 `.side-menu` 樣式定義後，追加：

```scss
// ── Tab bar ──

.side-menu__tabs {
  display: flex;
  border-bottom: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  background: var(--cds-layer-01, #f4f4f4);
  flex-shrink: 0;
}

.side-menu__tab {
  flex: 1;
  padding: 0.625rem 0.25rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--cds-text-secondary, #525252);
  transition: color 150ms ease, border-color 150ms ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    color: var(--cds-text-primary, #161616);
    background: var(--cds-layer-hover-01, #e8e8e8);
  }
}

.side-menu__tab--active {
  color: var(--cds-text-primary, #161616);
  border-bottom-color: var(--cds-interactive, #0f62fe);
  font-weight: 500;
}

// ── Chat tab ──

.side-menu__chat-tab {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

同時確認現有 `.side-menu` 有 `display: flex; flex-direction: column;`（若沒有則加入）。

- [ ] **Step 3: 型別檢查 + lint**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 errors

- [ ] **Step 4: 確認 `nav.chat` i18n key 已存在或加入**

在 `frontend/src/locales/zh-TW/common.json`（或對應 locale 檔案）確認有：
```json
"nav": {
  "chat": "Chat"
}
```
若不存在則加入。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/app/components/SideMenu.tsx \
        frontend/src/features/app/components/SideMenu.scss
git commit -m "feat(app): upgrade SideMenu with tab bar and Notion-style Chat tab"
```

---

## Task 9: 整合驗證與手動測試

- [ ] **Step 1: 啟動開發環境**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d
```

- [ ] **Step 2: 完整型別檢查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error TS"
```
Expected: 0 errors

- [ ] **Step 3: 執行單元測試**

```bash
cd frontend && npx vitest run src/features/chatbot/
```
Expected: All pass

- [ ] **Step 4: 手動測試 — URL routing**

- 瀏覽 `/chat` → 應該 redirect 或顯示最後一個 session
- 複製 URL（應為 `/chat/:sessionId`）→ 重新開啟 → 應進入同一 session
- 刪除目前 session → URL 應自動更新到下一個 session

- [ ] **Step 5: 手動測試 — SideMenu Chat tab**

- 點漢堡選單 → 看到三個 tab（教室 / 題庫 / Chat）
- 點 Chat tab → 看到 session 列表（Notion 風格：chat icon + 標題 + 時間）
- 點某 session → SideMenu 關閉，URL 更新，ChatContainer 顯示對應 session
- 點「新增對話」→ 建立新 session，URL 更新
- Hover session → 出現 `...` overflow（rename、delete）

- [ ] **Step 6: 手動測試 — ChatTopBar（full-page）**

- 點 session 標題 → 展開下拉清單（有 chat icon + 時間）
- 點清單中的 session → URL 更新，ChatContainer 切換
- 點 `+` → 建立新 session
- 點 `...` → Rename（inline 編輯）/ Delete（URL 更新）

- [ ] **Step 7: 手動測試 — sidebar mode 不受影響**

- 在習題頁或考試頁開啟 chat sidebar → 功能正常，有歷史 toggle

- [ ] **Step 8: Final commit（若有 polish 修改）**

```bash
git add -p
git commit -m "fix(chatbot): integration polish after manual testing"
```
