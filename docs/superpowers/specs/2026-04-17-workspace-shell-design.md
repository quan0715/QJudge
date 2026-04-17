# WorkspaceShell — AI Workspace Provider 設計 spec

**日期：** 2026-04-17
**目標：** 建立 `AIWorkspaceProvider` + `useWorkspace()` hook，讓任何頁面都能透過 API 叫出 AI split panel，取代現有 `ChatbotWidget`。

---

## 背景

現有 `ChatbotWidget` 是一個自包含元件（FAB + sidebar），硬嵌在某個 layout 中。問題：

- 只有一個入口（FAB），無法從頁面程式碼主動開啟
- 無法跨頁面共享 chat 狀態（切頁後 sidebar 重新初始化）
- 要新增「支援 AI 的頁面」需要手動放 `<ChatbotWidget />`

---

## 設計

### 層級

```
App root
  └─ <AIWorkspaceProvider>        ← 包住整個 app
       ├─ Context: WorkspaceContext
       ├─ <FAB />                  ← panel 關閉時顯示（teacher/admin only）
       └─ children                 ← 原本的 app 內容
```

每個頁面的 layout 使用 `useWorkspace()` 來控制 panel：

```
<SomeLayout>
  <div className="workspace-shell">
    <main>{page content}</main>        ← flex: 1
    {isOpen && <ChatPanel />}          ← sidebar，document flow
  </div>
</SomeLayout>
```

### `WorkspaceShell` 元件

提供 split-view layout 的 presentational 元件，由需要 AI sidebar 的 layout 使用：

```tsx
interface WorkspaceShellProps {
  children: React.ReactNode;
}

function WorkspaceShell({ children }: WorkspaceShellProps) {
  const { isOpen } = useWorkspace();
  return (
    <div className={styles.shell}>
      <main className={styles.content}>{children}</main>
      {isOpen && (
        <aside className={styles.panel}>
          <ChatContainer mode="sidebar" onClose={closeChat} />
        </aside>
      )}
    </div>
  );
}
```

CSS：flex row，`main` 為 `flex: 1`，`aside` 為固定寬度（使用 `$chat-history-width` 或 400px）+ width transition。面板在 document flow（不是 fixed/absolute）。

### `AIWorkspaceProvider`

```tsx
interface WorkspaceContextValue {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
}
```

- 管理 `isOpen` 狀態
- 權限判斷：只有 teacher/admin 才能 open（`openChat` 在非授權用戶下為 noop）
- Mobile 行為：`openChat()` 在 mobile 下 `navigate("/chat")` 而不是開 sidebar
- 渲染 FAB：當 `!isOpen` 且 user 是 teacher/admin 時顯示
- localStorage 記住 open/close 偏好

### `useWorkspace()` hook

```typescript
const { isOpen, openChat, closeChat, toggleChat } = useWorkspace();
```

任何在 `<AIWorkspaceProvider>` 內的元件都能用。

### 取代 ChatbotWidget

| 舊 | 新 |
|----|-----|
| `<ChatbotWidget defaultExpanded onProblemUpdated={...} />` | `<WorkspaceShell>{children}</WorkspaceShell>` + `useWorkspace()` |
| FAB toggle 在 ChatbotWidget 內部 | FAB 在 AIWorkspaceProvider 內部 |
| sidebar CSS 在 ChatbotSidePanel.module.scss | sidebar CSS 在 WorkspaceShell.module.scss |
| teacher/admin 判斷在 ChatbotWidget | teacher/admin 判斷在 AIWorkspaceProvider |

**廢除：** `ChatbotWidget.tsx`、`ChatbotSidePanel.module.scss`

**保留：** `ChatContainer`、所有 chat-ui 元件、`useChatbot`、`ChatStandalonePage`

---

## 檔案結構

```
features/chatbot/
  components/
    workspace/
      AIWorkspaceProvider.tsx      ← Context provider + FAB
      WorkspaceShell.tsx           ← Split-view layout
      WorkspaceShell.module.scss   ← Shell + panel CSS
    chat-ui/                       ← 不動
  hooks/
    useWorkspace.ts                ← re-export context hook
    useChatbot.ts                  ← 不動
  index.ts                         ← 更新 exports
```

---

## 使用方式

### App 層

```tsx
// App.tsx
<AIWorkspaceProvider>
  <RouterProvider router={router} />
</AIWorkspaceProvider>
```

### 需要 AI 的頁面 layout

```tsx
// DashboardLayout.tsx
function DashboardLayout() {
  return (
    <WorkspaceShell>
      <Outlet />
    </WorkspaceShell>
  );
}
```

### 頁面內主動開啟

```tsx
function SomePage() {
  const { openChat } = useWorkspace();
  return <Button onClick={openChat}>問 AI</Button>;
}
```

---

## 不在此次範圍

- `ChatStandalonePage`（`/chat`）遷移到 WorkspaceShell — 之後再做
- `onProblemUpdated` callback — 暫時不支援（之後可透過 event bus 或 context 傳遞）
- 多 panel 支援（同時開 chat + 其他 panel）
