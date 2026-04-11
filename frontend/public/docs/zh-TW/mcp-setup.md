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
- QJudge MCP Server 的連線 URL 與授權 Token（由平台管理員提供）

## 取得連線資訊

1. 登入 QJudge 平台
2. 進入 **設定 > MCP 連線**
3. 點擊「產生 Token」取得您的專屬授權憑證
4. 複製對應工具的安裝指令

## 安裝指南

### Claude Code

在終端機執行：

```bash
claude mcp add --transport http qjudge <MCP_SERVER_URL> \
  --header "Authorization: Bearer <YOUR_TOKEN>"
```

將 `<MCP_SERVER_URL>` 替換為平台提供的 MCP Server URL，`<YOUR_TOKEN>` 替換為您的授權 Token。

重啟 Claude Code 後，輸入 `/mcp` 確認 `qjudge` 出現在伺服器列表中。

### Cursor

在專案根目錄建立 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "qjudge": {
      "url": "<MCP_SERVER_URL>",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN>"
      }
    }
  }
}
```

重啟 Cursor 後，在 Agent 模式中即可使用 QJudge 工具。

### Codex CLI

先設定環境變數，再新增伺服器：

```bash
export QJUDGE_MCP_TOKEN="<YOUR_TOKEN>"
codex mcp add qjudge --url <MCP_SERVER_URL> \
  --bearer-token-env-var QJUDGE_MCP_TOKEN
```

建議將 `export QJUDGE_MCP_TOKEN="..."` 加入您的 `~/.zshrc` 或 `~/.bashrc`。

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

- MCP 連線使用 **OAuth 2.1** 標準授權，Token 代表您的身份
- AI 工具只能存取您有管理權限的教室與競賽
- 所有操作（出題、批改等）都會記錄在競賽活動日誌中
- Token 有效期為 30 天，過期後需重新產生
- 建議不要將 Token 提交到版本控制（已自動加入 `.gitignore`）

## 疑難排解

### 連線失敗

- 確認 MCP Server URL 正確且可存取
- 確認 Token 未過期（可在設定頁面查看）
- 確認您的帳號具有教師或助教權限

### 權限被拒絕 (403)

- 確認您是該競賽的擁有者或管理員
- 如果題目已鎖定（學生已開始作答），部分修改操作會被禁止

### 回應過大

- 使用 `question_id` 參數篩選特定題目的作答，避免一次載入整場考試
- 批量批改時使用 `batch_grade` 而非逐一呼叫 `grade`
