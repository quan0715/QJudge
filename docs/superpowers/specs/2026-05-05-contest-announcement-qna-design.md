# 競賽公告與提問功能 UX 設計

- 日期：2026-05-05
- 分支：dev
- 狀態：Draft（待 writing-plans）

## 目標

讓競賽中的「公告」與「Q&A 提問」功能在學生端與教師端形成一致、可被注意到的流程，並修正目前在答題畫面內完全看不到通知、教師無法在考試前後發公告的缺陷。

## 範圍與非範圍

**範圍**

- 學生在答題畫面（`PaperExamAnsweringScreen`）能被「通知」到新公告與新回覆。
- 學生與教師在 contest dashboard / admin panel 上的完整公告與 Q&A 互動。
- 教師端在競賽未開始 / 進行中 / 已結束三種狀態下都能發公告。
- 既有 `ContestClarifications.tsx`（405 行混合元件）拆檔。

**非範圍**

- 不引入新的後端表（無 ReadReceipt、無 watermark 欄位）。
- 不顯示「已讀人數 / 未讀名單」（後端沒有資料來源）。
- 不做 SSE / WebSocket，沿用現有 polling。
- 不做答題畫面內的提問（學生想提問需回 dashboard）。
- 不修改既有競賽分數 / 排行榜 / 監考相關流程。

## 現況差距

| 既有 | 缺陷 |
|---|---|
| `ContestAnnouncement`、`Clarification` model | 缺「已讀」相關概念 |
| `useClarifications` polling | 沒有未讀數計算 |
| `ContestClarifications.tsx` | 405 行單檔，混合公告 + Q&A + 三種 modal |
| `ContestQAScreen` / `AdminClarificationsScreen` | 在「進行中以外」整段 readOnly，導致教師考試前後不能發公告 |
| `PaperExamAnsweringScreen` | 完全沒有通知入口 |
| Clarification list endpoint | 未確認 `is_public=true` 的提問對非作者學生是否可見 |

## 設計

### A. 已讀狀態：localStorage

- 不動後端。每個學生瀏覽器自己記。
- key：`qjudge.contest.{contestId}.readIds`
- value：JSON 陣列，混存兩種前綴 id：
  - `ann:{announcementId}`
  - `clr:{clarificationId}:{answered_at_iso}`
- 「未讀 clarification」嚴格定義為 `status='answered' AND clr:{id}:{answered_at} 不在 readIds 中`。亦即「沒被回覆過的 clarification」（pending）不算未讀，不會出 banner；教師若日後修改回覆造成 `answered_at` 改變，會視為新一輪未讀。
- 已讀寫入時機：
  - 答題畫面 NotificationModal 點「我已閱讀」或「✕」 → 把 modal 顯示的所有 id 一次寫入。
  - Dashboard 上 `ContestAnnouncementList` / `ContestClarificationList` 的卡片進入 viewport（IntersectionObserver）→ 標單筆已讀。
- 跨裝置 / 清快取會重新提示，這是接受的取捨（考試多半同一台電腦）。

### B. 未讀計算 hook：`useContestUnread`

```
useContestUnread(contestId, currentUserId): {
  unreadAnnouncementIds: string[],
  unreadClarificationIds: string[],   // 含「對我可見的」公開 Q&A 與「自己提問的私下新回覆」
  unreadCount: number,                 // 兩者長度加總
  markRead: (ids: string[]) => void,
  markAllRead: () => void,
}
```

- 內部 reuse 既有 `useClarifications`（取資料 + polling）。
- 對學生：可見的 clarification = 自己發問的所有 + 其他人的 `is_public=true & status='answered'`。對「未讀」的計算只看其中 `status='answered'` 的子集合（見 §A 定義）。
- 對教師：本 hook 不啟用 banner（教師不需要公告通知，自己發的）。
- 對應 react state 變化會觸發 banner 的出現 / 消失。

### C. 學生端：答題畫面（`PaperExamAnsweringScreen`）

**新增兩個元件**

1. `ExamNotificationBanner.tsx`
   - 位置：考試版面頂部，緊接 ExamNavigator 上方。
   - 出現條件：`unreadCount > 0`。
   - 文案：`你有 {unreadCount} 則新訊息 · 點此查看`。
   - 行為：點擊整條 banner → 打開 `ExamNotificationModal`。`✕` 按鈕 = 直接 markAllRead 並關閉 banner（不必開 modal）。
   - 樣式：Carbon `InlineNotification` (kind=`info`) 為主，使用 `--cds-support-info` 顏色。

2. `ExamNotificationModal.tsx`
   - Carbon `Modal`，`passiveModal` 形式。
   - 內容分兩區（依時間倒序，未讀置頂並用分隔線與已讀分開）：
     - **新公告**：title / content / 時間。
     - **新回覆**：題號（若有）/ 自己原本的問題摘要 / 教師回覆內容 / 時間。
   - 底部按鈕：
     - Primary：「我已閱讀」→ markAllRead，關閉。
     - Secondary：「前往討論區」→ 導向 contest dashboard 的 Q&A tab；保持 modal 已標已讀的副作用。
   - **此 Modal 不含「提問」、「公開 Q&A 列表」、「歷史公告列表」**。

### D. 學生端：Contest Dashboard / Q&A Tab

維持 `ContestQAScreen` 入口，但元件拆檔（見 §G）。包含：

- 公告完整歷史列表（含已讀與未讀）。
- 「我的提問」列表 + 狀態（pending / answered）+ 教師回覆內容。
- 「公開 Q&A」列表（`is_public=true` 的提問）：匿名顯示，僅顯示「題號 / 問題 / 公開回覆」，不顯示提問者帳號。
- 「我要提問」按鈕（依下表權限決定 enabled）。
- 卡片進入 viewport 時對單筆 id 標已讀（`useContestUnread.markRead`）。

### E. 權限狀態表

| 競賽狀態 | 學生看公告 | 學生發問 | 教師發公告 | 教師回覆 |
|---|---|---|---|---|
| 未開始（published, now < startTime） | ✅ | ❌（按鈕 disabled，hint：「考試開始後可發問」） | ✅ | ✅ |
| 進行中 | ✅ | ✅ | ✅ | ✅ |
| 已結束（now > endTime） | ✅（只讀） | ❌ | ✅ | ✅ |

需要對應修改 `ContestClarifications.tsx` 既有的 `isReadOnly` 邏輯：原本 `contestStatus !== "published" || isEnded` 一律鎖死所有操作；改為**僅鎖學生的「我要提問」**，教師發公告 / 回覆永不鎖。

### F. 教師端：`AdminClarificationsScreen`

- 提問列表頂部加 Filter：`全部 / 待回覆 / 已回覆 / 依題目`。
- 預設排序：`status=pending` 優先，再依 `created_at` 由新到舊。
- 回覆 Modal 維持現有「`公開 / 私下`」切換。
- 公告區「發布公告」按鈕在所有競賽狀態下可用。

### G. 元件拆檔

把現行 `frontend/src/features/contest/components/ContestClarifications.tsx` 拆掉：

```
frontend/src/features/contest/components/discussion/
  ContestAnnouncementList.tsx        # 公告列表（顯示 + 未讀標記）
  ContestClarificationList.tsx       # Q&A 列表（含 tab：我的提問 / 公開 Q&A）
  AskClarificationModal.tsx          # 學生發問 modal
  ReplyClarificationModal.tsx        # 教師回覆 modal
  PostAnnouncementModal.tsx          # 教師發公告 modal
  ContestDiscussionView.tsx          # 組合上述五個，給 ContestQAScreen / AdminClarificationsScreen 用
  index.ts

frontend/src/features/contest/components/exam/
  ExamNotificationBanner.tsx
  ExamNotificationModal.tsx

frontend/src/features/contest/hooks/
  useContestUnread.ts
```

刪除：`ContestClarifications.tsx`、`AnnouncementSectionLayout.tsx`（功能搬入 `ContestAnnouncementList`）、`DiscussionsSection.tsx`（同樣搬入 `ContestClarificationList`）。

### H. 後端最小改動

僅修兩個 ViewSet，不新增表 / 欄位 / 端點：

1. **`ClarificationViewSet` query filter**：
   - 支援 `?status=pending|answered`
   - 支援 `?problem={uuid}`
   - 學生端 list queryset：`Q(author=user) | Q(is_public=True, status='answered')`（公開 Q&A 必須已被回覆才出現，避免「公開待答」造成噪音）。
   - 教師端 list queryset：所有 contest 內 clarification。

2. **`ContestAnnouncementViewSet`**：無需改動 schema。確認 list permission 對所有 enrolled 學生開放，create / update / delete 限教師 + 管理員（既有行為應已正確，僅做驗證）。

如測試發現 list queryset 與此規格不符，視為 bug 修補。

## 資料流

```
[Polling 30s]
  ↓
useClarifications(contestId)  ──→  raw announcements + clarifications
                                          │
                                          ▼
                          useContestUnread(contestId, userId)
                                          │
                ┌────────────────────────┼─────────────────────────┐
                ▼                        ▼                         ▼
   ExamNotificationBanner      ContestAnnouncementList     ContestClarificationList
   (only when unread > 0)      (in-viewport markRead)      (in-viewport markRead)
                │
                ▼
        ExamNotificationModal
        (markAllRead on close)
```

## 錯誤處理

- 發布 / 回覆 / 提問 API 失敗：沿用現有 `showError(...)` modal，文案再依操作分（已存在）。
- localStorage 寫入失敗（quota / private mode）：catch 後 log warn，不擋 UI 流程；下次仍會視為未讀，使用者體驗等同 banner 多顯示一次。
- polling 失敗：沿用 `useClarifications` 既有錯誤狀態，不在 banner 顯示錯誤訊息（避免雜訊）。

## 測試重點

- `useContestUnread`：給定 mock list + localStorage state，驗證 unreadCount 與 markRead 的副作用。
- 權限：未開始 / 進行中 / 已結束三狀態下，學生提問按鈕 enabled / disabled 與教師發公告按鈕都 enabled 的行為。
- 答題畫面 banner：`unreadCount` 變化時的出現 / 消失；點擊 / 點 ✕ / 點「我已閱讀」三個入口都把 ids 寫進 localStorage。
- Modal 顯示順序：未讀置頂、已讀置底、各自時間倒序。
- 公開 Q&A 匿名：DOM 上不出現提問者 username。
- Backend filter：`?status=pending` 與 `?problem={uuid}` 對學生 / 教師兩個角色的 queryset 結果。
- Backend 公開 Q&A 可見性：「他人發的 `is_public=true & status='answered'`」對學生可見；「他人發的 `is_public=false`」對學生不可見。

## 影響的檔案（粗估）

**Backend**
- `backend/apps/contests/views/clarification.py`（filter + queryset）
- `backend/apps/contests/tests/`（新增 viewset filter + 可見性測試）

**Frontend（新增）**
- `features/contest/components/discussion/*`
- `features/contest/components/exam/ExamNotificationBanner.tsx`
- `features/contest/components/exam/ExamNotificationModal.tsx`
- `features/contest/hooks/useContestUnread.ts`

**Frontend（修改）**
- `features/contest/screens/paperExam/PaperExamAnsweringScreen.tsx`（掛 banner）
- `features/contest/screens/ContestQAScreen.tsx`（改用 `ContestDiscussionView`）
- `features/contest/screens/admin/panels/AdminClarificationsScreen.tsx`（改用 `ContestDiscussionView` + filter）

**Frontend（刪除）**
- `features/contest/components/ContestClarifications.tsx`
- `features/contest/components/AnnouncementSectionLayout.tsx`
- `features/contest/components/DiscussionsSection.tsx`

## 開放問題

無。所有 UX 取捨已在腦力激盪階段確認。
