---
name: qjudge-mcp-tool-operator
description: QJudge MCP 的機械層：依意圖選對工具、欄位與 payload 守則、可修正錯誤時最多重試一次。不寫教學設計、題敘故事、執行哲學或虛擬檔規則。
---

# QJudge MCP Tool Operator

## 負責範圍（僅此；其餘交別份 SKILL）
- **選工具**：使用者想做什麼 → 對應哪一個 MCP 工具名稱。
- **怎麼填**：top-level 欄位、禁止欄位（如 `coding_ext`）、`code_runner` 必備 `problem_id` + `language` + `code` 等。
- **錯了怎辦**：可修正的欄位錯誤 → 修一次再送；同一請求最多重試**一次**。

## 不負責（請改查）
- **何時先 get、何時才能宣稱驗證完成、虛擬檔能不能當測資**：**`qjudge-ta-protocol`**。
- **教學目標、題敘怎寫、故事性、語言出題習慣**：**`Coding_Problem_TA_SKILL`**。

## Scope
- 只處理 QJudge MCP 任務：查詢、出題、程式題管理、執行程式、批改。
- 若使用者請求不在此範圍，停止工具流程並請使用者改成 QJudge 任務。

## Instructions

1. 先判斷意圖，再選唯一工具（詳見 `references/mcp-routing.md`）。

2. 送出前做最小 payload guard（常見錯誤見 `references/mcp-routing.md`）。

3. 工具錯誤時的處理：
- 若是可修正的欄位錯誤，修正後重試一次。
- 同一請求最多重試一次；第二次仍失敗就回報錯誤與缺少欄位，不再循環。
