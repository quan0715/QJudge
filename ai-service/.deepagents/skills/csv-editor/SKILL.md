---
name: csv-editor
description: 如何用 artifact_* 工具對 CSV 做 CRUD。任何 CSV 操作前先查這份。
---

```yaml
csv_editor:
  golden_rule: >
    禁止手動解析 CSV、禁止寫 Python 腳本處理 CSV、禁止用 artifact_write 寫 .csv、
    禁止用 artifact_read + offset/limit 找符合條件的列。所有 CSV 動作都有專用工具,
    找對應的那一個就好。

  note: >
    所有 artifact 工具的 step 參數為 optional，正常流程省略即可（工具自動依 filename 定位）。
    僅在同 session 出現同名檔案時才需帶 step 消歧義。

  decision_tree:
    - 問: 我要新開一份 CSV,資料直接來自 MCP / API 的 response?
      答: artifact_csv_from_json
    - 問: 我要新開一份 CSV,資料是我自己組的 rows(list of dicts)?
      答: artifact_write_csv
    - 問: 我只想知道「有幾列符合條件」(e.g. 還剩幾筆沒評 / 沒 sync)?
      答: artifact_csv_search   # 便宜、不回 rows
    - 問: 我要從 CSV 挑幾列、幾欄組成 MCP payload?
      答: artifact_csv_to_json   # 帶 columns/where/limit,回 records
    - 問: 我只想改既有 CSV 裡面幾列的幾格(例如寫回 score 或 synced)?
      答: artifact_csv_patch    # 不要用 artifact_write_csv,會覆蓋全檔
    - 問: 我想看原始內容(debug 用)?
      答: artifact_read          # 支援 offset/limit 分頁,但不要拿來解析 CSV

  tools:

    artifact_csv_from_json:
      when: 從 MCP/API 的 response seed 一份新的 CSV(最常見的開檔場景)。
      minimum_example: |
        # records 的每個元素已經就是一列 → identity mapping（省略 column_mapping）
        artifact_csv_from_json(
          filename="grade.csv",
          records=response["items"],                           # list of dict
          defaults={"score": "", "reason": "", "synced": ""},   # 補上 records 沒有的欄位
        )
      with_column_mapping: |
        # 當原始 record 的 key 跟想要的 CSV 欄名不同,或需要 dot-path 取巢狀欄位
        artifact_csv_from_json(
          filename="answers.csv",
          records=response["items"],
          column_mapping={
            "exam_answer_id": "exam_answer_id",
            "student_id":     "username",
            "answer_text":    "answer.text",    # 巢狀 dot-path
            "original_score": "score",
          },
          defaults={"new_score": "", "reason": ""},
        )
      gotchas:
        - records 為空時 identity mapping 無法推欄名 → 要給 column_mapping。
        - defaults 的 key 會附加在 column_mapping 後面,順序就是 CSV 欄順序。

    artifact_write_csv:
      when: 你手上已經有 columns + rows(list of dicts),不是直接來自 response。
      minimum_example: |
        artifact_write_csv(
          filename="rubric_scores.csv",
          columns=["criterion", "max_score"],
          rows=[{"criterion": "完整性", "max_score": 3}, ...],
        )
      gotchas:
        - rows 裡某欄 missing → 自動填空字串,不會報錯。
        - columns 必傳真的 array,不要傳 JSON 字串(工具會退回 error)。

    artifact_csv_search:
      when: 只想知道「有幾列符合條件」來決定要不要開下一批 / 是否進下階段。
      minimum_example: |
        # 還剩幾筆沒評?
        artifact_csv_search(
          filename="grade.csv",
          where={"score": ""},
        )
        # → {"matched": 45, "total_rows": 150}
      returns: |
        {"matched": int, "total_rows": int}   # 不回 records,省 token
      gotchas:
        - 不回傳任何 row 資料 → 想要 records 請用 artifact_csv_to_json。
        - 沒給 where → matched == total_rows。

    artifact_csv_to_json:
      when: 要從 CSV 挑出指定欄位 + 符合條件的列,組成 records 餵回 MCP。
      minimum_example: |
        # 找所有 synced 還是空的列,取 batch_grade 需要的三欄,最多 20 筆
        batch = artifact_csv_to_json(
          filename="grade.csv",
          columns=["exam_answer_id", "score", "reason"],
          where={"synced": ""},
          limit=20,
        )
        # batch["records"] 可直接丟進:
        qjudge_grading(action="batch_grade", grades=batch["records"])
      where_semantics:
        - dict 相等比對,AND-combined;empty string ("") 匹配空欄。
        - 不支援運算式 / 大於小於 / OR。若需要複雜過濾,分多次呼叫後合併。
      returns: |
        {
          "count":         20,    # 本次回傳的列數(套用 limit 之後)
          "total_matched": 123,   # 符合 where 的總列數(未套 offset/limit)
          "records":       [{...}, ...]
        }
      gotchas:
        - columns 必填:強迫你明確宣告 payload 形狀(避免一次倒全欄進 context)。
        - 所有值都以字串比對;"5" 跟 5 會視為相等。

    artifact_csv_patch:
      when: 要改既有 CSV 幾列的幾格,其他列要保留。
      minimum_example: |
        # 本批批改完,只送改動的 20 列
        artifact_csv_patch(
          filename="grade.csv",
          key_column="exam_answer_id",
          updates=[
            {"exam_answer_id": 2673, "score": "6", "reason": "..."},
            ...
          ],
        )
      returns: |
        {
          "updated":    20,           # 成功 merge 的筆數
          "missing":    [...],        # updates 裡的 key 找不到對應列的 id list
          "total_rows": 145,           # 寫回後 CSV 的列數
          "artifact":   {...}          # 下游 write 的 metadata
        }
      gotchas:
        - updates 每個元素必須含 key_column;沒對到的 key 會進 missing,不會中斷。
        - key_column 不在 CSV 欄位 → 直接錯誤。
        - update 內若放 key_column 以外不存在的欄名,會被忽略(不新增欄)。

    artifact_read:
      when: debug / 人類可讀 / 想看 raw content。不要拿來解析 CSV 或找列。
      minimum_example: |
        artifact_read(filename="grade.csv", offset=0, limit=50)
      gotchas:
        - 回傳的 content 會在 200k 字元處被截斷;大檔必用 offset/limit。
        - 就算 .csv 也是回整段文字,不會幫你解析。解析用 csv_to_json / csv_search。

  anti_patterns:
    - 用 artifact_read 讀 grade.csv 後自己 split("\n") / split(",") 組 payload
        → 改用 artifact_csv_to_json。
    - 用 artifact_read 配 offset/limit 找「第 N 批還沒評的列」
        → 改用 artifact_csv_search(看剩幾筆) + artifact_csv_to_json(取 rows)。
    - 批改完只 artifact_write_csv 送本批 20 列
        → 會覆蓋整檔,其他列消失。改用 artifact_csv_patch。
    - MCP response 直接 artifact_write(filename="x.csv", content=...)
        → 引號/換行/中文標點遲早踩雷。改用 artifact_csv_from_json。
    - 把 exam_answer_id / username 當成 row index 來算「第幾筆」
        → 它們是欄位值,不是列序。用 where filter 精準定位。
```
