# 無用功能下架與私人教室考試設計

## 摘要

QJudge 將移除目前沒有產品需求、已失效或與核心流程重複的功能。保留的核心流程是：教師管理私人題庫、在教室內建立考試，學生加入教室後作答並查看允許公開的結果。

本次下架包含題目討論、全站排行榜佔位頁、題庫 Marketplace 遺留狀態、AI 使用量入口、全站公告與更新紀錄。考試改為只能屬於一個教室，且固定為私人。`student`、`teacher`、`admin` 平台角色不變。

## 目標

- 刪除已無後端支援的題目討論前端。
- 刪除尚未實作的全站排行榜路由。
- 讓題庫資料模型只表達私人題庫實際需要的狀態。
- 移除沒有計費或額度作用的 AI 使用量產品入口。
- 移除與教室公告、考試公告重複的全站公告。
- 移除未固定維護的更新紀錄頁。
- 強制每場考試屬於一個教室，且沒有公開可見性選項。
- 讓本地 dev DB 與所有環境透過 migration 得到相同的最終 schema。

## 不在本次範圍

- 移除或重新命名 `admin` 角色。
- 調整 `student`、`teacher`、`admin` 的平台權限。
- 移除教室的 `ta` 或考試的 `co_owner` scope role。
- 移除教室公告、考試公告或考試中的 Clarification／Q&A。
- 移除題目版本紀錄。`QuestionVersion` 仍用於版本歷史與考試綁定。
- 移除 AI Copilot、AI 批改、MCP 或 AI 服務內部的執行 telemetry。
- 下架 QR 簽到、防作弊、監考、多語系、報表或匯出功能。

## 最終產品行為

### 題目討論

題目詳細頁不再顯示「討論」頁籤，也不能新增、回覆、按讚或管理討論。前端 discussion components、hooks、entities、mappers 與 repositories 全數刪除。後端 discussion models 已由既有 migration 移除，因此不新增相容 API 或提示頁。

舊前端程式若呼叫已移除的 discussion API，會依正常路由得到 `404`；正式前端不再發出這些請求。

### 全站排行榜

刪除 `/ranking` 的 Coming Soon 路由及相關導覽與翻譯殘留。考試內的排行榜與成績統計保留，因為它們屬於單一考試流程。

### 私人題庫

題庫只由教師或管理員持有，不再存在平台官方題庫。`QuestionBank.owner` 改為必填，ownerless 題庫由 migration 直接刪除。

`QuestionAsset` 移除以下只有單一實際值的欄位：

- `visibility`；所有題目都視為私人。
- `version_state`；建立或更新後的版本直接可供擁有者使用。
- `status`；不再維護 draft／active／archived 狀態機。

`QuestionVersion`、`latest_version`、`QuestionBankMembership` 與 `ContestQuestionBinding` 保留。刪除題目或題庫仍走既有刪除流程，不以 `QuestionAsset.status` 表達封存。

### AI 使用量

帳號設定移除「AI 使用量」頁籤、panel、翻譯與 `/api/v1/ai/usage/` 使用者 API。AI 執行不再依 token 數、run 數、額度或方案決定權限。

AI service 可繼續記錄 provider usage，供執行追蹤、錯誤診斷及基礎設施觀測使用；該資料不是計費或產品 entitlement。

### 全站公告

移除 `/management/announcements`、使用者選單入口、管理畫面、frontend repository/entity，以及 `apps.announcements` 的 runtime routes、views、serializers、admin 與 model。

教室公告與考試公告保留。首頁或其他畫面不再請求全站公告。

### 更新紀錄

移除 `/changelog`、使用者選單入口、screen、route 與 changelog 翻譯 namespace。公開文件 `/docs` 維持不變。

### 教室考試

每場考試必須且只能綁定一個教室：

- 教室可擁有多場考試。
- 同一場考試不能出現在多個教室。
- 建立考試必須從教室 context 進行。
- 不提供未綁教室的全站考試建立或瀏覽流程。

考試固定為私人。`Contest.visibility` 從 model、serializer、API filter、frontend entity、表單與權限判斷移除。學生只能透過教室 membership／contest participation 存取考試；匿名使用者與未加入教室的 outsider 不能讀取考試或排行榜。

`Contest.status` 的 draft、published、archived 流程保留，因為它控制考試生命週期，而不是公開探索。

## 資料遷移

### 未綁定與重複綁定的考試

資料 migration 依序執行：

1. 找出沒有 `ClassroomContest` binding 的考試並直接刪除。
2. 依現有 foreign key 規則刪除其參賽、題目綁定、作答、提交、成績、活動、公告、Clarification 與監考資料；migration test 必須證明沒有孤兒資料。
3. 若同一場考試意外有多個教室 binding，保留 `bound_at` 最早的 binding，刪除其他重複 binding，不刪除考試內容。
4. 將所有保留考試正規化為 `visibility=private`。
5. 為 `ClassroomContest.contest` 加上 unique constraint，從資料庫保證一場考試只屬於一個教室。
6. 移除 `Contest.visibility` 欄位。

刪除未綁定考試是刻意且不可逆的資料清理，不建立臨時教室，也不匯出備份檔。

### 題庫與題目

資料 migration 會：

1. 刪除 `owner IS NULL` 的題庫及其 membership；題目資產依既有 ownership 與 foreign key 規則處理。
2. 將 `QuestionBank.owner` 改成 non-null foreign key。
3. 移除 `QuestionAsset.visibility`、`version_state` 與 `status`。
4. 保留 owned banks、question assets、versions、coding adapters、exam adapters、bank memberships 與 contest bindings。

Migration 不新增預設 owner、官方帳號、替代 status 或相容欄位。

### 全站公告

全站公告資料不保留。由仍在 `INSTALLED_APPS` 的核心 migration 以可重複執行的方式刪除全站公告資料表；runtime 同版移除 `apps.announcements` 註冊。教室與考試公告資料表不受影響。

## 程式邊界

- `frontend/src/features/problems` 保留題目內容、解題與提交，不再組裝 discussion workflow。
- `frontend/src/features/question-banks` 只處理 owner-owned private banks。
- `frontend/src/features/contest` 只處理 classroom-scoped contests。
- `frontend/src/features/admin` 保留使用者管理與草稿題目管理，不再包含全站公告。
- `frontend/src/features/auth` 保留個人檔案、偏好與 MCP 設定，不再包含 AI 使用量產品頁。
- `frontend/src/infrastructure` 不保留 retired API repositories 或 mappers。
- `backend/apps/question_bank` 表達 private ownership、版本與綁定，不保留 Marketplace 狀態。
- `backend/apps/classrooms` 持續擁有教室與考試的關聯約束。
- `backend/apps/contests` 不判斷公開可見性，只判斷教室／考試 scope role 與生命週期。
- `backend/apps/users` 的平台角色模型不變。

## 錯誤處理

- 已移除的 frontend URL 由既有 404 fallback 處理，不新增 redirect。
- 已移除的 API 由正常 Django／DRF routing 回傳 `404`。
- 從非教室 context 建立考試時回傳 validation error，不自動建立教室。
- 重複將同一考試綁到另一個教室時，由 service validation 提供明確錯誤，資料庫 unique constraint 作最後防線。
- Migration 任一步失敗時中止部署，不留下部分套用的 schema。

## 驗證

### Migration

- migration test 建立未綁定考試及完整關聯資料，套用後確認考試與所有關聯資料消失。
- migration test 建立重複 classroom bindings，確認只保留最早的 binding。
- 套用 migration 後，一場考試無法建立第二個 classroom binding。
- 所有保留考試都沒有 `visibility` 欄位，且只能經教室關係取得。
- ownerless 題庫被刪除，owned private banks 與題目版本完整保留。
- `QuestionAsset` 的三個固定狀態欄位不存在。
- 全站公告資料表不存在，教室與考試公告資料表仍存在。
- dev DB 執行 migration 後，`showmigrations` 與 `makemigrations --check --dry-run` 顯示無未套用或未產生的變更。

### Backend

- 教師可在自己管理的教室建立、編輯與封存考試。
- 不帶 classroom context 的考試建立請求失敗。
- 教室成員與參賽者可依既有規則存取考試；匿名與 outsider 請求失敗。
- 題庫 CRUD、題目版本、匯入考試與 coding adapter 測試維持通過。
- discussion、AI usage 與全站公告 API 回傳 `404`。
- 教室公告、考試公告、考試 Clarification 與考試內排行榜測試維持通過。

### Frontend

- 題目頁沒有討論頁籤，也沒有 discussion network request。
- `/ranking`、`/changelog` 與 `/management/announcements` 進入既有 404。
- 設定視窗沒有 AI 使用量頁籤。
- 題庫編輯與考試建立 UI 不顯示公開、送審、狀態或官方題庫選項。
- 考試只能從教室頁建立並導向 classroom-scoped route。
- student、teacher、admin 角色標示與 route guards 不變。

### 靜態與品質檢查

- runtime search 找不到 discussion frontend、全站 ranking route、changelog、global announcements、AI usage UI/API，以及題庫／考試 visibility 狀態的引用。
- committed OpenAPI schema 不包含已移除操作與欄位。
- frontend typecheck、focused tests、完整 build、naming lint 與 architecture lint 通過。
- backend migration tests、focused tests 與完整測試通過。

## 完成條件

所有下架項目都已從 runtime、路由、API schema、資料模型、翻譯與測試 fixture 移除；資料 migration 已在 dev DB 套用；保留的私人題庫、教室考試、作答、評分、公告與角色流程有直接測試證據，且沒有為舊功能保留 feature flag、相容 endpoint 或替代狀態欄位。
