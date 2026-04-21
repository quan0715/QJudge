---
name: qjudge-exam-grading-sop
description: Open-ended 題目 AI 批改 SOP(YAML)。
---

```yaml
sop:
  purpose: "Open-ended AI 批改:訂 rubric + seed grade.csv → 一題一題評 → 寫回。"

  artifacts:
    rubric.md:
      writer: artifact_write
      content_type: text/markdown

    grade.csv:
      writer: artifact_write_csv_from_records   # seed(Stage 2)
      patcher: artifact_patch_csv_rows           # 批改/標記(Stage 3、6,只傳變動)
      columns: [index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced]
      key_column: exam_answer_id

  stages:
    - id: 1_target
      out: context [contest_id, grading_question_id]
      on_missing: 逐項問 user。

    - id: 2_seed
      steps:
        - |
          # 1. 產 rubric.md
          artifact_write(
            step="rubric",
            filename="rubric.md",
            content=<markdown 評分標準>,
            content_type="text/markdown",
          )
        - |
          # 2. 抓答案
          response = qjudge_grading(
            action="list_answers",
            contest_id=<X>,
            question_id=<Y>,
            projection="grading",
          )
          # response 形狀: {"count": N, "items": [{exam_answer_id, username, answer_text, original_score, original_feedback}, ...]}
        - |
          # 3. seed grade.csv(records 帶 index + 5 欄,defaults 補 score/reason/synced = 9 欄)
          artifact_write_csv_from_records(
            step="grade",
            filename="grade.csv",
            records=response["items"],
            defaults={"score": "", "reason": "", "synced": ""},
          )
        - |
          # 4. 建立 todo list,每 20 筆 index 範圍為一個 task
          write_todos(todos=[
            {"content": "批改 index 1-20 依 rubric.md", "status": "pending"},
            {"content": "批改 index 21-40 依 rubric.md", "status": "pending"},
            ...
          ])
      out: [rubric.md, grade.csv (score/reason/synced 都空), todo list]

    - id: 3_grade_batch_of_20
      rules:
        - 一題一題依 rubric.md 決定 score 與 reason,禁止寫腳本或機械批打。
        - 每批 20 筆,結束後用 artifact_patch_csv_rows 寫回,並將對應 todo 標為 completed。
      loop:
        - |
          # 讀目前進度(可用 offset/limit 分頁讀)
          artifact_read(step="grade", filename="grade.csv")
          # 取目前 todo 對應 index 範圍中 score == "" 的 row
        - |
          # 對每一筆獨立思考後決定 score 與 reason
        - |
          # 只 patch 這批 20 筆的 score/reason(不需重傳 answer_text 等原始欄位)
          artifact_patch_csv_rows(
            step="grade",
            filename="grade.csv",
            key_column="exam_answer_id",
            updates=[
              {"exam_answer_id": ..., "score": "...", "reason": "..."},
              ... (本批 20 筆)
            ],
          )
        - |
          # 更新 todo: 本批標 completed,啟動下一批
          write_todos(todos=[...])
        - 仍有 todo pending → 下一輪;全部 completed → 進 4_writeback_confirm

    - id: 4_writeback_confirm
      halt: true
      precondition: grade.csv 所有 row 的 score 都有值(reason 可空);若仍有空值 → 回 3_grade_batch_of_20 補完再進這裡
      branches:
        contains_writeback_keyword: goto 5_writeback
        other:                      ask_again (要「寫回」)
      first_entry_message: |
        全部 <N> 筆已評完(右側 panel 看 grade.csv)。
        - 確認寫回 → 回「確認寫回」
        - 取消 → 回「取消」

    - id: 5_writeback
      steps:
        - qjudge_grading(action=grade|batch_grade, per_row={exam_answer_id, score, reason})
        - |
          # 每筆寫回成功後 patch grade.csv 標記 synced="yes",未成功留空
          artifact_patch_csv_rows(
            step="grade", filename="grade.csv",
            key_column="exam_answer_id",
            updates=[{"exam_answer_id": ..., "synced": "yes"}, ...],
          )
      report: 寫回 X 筆成功、Y 筆失敗(失敗列 exam_answer_id + 錯誤)。
      idempotency: 同一 exam_answer_id 重複視為 no-op;synced=="yes" 的 row 可跳過。

  stage_resolution:
    primary: artifact_list
    secondary: last_assistant_message
    fallback: ask_user
    map:
      - {artifacts: [],                                 candidates: [1_target, 2_seed]}
      - {artifacts: [rubric.md, grade.csv(any empty)],  stage: 3_grade_batch_of_20}
      - {artifacts: [rubric.md, grade.csv(all scored)], candidates: [4_writeback_confirm, 5_writeback]}

  hard_rules:
    - MCP 解析 / CSV 組裝必須在同一 turn 內自己做,禁 delegate task/subagent。
    - 評分時一題一題思考並填 score,禁止寫腳本或機械批打。
    - 寫回前 user 訊息必須含「寫回」兩字。
```
