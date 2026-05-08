QJudge 支援透過 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 讓 AI 工具直接管理您的考試題目與批改作業。連線後，您可以用自然語言請 AI 助手幫您出題、改卷、查看統計，無需手動操作網頁介面。

## 支援的 AI 工具

| 工具 | 支援狀態 |
|------|---------|
| 支援 remote MCP 的 AI 工具 | 完整支援，直接貼上 `https://mcp.q-judge.com/mcp` |
| [Claude Code](https://claude.ai/claude-code) | 完整支援（Streamable HTTP） |
| [Cursor](https://cursor.com) | 完整支援 |
| [Codex CLI](https://github.com/openai/codex) | 完整支援 |
| [ChatGPT](https://chatgpt.com/) / Claude Desktop / VS Code 等支援 remote MCP 的工具 | 應可使用，流程類似 Notion 官方 MCP onboarding |
| 其他 MCP 相容工具 | 應可使用（需支援 remote MCP 或 Streamable HTTP transport） |

## 前置條件

- QJudge 帳號，且具有 **教師** 或 **助教** 權限
- 已安裝上述任一 AI 工具

MCP Server 將使用 OAuth 2.1 自動進行授權，無需手動產生 Token。

## 快速連接

如果您的 AI 工具有內建 MCP、Connectors 或 Integrations 設定頁，請優先使用這種方式，流程和 Notion 官方的「Connect through your AI tool」類似：

1. 在工具設定中新增 custom / remote MCP server
2. 貼上 QJudge MCP server URL
3. 儲存設定並重新載入工具
4. 第一次呼叫 QJudge 工具時，在瀏覽器完成 OAuth 登入與授權

```text
https://mcp.q-judge.com/mcp
```

這類流程通常適用於 ChatGPT、Claude Desktop、VS Code，以及其他支援 remote MCP 的客戶端。

## 安裝指南

### Claude Code

在終端機執行：

```bash
claude mcp add --transport http qjudge https://mcp.q-judge.com/mcp
```

重啟 Claude Code 後，輸入 `/mcp` 確認 `qjudge` 出現在伺服器列表中。

### Cursor

在專案根目錄建立 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "qjudge": {
      "type": "http",
      "url": "https://mcp.q-judge.com/mcp"
    }
  }
}
```

重啟 Cursor 後，在 Agent 模式中即可使用 QJudge 工具。

### Codex CLI

在終端機執行：

```bash
codex mcp add --transport http qjudge https://mcp.q-judge.com/mcp
```

## 如果你的工具不支援 remote MCP

若您的 AI 工具只能讀取本地 JSON 設定或 CLI 命令，請使用本頁提供的 Claude Code、Cursor、Codex CLI 範例。核心原則不變：所有客戶端最終都應指向同一個遠端 server URL：

```text
https://mcp.q-judge.com/mcp
```

## 自動授權流程

加入 MCP Server 後，您在第一次呼叫工具時，瀏覽器會自動開啟 QJudge 登入頁面。完成授權後，您的身份令牌將由 AI 工具安全保存；後續使用通常無需重複授權。

## 可用工具

連線成功後，您的 AI 工具會看到多個 QJudge MCP 工具。實際工具名稱以 MCP 工具列表為準；目前常用工具如下：

| 工具 | 用途 | 何時使用 |
|------|------|----------|
| `qjudge_browse` | 查詢教室、競賽與取得工具說明 | 還不知道 `classroom_id` 或 `contest_id` 時 |
| `qjudge_contest_manager` | 查看競賽詳情、列出場內題目、重排題目 | 已知道 `contest_id`，要操作整場競賽時 |
| `qjudge_exam` | 管理紙筆題考試題目 | 紙筆題單題新增、修改、刪除、批次新增、從題庫匯入 |
| `qjudge_coding_problems` | 管理程式題題目資料 | 程式題單題新增、修改、刪除 |
| `qjudge_code_runner` | 執行程式題測試 | 要用某段程式碼跑該題在系統內儲存的全部測資時 |
| `qjudge_grading` | 查看作答與批改 | 查詢作答、看單題統計、批改、批量批改、撤銷批改 |
| `preview_exam_problem` | 預覽紙筆題顯示效果 | 修改紙筆題前，想先確認學生看到的題目畫面 |

> 注意：`qjudge_bank` 目前沒有開放成 MCP 工具。題庫匯入目前走 `qjudge_exam` 的 `import_from_bank`，而不是直接用 MCP 管理題庫本身。

### 查詢教室與競賽：`qjudge_browse`

常用 action：

- `list_classrooms`：列出您管理的教室。
- `get_classroom`：取得單一教室資訊。
- `list_classroom_contests`：列出某個教室中的競賽或考試。
- `list_contests`：列出您可管理的競賽。
- `get_contest`：取得單一競賽資訊。
- `get_help`：取得 MCP 工具使用說明。

### 競賽層操作：`qjudge_contest_manager`

常用 action：

- `get_detail`：取得競賽詳情。
- `list_problems`：列出競賽內的所有題目。
- `reorder`：重排競賽題目順序。

如果您只是要「找某場考試」或「找某個教室」，請先用 `qjudge_browse`；已經知道 `contest_id` 後，再用 `qjudge_contest_manager`。

### 紙筆題管理：`qjudge_exam`

`qjudge_exam` 只用於 `paper_exam` 類型的競賽。場內題目列表與重排請改用 `qjudge_contest_manager`。

常用 action：

- `get`：查看單一紙筆題。
- `create`：新增單一紙筆題。
- `update`：修改單一紙筆題。
- `delete`：刪除單一紙筆題。
- `batch_create`：批次新增紙筆題。
- `import_from_bank`：從題庫匯入紙筆題。

支援題型包含是非、單選、多選、簡答與問答。選項請傳純文字，畫面會自動處理選項標號。

### 程式題管理：`qjudge_coding_problems`

`qjudge_coding_problems` 只用於 `coding` 類型的競賽。這個工具只管理題目資料，不執行學生程式碼。

常用 action：

- `get`：查看單一程式題。
- `create`：新增單一程式題。
- `update`：修改單一程式題。
- `delete`：刪除單一程式題。

若要列出某場競賽的全部程式題，請用 `qjudge_contest_manager` 的 `list_problems`。

### 程式碼執行：`qjudge_code_runner`

`qjudge_code_runner` 用於對某一道程式題執行程式碼。它會跑該題在系統中儲存的全部測資，不是只跑 sample，也不支援傳入自訂測資。

必要參數：

- `problem_id`
- `language`
- `code`

目前支援語言：

- `cpp`
- `c`
- `python`
- `java`

### 作答查看與批改：`qjudge_grading`

常用 action：

- `list_answers`：列出學生作答，可依題目或參賽者篩選。
- `question_detail`：查看單題作答分析與分布。
- `dashboard`：查看整場考試的批改總覽。
- `grade`：批改單一作答。
- `batch_grade`：批量批改多份作答。
- `ungrade`：撤銷批改結果。

## 使用範例

以下是一些您可以直接對 AI 說的指令：

**查詢與瀏覽**
- 「列出我的所有教室」
- 「找到演算法這門課的期中考」
- 「看一下第三題的內容」
- 「列出這場考試的所有題目」

**出題**
- 「幫我在期中考新增一題關於二元樹的是非題，配分 5 分」
- 「新增一題多選題，問 TCP 三向交握的步驟，選項有四個」
- 「從題庫匯入 A+B Problem 到這場競賽」

**程式題**
- 「列出這場競賽的所有程式題」
- 「新增一題程式題，題目是輸入兩個整數並輸出總和」
- 「幫我跑一下這段 Python 程式，用這題系統內的測資測試」
- 「把第二題的時間限制改成 2 秒」

**批改**
- 「看一下第五題的作答情況」
- 「第五題的簡答題，答對關鍵字『遞迴』的給 8 分，其他給 4 分」
- 「幫我批改所有還沒改的申論題」

## 安全性說明

- MCP 連線使用 **OAuth 2.1 with PKCE** 標準授權，無需手動產生或儲存 Token
- 存取令牌由您的 AI 工具自動儲存與管理；實際儲存位置依工具而定
- 存取令牌（Access Token）有效期為 1 小時，過期後會自動更新
- 更新令牌（Refresh Token）有效期為 30 天，需重新授權
- AI 工具只能存取您有管理權限的教室與競賽
- 所有操作（出題、批改等）都會記錄在競賽活動日誌中

## 疑難排解

### 連線失敗

- 確認 MCP Server URL 正確且可存取（應為 `https://mcp.q-judge.com/mcp`）
- 確認您的帳號具有教師或助教權限
- 若授權過期（Refresh Token 逾期），請重新執行安裝指令以重新授權

### 權限被拒絕 (403)

- 確認您是該競賽的擁有者或管理員
- 如果題目已鎖定（學生已開始作答），部分修改操作會被禁止

### 回應過大

- 使用 `question_id` 參數篩選特定題目的作答，避免一次載入整場考試
- 批量批改時使用 `batch_grade` 而非逐一呼叫 `grade`

### 工具用錯

- 如果 AI 嘗試用 `qjudge_exam` 列出全部題目，請改用 `qjudge_contest_manager` 的 `list_problems`。
- 如果 AI 嘗試用 `qjudge_coding_problems` 執行程式碼，請改用 `qjudge_code_runner`。
- 如果 AI 想直接管理題庫，請注意目前 `qjudge_bank` 未開放成 MCP 工具。
