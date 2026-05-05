# 競賽公告與對話功能 UX 設計

- 日期：2026-05-05
- 分支：dev
- 狀態：Draft（待 writing-plans）

## 目標

讓競賽中三類訊息流——「廣播公告」、「老師–學生雙向對話」、「未讀通知」——形成一致、可被注意到的流程，並修正目前完全沒有通知入口、教師無法在考試前後發公告、學生無法回覆老師訊息的缺陷。

## 範圍與非範圍

**範圍**

- ContestLayout 頂部 navbar 新增「通知鈴鐺」入口，覆蓋所有 contest 子頁面（dashboard / 答題 / 排行榜 / admin）
- 學生與教師可在 contest dashboard / admin panel 進行雙向對話（thread）
- 教師可在 AdminProctoringPanel 對「特定學生」主動開啟對話
- 廣播公告 (`ContestAnnouncement`)：教師可在競賽未開始 / 進行中 / 已結束三種狀態下都能發布
- 移除舊 `Clarification` 模型與既有 `ContestClarifications.tsx` / 相關 UI

**非範圍**

- 不引入 ReadReceipt 表、不顯示「已讀人數 / 未讀名單」（已讀狀態用 localStorage）
- 不做 SSE / WebSocket，沿用 polling
- 不做答題畫面內直接提問入口（學生想開對話需回 dashboard）
- 不修改既有競賽分數 / 排行榜 / 監考偵測流程
- 不做「公開 Q&A」（所有對話僅老師與該學生可見）
- 不保留 `Clarification` 舊資料（依使用者指示直接 drop table、不做 fallback）

## 現況差距

| 既有 | 缺陷 |
|---|---|
| `Clarification` model | 只能「問一次答一次」，無法雙向多輪對話；老師無法主動開啟 |
| `ContestAnnouncement` | 純廣播，老師無法只通知個別學生 |
| `ContestClarifications.tsx` | 405 行單檔，混合公告 + Q&A + 三種 modal |
| `ContestQAScreen` / `AdminClarificationsScreen` | 在「進行中以外」整段 readOnly，導致教師考試前後不能發公告 |
| `ContestLayout` header | 沒有任何通知入口 |
| `AdminProctoringPanel` | 沒有「對單一學生送訊息」的能力 |

## 設計

### A. 資料模型

#### A.1 新增 `ContestConversation`

```
contest          FK → Contest
student          FK → User                 # 對話另一端的學生
problem          FK → Problem (nullable)   # 學生提問可帶題目；老師主動私訊通常為 null
created_at       DateTimeField
last_message_at  DateTimeField             # 用於排序與未讀判斷
```

- `(contest, student, problem)` 不設 unique：同一題、同一學生可有多次對話
- 無 status 欄位：「進行中／待回覆」由 `last_message.sender_role` 表達
- 無 `initiated_by` 欄位：「誰發起的」由第一則 message 的 `sender_role` 表達；list endpoint 回傳時附 `first_sender_role` 給前端用（避免每次 join messages 表）

#### A.2 新增 `ContestMessage`

```
conversation  FK → ContestConversation
sender        FK → User
sender_role   CharField('student'|'teacher')   # denormalized for clarity & queries
content       TextField
created_at    DateTimeField
```

- 一條 conversation 至少有一則 message（建立 conversation 時一併寫入第一則）
- `sender_role` 在 create 時依 sender 的競賽角色決定，後端強制；前端不可指定

#### A.3 移除 `Clarification`

- Migration：drop table `contest_clarifications`
- 同時移除所有引用：`models.py` 的 `Clarification` class、`serializers.py`、`views/`、`admin.py`、`urls.py` 的 router register、相關測試檔
- 既有資料直接清除（依使用者指示）

#### A.4 `ContestAnnouncement` 維持原狀（純廣播）

- 不加 `target_user`（原計畫廢除）
- 行為：老師發布 → 全部已加入該 contest 的學生都能看見

### B. 已讀狀態：localStorage

- 不動後端的 read 狀態。每個學生瀏覽器自己記
- key：`qjudge.contest.{contestId}.readIds`
- value：JSON 陣列，混存兩種前綴 id：
  - `ann:{announcementId}`：對應廣播公告
  - `msg:{messageId}`：對應 ContestMessage 中「對方傳給我」的訊息
- 已讀寫入時機：
  - Notification Modal 點「我已閱讀」或「✕」 → 把 modal 顯示的所有 id 一次寫入
  - Dashboard 上 `ContestAnnouncementList` / `ContestConversationList` 的卡片進入 viewport（IntersectionObserver）→ 標單筆已讀
  - 開啟 Conversation thread 時，把 thread 內所有對方訊息標已讀
- 跨裝置 / 清快取會重新提示，這是接受的取捨

### C. 未讀計算 hook：`useContestUnread`

```ts
useContestUnread(contestId, currentUserId, role): {
  unreadAnnouncementIds: string[]      // 學生用
  unreadMessageIds: string[]            // 學生用：對方傳給我且未讀的 message
  pendingConversationCount: number      // 老師用：等我回的對話數
  unreadCount: number
  markRead: (ids: string[]) => void
  markAllRead: () => void
}
```

- 內部 polling 兩個 list endpoint：`/announcements/`、`/conversations/`（含每個 conversation 的最新一則 message 預覽）
- 角色差異：
  - **學生**：可見 conversation = 自己參與的；`unreadCount = unreadAnnouncementIds.length + unreadMessageIds.length`，其中 unreadMessageIds 取每個 conversation 中 `sender_role='teacher'` 且尚未在 localStorage 的訊息 id
  - **教師 / 管理員**：可見全部 conversation；`unreadCount = pendingConversationCount`，定義為 `last_message.sender_role='student'`（=「最後一則是學生發的，等我回」），不計公告

### D. 通知入口：`ContestLayout` 頂部 navbar 鈴鐺

**為何放 navbar 而不是答題畫面 banner**

- 一個 ContestLayout 覆蓋所有 contest 子頁面，不只答題中
- 不吃答題畫面的垂直空間
- 跟既有 `HeaderGlobalBar` 一致風格

**新增兩個元件**

1. **`ContestNotificationBell.tsx`**（掛在 `ContestLayout` 的 `<HeaderGlobalBar>` 內）
   - Carbon `HeaderGlobalAction`，icon 用 `@carbon/icons-react` 的 `Notification`
   - 右上角紅色數字 badge：`unreadCount`（>9 顯示 `9+`，=0 不顯示 badge）
   - 角色差異：
     - **學生**：點擊 → 開 `ContestNotificationModal`（見下）
     - **教師 / 管理員**：點擊 → 直接導向 `AdminConversationsScreen?awaiting=teacher`，不開 modal（待回的對話需要的是處理動作而非閱讀）

2. **`ContestNotificationModal.tsx`**（學生用）
   - Carbon `Modal`，`passiveModal`
   - 內容兩區（依時間倒序，未讀置頂並用分隔線與已讀分開）：
     - **新公告**：title / content / 時間
     - **新訊息**：對話另一端 (老師) / 訊息內容（截斷）/ 題目（若有）/ 時間
   - 底部按鈕：
     - Primary：「我已閱讀」→ markAllRead，關閉
     - Secondary：「前往討論」→ 導向 contest dashboard 的 Q&A tab；保持 modal 已標已讀的副作用
   - **此 Modal 僅是通知摘要，不含發起新對話 / 完整歷史**

### E. 學生端：Contest Dashboard / Q&A Tab

維持 `ContestQAScreen` 入口，但元件拆檔（見 §H）。包含：

- 公告完整歷史列表（含已讀與未讀）
- 「我的對話」列表：每筆顯示 `題號（若有）/ 對方最新訊息預覽 / 時間 / 未讀紅點`
- 點開單筆 → `ConversationThreadView`：時序顯示所有 message，底部有輸入框可繼續發訊（依下表權限決定 enabled）
- 「新增對話」按鈕（原「我要提問」）：開 `StartConversationModal`，可選題目 + 第一則訊息內容
- 公告卡片 / 對話列表項進入 viewport 標已讀；開啟 thread 時 thread 內訊息全部標已讀

### F. 權限狀態表

| 競賽狀態 | 學生看公告/對話 | 學生發起新對話 | 學生在現有對話中回覆 | 教師發公告 | 教師回覆對話 | 教師主動開對話（私訊） |
|---|---|---|---|---|---|---|
| 未開始（published, now < startTime） | ✅ | ❌（disabled，hint：「考試開始後可發問」） | ✅ | ✅ | ✅ | ✅ |
| 進行中 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 已結束（now > endTime） | ✅（只讀） | ❌ | ❌（thread 變唯讀） | ✅ | ✅ | ✅ |

需要對應修改現行 `isReadOnly` 邏輯：原本 `contestStatus !== "published" || isEnded` 一律鎖死所有操作；改為**僅鎖學生的「發起／回覆」相關按鈕**，教師永不鎖。

### G. 教師端

#### G.1 `AdminClarificationsScreen` 改為 `AdminConversationsScreen`

- 對話列表頂部加 Filter：`全部 / 等我回 / 我已回 / 依題目`
  - `等我回 = last_message.sender_role='student'`
  - `我已回 = last_message.sender_role='teacher'`
- 預設排序：`等我回` 優先，再依 `last_message_at` 由新到舊
- 點開單筆 → 同 `ConversationThreadView`，老師在底部輸入框 append message（sender_role 自動為 teacher）
- 公告區「發布公告」按鈕在所有競賽狀態下可用

#### G.2 `AdminProctoringPanel` 新增動作

- 在每位被監考的學生卡片上新增「📩 傳送訊息」按鈕
- 點擊 → 開 `StartConversationModal`（變體）：
  - 標頭顯示「給：{username}」
  - TextArea 輸入第一則訊息內容
  - 不需選題目（problem=null）
  - Primary：「送出」→ 呼叫 `POST /conversations/`，後端依 sender 寫入第一則 `Message(sender_role='teacher')`
- 該訊息會出現在學生 navbar bell 與 dashboard「我的對話」中

### H. 元件拆檔

把現行 `frontend/src/features/contest/components/ContestClarifications.tsx` 整檔砍掉。新結構：

```
frontend/src/features/contest/components/discussion/
  ContestAnnouncementList.tsx        # 公告列表
  ContestConversationList.tsx        # 對話列表（學生：我的對話；老師：所有對話）
  ConversationThreadView.tsx         # 點開單筆對話的 thread 顯示 + 回覆輸入框
  StartConversationModal.tsx         # 學生「新增對話」/ 老師「傳送訊息」共用
  PostAnnouncementModal.tsx          # 教師發公告 modal
  ContestDiscussionView.tsx          # 組合給 ContestQAScreen / AdminConversationsScreen 用
  index.ts

frontend/src/features/contest/components/notification/
  ContestNotificationBell.tsx
  ContestNotificationModal.tsx

frontend/src/features/contest/hooks/
  useContestUnread.ts
  useContestConversations.ts          # 取代 useClarifications，封裝 polling + thread 操作
```

刪除：`ContestClarifications.tsx`、`AnnouncementSectionLayout.tsx`、`DiscussionsSection.tsx`、`useClarifications.ts`。

### I. 後端改動

#### I.1 新增 model + migration

- 建立 `contest_conversations`、`contest_messages` 兩張表（schema 如 §A）
- Migration 同時 `DROP TABLE contest_clarifications`（依使用者指示，不做資料保留）

#### I.2 新增 ViewSets

- **`ContestConversationViewSet`**（巢狀於 `/contests/{id}/conversations/`）
  - list：
    - 學生 queryset：`Q(student=user)`
    - 教師 queryset：所有 contest 內 conversation
  - filter：
    - `?awaiting=teacher|student`（依 `last_message.sender_role` 判斷誰在等對方回）
    - `?problem={uuid}`
  - create payload：`{ problem_id?, initial_content, student_id? }`，後端依 user 角色決定 `student` 與第一則 message 的 `sender_role`：
    - 學生 create：忽略 `student_id`，`student=user`，第一則 `sender_role='student'`
    - 教師 create：必須提供 `student_id`，第一則 `sender_role='teacher'`，permission 限教師 / 管理員
  - retrieve：回傳 conversation + 所有 messages
  - 自訂 action `POST /conversations/{id}/messages/`：append message（前端送 `{ content }`，後端依 sender 自動填 `sender_role`、檢查權限）

- **`ContestMessageViewSet`** 不另外開 root，僅以 nested action 形式存在

#### I.3 既有 ViewSet 調整

- `ClarificationViewSet`：刪除整個檔案
- `urls.py`：移除 `clarifications` router 註冊
- `ContestAnnouncementViewSet`：無 schema 變更；「進行中以外整段 readOnly」是前端邏輯，後端原本就允許教師任何時候發公告，僅做測試覆蓋確認

#### I.4 權限

- 學生對 `ContestConversationViewSet`：
  - list：僅自己參與的
  - retrieve：僅自己參與的
  - create：限自己作為 student
  - append message：限本人是 conversation.student，且該 contest 未結束（依 §F 表）
- 教師 / 管理員：全部允許

## 資料流

```
[Polling 30s]
  ↓
useContestConversations(contestId)  ──→  conversations + latest message preview
useContestAnnouncements(contestId)  ──→  announcements
                                          │
                                          ▼
                          useContestUnread(contestId, userId, role)
                                          │
                ┌────────────────────────┼─────────────────────────┐
                ▼                        ▼                         ▼
   ContestNotificationBell      ContestAnnouncementList    ContestConversationList
   (badge = unreadCount)        (in-viewport markRead)     (in-viewport markRead)
                │                                                  │
                ▼                                                  ▼
      ContestNotificationModal                          ConversationThreadView
      (markAllRead on close, 學生用)                    (open → mark thread msgs read,
                                                         post → append message API)
```

## 錯誤處理

- 發布公告 / 開對話 / 回覆訊息 API 失敗：沿用 `showError(...)` modal
- localStorage 寫入失敗（quota / private mode）：catch 後 log warn，不擋 UI
- polling 失敗：保留 loaded state，不在鈴鐺顯示錯誤訊息
- thread 中追加訊息送出失敗：保留輸入框內容，顯示 inline 錯誤；不清空使用者打的字

## 測試重點

**Frontend**

- `useContestUnread`：學生 / 教師兩種角色下 unreadCount 計算；markRead / markAllRead 寫入 localStorage
- 鈴鐺 badge：`unreadCount` 變化時出現 / 消失，>9 顯示 `9+`
- 學生 Modal：未讀置頂、已讀置底、各自時間倒序
- 教師鈴鐺點擊：導向 `?awaiting=teacher`
- ConversationThreadView：開啟時把 thread 內對方訊息標已讀；送訊失敗保留輸入內容；end-state 對話唯讀
- 權限：未開始 / 進行中 / 已結束三狀態下，學生「新增對話」、「在 thread 中回覆」、教師發公告 / 私訊按鈕的 enabled / disabled
- AdminProctoringPanel：點「傳送訊息」打開 modal，送出後呼叫 conversation create API 帶 `student_id`

**Backend**

- `ContestConversationViewSet`：
  - 學生 list 只看自己；教師 list 看全部
  - 學生 create 不能指定 `student_id`；教師可指定
  - 學生 append message 限自己參與；教師 append 任意 conversation
  - filter `?awaiting` / `?problem` 各自正確
  - 競賽結束後學生 append 被拒（403）
- Migration：drop `contest_clarifications` table 後相關 import 不留殘骸
- `ContestAnnouncementViewSet`：教師在三種競賽狀態下都能 create

## 影響的檔案（粗估）

**Backend（新增）**
- `backend/apps/contests/migrations/00XX_drop_clarification_add_conversation.py`
- `backend/apps/contests/views/conversation.py`
- `backend/apps/contests/serializers.py`（新增 `ContestConversationSerializer`、`ContestMessageSerializer`）
- `backend/apps/contests/tests/conversation/`

**Backend（修改）**
- `backend/apps/contests/models.py`（移除 Clarification、新增 Conversation/Message）
- `backend/apps/contests/admin.py`（移除 Clarification、新增 Conversation/Message）
- `backend/apps/contests/urls.py`（換 router）
- `backend/apps/contests/permissions.py`

**Backend（刪除）**
- 所有 Clarification 相關 view / serializer / 測試 / 引用

**Frontend（新增）**
- `features/contest/components/discussion/*`（如 §H）
- `features/contest/components/notification/ContestNotificationBell.tsx`
- `features/contest/components/notification/ContestNotificationModal.tsx`
- `features/contest/hooks/useContestUnread.ts`
- `features/contest/hooks/useContestConversations.ts`
- `infrastructure/api/repositories` 新增 conversation / message endpoints
- `core/entities/contest.entity` 新增 `ContestConversation`、`ContestMessage` 類型

**Frontend（修改）**
- `features/contest/components/layout/ContestLayout.tsx`（在 `HeaderGlobalBar` 掛鈴鐺）
- `features/contest/screens/ContestQAScreen.tsx`（改用 `ContestDiscussionView`）
- `features/contest/screens/admin/panels/AdminClarificationsScreen.tsx` → 改名為 `AdminConversationsScreen.tsx`
- `features/contest/screens/admin/panels/AdminProctoringPanel.tsx`（每位學生加「📩 傳送訊息」按鈕）
- `features/contest/modules/AdminPanelRendererRegistry.tsx`（key 改為 `conversations`）
- `features/contest/tabConfig.ts` / 路由若有 hardcoded `clarifications` key 一併改

**Frontend（刪除）**
- `features/contest/components/ContestClarifications.tsx`
- `features/contest/components/AnnouncementSectionLayout.tsx`
- `features/contest/components/DiscussionsSection.tsx`
- `features/contest/hooks/useClarifications.ts`

## 開放問題

無。
