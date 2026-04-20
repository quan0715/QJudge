---
name: qjudge-exam-grading-sop
description: 開放式題目（問答、解釋、設計）AI 批改的標準流程。用 artifact_write/read/list 把流程產物落地，並在 Gate-1 / Gate-2 顯式停下等老師確認。只在使用者要求對 open-ended 題目做批改或改分時啟用。
---

# QJudge Exam 批改 SOP（open-ended 題）

## 適用範圍

- 題目屬於 **open-ended**：問答、解釋、設計、申論。選擇題或 coding 題另循其他流程。
- 目的：用 AI 幫老師把同一題的全部答案以一致的標準評分，最終寫回平台。
- 硬性條件：寫回前必須有 user 明確確認。

## 三個核心約束

1. **Artifact first**：SOP 每個階段的產物必須透過 `artifact_write` 落到 artifact，不可只放在回覆訊息。
2. **Turn 起手式**：每個 user turn 開頭先 `artifact_list` 看當前進度 + 看 **本 turn user 訊息**，兩個訊號合起來決定進到哪個 step。
3. **Gate 必停**：到了 Gate-1 / Gate-2，產 artifact 後只輸出訊息讓 user 確認，**不再呼叫任何工具**，本 turn 到此結束。

## Gate 確認是「對話事件」不是檔案狀態

`artifact_list` 只能看到產出物，**看不到** user 是否已在對話裡說「確認」。所以判斷 Gate 是否通過**一律靠本 turn user 訊息**：

- **同意關鍵字**：「繼續」、「確認」、「通過」、「ok」、「沒問題」、「可以」、「go」、「批」、「沒有要改」等明確肯定
- **調整訊號**：user 指出要改的地方（例：「rubric 把 X 權重調高」）→ 視為未通過，需要回上一 step 重做
- **曖昧訊號**：「看起來不錯」、「我看看」、「再跑一下」等 → **再問一次**，不要擅自前進
- **Gate-2 特別嚴格**：必須含「寫回」字眼（「確認寫回」、「可以寫回」、「寫回吧」），否則一律當未通過

## 8 個階段

### Step 0（每 turn 必做）起手式

1. `artifact_list` 看當前 session 的產出狀態
2. 檢查本 turn user 訊息的性質（新任務 / Gate 確認 / Gate 調整 / 其他）
3. 依下表決定進到哪個 step：

| artifact 狀態 | user 訊息性質 | 接續 step |
|---|---|---|
| 無任何 artifact | 發起批改任務 | Step 1 → 2 → 3 → 4 → Gate-1 |
| 有 `rubric.json` 但無 `calibration_report.md` | 任何 | Step 4 → Gate-1 |
| 有 `calibration_report.md` | Gate-1 同意（「繼續」等）| Step 6 |
| 有 `calibration_report.md` | 要調 rubric | Step 2 → 4 → Gate-1 |
| 有 `calibration_report.md` | 其他 / 曖昧 | 輸出 Gate-1 訊息 |
| 有 `graded_answers.csv` 但未覆蓋全部答案 | 同意「繼續」| Step 6（續跑） |
| 全部答案已評但無 `final_delta_preview.csv` | 任何 | Step 7 → Gate-2 |
| 有 `final_delta_preview.csv` | Gate-2 同意（「確認寫回」等）| Step 8 |
| 有 `final_delta_preview.csv` | 其他 / 曖昧 | 輸出 Gate-2 訊息 |

**關鍵**：**同一 artifact 狀態**會因 user 訊息不同走向不同 step。不要只看 artifact 就決定。

### Step 1 資料完整性檢查
確認以下資訊齊全：`contest_id`、`grading_question_id`、批改範圍（single/partial/total）。
缺任何一項 → 停下問 user，不准臆測。

### Step 2 建立 / 更新 rubric
- 產出 `rubric.json`，呼叫 `artifact_write(step="rubric", filename="rubric.json", content=<json-string>, content_type="application/json")`。
- 若本 turn 是為了調整 rubric 重跑，覆寫即可（同一 session 只保留一版）。

#### rubric.json schema
```json
{
  "question_id": "Q42",
  "total": 10,
  "dimensions": [
    {
      "name": "核心概念正確性",
      "weight": 5,
      "levels": [
        {"score": 5, "desc": "..."},
        {"score": 3, "desc": "..."},
        {"score": 1, "desc": "..."}
      ]
    }
  ],
  "edge_cases": ["文字規則，如：術語不同但概念正確給滿分"]
}
```

### Step 3 原始資料匯出
呼叫對應 QJudge MCP tool 取得全部答案，轉為 CSV，`artifact_write(step="raw_answers", filename="raw_answers.csv", ...)`。
欄位：`exam_answer_id,student_id,original_score,answer_text`。

⚠️ **產 CSV 一律用 `artifact_write_csv`**（所有產出 csv 都要遵守，包含後續 step）：
- 傳 `columns`（欄位名陣列）+ `rows`（dict 陣列），由 tool 處理 RFC 4180 quoting
- **不要自己拼 CSV 字串**後塞給 `artifact_write`——中文逗號、引號、換行手工處理幾乎必錯
- tool 內部用 `csv.QUOTE_ALL`，任何欄位都會被雙引號包住；欄位內 `"` 自動改成 `""`
- 範例呼叫：
  ```
  artifact_write_csv(
    step="raw_answers",
    filename="raw_answers.csv",
    columns=["exam_answer_id","student_id","original_score","answer_text"],
    rows=[{"exam_answer_id":1820,"student_id":92,"original_score":"1.00","answer_text":"答案,含逗號\n含換行"}],
  )
  ```

### Step 4 小樣本校準
從 raw_answers 取前 10 筆（或 user 指定範圍），依 rubric 評分，產出**一份** artifact：

`calibration_report.md`（人讀摘要，**不要**塞完整表格，窄 panel 不好讀）：
- **評分標準摘要**：rubric 各 dimension 權重一覽（3–5 行）
- **分數分佈**：suggested score 的 min/max/avg 或分佈敘述
- **偏差觀察**：對比 original_score 與 suggested_score 的 delta pattern，指出 AI 可能偏嚴/偏鬆
- **Top-3 風險案例**：delta 絕對值最大的 3 筆，列 student_id + 理由一句話
- 目標長度：不超過 5 KB
- `artifact_write(step="calibration", filename="calibration_report.md", ..., content_type="text/markdown; charset=utf-8")`

（若 user 之後想看完整 10 筆細節，再直接在對話回答即可，不需另存 artifact。）

### Step 5（Gate-1）校準確認 — **必停**
產出 `calibration_report.md` 後：
- 輸出訊息：「已完成小樣本校準（10 筆），摘要見 `calibration_report.md`（右側 panel 可看）。rubric 可以這樣批請回覆『繼續』；要調整 rubric 請告訴我怎麼改。」
- **不再呼叫任何工具**，結束本 turn。

下一 turn 由 Step 0 的表格依 user 訊息分派，**不在這一 turn 內自己判斷要不要繼續**。

### Step 6 批次評分（可續跑）
起手式：
1. `artifact_read(step="graded", filename="graded_answers.csv")`，若 `is_error=not found` 則從 0 開始；若存在，解析已評的 `exam_answer_id` 清單。
2. 從 raw_answers.csv 裡挑出**尚未評分**的答案逐一評分。

每題輸出：`exam_answer_id,student_id,original_score,new_score,dimension_breakdown,reason`。

評完後 `artifact_write(step="graded", filename="graded_answers.csv", ...)`，**覆寫**完整的 graded_answers.csv（不是 append — 直接寫整個當前的完整版本）。

注意：
- Step 6 內**不要**每題都跟 user 互動。
- 若評到一半因故中斷（soft timeout / 錯誤），下個 turn user 回「繼續」時會從 Step 0 起手式重新進入 Step 6，讀 graded_answers 續跑。

### Step 7（Gate-2 產 artifact）final delta 預覽
Step 6 全部完成後：
1. 產出 `final_delta_preview.csv`，欄位：`exam_answer_id,student_id,original_score,new_score,delta,reason`。
2. `artifact_write(step="final_delta", filename="final_delta_preview.csv", ...)`。
3. 輸出訊息給 user：
   - 概述：本批總人數、平均 delta、分數分佈變化、最大幅變動前 3 筆（正負各）。
   - 指引：「請到 artifact panel 檢視 `final_delta_preview.csv`。確認沒問題請回覆『確認寫回』，不寫回請回覆『取消』。」
4. **不再呼叫任何工具**，結束本 turn。

### Step 8 寫回（僅在 user 明確含「寫回」字眼後）
觸發條件：user 回覆訊息**必須含「寫回」字眼**（「確認寫回」、「可以寫回」、「寫回吧」）。其他肯定詞（單純「ok」、「沒問題」）**不足以**觸發寫回，必須再問一次。

寫回流程：
1. 讀 `final_delta_preview.csv`。
2. 呼叫對應 QJudge MCP tool（例如 `qjudge_grading(action="grade"/"batch_grade", ...)`）逐筆寫回。
3. 完成後報告：寫回筆數 / 失敗筆數 / 失敗清單。

Idempotency：以 `(session_id, exam_answer_id)` 為鍵，重複呼叫同一筆視為 no-op，避免 user 重複觸發。

## 禁止事項

- Gate-1 / Gate-2 前呼叫寫回 tool。
- 沒有 `final_delta_preview.csv` artifact 時寫回。
- **只看 artifact 就判斷 Gate 是否通過** —— 一定要讀本 turn user 訊息。
- 已收到 user 明確「繼續」後還重複問 Gate-1 / Gate-2（跳針行為）。
- 產 CSV 時手動拼字串後丟 `artifact_write`，而不是用 `artifact_write_csv`（手工 quoting 會錯）。
- 把完整答案或 rubric 內容只寫在對話訊息裡不走 artifact。
- Step 6 內頻繁停下問 user（會讓老師崩潰）。
- 評分結果裡沒有 dimension breakdown 或 reason（無法審核）。

## Artifact tool 速查

```
artifact_list(step?, filename?)
  → 回 {artifacts: [...]}

artifact_read(step, filename)
  → 回 {metadata, content} 或 {is_error, detail}

artifact_write(step, filename, content, content_type?, metadata?)
  → 回 {id, object_key, size_bytes, ...}
  * 用於 json / markdown / 一般文字

artifact_write_csv(step, filename, columns, rows, metadata?)
  → 回 {id, object_key, size_bytes, ...}
  * **凡是 *.csv 一律走這個**，不要用 artifact_write 手拼 CSV 字串
```

所有 artifact 自動綁到當前 session；agent 不需要也不可傳 session_id / run_id。
