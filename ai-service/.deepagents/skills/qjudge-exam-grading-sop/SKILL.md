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
      seeder:   artifact_csv_from_json   # Stage 2 建檔
      searcher: artifact_csv_search       # Stage 3/5 狀態檢查(不帶 rows)
      loader:   artifact_csv_to_json      # Stage 3/5 取批次 payload
      patcher:  artifact_csv_patch        # Stage 3/5 寫回部分變動
      columns: [index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced]
      key_column: exam_answer_id

  note: >
    artifact 工具的 step 參數為 optional，正常流程省略即可；
    工具會自動依 filename 定位唯一 artifact。僅在同 session 出現同名檔案時才需帶 step 消歧義。

  stages:
    - id: 1_target
      out: context [contest_id, grading_question_id]
      on_missing: 逐項問 user。

    - id: 2_seed
      steps:
        - |
          # 1. 產 rubric.md
          artifact_write(
            filename="rubric.md",
            content=<markdown 評分標準>,
            content_type="text/markdown",
          )
        - |
          # 2. 抓答案
          response = qjudge_grading(
            action="list_answers",
            contest_id=<X>, question_id=<Y>,
            projection="grading",
          )
          # response 形狀: {"count": N, "items": [{exam_answer_id, username, answer_text, original_score, original_feedback}, ...]}
        - |
          # 3. seed grade.csv（records 帶 index + 5 欄，defaults 補 score/reason/synced = 9 欄）
          artifact_csv_from_json(
            filename="grade.csv",
            records=response["items"],
            defaults={"score": "", "reason": "", "synced": ""},
          )
        - |
          # 4. 宣告批次計畫（每 20 筆一個 todo）
          write_todos(todos=[
            {"content": "批改 index 1-20 依 rubric.md",  "status": "pending"},
            {"content": "批改 index 21-40 依 rubric.md", "status": "pending"},
            ...
          ])
      out: [rubric.md, grade.csv (score/reason/synced 都空), todo list]

    - id: 3_grade_batch_of_20
      rules:
        - 一題一題依 rubric.md 決定 score 與 reason，禁止寫腳本或機械批打。
        - 禁止 artifact_read + offset/limit 手動找未評列；永遠用 artifact_csv_search / artifact_csv_to_json。
        - reason 政策（省 output token）：
            - 預設：滿分（rubric 最高分） → reason 留空；非滿分 → 必填 reason。
            - 例外：滿分但有值得給的改進建議 → 可填。
            - 覆寫：若 user 在 Stage 1 明說「每題都要寫 reason / 都要評語」 → 一律填。
      loop:
        - |
          # 1. 看還剩幾筆沒評（便宜、不拉 rows）
          status = artifact_csv_search(
            filename="grade.csv",
            where={"score": ""},
          )
          # status = {"matched": M, "total_rows": N}
          # matched == 0 → 進 4_writeback_confirm
        - |
          # 2. 取本批 20 筆 + 必要兩欄（其他欄/列不載入，省 token）
          batch = artifact_csv_to_json(
            filename="grade.csv",
            columns=["exam_answer_id", "answer_text"],
            where={"score": ""},
            limit=20,
          )
          # batch["records"] = [{exam_answer_id, answer_text}, ...]
        - |
          # 3. 對每一筆獨立思考後決定 score 與 reason（依 reason 政策）
        - |
          # 4. 寫回本批變動
          artifact_csv_patch(
            filename="grade.csv",
            key_column="exam_answer_id",
            updates=[
              {"exam_answer_id": ..., "score": "...", "reason": "..."},
              ... (本批 20 筆)
            ],
          )
        - |
          # 5. 更新 todo: 本批 completed，下一批 pending → in_progress
          write_todos(todos=[...])
        - status.matched > 0 → 下一輪；== 0 → 進 4_writeback_confirm

    - id: 4_writeback_confirm
      halt: true
      precondition: |
        artifact_csv_search(filename="grade.csv", where={"score": ""}) 回 matched == 0
        （仍有空值 → 回 3_grade_batch_of_20 補完再進這裡）
      branches:
        contains_writeback_keyword: goto 5_writeback
        other:                      ask_again (要「寫回」)
      first_entry_message: |
        全部 <N> 筆已評完（右側 panel 看 grade.csv）。
        - 確認寫回 → 回「確認寫回」
        - 取消 → 回「取消」

    - id: 5_writeback
      rules:
        - 禁止手動解析 CSV 或寫 Python。search 看狀態 → to_json 組 payload → batch_grade → patch 標 synced。
        - 每批最多 20 筆（跟 Stage 3 批次對齊）。
        - 批次計畫前/每批完成後必 write_todos（跟 Stage 3 同規則）。
      loop:
        - |
          # 1. 看還剩幾筆沒 sync
          status = artifact_csv_search(
            filename="grade.csv",
            where={"synced": ""},
          )
          # matched == 0 → 跳出 loop 進 report
        - |
          # 2. 取這批 MCP payload（三欄）
          batch = artifact_csv_to_json(
            filename="grade.csv",
            columns=["exam_answer_id", "score", "reason"],
            where={"synced": ""},
            limit=20,
          )
        - |
          # 3. 整批寫回
          qjudge_grading(action="batch_grade", grades=batch["records"])
        - |
          # 4. 成功的列標 synced="yes"；失敗的留空，等下輪重試或進 report
          artifact_csv_patch(
            filename="grade.csv",
            key_column="exam_answer_id",
            updates=[{"exam_answer_id": ..., "synced": "yes"}, ...],  # 只放成功的
          )
        - |
          # 5. 更新 todo
          write_todos(todos=[...])
      report: 寫回 X 筆成功、Y 筆失敗（失敗列 exam_answer_id + 錯誤）。
      idempotency: 同一 exam_answer_id 重複視為 no-op；synced=="yes" 的 row 下輪會自動被 where filter 跳過。

  stage_resolution:
    primary: artifact_list + artifact_csv_search
    secondary: last_assistant_message
    fallback: ask_user
    map:
      - {artifacts: [],                                    candidates: [1_target, 2_seed]}
      - {artifacts: [rubric.md, grade.csv], score_empty>0: stage: 3_grade_batch_of_20}
      - {artifacts: [rubric.md, grade.csv], score_empty=0: candidates: [4_writeback_confirm, 5_writeback]}

  hard_rules:
    - MCP 解析 / CSV 組裝必須在同一 turn 內自己做，禁 delegate task/subagent。
    - 評分時一題一題思考並填 score，禁止寫腳本或機械批打。
    - 任何批次操作「前」都要 write_todos 宣告批次計畫；「每批完成後」立刻 write_todos 把該批標 completed；todo 未更新 = 不可進下一批。
    - 禁止用 artifact_read + offset/limit 找未評/未 sync 列；永遠用 artifact_csv_search（狀態）或 artifact_csv_to_json（取 rows）。
    - 寫回前 user 訊息必須含「寫回」兩字。
```
