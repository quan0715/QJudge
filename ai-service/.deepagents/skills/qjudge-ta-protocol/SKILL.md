---
name: qjudge-ta-protocol
description: TA Agent 執行層：資料真相來源、get／code_runner／update 順序、檔案工具僅讀、測資驗證工作流、失敗收斂、HITL 使用預期。不含 MCP 欄位細節與工具選擇表（交 mcp-tool-operator）；不含教學與題敘設計（交 Coding_Problem_TA_SKILL）。
---

# QJudge TA 執行協議

## 負責範圍（僅此；其餘交別份 SKILL）

- **先後與真假**：題目／測資以平台 **get** 為準；驗證必 **code_runner**；寫回必 **update**；禁止用本機腳本冒充已驗證。
- **環境行為**：檔案類工具**僅能讀**（見下）；草稿請寫在**回覆訊息**；執行預算與卡住時如何收斂。
- **流程**：測資設計→跑程式驗證→再 update；HITL（寫入會暫停）時勿重試相同寫入。

## 不負責（請改查）

- **具體要呼叫哪個 MCP 名稱、參數 key、payload 禁忌**：**qjudge-mcp-tool-operator**（本協議只說「類型」如 get／update／code_runner）。
- **教學目標、題敘故事、語言出題習慣、定稿欄位 checklist**：**Coding_Problem_TA_SKILL**。

## （1）工具與資料優先順序（必須遵守）

- **真相來源**：題目與測資以 **MCP `qjudge_coding_problems` get** 為準，不要假設本機路徑、`/tmp` 與平台一致。
- **驗證程式**：執行與對答案一律 **`qjudge_code_runner`（傳入 code 字串）**；不要用「在本機執行 Python／shell」當前提。
- **寫回平台**：更新題敘／測資／語言設定一律 **`qjudge_coding_problems` update**；典型順序：**get →（必要時改測資）→ code_runner 驗證 → update**。

## （2）檔案類工具（已關閉寫入）

執行環境已**移除 `write_file` / `edit_file`**。僅可使用 **`ls`、`read_file`、`glob`、`grep`**（及未關閉之其他內建工具）讀取路徑（含 `/app/.deepagents/` 下 SKILL／AGENTS）。

- 需要暫存草稿時用**對話內文**，不要假裝能寫檔。
- **禁止**宣稱已驗證測資，若尚未執行 `qjudge_code_runner` 或未成功比對輸出。
- 真實更新題目／測資必須：`qjudge_coding_problems(action="update")`；執行程式碼必須：`qjudge_code_runner`。
- 同一檔案不要連續 read 超過一次；已讀內容用對話承接。

## （3）執行預算與收斂

- 同一子目標若已嘗試 **約 3 次仍失敗**，**停止鑽研**：條列證據與阻塞，給使用者**可操作的下一步**，勿無限重試。
- 工具優先 **MCP**；非必要不用 ls/glob/grep 掃檔代替查題。

## 測資生成與驗證工作流（語意層；欄位見 mcp-tool-operator）

1. `get` 讀題目與限制（工具選擇與參數鍵名見 **qjudge-mcp-tool-operator**）。
2. 對齊 sample 或整理測資需求（題意品質可參考 **Coding_Problem_TA_SKILL**）。
3. 撰寫 reference solution，放在**訊息**中即可。
4. 設計 sample + hidden 測資。
5. **必須**以 `code_runner` 執行驗證；不可跳過或純手推 expected output。
6. 驗證後以 `update` 寫回 `test_cases`；不可假裝已寫入。

## 寫入核准（HITL）

下列寫入類 action 會中斷待核准（**action 名稱**以實際 MCP 為準）：

- `qjudge_grading`：grade / batch_grade / ungrade（唯讀：list_answers 等）
- `qjudge_contest_manager`：reorder（列表用 list_problems）
- `qjudge_coding_problems`：create / update / delete（唯讀：get）
- `qjudge_exam`：create / update / delete / reorder / import_from_bank / batch_create

不要自行加「請確認」類開場。使用者拒絕寫入時依 ToolMessage 調整，勿重試相同寫入。

## 與其他 SKILL

- **MCP 工具路由與 payload**：`qjudge-mcp-tool-operator`
- **題目設計、題敘、故事性、語言習慣**：`Coding_Problem_TA_SKILL`
