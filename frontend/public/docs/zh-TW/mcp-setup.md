# 配置 MCP 工具連線

MCP（Model Context Protocol）是一種讓外部 AI 工具呼叫系統功能的開放連線協定。對教師與管理者而言，它的用處非常直接：讓你能在平時習慣的 AI 工具（例如 Cursor、Claude Desktop 或支援 MCP 的程式編輯器）中，直接查詢教室資訊、整理題目或取得作答統計，不必每次都手動切換回瀏覽器。

MCP 是**選用功能**。如果你只透過 QJudge 網頁介面出題、批改與評測，完全不需要設定它。

## 第 1 步：確認 MCP 服務就緒

QJudge 系統預設已經內建 Remote HTTP MCP 服務，端點路徑固定為公開網域加上 `/mcp`，例如：

```text
https://judge.example.edu/mcp
```

> **重要注意事項**：外部 AI 工具（如 Claude Desktop 或 Cursor）通常要求遠端連線必須採用 **HTTPS**。如果你的主機目前僅使用地端 IP 或尚未設定 SSL 憑證，請先依照[架設與部署](#/docs/deployment)或[加入選用功能](#/docs/deployment-options)設定網域名稱與 HTTPS（例如搭配 Cloudflare Tunnel 或反向代理）。

## 第 2 步：在 AI 工具中加入連線

不同 AI 工具將此設定稱為 MCP、Connectors、Integrations 或 External Tools，但設定邏輯一致。

### 以 Claude Desktop 為例

在 Claude Desktop 的設定檔（例如 `claude_desktop_config.json`）中加入 `mcpServers` 區塊：

```json
{
  "mcpServers": {
    "qjudge": {
      "type": "http",
      "url": "https://judge.example.edu/mcp"
    }
  }
}
```

### 以 Cursor 為例

1. 打開 Cursor 的 **Settings** > **Features** > **MCP Servers**。
2. 點擊 **Add New MCP Server**。
3. 名稱填入 `qjudge`，Type 選擇 `http`（或 SSE/Remote）。
4. URL 填入你的 QJudge MCP 網址（例如 `https://judge.example.edu/mcp`）並儲存。

### 以 ChatGPT 桌面版為例

ChatGPT 桌面版（macOS 與 Windows）支援連接外部開發者工具與 MCP 服務：

1. 開啟 ChatGPT 桌面應用程式。
2. 點擊個人頭像或齒輪進入 **Settings（設定）**。
3. 進入 **Apps & Integrations（應用與整合）** 或 **Developer（開發者設定）** > **MCP Servers**。
4. 點擊 **Add Server（新增伺服器）**：
   - **名稱（Name）**：`qjudge`
   - **連線類型（Type）**：選擇 `HTTP`（或 Remote）
   - **伺服器網址（URL）**：填入 `https://judge.example.edu/mcp`
5. 若使用 JSON 設定檔，內容與 Claude Desktop 一致：
   ```json
   {
     "mcpServers": {
       "qjudge": {
         "type": "http",
         "url": "https://judge.example.edu/mcp"
       }
     }
   }
   ```
6. 儲存後重啟或重新載入對話，即可在聊天中啟用 QJudge 相關操作。

### 以 ChatGPT 網頁版為例

在瀏覽器中使用 [chatgpt.com](https://chatgpt.com/) 時，可依功能支援採用以下方式：

#### 方式 A：透過 Connected Apps（已啟用開發者 / MCP 連線）
1. 進入 ChatGPT 網頁版，點擊個人設定 > **Connected Apps**（或 **Developer Tools**）。
2. 點擊 **Connect Tool** 或 **Add MCP Endpoint**。
3. 輸入 QJudge 的 MCP 網址：`https://judge.example.edu/mcp`。
4. 點擊連線，系統會彈出 QJudge 的 OAuth 登入視窗完成授權。

#### 方式 B：透過自訂 GPT（Custom GPT Actions 整合）
若希望建立專屬於課程的「課程助教 GPT」：
1. 進入 **Explore GPTs** > 點擊 **Create a GPT**。
2. 切換至 **Configure** 分頁，在最下方找到 **Actions** 並點擊 **Create new action**。
3. 在認證（Authentication）選擇 **OAuth**：
   - **Authorization URL**：`https://judge.example.edu/o/authorize/`
   - **Token URL**：`https://judge.example.edu/o/token/`
   - **Scope**：`read write`
4. 填入 QJudge 端點，完成後即可讓此 GPT 具備查詢教室與出題能力。

> **安全提醒**：**請勿在設定檔中填寫帳號密碼或機密 Token**。QJudge 採用安全的 OAuth 2.0 流程，連線憑證由系統在瀏覽器中動態簽發，不需手動寫死在檔案裡。

## 第 3 步：首次授權與登入

完成上述設定後，重新載入或重啟你的 AI 工具：

1. 當 AI 工具首次嘗試呼叫 QJudge 工具時，瀏覽器會自動彈出或提示你開啟 QJudge 授權頁面。
2. 在網頁上登入你的 QJudge 帳號。
3. 檢視授權畫面（說明工具即將取得的權限），確認後點擊「同意授權」。
4. 瀏覽器顯示授權成功後，即可關閉網頁，回到你的 AI 工具。

## 權限與安全界線

MCP 工具所具備的權限，完全**等同於你在 QJudge 中的登入帳號**：

- **教師帳號**：只能查詢與操作自己所擁有的教室、作業、考卷與學生名冊，無法讀取其他教師的未公開題目。
- **管理員帳號**：可以查詢站台層級的系統狀態與全域設定。

MCP 不會繞過 QJudge 內部的權限校驗，也不會讓 AI 工具取得超出你個人帳號範圍以外的資料。

## 第 4 步：測試第一條指令

連線設定完成後，建議先從簡單的唯讀查詢開始測試，確認連線與權限正常：

在 AI 工具的對話框中輸入：

> 「請幫我查詢我在 QJudge 上有哪些教室？」

如果 AI 能列出你所屬的課程教室名稱與代號，代表 MCP 連線已完全就緒！

[上一步：配置 AI 模型與服務](#/docs/ai-setup) · [下一步：配置第三方登入](#/docs/auth-setup)
