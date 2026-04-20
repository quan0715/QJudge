---
name: qjudge-exam-grading-sop
description: 開放式題目（問答、解釋、設計）AI 批改的標準流程。5 個 step、2 個 gate、2 個 artifact（rubric.json + answers.csv）。每個 step 用固定 schema；先跑 Step 0 起手式分派，不要自由心證。只在使用者要求對 open-ended 題目做批改或改分時啟用。
---

# QJudge Exam 批改 SOP（open-ended）

## 適用範圍
- 題目屬於 **open-ended**（問答、解釋、設計、申論）。選擇題或 coding 題不走此 SOP。
- 目標：用 AI 幫老師用一致標準評分，最終寫回平台。
- 硬性條件：寫回前必須有 user 明確**含「寫回」字眼**的確認。

## 三個不可違反的原則
1. **Artifact first**：每個 step 的產出用 `artifact_write` / `artifact_write_csv` 落地，不能只放對話。
2. **單一來源判斷 step**：每 turn 開頭固定跑 Step 0 起手式。不要看到 user 語氣就自行推斷。
3. **Gate 必停**：到 Gate-1 / Gate-2，只輸出訊息，**不再呼叫任何工具**，turn 結束。

## 資料存取規範（不可違反）
- **原始資料一律來自 MCP tool**（`qjudge_grading(action="list_answers", ...)` 等）。
- **禁止**嘗試讀本機檔案（`/tmp/xxx`、user 貼的路徑）。你沒有 host 檔案存取能力；虛擬 FS 只存 session 本身產物。詳見 `AGENTS.md` → 檔案系統。
- 跨 turn 持久化 → `artifact_*`。本 turn 暫存（如 MCP 自動 offload 結果）→ 虛擬 FS。

---

## 全流程地圖（5 step / 2 gate / 2 artifact）

| # | 階段 | 產出 | 中斷 |
|---|---|---|---|
| 1 | 資料齊備檢查 | — | 缺才停 |
| 2 | 產 rubric | `rubric.json` | ❌ |
| — | **Gate-1** rubric 確認 | （訊息） | ✅ |
| 3 | fetch + seed answers | `answers.csv`（後兩欄空） | ❌ |
| 4 | 批次評分（填完所有 `new_score`） | 覆寫 `answers.csv` | ❌ |
| — | **Gate-2** 寫回確認（含「寫回」） | （訊息） | ✅ |
| 5 | 寫回 | 呼叫 MCP 逐筆 grade | ❌ |

---

## Step 0 — 起手式（每 turn 固定執行）

**1. 呼叫 `artifact_list()`，記下目前 session 擁有哪些 artifact。**

**2. 分類本 turn user 訊息**（只能是以下其中一種）：

| 分類 | 判斷關鍵 |
|---|---|
| `NEW_TASK` | 明確發起批改任務，含 contest/question 資訊或開始批改指令 |
| `APPROVE_GATE` | 含「繼續」「確認」「通過」「ok」「沒問題」「可以」等肯定詞（**不含「寫回」**） |
| `APPROVE_WRITEBACK` | **必須含「寫回」字眼**（「確認寫回」、「可以寫回」、「寫回吧」） |
| `REVISE` | 指出要調整 rubric（「把 X 標準改嚴」「重新訂 rubric」） |
| `REDO_STEP` | 明確要求重做某個 step（「重新生成 answers」「重跑評分」） |
| `AMBIGUOUS` | 以上都不是，或語氣模糊（「看看」「我再想想」） |

**3. 依下表決定進哪個 step（照表做、不要自由推斷）**：

| artifact 狀態 | 訊息分類 | 動作 |
|---|---|---|
| 空 | `NEW_TASK` | → Step 1 |
| 空 | 其他 | 回覆「請給我 contest_id / grading_question_id / 批改範圍」，結束 turn |
| 只有 `rubric.json` | `APPROVE_GATE` | → Step 3 |
| 只有 `rubric.json` | `REVISE` | → Step 2（覆寫 rubric） |
| 只有 `rubric.json` | 其他 | 重發 Gate-1 訊息，結束 turn |
| `rubric.json` + `answers.csv`（有 `new_score` 為空的 row） | 任何 | → Step 4（續跑） |
| `rubric.json` + `answers.csv`（全部 `new_score` 都填好） | `APPROVE_WRITEBACK` | → Step 5 |
| 同上 | `APPROVE_GATE`（無「寫回」） | 回覆「必須含『寫回』兩字才會觸發寫回，請確認」，結束 turn |
| 同上 | 其他 | 重發 Gate-2 訊息，結束 turn |
| 任何狀態 | `REDO_STEP` | 回覆「我要清掉 `<step>` 及其後續 artifact 再重跑，確認嗎?」，結束 turn（**不可自行清**） |

**第一原則**：同一 artifact 狀態會因 user 訊息分類走向**不同** step。必須同時看兩邊。

---

## Step 定義（統一 schema）

每個 step 用固定欄位：**敘述 / 進入條件 / 資料來源 / 產出 / 中斷**。
- **資料來源**：只能是 MCP tool 或 `artifact_read`。**不得是**讀本機檔案或 user 貼資料。
- **產出**：本 step 必須產出的 artifact（或對話訊息）。缺了不能進下一步。
- **中斷**：`❌` = 直接接下一個 step；`✅` = 禁用所有工具，輸出訊息後結束 turn。

---

### Step 1 — 資料齊備檢查
- **敘述**：確認 `contest_id`、`grading_question_id`、批改範圍（single / partial / total）到齊。
- **進入條件**：artifact 全空 + `NEW_TASK`。
- **資料來源**：user 訊息。
- **產出**：無 artifact。
- **中斷**：缺任何一項 → ✅ 停問 user，不准臆測。齊 → 進 Step 2。

---

### Step 2 — 建立 / 更新 rubric
- **敘述**：與 user 協商**level-based** 評分規準並落地為 `rubric.json`。若為 `REVISE` 則覆寫既有 rubric。
- **進入條件**：Step 1 完成；或 Step 0 分派為 `REVISE`。
- **資料來源**：user 訊息（若需題目內容，用 `qjudge_browse` 取）。
- **產出**：
  ```
  artifact_write(
    step="rubric",
    filename="rubric.json",
    content=<json-string>,
    content_type="application/json",
  )
  ```
  Schema（扁平 level-based，**不含 dimensions / weight**）：
  ```json
  {
    "question_id": "Q42",
    "total": 5,
    "levels": [
      {"score": 5, "desc": "完全正確且完整"},
      {"score": 3, "desc": "主要概念正確但不完整 / 缺關鍵細節"},
      {"score": 1, "desc": "部分概念正確但有明顯錯誤"},
      {"score": 0, "desc": "完全錯誤或未作答"}
    ],
    "edge_cases": ["術語不同但概念正確給滿分"]
  }
  ```
  - levels 給 3–5 檔即可；agent 評分時可挑中間值（例如 2、4）。
  - `total` 應等於 levels 最高分。
- **中斷**：❌ 產完直接進 Gate-1。

---

### Gate-1 — rubric 確認 ✅ 必停
- **敘述**：讓 user 檢查 rubric 合不合用，再決定要不要動用 LLM 批改全部答案（成本最重的一步）。
- **進入條件**：`rubric.json` 剛產出。
- **資料來源**：無。
- **產出**（**只輸出對話訊息**）：
  > 已建立 rubric（右側 panel 看 `rubric.json`），`total=<N>`、<M> 個 level。
  > - rubric 可用 → 請回覆「繼續」，我會 fetch 全部答案並批改。
  > - 要改 → 告訴我怎麼改，我會覆寫 rubric。
- **中斷**：✅ **禁用所有工具**，結束 turn。下一 turn 從 Step 0 依 user 回覆分派。

---

### Step 3 — fetch + seed answers
- **敘述**：取全部學生答案，建立初始 `answers.csv`（`new_score` / `reason` 欄位空）。
- **進入條件**：`rubric.json` 存在 + Step 0 分派為 `APPROVE_GATE`。
- **資料來源**：
  ```
  qjudge_grading(action="list_answers", contest_id=..., question_id=...)
  ```
  **絕對不讀本機檔案**。回傳若太大 DeepAgent 會自動 offload 到虛擬 FS，正常的 — 直接解析即可。
- **產出**：
  ```
  artifact_write_csv(
    step="answers",
    filename="answers.csv",
    columns=["exam_answer_id", "student_id", "answer_text", "original_score", "new_score", "reason"],
    rows=[
      {"exam_answer_id": ..., "student_id": ..., "answer_text": ..., "original_score": ..., "new_score": "", "reason": ""},
      ...
    ],
  )
  ```
  - 每一筆從 MCP 回來的答案都要放進去（缺筆會讓 Step 4 漏評）。
  - `new_score` / `reason` 初始一律空字串。
- **中斷**：❌ 直接進 Step 4。

---

### Step 4 — 批次評分
- **敘述**：逐筆填入 `new_score` 與 `reason`。依 rubric 從 levels 挑最合適分數。
- **進入條件**：`answers.csv` 存在且有 `new_score == ""` 的 row。
- **資料來源**：
  - `artifact_read(step="answers", filename="answers.csv")`
  - `artifact_read(step="rubric", filename="rubric.json")`
- **產出**：
  ```
  artifact_write_csv(
    step="answers",
    filename="answers.csv",
    columns=[...同 Step 3],
    rows=[...],   # 覆寫整個完整集合：已評過的保留原值，新評的填 new_score + reason
  )
  ```
  - **續跑**：soft-timeout 或中斷後，下一 turn Step 0 會看到還有空值，直接回到本 step 繼續。
  - **禁止**只寫增量或另存檔案。永遠覆寫整個 `answers.csv`。
  - `reason` 用一句話敘述為什麼給這個分數（呼應 rubric 哪個 level）。
  - 過程中**不要**每題問 user。
- **中斷**：❌ 全部填完 → 進 Gate-2。

---

### Gate-2 — 寫回確認 ✅ 必停
- **敘述**：呈現批改結果摘要，等 user 明確同意才把分數寫回平台。
- **進入條件**：`answers.csv` 所有 row 都有 `new_score`。
- **資料來源**：`artifact_read(step="answers", filename="answers.csv")`（算摘要用）。
- **產出**（**只輸出對話訊息**；**不產新 artifact**）：
  > 全部 <N> 筆已評完，右側 panel 看 `answers.csv`。
  > - 平均 delta：`<new_avg> - <original_avg> = <delta_avg>`
  > - 分數分佈變化：original min/max/avg → new min/max/avg
  > - 最大變動前 3 筆：`<student_id>(<orig>→<new>)`, ...（delta 絕對值排序）
  > - 確認寫回 → 請回覆「確認寫回」（**必須含「寫回」兩字**）。
  > - 取消 → 請回覆「取消」。
- **中斷**：✅ **禁用所有工具**，結束 turn。

---

### Step 5 — 寫回
- **敘述**：把 `new_score` 透過 MCP tool 逐筆寫回 QJudge。
- **進入條件**：`answers.csv` 全填 + Step 0 分派為 `APPROVE_WRITEBACK`（必須含「寫回」）。
- **資料來源**：`artifact_read(step="answers", filename="answers.csv")`。
- **產出**：
  1. 對每一筆 row 呼叫 `qjudge_grading(action="grade" / "batch_grade", exam_answer_id=..., score=<new_score>, reason=<reason>)`。
  2. 回覆 user：寫回 X 筆成功、Y 筆失敗（列失敗的 `exam_answer_id` 與錯誤訊息）。
- **Idempotency**：以 `(session_id, exam_answer_id)` 為鍵，同一筆重複呼叫視為 no-op。
- **中斷**：❌ 寫回結束整個 SOP。

---

## 禁止事項
- Gate-1 / Gate-2 前呼叫寫回相關 tool。
- 沒走完 Step 4（還有 `new_score` 為空的 row）就進 Gate-2 或寫回。
- **只看 artifact 狀態**決定 step（必須同時看 user 訊息分類）。
- **只看 user 語氣**就自行推斷要重做（要先確認，由 Step 0 的 `REDO_STEP` 路徑處理）。
- 嘗試讀本機檔案（`/tmp/...`、user 貼的路徑）。
- 產 CSV 時手拼字串給 `artifact_write` — 一律用 `artifact_write_csv`。
- Step 4 內頻繁停下問 user。
- 評分結果少 `reason`（無法審核）。
- rubric 加回 `dimensions` / `weight` — 本版 SOP 就是扁平 level-based。

## Artifact tool 速查

```
artifact_list(step?, filename?)
  → {artifacts: [{id, step, filename, size_bytes, ...}, ...]}

artifact_read(step, filename)
  → {metadata, content}  或  {is_error, detail}

artifact_write(step, filename, content, content_type?, metadata?)
  → {id, object_key, size_bytes, ...}
  * 用於 json / markdown / 一般純文字。

artifact_write_csv(step, filename, columns, rows, metadata?)
  → {id, object_key, size_bytes, ...}
  * 凡是 *.csv 一律走這個（RFC 4180 quoting 由 tool 處理）。
```

所有 artifact 自動綁到當前 session；agent 不需要也不可傳 session_id / run_id。
