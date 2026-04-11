QJudge 支援透過 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 讓 AI 工具直接管理您的考試題目與批改作業。連線後，您可以用自然語言請 AI 助手幫您出題、改卷、查看統計，無需手動操作網頁介面。

## 支援的 AI 工具

| 工具 | 支援狀態 |
|------|---------|
| [Claude Code](https://claude.ai/claude-code) | 完整支援（Streamable HTTP） |
| [Cursor](https://cursor.com) | 完整支援 |
| [Codex CLI](https://github.com/openai/codex) | 完整支援 |
| 其他 MCP 相容工具 | 應可使用（需支援 Streamable HTTP transport） |

## 前置條件

- QJudge 帳號，且具有 **教師** 或 **助教** 權限
- 已安裝上述任一 AI 工具

MCP Server 將使用 OAuth 2.1 自動進行授權，無需手動產生 Token。

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

## 自動授權流程

加入 MCP Server 後，您在第一次呼叫工具時，瀏覽器會自動開啟 QJudge 登入頁面。完成授權後，您的身份令牌將被安全地保存在系統 Keychain（macOS）或 Credential Manager（Windows）中，後續使用無需重複授權。

## 可用功能

連線成功後，您的 AI 工具將獲得以下三組功能：

### 查詢教室與競賽 (`qjudge_discover`)

| 操作 | 說明 |
|------|------|
| `list_classrooms` | 列出您管理的所有教室 |
| `list_contests` | 搜尋競賽（支援名稱搜尋與狀態篩選） |
| `get_contest` | 查看競賽詳情 |

### 管理考試題目 (`qjudge_exam`)

| 操作 | 說明 |
|------|------|
| `list` | 列出競賽中所有考試題目 |
| `get` | 查看單一題目詳情 |
| `create` | 新增題目（支援是非、單選、多選、簡答、申論） |
| `update` | 修改題目內容 |
| `delete` | 刪除題目 |
| `reorder` | 重新排列題目順序 |

### 查看與批改作答 (`qjudge_grading`)

| 操作 | 說明 |
|------|------|
| `list_answers` | 列出學生作答（可按題目或學生篩選） |
| `question_detail` | 查看單題的作答分析與答題分佈 |
| `dashboard` | 查看整場考試的批改總覽 |
| `grade` | 批改單一作答 |
| `batch_grade` | 批量批改多份作答 |
| `ungrade` | 撤銷批改結果 |

## 使用範例

以下是一些您可以直接對 AI 說的指令：

**查詢與瀏覽**
- 「列出我的所有教室」
- 「找到演算法這門課的期中考」
- 「看一下第三題的內容」

**出題**
- 「幫我在期中考新增一題關於二元樹的是非題，配分 5 分」
- 「新增一題多選題，問 TCP 三向交握的步驟，選項有四個」

**批改**
- 「看一下第五題的作答情況」
- 「第五題的簡答題，答對關鍵字『遞迴』的給 8 分，其他給 4 分」
- 「幫我批改所有還沒改的申論題」

## 安全性說明

- MCP 連線使用 **OAuth 2.1 with PKCE** 標準授權，無需手動產生或儲存 Token
- 存取令牌由您的 AI 工具自動儲存在系統 Keychain 中，確保安全
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
