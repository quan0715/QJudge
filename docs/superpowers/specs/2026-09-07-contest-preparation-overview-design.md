# 競賽準備階段管理總覽設計

日期：2026-09-07
範圍：教師端 `AdminOverviewScreen` 在競賽尚未開考時的畫面

## 背景

教師建立競賽後進入管理後台總覽，看到的是一整片為 runtime 監控設計的指標：倒數計時「未設定」、學生作答進度 0%、批改進度「尚無批改資料」、在線人數 0、異常事件 0、開始／結束時間「-」。畫面沒有告訴教師下一步該做什麼，右欄唯一醒目的藍色主按鈕是「發布成績」——在草稿階段這是誤導。

三個具體缺陷：

1. **「發布競賽」沒有入口。** 教師唯一能把草稿轉成正式競賽的路徑，是 `設定 → 狀態與權限 → 狀態` 的下拉選單改成 `published`（`AccessSettingsPanel.tsx:87`）。這是設定項，不是動作，教師不會知道。
2. **為準備階段寫的 UI 全是孤兒元件。** `DraftChecklistPanel`、`AdminPreparationDashboard`、`OverviewActionWidgets`、`OverviewInsightsPanel` 都只有自己的測試在引用，production code path 進不去。`OverviewInsightsPanel` 甚至已有「下一步：先完成題目與設定，再發布競賽」的文案。
3. **總覽頁不分階段。** `AdminOverviewScreen.tsx:343` 不論 contest 是 draft 還是 running，都 render 同一個 `AdminOverviewCommandCenter`。`getContestState()`（`contest.entity.ts:638`）已能算出 draft / upcoming / running / ended / archived，只是沒有被總覽頁使用。

成因：commit `426352b0`（2026-05-03，admin overview command center redesign）的計畫原本要求「保留 `OverviewActionWidgets` 作為次要操作區，讓 publish/settings 控制項仍可觸及」，實作時整段從 screen 移除，準備階段的動作入口一併消失。

## 目標

- 尚未開考時，總覽第一眼要回答「還缺什麼」和「下一步按哪裡」
- 「發布競賽」成為畫面上的主要動作，且不會發布出學生進不去的競賽
- 準備階段不顯示恆為零的 runtime 指標
- 回收既有的孤兒元件，不讓同一份 checklist 邏輯存在兩份

## 非目標

- 不改競賽建立流程本身，也不改建立後的落地頁
- 不為 ended 狀態另做結算型畫面（沿用 CommandCenter 既有的成績區塊）
- 不改後端 API；發布沿用 `updateContest(id, { status })`
- 不改 `AdminOverviewCommandCenter` 的內容（只改由誰決定要不要 render 它）

## 狀態切點

`AdminOverviewScreen` 依 `getContestState(contest)` 分歧：

| state | 畫面 |
| --- | --- |
| `draft` | 準備型（`AdminPreparationCommandCenter`） |
| `upcoming` | 準備型（同上，變體見下） |
| `running` | 現有 `AdminOverviewCommandCenter` |
| `ended` | 現有 `AdminOverviewCommandCenter` |
| `archived` | 現有 `AdminOverviewCommandCenter` |

切點是「是否已開考」而非「是否已發布」：已發布但還沒到開始時間時，同樣沒有任何作答資料，教師仍在核對題目與名單，runtime 指標一樣是零。

`getContestState` 在缺少 start/end time 時會回傳 `running`。準備型畫面必須先判斷 `status === "draft"`，再看時間，避免草稿因為沒有時間而被判成 running。實作上以 `contest.status === "draft" || state === "upcoming"` 作為準備型的條件。

## 畫面規格

沿用 `AdminSegmentedDashboard` 的 `header` / `primary` / `side` 三槽骨架，header 與工具列完全沿用現有 `renderContestHeader()`，只換 primary 與 side 的內容，讓發布前後的版面位置連續。

### 主欄（primary）

**資訊列** — 三格：考卷題型、題目數、考生數。移除開始／結束時間格（草稿階段恆為「-」，時間改由 checklist 呈現）。

**發布前檢查** — 四個項目，每項有狀態圖示、標題、一行說明、一顆跳轉按鈕。排序規則：`blocking` 優先，其次 `warning`，最後 `done`；同級維持固定順序。

| 項目 | 條件 | 未滿足時的等級 | 動作 |
| --- | --- | --- | --- |
| 考試時間 | `startTime` 與 `endTime` 皆有效 | `blocking` | 開設定 modal 的 `general` 分頁 |
| 題目準備 | coding 看 `contest.problems.length > 0`；paper_exam 看 `contest.examQuestionsCount > 0` | `warning` | `openPanel("problem_editor")` |
| 考生名單 | `participants.length > 0` | `warning` | classroom-bound 競賽跳 `openPanel("settings")`，否則開 `AddParticipantModal` |
| 競賽規則 | `contest.rules` 去空白後非空 | `warning` | 開設定 modal 的 `general` 分頁 |

`blocking` 用 `--text-danger` 圖示與紅色 tag，`warning` 用 `--text-warning`，`done` 用 `--text-success`。

**考生名單** — 沿用現有 participants 資料，但只顯示顯示名稱與帳號，移除分數、在線狀態、作答進度欄位；草稿階段這些欄位恆為「0.00 分 / 離線」，沒有資訊量。名單為空時顯示 empty state，CTA 與 checklist 的考生名單項一致。

### 側欄（side）

由上而下三塊，之間用 `--border` 分隔：

1. **下一步** — 主要 CTA。draft 時是「發布競賽」（`kind="primary"`），下方一行說明目前的 blocking 原因或「發布後學生就能看到這場競賽」。
2. **學生看到的樣子** — 「預覽考生視角」次要按鈕，接現有的 `onPreview`（`AdminDashboardScreen.handlePreview`，開 `exam-preview`）。draft 時附註「草稿不會出現在學生的競賽列表」。
3. **邀請與入場** — draft 時為 disabled 狀態的佔位（「發布後開放」）；upcoming 時放兩個入口，沿用 header 工具列既有的路徑計算：競賽主頁連結（`contestHomePath`）與簽到投屏（`attendanceProjectionPath`，僅在 `contest.attendanceCheckEnabled` 為真時顯示）。

側欄不再出現「發布成績」。成績相關動作屬於 running/ended，留在 CommandCenter。

### upcoming 變體

同一個元件，三處差異：

- 主 CTA 換成分享連結／簽到投屏，上方顯示到開考的倒數；「發布競賽」按鈕消失
- checklist 的考試時間項變成 `done`，說明改為實際時段
- 側欄底部多一個次要動作「退回草稿」（`updateContest(id, { status: "draft" })`）

## 發布流程與 gate

`handlePublishContest` 的順序：

1. 若 `startTime` 或 `endTime` 無效 → 不呼叫 API，直接開設定 modal 的 `general` 分頁，並以 toast 說明「發布前需要先設定考試時間」
2. 若題數為 0 → 顯示確認對話框，內容點出沒有題目，教師可選擇繼續（時間是硬擋，題目只警告）
3. 呼叫 `updateContest(contest.id, { status: "published" })`
4. 成功後 `refreshContest()`，畫面自動由 draft 變體切到 upcoming 變體，toast 用既有的 `adminOverview.actions.publishContestSuccess`
5. 失敗時 toast 用既有的 `adminOverview.actions.publishContestFailed`，保留在原畫面

「退回草稿」不需要 gate，但要確認對話框，因為會讓學生立即看不到競賽。

## 元件與檔案

新增：

- `frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.tsx` — 準備型畫面外殼，組 `AdminSegmentedDashboard` 的三個槽
- `frontend/src/features/contest/components/admin/AdminPreparationCommandCenter.module.scss`
- `frontend/src/features/contest/components/admin/PreparationChecklist.tsx` — 純展示，接收算好的 checklist items
- `frontend/src/features/contest/components/admin/PreparationChecklist.module.scss`

修改：

- `AdminOverviewScreen.tsx` — 依狀態選擇 render 哪個 command center；新增 `handlePublishContest`、`handleRevertToDraft`；把 `openSettings` 擴充成可帶 section
- `adminOverviewDashboard.model.ts` — 新增 `buildAdminPreparationOverview()`，取代既有的 `buildAdminPreparationDashboard()`
- `features/contest/modules/types.ts` — 新增 `ContestSettingsSectionId`（`"general" | "access" | "display" | "cheatDetection" | "integrity"`，對齊 `ContestSettingsModal` 的 `NAV_ITEM_DEFS`），並把 `AdminPanelProps.onOpenSettings` 型別改為 `(section?: ContestSettingsSectionId) => void`；不傳 section 時維持現行行為（開第一個分頁）
- `AdminDashboardScreen.tsx` — 以 state 保存要開啟的 settings section，傳給 modal
- `ContestSettingsModal.tsx` — 新增 `initialActiveId` prop 並透傳給 `SettingsModal`（`SettingsModal` 已支援此 prop，只是沒有被 `ContestSettingsModal` 接上）

刪除（內容被新元件吸收後）：

- `DraftChecklistPanel.tsx` / `.module.scss` / `.test.tsx` — checklist 邏輯移入 `buildAdminPreparationOverview`
- `AdminPreparationDashboard.tsx` / `.module.scss` / `.test.tsx` — 與新畫面重疊
- `buildAdminPreparationDashboard()` 與 `AdminPreparationDashboardData`、`PreparationReadinessState` 型別，及其在 `adminOverviewDashboard.model.test.ts` 的測試
- `OverviewActionWidgets.tsx` / `.module.scss` / `.test.tsx` — 發布與退回草稿邏輯移入 `AdminOverviewScreen`
- `OverviewInsightsPanel.tsx` / `.module.scss` / `.test.tsx`

保留不動：`AdminOverviewCommandCenter`、`AdminInsightRail`、`AdminSegmentedDashboard`。

## 資料模型

`buildAdminPreparationOverview()` 放在 `adminOverviewDashboard.model.ts`，與既有 `buildAdminOverviewDashboard()` 並列，維持「screen 算資料、component 只渲染」的分工。

輸入：`contest`、`participants`、`tr`（既有的 `DashboardText`）、`nowMs`。

輸出：

```ts
type PreparationItemLevel = "done" | "warning" | "blocking";

interface PreparationChecklistItem {
  key: "schedule" | "problems" | "participants" | "rules";
  level: PreparationItemLevel;
  title: string;
  description: string;
  actionLabel: string;
}

interface AdminPreparationOverviewData {
  phase: "draft" | "upcoming";
  infoCells: { key: string; label: string; value: string }[];
  checklist: PreparationChecklistItem[];
  blockingKeys: PreparationChecklistItem["key"][];
  canPublish: boolean;
  countdownMs: number | null;
  participants: { userId: string; displayName: string; username: string }[];
}
```

`canPublish` 為 `blockingKeys.length === 0`。動作的實際 handler 由 screen 注入，model 只產出 label 與等級，維持可測試性。

## i18n

`adminOverview.actions.publishContest` / `publishContestConfirm` / `publishContestBody` / `publishContestSuccess` / `publishContestFailed` / `revertToDraft` 四語系皆已存在，直接沿用。

新增命名空間 `adminOverview.preparation.*`，涵蓋 checklist 四個項目（考試時間、題目準備、考生名單、競賽規則）的標題／說明／動作、側欄三塊的標題與註記、考生名單 empty state、時間 blocking 的 toast。四個語系（zh-TW / en / ja / ko）同步補齊，不留只有 fallback 的 key。

## 測試

- `adminOverviewDashboard.model.test.ts` — `buildAdminPreparationOverview` 的分支：缺時間 → schedule 為 blocking 且 `canPublish` 為 false；缺題目 → warning 但 `canPublish` 仍為 true；全滿足 → checklist 全 done；draft 與 upcoming 的 `phase` 判定
- `AdminPreparationCommandCenter.test.tsx` — draft 顯示「發布競賽」、upcoming 不顯示且出現「退回草稿」；checklist 排序把 blocking 排最前；考生列不出現分數與在線狀態
- `AdminOverviewScreen` 既有測試 — 補上狀態分歧：draft 不 render CommandCenter、running 仍 render CommandCenter
- 發布 gate：缺時間時點發布不呼叫 `updateContest`，改為開啟 settings modal

## Quality gates

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-repository-exports.js
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all
```

視覺改動另需 dev 環境的 desktop 與 mobile rendered QA，覆蓋 draft 與 upcoming 兩個變體。
