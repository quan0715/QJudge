# Exam 批改優化實作計劃 v3（最簡版）

## Summary

用 **Skill SOP + Artifact 本地 tool** 約束 AI 批改行為與狀態，不動 Celery/HITL 系統。每個 user turn 跑一個 single-task celery run，整個批改跨多 turn 完成，artifact 是 turn 之間的狀態載體。

範圍：**open-ended 題目批改**（問答、解釋、設計）。

---

## 架構對應

| 層 | 職責 |
|---|---|
| **Django backend**（`backend/apps/ai/`） | `AIArtifact` model、object storage service、internal HMAC API（供 ai-service）、public API（供前端 panel） |
| **ai-service**（`ai-service/services/`） | `artifact_tools.py`：LangChain 本地 tool（write/read/list），HTTP 打 Django internal endpoint；由 `deepagent_runner` 與 MCP tools 一起載入 |
| **mcp-server** | **不動**。Artifact 為 session 私有資源，不暴露給外部 MCP client |
| **Frontend** | Artifact Panel 呼叫 Django public API |
| **Object storage** | 沿用 `OBJECT_STORAGE_*` S3-compatible 連線設定，新 bucket `ai-artifacts` |

---

## In / Out of Scope

**In**
- Django `AIArtifact` model + migration
- Object storage service（參考 `markdown_image_storage.py` pattern）
- Django internal/public artifact API
- ai-service 本地 artifact LangChain tools
- Exam Grading SOP Skill（文本／system prompt）
- 前端 Artifact Panel（list + preview）

**Out**
- Batch / BudgetGuard / summary_mode
- 系統層 checkpoint & resume
- Rubric versioning（覆寫即可）
- Object storage bucket versioning
- LangGraph / 新 system HITL 事件
- Celery soft_time_limit 調整

升級觸發：上線 2 週後 `SoftTimeLimitExceeded rate > 3%` 或 `unfinished_run_rate > 2%`。

---

## Exam Grading SOP（Skill 骨架）

| # | 階段 | Artifact | 行為 |
|---|---|---|---|
| 0 | 起手式 | — | 呼叫 `artifact_list` 對齊進度 |
| 1 | 資料完整性檢查 | — | 缺資料 → 問 user，停 |
| 2 | 建立 / 更新 rubric | `rubric.json` | 覆寫 |
| 3 | 原始資料匯出 | `raw_answers.csv` | — |
| 4 | 小樣本校準（sample=10） | `calibration_report.md` | — |
| 5 | **Gate-1：校準確認** | — | **停**，問 user |
| 6 | 批次評分 | `graded_answers.csv` | 起手讀 artifact，skip 已評 |
| 7 | **Gate-2：final delta** | `final_delta_preview.csv` | **停**，等 user 對話確認後 agent 才呼叫寫回 tool |

### Skill 必刻規則

- **Turn 開頭**必先 `artifact_list`，跳過已完成 step
- **Step 6 起手**必 `artifact_read graded_answers.csv`，skip 已評 answer_id
- **Gate-1 / Gate-2** 產 artifact 後只輸出訊息，**不再呼叫工具**，本 turn 結束
- **Rubric 覆寫時**同步覆寫 `calibration_report.md`
- **Gate-2 前**禁止呼叫任何寫回成績的 tool
- **Gate-2 後**必須收到 user 明確確認訊息（如「確認寫回」）才呼叫寫回 tool；曖昧訊息要再問一次
- Step 7 內不可每題都問 user

---

## Artifact 本地 Tool 契約（ai-service）

```
artifact_write(step, filename, content, metadata)
artifact_read(path)
artifact_list(filter?)
```

- `session_id` / `run_id` 由 ai-service 從當前 run context 自動注入，agent 不傳
- `metadata` 必含 `artifact_type`
- Tool 內部以 HMAC 簽章 HTTP 呼叫 Django internal endpoint

### Django API

- `POST /internal/ai/artifacts`（HMAC，ai-service 專用）
- `GET  /api/v1/ai/artifacts?session_id=&run_id=`（session 授權）
- `GET  /api/v1/ai/artifacts/{id}`（回 metadata + 預簽 URL）

### Object storage 路徑

```
ai-artifacts/{session_id}/{run_id}/{step}/{filename}
```

覆寫即覆蓋，不保留歷史。單檔上限 10MB，預簽 URL TTL 5 分鐘。

---

## 多 turn 流程範例

```
T1 user: 幫我批改 Exam X 的 Q42
   agent: [Step 1-4] 產 rubric.json + calibration_report.md
          Gate-1 → 請 user 確認

T2 user: rubric 把「舉例」權重調高
   agent: [Step 2-4 重跑] 覆寫 rubric.json + calibration_report.md
          Gate-1 → 再問 user

T3 user: ok 繼續
   agent: [Step 6] 產 graded_answers.csv
          [Step 7] 產 final_delta_preview.csv
          Gate-2 → 請 user 審 artifact panel

T4 user: 確認寫回
   agent: 呼叫寫回 tool（以 (session_id, answer_id) idempotent）

若 T3 soft timeout：
T4 user: 繼續
   agent: Step 6 起手讀 graded_answers.csv，skip 已評 → 續評剩下
```

---

## Acceptance

**Artifact MCP**
- SOP 各 step 輸出能寫入並於前端列出
- `artifact_list` 能按當前 session/run 過濾
- 跨 session 存取被授權層擋住

**Skill 行為**
- Gate-1 / Gate-2 必停
- Turn 開頭必讀 artifact 對齊狀態
- Step 6 中斷後續跑只評剩餘答案
- Rubric 覆寫時同步覆寫 calibration_report

**寫回**
- 以 `(session_id, answer_id)` idempotent
- 無 `final_delta_preview.csv` artifact 時拒絕寫回

**回歸**
- 非 exam grading 對話流不受影響
- 現有 HITL / SSE / run 流不破壞

---

## Rollout

| Phase | 範圍 | 預估 |
|---|---|---|
| 1a | Django model + storage + API + ai-service tools + 測試 | ~1 週 |
| 1b | Skill SOP + 前端 Artifact Panel | ~1 週 |
| 1c | 上線觀測 2 週，收指標（soft timeout / unfinished run） | — |
| 2 | 條件觸發（若指標超標才評估升級） | 視情況 |

---

## 實作順序

1. Django `AIArtifact` model + migration
2. `artifact_storage.py` service（S3-compatible object storage via boto3）
3. Django REST endpoints（internal HMAC + public）
4. ai-service `artifact_tools.py` 本地 LangChain tool
5. 測試（storage / API / tool 整合）
6. Skill 文本
7. 前端 Artifact Panel
