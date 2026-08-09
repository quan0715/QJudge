# 讓 AI 工具連接 QJudge

MCP（Model Context Protocol）是一種讓 AI 工具呼叫外部系統功能的連線方式。對老師與助教而言，它的用途很直接：在熟悉的 AI 工具裡查詢教室、準備題目或協助批改，不必每次都切回 QJudge 網頁。

MCP 是選用功能。只使用 QJudge 網頁、提交與評測時，不需要設定它。

## 開始前先確認兩件事

第一，你的帳號需要有相對應的教室或競賽管理權限。MCP 不會繞過 QJudge 原本的權限檢查。

第二，向站台管理者取得 **QJudge MCP URL**。網址由每個部署單位決定，不一定是 QJudge 官方網域，通常會長得像：

```text
https://mcp.example.edu/mcp
```

若你就是站台管理者，請先完成[加入選用功能](/docs/deployment-options)中的「Remote MCP」與 HTTPS 設定。只在 QJudge 內部讓 AI Service 呼叫 MCP 時，不需要公開 HTTPS；要讓校外的 AI 工具連進來時，才需要可公開存取的 HTTPS 網址。

## 在 AI 工具中加入連線

不同 AI 工具會把入口稱為 MCP、Connectors、Integrations 或 Tools，但設定流程大致相同：

1. 打開工具的 MCP 或整合設定。
2. 新增一個 remote HTTP MCP server。
3. 名稱填入 `qjudge`，網址填入管理者提供的 MCP URL。
4. 儲存後重新載入工具。
5. 第一次使用時，依瀏覽器畫面登入 QJudge 並同意授權。

若工具使用 JSON 設定，常見的形式如下。實際欄位名稱仍以該工具當前版本的說明為準：

```json
{
  "mcpServers": {
    "qjudge": {
      "type": "http",
      "url": "YOUR_QJUDGE_MCP_URL"
    }
  }
}
```

不要把帳號密碼、access token 或 OAuth client secret 寫進這份設定。正常的 remote MCP 流程會在瀏覽器完成 OAuth 授權，再由 AI 工具管理自己的連線憑證。

## 第一次先做唯讀確認

連線完成後，不要一開始就請 AI 修改整場考試。先用一個容易核對的查詢確認帳號與權限：

> 列出我可以管理的教室。

接著選一個測試教室，再問：

> 列出這個教室中的競賽，先不要修改任何內容。

如果看到的範圍正確，再開始新增題目或批改。這樣比較容易在真正變更資料前發現登入錯帳號、選錯站台或權限不足。

## AI 可以使用哪些 QJudge 工具

實際工具清單會由 MCP Server 回傳。目前常用工具如下：

| 工具 | 用途 |
| --- | --- |
| `qjudge_browse` | 尋找教室、競賽與工具說明 |
| `qjudge_contest_manager` | 查看競賽、列出場內題目與調整順序 |
| `qjudge_exam` | 新增、修改、刪除或匯入紙筆題 |
| `preview_exam_problem` | 在修改前預覽紙筆題 |
| `qjudge_coding_problems` | 新增、修改或刪除程式題 |
| `qjudge_code_runner` | 使用題目已保存的測資執行程式碼 |
| `qjudge_grading` | 查詢作答、查看統計與執行批改 |

`qjudge_bank` 目前沒有開放成 MCP 工具。需要從題庫匯入紙筆題時，使用 `qjudge_exam` 的 `import_from_bank`。

## 用自然語言交代工作

你不必背工具名稱。先把範圍、目標與限制說清楚，AI 工具會依情況選擇 MCP 操作。例如：

- 「列出我管理的教室，只查詢，不要修改。」
- 「找出演算法課的期中考，列出所有題目。」
- 「先預覽一題 5 分的二元樹是非題，不要立刻新增。」
- 「查看第五題尚未批改的作答，先整理常見答案。」
- 「用這題系統內已有的測資執行這段 Python 程式。」

要新增、刪除或批量批改時，最好明確要求 AI 先整理預計變更，等你確認後再執行。MCP 仍會受 QJudge 權限與題目狀態限制，但最後的內容判斷仍由授課者負責。

## 常見問題

### 找不到 MCP 設定

先確認目前使用的 AI 工具與版本是否支援 remote HTTP MCP。若只支援本機程序，就不能直接使用這個遠端連線方式；請改用支援 remote MCP 的客戶端，或向工具供應商查詢目前的設定方法。

### 瀏覽器沒有出現登入頁

重新載入 MCP 連線，確認網址包含正確的 `/mcp` 路徑，而且可以從你目前的網路開啟。若站台使用校園網路或 VPN，也要先連上相同網路。

### 出現 401、403 或授權失敗

401 通常表示登入或授權已失效，可以移除連線後重新授權。403 表示帳號已登入，但沒有操作該教室或競賽的權限；請向課程管理者確認，而不是把 token 貼到設定檔裡。

### AI 選錯工具

找教室或競賽時先用 `qjudge_browse`；列出場內題目用 `qjudge_contest_manager`；執行程式碼用 `qjudge_code_runner`。你也可以直接在提示中說明「先查詢競賽，再修改紙筆題」，讓步驟更清楚。

### 我是站台管理者，連線仍失敗

依序確認公開 HTTPS、MCP URL、OAuth issuer 與 callback 是否一致，再查看服務日誌。部署端的檢查順序請見[部署故障排除](/docs/deployment-troubleshooting)。
