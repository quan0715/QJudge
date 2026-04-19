# Notion 風格 SideMenu + Chat Session URL Routing

## 目標

將 ChatHistoryPanel 整合進全域 SideMenu，改成 Notion AI 側邊欄風格，並加上 tab 切換（教室 / 題庫 / Chat）。同時讓 `/chat/:sessionId` 承載 session 狀態，使 URL 可分享與書籤化。

---

## 一、路由變更（App.tsx）

- 現有：`/chat`
- 新增：`/chat/:sessionId`
- 行為：
  - 進入 `/chat` → 自動 redirect 到最後一個 session（localStorage `chatbot_last_session_id`），或 redirect 到新建 session 的 URL
  - `ChatStandalonePage` 讀取 `useParams()` 取得 `sessionId`，傳入 `ChatContainer`
  - 切換 session → `navigate('/chat/:newId')`，不 push 同一個 session
  - 刪除目前 session → redirect 到最近的其他 session，或 `/chat`（自動新建）

---

## 二、狀態提升：`useChatSessions` + `ChatSessionProvider`

### 問題
目前 session 清單與 CRUD 邏輯都埋在 `useChatbot` 裡，SideMenu 無法取得。

### 解法
將 session 管理拆出為獨立 hook：

**`useChatSessions`**（新建）
```ts
{
  sessions: ChatSession[];
  isInitializing: boolean;
  createSession: () => Promise<string | null>;   // 回傳新 sessionId
  deleteSession: (id: string) => Promise<void>;
  switchSession: (id: string) => void;           // 更新 currentSessionId
  renameSession: (id: string, title: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
}
```

**`ChatSessionProvider`**（新建，在 App.tsx 包住 protected routes）
- 使用 `useChatSessions`
- 僅在已登入時初始化（`enabled: !!user`）
- 暴露 context 給 SideMenu 和 full-page ChatContainer 消費

**`useChatbot` 變更**
- full-page 模式：接收外部 `ChatSessionContext`（不再自建 session state）
- sidebar 模式（WorkspaceShell 內）：維持原有行為，使用獨立 session（不共用 context）

---

## 三、SideMenu 重設計

### Tab bar（頂部）
- 三個 tab：`教室 | 題庫 | Chat`
- 依目前路由自動 active：
  - `/classrooms/*` → 教室
  - `/question-banks/*` → 題庫
  - `/chat/*` → Chat
- Tab 儲存於 SideMenu 內部 state，點擊可切換

### 教室 tab
與現有內容相同（classroom list）。

### 題庫 tab
與現有內容相同（question bank list）。

### Chat tab（Notion 風格）
- 無搜尋欄
- 依時間分組（今天 / 昨天 / 過去一週 / 更早）
- 每個 session item：
  - 左：`<Chat size={16} />` icon（灰色）
  - 中：標題（truncate，1 行）
  - 右：相對時間（`1d`、`Apr 16` 等）
  - hover → 顯示 `...` OverflowMenu（rename、delete）
- Active session（目前 URL sessionId）高亮
- 點擊 session → `navigate('/chat/:id')`
- 底部固定：「新增對話」全寬 ghost button → `navigate('/chat')` + createSession

---

## 四、ChatContainer full-page 模式變更

### 移除
- `historyColumn`（左側歷史欄）
- `historyOverlay`（mobile 覆蓋層）
- `historyOpen` state 和 toggle 邏輯
- ChatTopBar 的 history toggle 按鈕

### ChatTopBar 重設計（full mode）
```
[ <sessionTitle> ▾ ]  ←→  [ + ] [ ⋯ ]
```
- **左側**：`<Button kind="ghost">` 顯示目前 session 標題 + `<ChevronDown>` icon
  - 點擊展開 dropdown，列出最近 sessions（最多 15 筆）
  - 每項：標題 + 相對時間，點擊 → `navigate('/chat/:id')`
- **右側**：
  - `+`（Add icon）→ create new session → navigate
  - `...`（OverflowMenu）→ Rename（inline 編輯）/ Delete（confirm + redirect）

### sidebar mode ChatTopBar
維持不變（有 close button）。

---

## 五、ChatHistoryPanel 重設計

（用於 SideMenu Chat tab 和未來其他地方）

- 移除 `<Search>` 元件
- 移除 header 的 close button（由 SideMenu 管理開關）
- 每個 item 加上 `<Chat size={16} />` 前綴 icon
- 每個 item 右側加上相對時間（`formatDistanceToNow` from date-fns 或自製）
- OverflowMenu 改為 hover 才顯示（CSS `opacity: 0 → 1 on :hover`）
- 整體樣式：更乾淨，無邊框，`--cds-layer-01` 背景，`8px` border-radius hover

---

## 六、影響範圍

| 檔案 | 改動類型 |
|---|---|
| `frontend/src/App.tsx` | 新增 `/chat/:sessionId` route + `ChatSessionProvider` |
| `frontend/src/features/chatbot/hooks/useChatbot.ts` | 拆出 `useChatSessions`，支援外部 context |
| `frontend/src/features/chatbot/contexts/ChatSessionContext.tsx` | 新建 |
| `frontend/src/features/chatbot/hooks/useChatSessions.ts` | 新建 |
| `frontend/src/features/chatbot/components/ChatStandalonePage.tsx` | 讀 URL params，傳 sessionId |
| `frontend/src/features/chatbot/components/ChatFullPage.tsx` | 傳 sessionId 給 ChatContainer |
| `frontend/src/features/chatbot/components/chat-ui/ChatContainer.tsx` | 移除 history panel，接受外部 sessionId |
| `frontend/src/features/chatbot/components/chat-ui/ChatTopBar.tsx` | 重設計 full-page header |
| `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.tsx` | 移除搜尋，Notion 樣式 |
| `frontend/src/features/chatbot/components/chat-ui/ChatHistoryPanel.module.scss` | 重設計 |
| `frontend/src/features/app/components/SideMenu.tsx` | 加 tab bar，整合 Chat tab |
| `frontend/src/features/app/components/SideMenu.scss` | 加 tab + chat item 樣式 |

---

## 七、不在本次範圍

- Agent 頭像列（目前只有一個 AI 助教）
- SideMenu 搜尋功能
- sidebar 模式的 ChatContainer（維持現有行為）
- Mobile 響應式細節（維持現有 breakpoint 邏輯）
