---
name: qjudge-mcp-tool-operator
description: QJudge MCP 機械層：依意圖選工具、填正確欄位、處理可修正錯誤（最多重試一次）。不負責題意設計或執行流程哲學。
---

# QJudge MCP Tool Operator

## 負責範圍
- 意圖到工具的路由。
- Top-level payload 欄位檢查與最低必要欄位。
- 錯誤修正策略（一次重試上限）。

## 規則
1. 先判斷意圖，再選單一工具（見 `references/mcp-routing.md`）。
2. 僅傳 API 定義需要的欄位；不要混用舊欄位或別名。
3. `contest_id` / `problem_id` 必須是 UUID；不要猜 `id=1` 這類短碼。
4. `qjudge_code_runner` 必帶：`problem_id`、`language`、`code`。
5. 同一請求可修正錯誤最多重試一次；第二次失敗就停止。
6. 錯誤不清楚或路由不確定時，先呼叫：
   `qjudge_browse(action="get_help", tool_name="<tool_name>")`
