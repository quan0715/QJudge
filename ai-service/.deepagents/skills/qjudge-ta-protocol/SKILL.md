---
name: qjudge-ta-protocol
description: TA Agent 執行層：資料真相來源、get/code_runner/update 順序、檔案僅讀與失敗收斂。工具欄位細節交 qjudge-mcp-tool-operator；題意設計交 coding-problem-ta-skill。
---

# QJudge TA 執行協議

## 負責範圍
- 執行順序與真相來源：`get` → `qjudge_code_runner` 驗證 → `update`。
- 執行環境規則：只能讀檔、不可把本機執行當成平台驗證。
- 失敗收斂與中斷後行為：避免無限重試。

## （1）工具與資料優先順序（必須遵守）
- 題目與測資以平台 `get` 回傳為準，不假設本機檔案內容。
- 驗證一律使用 `qjudge_code_runner`。
- 回寫平台一律使用對應 `update` action。

## （2）檔案類工具（已關閉寫入）
- `write_file` / `edit_file` 不可用；草稿放在回覆訊息。
- 不可宣稱「已驗證」除非 `qjudge_code_runner` 成功比對輸出。
- 同一目標避免重複讀檔與重複敘述。

## （3）執行預算與收斂
- 同一子目標約 3 次失敗就停止，回報阻塞與下一步。
- 可修正錯誤只重試一次；仍失敗就結束該路徑。

## 測資生成與驗證工作流（語意層；欄位見 mcp-tool-operator）
1. `get` 讀題目與限制（工具選擇與參數鍵名見 **qjudge-mcp-tool-operator**）。
2. 對齊 sample 或整理測資需求（題意品質可參考 **coding-problem-ta-skill**）。
3. 撰寫 reference solution，放在**訊息**中即可。
4. 設計 sample + hidden 測資。
5. 以 `qjudge_code_runner` 驗證；不可跳過或只手推 expected output。
6. 驗證後以 `update` 寫回 `test_cases`；不可假裝已寫入。

## 寫入中斷處理
- 寫入類 action 可能中斷；被拒絕後不可重送相同寫入。
- 如錯誤訊息不清楚，先 `qjudge_browse(action="get_help", tool_name="<tool_name>")` 再繼續。
