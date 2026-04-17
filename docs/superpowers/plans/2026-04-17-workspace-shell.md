# WorkspaceShell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `AIWorkspaceProvider` + `useWorkspace()` hook + `WorkspaceShell` component so any page can open an AI chat sidebar via API, replacing `ChatbotWidget`.

**Architecture:** Context provider at app root manages open/close state + FAB. `WorkspaceShell` is a flex layout component that pages wrap around their content to get split-view AI chat. Reuses existing `ChatContainer mode="sidebar"` for the panel.

**Tech Stack:** React 18 Context, `@carbon/react`, existing `ChatContainer`, CSS Modules with shared `_variables.scss`.

**Spec:** `docs/superpowers/specs/2026-04-17-workspace-shell-design.md`

---

## File Structure

```
frontend/src/
  features/chatbot/
    components/
      workspace/
        AIWorkspaceProvider.tsx       (create — context + FAB)
        WorkspaceShell.tsx            (create — split-view layout)
        WorkspaceShell.module.scss    (create — shell + panel CSS)
      ChatbotWidget.tsx               (delete)
      ChatbotWidget.stories.tsx       (delete)
      ChatbotSidePanel.module.scss    (delete)
    hooks/
      useWorkspace.ts                 (create — re-export context hook)
    index.ts                          (modify — update exports)

  features/app/components/
    MainLayout.tsx                    (modify — replace ChatbotWidget with WorkspaceShell)

  App.tsx                             (modify — add AIWorkspaceProvider)
```

---

## Task 1: Create WorkspaceContext and AIWorkspaceProvider

The core context that manages the sidebar open/close state, permission checking, and FAB rendering.

**Files:**
- Create: `frontend/src/features/chatbot/components/workspace/AIWorkspaceProvider.tsx`

- [ ] **Step 1: Create AIWorkspaceProvider**

```tsx
// frontend/src/features/chatbot/components/workspace/AIWorkspaceProvider.tsx
import { createContext, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import styles from "./WorkspaceShell.module.scss";

const STORAGE_KEY = "workspace_chat_open";

export interface WorkspaceContextValue {
  isOpen: boolean;
  isAllowed: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  isOpen: false,
  isAllowed: false,
  openChat: () => {},
  closeChat: () => {},
  toggleChat: () => {},
});

function getInitialOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AIWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(getInitialOpen);

  const isAllowed = user?.role === "teacher" || user?.role === "admin";
  const isOnChatPage = location.pathname === "/chat";
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  const persistOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    try { localStorage.setItem(STORAGE_KEY, String(open)); } catch { /* ignore */ }
  }, []);

  const openChat = useCallback(() => {
    if (!isAllowed) return;
    if (isMobile) {
      navigate("/chat");
      return;
    }
    persistOpen(true);
  }, [isAllowed, isMobile, navigate, persistOpen]);

  const closeChat = useCallback(() => {
    persistOpen(false);
  }, [persistOpen]);

  const toggleChat = useCallback(() => {
    if (!isAllowed) return;
    if (isMobile) {
      navigate("/chat");
      return;
    }
    persistOpen(!isOpen);
  }, [isAllowed, isMobile, navigate, persistOpen, isOpen]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ isOpen: isOpen && isAllowed, isAllowed, openChat, closeChat, toggleChat }),
    [isOpen, isAllowed, openChat, closeChat, toggleChat],
  );

  const showFab = isAllowed && !isOpen && !isOnChatPage && !isMobile;

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {showFab &&
        createPortal(
          <button
            className={styles.fab}
            onClick={toggleChat}
            aria-label="開啟 AI 助教"
          >
            <AiLaunch size={20} />
          </button>,
          document.body,
        )}
    </WorkspaceContext.Provider>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Note: This will fail until WorkspaceShell.module.scss exists. That's OK — we create it in Task 2.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/chatbot/components/workspace/AIWorkspaceProvider.tsx
git commit -m "feat(workspace): add AIWorkspaceProvider with context + FAB"
```

---

## Task 2: Create useWorkspace Hook and WorkspaceShell Component

The hook re-exports context, and the shell provides the split-view layout.

**Files:**
- Create: `frontend/src/features/chatbot/hooks/useWorkspace.ts`
- Create: `frontend/src/features/chatbot/components/workspace/WorkspaceShell.tsx`
- Create: `frontend/src/features/chatbot/components/workspace/WorkspaceShell.module.scss`

- [ ] **Step 1: Create useWorkspace hook**

```typescript
// frontend/src/features/chatbot/hooks/useWorkspace.ts
import { useContext } from "react";
import { WorkspaceContext } from "../components/workspace/AIWorkspaceProvider";
import type { WorkspaceContextValue } from "../components/workspace/AIWorkspaceProvider";

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
```

- [ ] **Step 2: Create WorkspaceShell component**

```tsx
// frontend/src/features/chatbot/components/workspace/WorkspaceShell.tsx
import { useWorkspace } from "../../hooks/useWorkspace";
import { ChatContainer } from "../chat-ui/ChatContainer";
import styles from "./WorkspaceShell.module.scss";

interface WorkspaceShellProps {
  children: React.ReactNode;
}

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const { isOpen, closeChat } = useWorkspace();

  return (
    <div className={styles.shell}>
      <div className={styles.content}>
        {children}
      </div>
      <aside className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}>
        {isOpen && (
          <ChatContainer
            mode="sidebar"
            onClose={closeChat}
          />
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Create WorkspaceShell styles**

```scss
// frontend/src/features/chatbot/components/workspace/WorkspaceShell.module.scss
@use "../chat-ui/variables" as *;

$panel-width: 400px;

.shell {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.content {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.panel {
  flex-shrink: 0;
  width: 0;
  overflow: hidden;
  border-left: 1px solid var(--cds-border-subtle-01, #e0e0e0);
  transition: width $chat-motion-duration $chat-motion-easing;
}

.panelOpen {
  width: $panel-width;
}

// Hide panel on mobile — use /chat full page instead
@media (max-width: $chat-mobile-breakpoint) {
  .panel {
    display: none;
  }
}

// FAB — fixed bottom-right
.fab {
  position: fixed;
  bottom: 1.25rem;
  right: 1.25rem;
  z-index: 8001;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--cds-interactive, #0f62fe);
  color: var(--cds-text-on-color, #fff);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: background $chat-motion-duration $chat-motion-easing;

  &:hover {
    background: var(--cds-interactive-hover, #0043ce);
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/chatbot/hooks/useWorkspace.ts \
       frontend/src/features/chatbot/components/workspace/WorkspaceShell.tsx \
       frontend/src/features/chatbot/components/workspace/WorkspaceShell.module.scss
git commit -m "feat(workspace): add useWorkspace hook + WorkspaceShell split-view layout"
```

---

## Task 3: Wire AIWorkspaceProvider into App and Replace ChatbotWidget in MainLayout

Connect the provider at app root and swap ChatbotWidget for WorkspaceShell in MainLayout.

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/features/app/components/MainLayout.tsx`

- [ ] **Step 1: Add AIWorkspaceProvider to App.tsx**

Wrap it around `<BrowserRouter>` (needs to be inside `<AuthProvider>` since it uses `useAuth`, and inside `<BrowserRouter>` since it uses `useNavigate`). Add it right inside `<BrowserRouter>`:

In `App.tsx`, add import:
```typescript
import { AIWorkspaceProvider } from "@/features/chatbot/components/workspace/AIWorkspaceProvider";
```

Wrap `<PageHeaderActionsProvider>` with `<AIWorkspaceProvider>`:

```tsx
<BrowserRouter>
  <AIWorkspaceProvider>
    <PageHeaderActionsProvider>
    <ApiErrorProvider>
    <Routes>
      {/* ... all routes ... */}
    </Routes>
    </ApiErrorProvider>
    </PageHeaderActionsProvider>
  </AIWorkspaceProvider>
</BrowserRouter>
```

Don't forget to close `</AIWorkspaceProvider>` before `</BrowserRouter>`.

- [ ] **Step 2: Replace ChatbotWidget with WorkspaceShell in MainLayout**

Replace the entire `MainLayout.tsx`:

```tsx
// frontend/src/features/app/components/MainLayout.tsx
import { Outlet, useLocation } from "react-router-dom";
import { Content } from "@carbon/react";
import { GlobalHeader } from "./GlobalHeader";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";

const MainLayout = () => {
  const location = useLocation();
  const isFullBleed = location.pathname === "/chat";

  return (
    <>
      <GlobalHeader />
      <div
        style={{
          display: "flex",
          height: "calc(100dvh - 48px)",
          marginTop: "48px",
          overflow: "hidden",
        }}
      >
        {isFullBleed ? (
          <div style={{
            flex: 1,
            overflow: "hidden",
            position: "relative",
            height: "100%",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}>
            <Outlet />
          </div>
        ) : (
          <WorkspaceShell>
            <Content style={{ flex: 1, overflow: "auto", marginTop: 0 }}>
              <Outlet />
            </Content>
          </WorkspaceShell>
        )}
      </div>
    </>
  );
};

export default MainLayout;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/features/app/components/MainLayout.tsx
git commit -m "feat(workspace): wire AIWorkspaceProvider into App, replace ChatbotWidget in MainLayout"
```

---

## Task 4: Update Exports and Delete Old ChatbotWidget Files

Clean up: remove ChatbotWidget and its styles, update feature exports.

**Files:**
- Delete: `frontend/src/features/chatbot/components/ChatbotWidget.tsx`
- Delete: `frontend/src/features/chatbot/components/ChatbotWidget.stories.tsx`
- Delete: `frontend/src/features/chatbot/components/ChatbotSidePanel.module.scss`
- Modify: `frontend/src/features/chatbot/index.ts`

- [ ] **Step 1: Delete old files**

```bash
rm frontend/src/features/chatbot/components/ChatbotWidget.tsx \
   frontend/src/features/chatbot/components/ChatbotWidget.stories.tsx \
   frontend/src/features/chatbot/components/ChatbotSidePanel.module.scss
```

- [ ] **Step 2: Update index.ts**

Replace content of `frontend/src/features/chatbot/index.ts`:

```typescript
export { AIWorkspaceProvider } from "./components/workspace/AIWorkspaceProvider";
export { WorkspaceShell } from "./components/workspace/WorkspaceShell";
export { ChatContainer } from "./components/chat-ui/ChatContainer";
export { useWorkspace } from "./hooks/useWorkspace";
```

- [ ] **Step 3: Verify no remaining ChatbotWidget imports**

Run:
```bash
grep -r "ChatbotWidget\|ChatbotSidePanel" frontend/src/ --include="*.ts" --include="*.tsx" --include="*.scss"
```

Expected: Only the comment in `CodingTestEditorLayout.tsx` (line 352, which is just a comment, not an import).

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Verify build passes**

Run: `cd frontend && npm run build 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(workspace): delete ChatbotWidget, update chatbot feature exports"
```

---

## Verification Checklist

After all tasks are complete:

1. [ ] `npx tsc --noEmit` passes with zero errors
2. [ ] `npm run build` succeeds
3. [ ] `grep -r "ChatbotWidget" frontend/src/ --include="*.tsx"` returns only comments (no imports)
4. [ ] Dashboard page (`/dashboard`) shows FAB when sidebar closed, split panel when open
5. [ ] FAB click opens sidebar with smooth width transition
6. [ ] Sidebar close button works, FAB reappears
7. [ ] `useWorkspace().openChat()` works from any component inside the provider
8. [ ] Mobile: FAB navigates to `/chat` instead of opening sidebar
9. [ ] `/chat` standalone page still works independently
10. [ ] Non teacher/admin users: no FAB, `openChat()` is noop
