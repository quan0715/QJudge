# 配置第三方登入

在預設狀態下，QJudge 支援傳統的電子郵件與密碼登入。如果學校或機構希望學生與教師直接使用現有的帳號（例如 Google、GitHub 或陽明交通大學單一登入 NYCU OAuth）一鍵登入，不需額外記憶新密碼，可以透過本指南完成設定。

第三方登入為**選用功能**。你也可以隨時依單位政策啟用其中一種或多種登入管道。

## 第 1 步：向提供者申請 OAuth 憑證

首先需要至對應平台的開發者後台註冊應用程式，以取得一組 **Client ID** 與 **Client Secret**。

- **Google**：前往 [Google Cloud Console](https://console.cloud.google.com/) > **API 和服務** > **憑證** > **建立憑證** > **OAuth 用戶端 ID**（應用程式類型選擇「網頁應用程式」）。
- **GitHub**：前往 GitHub **Settings** > **Developer settings** > **OAuth Apps** > **New OAuth App**。

### 最關鍵的一步：填寫 Callback URL

在各平台填寫應用程式資訊時，務必將**授權重新導向 URI（Authorized redirect URIs / Callback URL）**設定為你的 QJudge 前端公開網址：

```text
https://<你的網域>/auth/<provider>/callback
```

具體範例如下：

- Google 回調網址：`https://judge.example.edu/auth/google/callback`
- GitHub 回調網址：`https://judge.example.edu/auth/github/callback`
- NYCU 回調網址：`https://judge.example.edu/auth/nycu/callback`

> **特別注意**：請確認網址開頭包含 `https://`，且指向**前端網域**與 `/auth/...` 路徑，不要填寫成後端 API 的位址。若網址填寫錯誤，使用者登入時提供者會回報「重新導向 URI 不相符（redirect_uri_mismatch）」。

## 第 2 步：在主機設定環境變數

取得憑證後，透過 SSH 連上你的 QJudge 部署主機，編輯專案目錄下的 `.env` 檔案。

只填寫你想啟用的平台即可（Client ID 與 Secret 必須成對填寫）：

```env
# Google 登入
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-your-google-client-secret

# GitHub 登入
GITHUB_OAUTH_CLIENT_ID=your-github-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-github-client-secret

# NYCU 校園單一登入（陽明交通大學）
NYCU_OAUTH_CLIENT_ID=your-nycu-client-id
NYCU_OAUTH_CLIENT_SECRET=your-nycu-client-secret
```

## 第 3 步：可選：強制使用第三方登入

如果你希望全校統一透過第三方帳號登入，關閉原本的一般電子郵件與密碼輸入框，可以在 `.env` 中設定：

```env
AUTH_EMAIL_PASSWORD_ENABLED=false
```

啟用後，登入頁面只會顯示已啟用的第三方登入按鈕，不再開放自訂密碼註冊。

## 第 4 步：套用設定並重新啟動

在主機專案目錄下執行以下指令，讓後端與前端重新讀取環境變數：

```bash
docker compose -p qjudge up -d backend frontend
```

## 第 5 步：驗證登入流程

1. 使用瀏覽器的無痕視窗開啟 QJudge 登入頁面（`https://<你的網域>/login`）。
2. 確認登入頁面上已出現對應的登入按鈕（例如「使用 Google 登入」或「使用 GitHub 登入」）。
3. 點擊按鈕，確認瀏覽器能順利導向該平台的授權畫面。
4. 完成帳號登入與授權後，檢查是否能正常跳轉回 QJudge 首頁並顯示已登入狀態。

## 帳號身分與權限界線

- **首次登入自動建檔**：當使用者第一次透過 Google 或 GitHub 登入時，系統會自動建立 QJudge 使用者資料，預設角色為「學生」。
- **教師資格需由管理員開通**：即使該帳號是學校教授或講師的外部信箱，登入後也不會自動成為教師。若該人員需要開課出題，仍請站台管理員依照[管理教師資格](#/docs/teacher-qualification)，在使用者管理頁搜尋該帳號並手動確認開通。

[上一步：配置 MCP 工具連線](#/docs/mcp-setup) · [返回平台概覽](#/docs/overview)

## 密碼重設與寄信

密碼重設需要帳密登入與 `EMAIL_MODE=external` 同時啟用。SMTP 設定、停用狀態下的測試信與分階段啟用步驟，見[設定寄信](#/docs/deployment-email)。
