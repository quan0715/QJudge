# 題目編輯鎖定正規化與第一波程式收斂設計

## 背景

目前 `Contest` 以 `question_edit_locked`、`question_edit_locked_at` 與
`question_edit_lock_trigger` 三個欄位保存題目是否鎖定。系統在考生開始紙筆考試、
寫入考試答案或送出正式程式題解答時更新這些欄位；讀取與修改題目時，又同時檢查
部分既有作答狀態作為 fallback。

這讓同一件事存在兩套真相：實際的考生作答／提交紀錄，以及額外維護的鎖定欄位。
鎖定欄位需要回填命令、寫入 hook、觸發原因與時間，也可能因刪除資料或漏掉寫入路徑
而和真實狀態不同步。

本次調整採用更直接的規則：鎖定只代表「目前仍有考生可能看過或作答這份題目」，
因此應由現有證據動態推導，不再永久記錄鎖定狀態。若最後一筆相關證據被刪除，題目
可以再次編輯；這符合本系統目前不需要保存完整稽核歷史的產品前提。

## 目標

- 移除 `Contest` 上三個題目鎖定欄位及其同步機制。
- 以單一、可讀的查詢規則動態判斷題目內容是否鎖定。
- 保持目前前端編輯器的使用方式：鎖定時停止 auto-save，使用者嘗試儲存時顯示通知。
- 保護「產生考生曝光證據」與「修改題目內容」之間的競態條件。
- 順便刪除本功能附近已確認無用途的 result wrapper、fallback modal 與舊 snapshot fixture。

## 非目標

- 不建立題目內容版本、評分規則版本或稽核紀錄。
- 不保存鎖定發生時間與觸發來源。
- 不改變標準答案、配分與主觀題評分後續處理流程。
- 不進行跨 feature 的全專案 Legacy 清理。

## 動態鎖定規則

新增唯讀的 domain/service predicate，例如
`is_contest_question_edit_locked(contest)`，作為唯一判斷入口。

### 紙筆考試

符合任一條件即鎖定：

1. 目前存在 `started_at` 不為空的參賽紀錄。
2. 目前存在任何隸屬該考試的 `ExamAnswer`。

第一項代表考生已進入考試，可能看過題目；第二項保護歷史資料或不完整狀態，避免在
參賽狀態異常但答案仍存在時開放修改。只要上述證據全數不存在，即解除鎖定。

### 程式題競賽

目前存在任一筆符合下列條件的提交時鎖定：

- 隸屬該競賽；
- `source_type` 為正式競賽來源；
- 不是測試執行；
- 提交者不是該競賽的管理者。

管理者測試或管理操作不應造成鎖定。管理者身分沿用既有
`can_manage_contest` 權限判斷，避免另寫一套角色規則。這個判斷不是高頻列表查詢，
可優先選擇清楚且一致的實作，不建立額外 materialized flag。

### 刪除語意

鎖定是現況衍生值，不是不可逆事件。刪除最後一筆開始紀錄、答案或正式提交後，系統
會自然解除鎖定。這是經確認的產品行為，而不是資料修復 fallback。

## 一致性與競態控制

動態推導移除同步負擔，但仍必須避免以下競態：一個請求判斷尚未鎖定並修改題目，
另一個請求同時建立第一筆作答或提交。

所有會建立「題目已曝光」證據的交易，以及所有會修改受鎖定保護之題目內容的交易，
都必須先以穩定順序鎖定對應 `Contest` 資料列，並持有到交易完成：

- 開始／恢復紙筆考試：鎖定競賽列後更新參賽者 `started_at`。
- 正式競賽提交：鎖定競賽列後建立 submission。
- 題目新增、修改、刪除、排序、群組與試卷結構調整：鎖定競賽列後重新計算衍生狀態，
  通過後才寫入。
- 編輯被多個競賽共用的程式題：依競賽 ID 排序並鎖定所有相關競賽列，再檢查是否有
  任一競賽已鎖定，以降低死鎖風險。

驗證失敗仍回傳目前既有的 409 衝突語意。這些 transaction 與資料列鎖屬於一致性
保護，不因移除欄位而刪除。

## API 與前端契約

競賽詳細資料保留 `question_edit_locked`，但改成 serializer 計算欄位，讓既有編輯器
不需要改變判斷介面。`question_edit_locked_at` 與 `question_edit_lock_trigger` 從 API、
前端 DTO、mapper 與 domain entity 移除。

競賽列表不回傳 `question_edit_locked`，避免每列額外執行衍生查詢；目前鎖定狀態只在
進入題目編輯情境時需要。

前端保留已核准的互動：

- 未鎖定時可使用 auto-save。
- 鎖定後停止 auto-save。
- 使用者主動嘗試儲存受保護內容時，顯示題目已鎖定的通知。
- 評分相關欄位繼續走既有的明確儲存與影響確認流程。

## 第一波鄰近程式收斂

本次只處理已確認沒有產品用途或重複責任的內容：

1. `locked_question_update` 不再回傳只被包裝、未被呼叫端使用的
   `LockedQuestionUpdateResult`；直接回傳更新後的 `ExamQuestion`，並移除無人使用的
   `affected_answers` 計數。
2. 移除 `contests.services` 中未被使用的重新匯出，呼叫端維持從實際模組匯入。
3. `ScorePolicyMenu` 的 `impactContext` 改為必要參數，所有正式呼叫端一律開啟影響確認
   dialog；刪除不會走到的 `ScorePolicyModal` fallback 與相關狀態。
4. 移除前端測試中殘留的 `questionSnapshot` 輸入 fixture。保留「輸出不可再含 snapshot」
   的 schema／repository regression test，因為它是在保護新契約，不是相容性 fallback。

不刪除錯誤處理、transaction、API 409 mapping 或必要的回歸測試；它們仍有明確職責。

## 資料庫遷移與部署

新增 migration 移除：

- `question_edit_locked`
- `question_edit_locked_at`
- `question_edit_lock_trigger`

既有 migration 歷史不重寫。欄位移除後，一併刪除鎖定寫入 service、觸發 hook、回填
management command 及只驗證 materialized 欄位的測試。部署不需要資料回填；新版本
直接依當下的作答與提交資料計算狀態。

## 驗證策略

後端至少涵蓋：

- 紙筆考試未開始、已開始、有答案、刪除最後證據後解除鎖定。
- 程式題無提交、一般考生正式提交、測試提交、管理者提交，以及刪除最後正式提交後
  解除鎖定。
- 題目各種內容修改路徑在鎖定時回傳 409，評分欄位仍按既有規則運作。
- 競賽 detail 有 computed `question_edit_locked`，list 與 API schema 不再包含已移除欄位。
- migration graph 無遺漏，`makemigrations --check` 通過。

前端至少涵蓋：

- mapper 與 domain model 只保留 boolean 鎖定狀態。
- 鎖定後不觸發 auto-save，主動儲存顯示通知。
- `ScorePolicyMenu` 一律走 impact dialog，沒有 fallback modal。
- snapshot fixture 移除後，repository 仍不產生 `questionSnapshot`。

最後執行受影響後端測試、前端測試與 build、架構／命名／Carbon gate；若全域 gate 有
既存問題，需明確區分本次變更與 baseline。
