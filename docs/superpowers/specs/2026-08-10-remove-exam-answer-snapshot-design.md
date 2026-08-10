# 移除考試作答 Snapshot 與鎖定後評分修正設計

日期：2026-08-10
狀態：設計已確認

## 背景

`ExamAnswer.question_snapshot` 會在考生第一次送出作答時，複製題幹、選項、題型、標準答案、配分與詳解。自動評分、成績 API、報表與前端又優先讀取這份資料。教師後來修正標準答案時，既有作答仍可能沿用 snapshot 內的舊答案評分。

題目鎖定目前把所有欄位視為同一類資料。只要出現正式作答，教師便不能修正標準答案或一般配分。前端也把整張題目卡設為唯讀，只有計分政策選單例外。

## 目標

1. 完整移除每筆作答上的題目 snapshot。
2. 考生開始考試後，鎖定他實際會看到的試卷內容。
3. 鎖定後仍允許教師修正標準答案、評分參考、配分與詳解。
4. 鎖定後停用題目 auto-save，改由教師明確確認更新及後續處理方式。
5. 不新增稽核表、評分版本或待重批狀態欄位。

## 不在本次範圍

- 不建立題目內容版本或評分規則版本。
- 不保存評分規則異動歷程。
- 不保留任何可供評分使用的 answer snapshot。
- 不把歷史 snapshot 轉存到其他欄位。
- 不改變考生作答內容的格式。

## 欄位責任

考試開始後，後端依「持久化資料的實際值是否改變」判斷更新類型。前端即使送出完整題目 payload，只要內容欄位沒有改變，就不會被誤判為修改試卷。

| 類別 | 欄位 | 開考後行為 |
| --- | --- | --- |
| 試卷內容 | `prompt`、`options`、`question_type`、`order`、`group_id`、`order_in_group`、`answer_format` | 唯讀 |
| 題組內容 | 題組標題、共同題幹、題組順序 | 唯讀 |
| 評分規則 | `correct_answer`、`reference_answer_document`、`score`、`score_policy`、`score_policy_config` | 明確確認後儲存 |
| 成績說明 | `explanation`、`explanation_document` | 明確確認後儲存 |

建立、刪除、複製、匯入與重新排序題目仍屬試卷內容異動，開考後一律拒絕。

## 開考與鎖定

第一位考生進入 `IN_PROGRESS` 時，系統永久設定考試的題目鎖定，不再等到第一筆非空作答。題目鎖定新增 `exam_started` 觸發來源。

為避免歷史資料或並行請求繞過鎖定，寫入端同時檢查：

- `Contest.question_edit_locked`；
- 是否已有考生處於 `IN_PROGRESS`、`PAUSED`、`LOCKED` 或 `SUBMITTED`。

開始考試與更新題目都在 transaction 中鎖定同一筆 `Contest`。若兩個請求同時發生，後取得鎖定的一方重新檢查狀態，因此不會在考生開始後寫入新的試卷內容。

## 資料模型

新增 migration 刪除 `ExamAnswer.question_snapshot`，並加入 `exam_started` 題目鎖定觸發來源。除此之外不新增資料表或欄位。

所有題目顯示與評分資料都由 `ExamAnswer.question_id` 關聯的 `ExamQuestion` 取得。既有 snapshot 不做資料搬移。開考後禁止刪除題目，因此 live question 是唯一資料來源。

目前已使用下列資料表示批改狀態：

- `score is null`：待批改；
- `graded_by`、`graded_at`：最後批改者與時間；
- `feedback`：目前評語。

系統不新增 `needs_regrade`。教師選擇「標記待批改」時，沿用 `score is null` 表示狀態。

## 編輯器行為

### 未鎖定

維持現有行為：表單變更後等待一秒 auto-save，欄位 blur、關閉卡片或按 Escape 時也會儲存。

### 已鎖定

- 停用所有題目欄位的 auto-save 與 blur-save。
- 題幹、選項文字、題型、順序、題組與作答格式保持唯讀。
- 正確答案、評分參考、配分與詳解可進入編輯狀態。
- 編輯後顯示「尚未儲存」與明確的「儲存變更」按鈕。
- 關閉有未儲存內容的卡片時，教師只能選擇繼續編輯或放棄變更。
- 成功或失敗回饋使用既有 toast；有評分影響的選擇使用 Carbon confirmation modal。

目前 `ExamQuestionEditCard` 的 `frozen` 會禁止整張卡片進入編輯。實作時要拆成「試卷內容唯讀」與「評分欄位可編輯」，不能再用單一 boolean 同時控制兩類欄位。

## 鎖定後的儲存確認

前端根據本次編輯的實際差異及現有已批改作答數，顯示以下確認內容。後端仍會自行重新計算差異與受影響筆數，不信任前端提供的統計值。

### 客觀題

`correct_answer` 或 `score` 改變且已有作答時，modal 說明受影響的作答數，以及重新批改後會重算總分。選項為：

- `取消`；
- `儲存並重新批改`。

確認後，所有既有作答以目前題目的 `question_type`、`correct_answer` 與 `score` 重新執行 `auto_grade()`，再重算考生總分。客觀題結果可確定計算，因此不提供保留舊分的選項。若成績已發布，系統將 `results_published` 設為 `False`。

### 主觀題

`correct_answer`、`reference_answer_document` 或 `score` 改變且已有已批改作答時，modal 說明已批改數量。選項為：

- `取消`；
- `只儲存規則`；
- `儲存並標記待批改`。

`只儲存規則`不修改既有分數、批改者或發布狀態，後續是否重新批改由教師負責。

`儲存並標記待批改`會將已批改作答的 `score`、`is_correct`、`graded_by` 與 `graded_at` 設為空值，保留 `feedback` 作為重新批改參考，接著重算所有考生總分。若成績已發布，系統將 `results_published` 設為 `False`。

未批改作答不需要更新。

### 計分政策與詳解

- `score_policy` 或 `score_policy_config` 改變時，沿用現有影響預覽與明確確認流程。系統不覆寫 `ExamAnswer.score`，只透過 `ExamScoringService` 重算有效配分與考生總分。若成績已發布，系統將 `results_published` 設為 `False`。
- 只有 `explanation` 或 `explanation_document` 改變時，不處理既有批改。若成績已發布，確認訊息要明確說明考生可見內容會立即改變。
- 沒有既有作答或批改可受影響時，modal 只確認鎖定後仍要更新評分資料，不顯示重批選項。

## 後端交易與 API

沿用現有題目更新入口，但鎖定後的更新 request 必須包含一次性的 `existing_grades_action`：

- `regrade`：客觀題重新批改；
- `keep`：只儲存規則或詳解；
- `mark_pending`：主觀題既有批改改為待批改。

這個值是 command option，不寫入資料庫。後端 application service 在同一個 transaction 中：

1. 鎖定考試、題目及需要處理的作答。
2. 比對資料庫與驗證後資料，分類試卷內容及評分資料的實際差異。
3. 若開考後有試卷內容異動，回傳 `409 CONTEST_QUESTION_EDIT_LOCKED`，不寫入任何欄位。
4. 驗證 `existing_grades_action` 是否符合題型與差異；不符合時回傳 `400`。
5. 更新評分資料。
6. 依 action 重新批改、保留原批改或標記待批改。
7. 必要時重算考生總分及取消成績發布。
8. transaction 完成後清除 dashboard cache。

規則更新與所選處理動作不可拆成兩個 request，避免規則已更新但作答處理失敗的半完成狀態。

## 讀取流程

- `ExamAnswerDetailSerializer` 繼續提供既有的 flattened 題目欄位，但全部直接讀取 `answer.question`。
- API 移除 `question_snapshot`。
- 成績、學生 dashboard、HTML/PDF 報表與匯出內容一律讀取目前題目與目前評分結果。
- 前端移除 `QuestionSnapshotDto`、`QuestionSnapshot`、`questionSnapshot` mapper 與所有 snapshot fallback。
- MCP grading payload 不再需要 `_strip_snapshots`；移除該函式及相關 snapshot 測試資料。

## 錯誤處理

- 無管理權限：`403`。
- 開考後修改試卷內容：`409 CONTEST_QUESTION_EDIT_LOCKED`。
- 鎖定後缺少或傳入不適用的 `existing_grades_action`：`400`。
- 評分欄位格式錯誤：`400`。
- 重批、總分重算或標記待批改失敗：整筆 transaction 回滾，不留下部分更新。
- 儲存失敗時保留前端 dirty state，讓教師重試或放棄變更。

## Migration 與相容性

同一次發布包含 backend、frontend 與 MCP 變更，因為 `question_snapshot` 會從 API contract 移除。migration 只刪除欄位並調整鎖定來源，不嘗試還原或轉換舊 snapshot。

部署 migration 時不主動改寫既有 `ExamAnswer.score` 或 `is_correct`。只有教師在鎖定後明確選擇 `regrade` 或 `mark_pending`，系統才處理既有批改。

## 測試與驗收

後端至少涵蓋：

- 第一位考生開始考試時立即鎖定試卷內容；
- 開考後拒絕題幹、選項、題型、順序、題組與答案格式異動；
- 完整 payload 帶入未改變的內容欄位時，仍可只更新評分資料；
- 鎖定後缺少或傳入錯誤 action 時不寫入資料；
- `regrade` 以 live question 重批所有客觀題作答並重算總分；
- `regrade` 在成績已發布時取消發布；
- 主觀題 `keep` 保留所有既有批改；
- 主觀題 `mark_pending` 清除批改狀態、保留 feedback 並重算總分；
- `mark_pending` 在成績已發布時取消發布；
- 計分政策修改重算總分、不覆寫原始人工分數，並在成績已發布時取消發布；
- transaction 任一步驟失敗時完整回滾；
- serializer、dashboard、報表與匯出不再讀取 snapshot；
- migration 後資料模型與 API 均不存在 `question_snapshot`。

前端至少涵蓋：

- 未鎖定時維持現有 auto-save；
- 鎖定後不因 debounce、blur、關閉或 Escape 發出更新 request；
- 鎖定後只有評分欄位可編輯；
- dirty state、放棄確認與明確儲存行為正確；
- 客觀題、主觀題、計分政策與詳解顯示正確的確認選項；
- repository 不再映射 snapshot；
- 成績頁只使用目前題目資料。

MCP 測試確認 grading payload 不再依賴 snapshot 清理。最後在 test Compose 環境執行 migration、backend 相關測試、frontend unit tests、type/lint 檢查與 MCP tests。
