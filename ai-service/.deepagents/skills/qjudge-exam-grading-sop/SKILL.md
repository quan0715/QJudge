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
        - reason 政策(省 output token):
            - 預設:滿分(rubric 最高分) → reason 留空;非滿分 → 必填 reason。
            - 例外:滿分但有值得給的改進建議 → 可填。
            - 覆寫:若 user 在 Stage 1 明說「每題都要寫 reason / 都要評語」 → 一律填。
      loop:
        - |
          # 1. 只把本批要評的 20 筆 + 必要欄位讀進 context(其他欄/列不載入,省 token)
          batch = artifact_csv_to_records(
            step="grade",
            filename="grade.csv",
            columns=["exam_answer_id", "answer_text"],
            where={"score": ""},
            limit=20,
          )
          # batch["records"] = [{exam_answer_id, answer_text}, ...]
          # batch["count"] == 0 → 全部評完,跳出 loop 進 4_writeback_confirm
        - |
          # 2. 對每一筆獨立思考後決定 score 與 reason (依 reason 政策)
        - |
          # 3. 只 patch 這批 20 筆的 score/reason
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
          # 4. 更新 todo: 本批標 completed,啟動下一批
          write_todos(todos=[...])
        - count > 0 → 下一輪;count == 0 → 進 4_writeback_confirm

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
      rules:
        - 禁止手動解析 CSV 或寫 Python。用 artifact_csv_to_records 讀 unsynced rows → 直接丟 batch_grade。
        - 每批最多 20 筆(跟 Stage 3 批次對齊)。
      loop:
        - |
          # 1. 取尚未 sync 的 (exam_answer_id, score, reason),最多 20 筆
          batch = artifact_csv_to_records(
            step="grade",
            filename="grade.csv",
            columns=["exam_answer_id", "score", "reason"],
            where={"synced": ""},
            limit=20,
          )
          # batch 形狀: {"count": N, "total_matched": M, "records": [{exam_answer_id, score, reason}, ...]}
          # count == 0 → 全部寫回完畢,跳出 loop 進 report
        - |
          # 2. 整批寫回
          qjudge_grading(action="batch_grade", grades=batch["records"])
        - |
          # 3. 成功的列 patch synced="yes";失敗的留空,等下輪重試或進 report
          artifact_patch_csv_rows(
            step="grade", filename="grade.csv",
            key_column="exam_answer_id",
            updates=[{"exam_answer_id": ..., "synced": "yes"}, ...],  # 只放成功的
          )
      report: 寫回 X 筆成功、Y 筆失敗(失敗列 exam_answer_id + 錯誤)。
      idempotency: 同一 exam_answer_id 重複視為 no-op;synced=="yes" 的 row 下輪會自動被 where filter 跳過。

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
