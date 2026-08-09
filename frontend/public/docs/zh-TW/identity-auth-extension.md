# 擴充身分登入來源

QJudge 可以使用帳號密碼，也可以串接校園 SSO、OAuth 2.0 或 OpenID Connect。這份文件提供給維護者與學校系統管理者，說明現有登入邊界，以及新增 provider 時應修改哪些地方。

如果你只是要啟用現有的 Google、GitHub 或 NYCU 登入，不需要修改程式。先向 provider 申請 client ID 與 client secret，再依[加入選用功能](/docs/deployment-options)設定 HTTPS、callback 與環境變數。

## 先分清楚兩種 OAuth

儲存庫裡有兩個會使用 OAuth 名稱的區域，但角色相反：

| 區域 | QJudge 的角色 | 用途 |
| --- | --- | --- |
| `backend/apps/users` | OAuth client | 讓使用者透過學校、Google 或 GitHub登入 QJudge |
| `backend/apps/oauth` | Authorization server | 讓外部 MCP client 取得操作 QJudge 的授權 |

新增學校 SSO 或一般登入 provider 時，主要修改 `backend/apps/users/auth/` 與 `frontend/src/features/auth/`。不要把第三方登入流程放進 `backend/apps/oauth`。

不論從哪個 provider 登入，成功後都會轉成 QJudge 自己的 `User` 與 session。第三方 claims 只用來辨識身分，不會直接授予 teacher、admin、教室成員或競賽管理權限。

## 登入流程如何走

以 `google` 為例，使用者會經過以下步驟：

1. 前端讀取 `GET /api/v1/auth/providers`，決定登入頁要顯示哪些選項。
2. 使用者選擇 Google，前端呼叫 `/api/v1/auth/login/google`。
3. 後端建立 provider authorization URL，瀏覽器前往 Google。
4. Google 將瀏覽器帶回前端 `/auth/google/callback`。
5. 前端把 code 送到後端 `/api/v1/auth/callback/google`。
6. 後端交換 token、取得 user info，並轉成 `NormalizedQAuthIdentity`。
7. account linking 找到或建立 QJudge `User`，更新 `ExternalIdentity`，最後簽發 QJudge 自己的登入 cookie。

這裡最常設定錯的是 callback：provider 管理介面應填前端公開網址，例如 `https://judge.example.edu/auth/google/callback`，不是後端 API 路徑。

## 公開選項與機密連線設定

登入頁需要知道 provider 的名稱、分類與圖示，但絕對不需要知道 client secret。QJudge 因此把設定分成兩層：

- `backend/apps/users/auth/provider_registry.py` 保存可公開的顯示資訊與 service 對應。
- `QAUTH_PROVIDER_CONNECTIONS_JSON` 保存後端使用的 endpoint、scope，以及「要從哪個環境變數讀取 credential」。
- 實際 client ID 與 client secret 放在伺服器環境變數，不寫進 JSON、前端 bundle 或 Git。

`GET /api/v1/auth/providers` 只會輸出公開 metadata。`backend/apps/users/auth/provider_connections.py` 只在伺服器端解析連線設定與讀取 credential。

帳號密碼登入則由 `AUTH_EMAIL_PASSWORD_ENABLED` 控制。停用後，公開 provider 清單不再顯示 password，相關註冊與登入 API 也會拒絕請求。

## 身分如何連到既有帳號

外部身分的主資料是 `ExternalIdentity`，穩定鍵為 `(provider_key, subject)`。`User.auth_provider` 與 `User.oauth_id` 是既有相容欄位，不能用來表示一名使用者連接的所有 provider。

目前 linking 順序是：

1. 先用 `provider_key + subject` 尋找既有 `ExternalIdentity`。
2. 找不到且 provider 回傳 email 時，尋找相同 email 的 QJudge 使用者；不存在才建立新使用者。
3. 沒有可用 email 時，以 provider 身分建立使用者。
4. 同步 `User` projection，再新增或更新 `ExternalIdentity`。

因此新增 provider 時，只有在你信任該來源的 email 時，才應把 email 放進 normalized identity。若 provider 可能回傳未驗證或可任意宣告的 email，應先補上驗證與 linking 規則，否則同 email 自動連結可能接到錯誤帳號。

## 新增一個 provider

假設新的 provider key 是 `school`，可以依下面順序進行。

### 1. 先確認 provider 契約

向學校身分系統管理者取得 authorization endpoint、token endpoint、userinfo endpoint、scope，以及可作為穩定 subject 的欄位。也要確認 email 是否經過 provider 驗證。

在正式站台註冊 callback：

```text
https://YOUR_QJUDGE_ORIGIN/auth/school/callback
```

本機開發若 provider 允許 HTTP，可另加：

```text
http://localhost:5173/auth/school/callback
```

### 2. 建立後端 provider service

在 `backend/apps/users/auth/providers/` 新增 provider class，繼承 `BaseOAuthService`。至少要設定穩定的 `provider_key`、預設 scope 與 settings 名稱，並把 provider profile 轉成共同欄位：

- `oauth_id`：穩定且不可變的 subject
- `username`
- `email`：只有可信任時才提供
- `avatar_url`：選用

共用的 authorization URL、code exchange 與 userinfo request 已在 `providers/base.py`。只有 provider 真的不同時才覆寫方法，避免複製整套登入流程。

### 3. 註冊公開 metadata

在 `backend/apps/users/auth/provider_registry.py` 呼叫 `register_oauth_provider()`，讓 provider key 對應到剛建立的 service，並設定：

- `type`：`oauth2` 或 `oidc`
- `category`：校園登入用 `campus`，一般社群登入用 `social`
- `display_name`
- 選用的 i18n key 與 logo URL

class 的 `provider_key` 必須和 registry key 完全相同。路由不必為每個 provider 重寫；`backend/apps/users/auth_urls.py` 已使用 generic `/login/<provider>` 與 `/callback/<provider>`。

### 4. 加入 server-only connection

在部署環境的 `QAUTH_PROVIDER_CONNECTIONS_JSON` 加入同一個 key，並用 `client_id_env`、`client_secret_env` 指向另外兩個環境變數。credential 本身只放進 secret 管理或 `.env`，不要直接放進 JSON。

若 endpoint 可以沿用 Django settings 的既有預設，connection 可只覆寫必要欄位。設定完成後先用 Compose config 檢查 JSON 與環境變數，再啟動服務。

### 5. 補上前端顯示文字

前端會根據 `/api/v1/auth/providers` 自動顯示 provider。若 registry 使用新的 `display_name_i18n_key`，請在各語系 auth 翻譯檔加入相同 key；logo 則放在公開 assets 並填入 `logo_url`。通常不需要新增 callback route，`frontend/src/features/auth/routes.tsx` 已提供 `/auth/:provider/callback`。

### 6. 寫測試，再用測試帳號走一次

至少覆蓋以下情況：

- provider metadata 是否正確且未洩漏 credential
- connection JSON 與 credential env 是否正確解析
- profile 能否轉成穩定 subject、username 與可信 email
- 第一次登入建立帳號，再次登入回到同一帳號
- 相同 email linking 與重複 subject 的行為
- provider 拒絕、callback code 無效與外部 endpoint 失敗

現有測試可從下列檔案開始閱讀：

- `backend/apps/users/tests/test_auth_provider_options.py`
- `backend/apps/users/tests/test_oauth_profile_helpers.py`
- `backend/apps/users/tests/test_account_linking.py`
- `backend/apps/users/tests/test_auth_module_boundaries.py`

測試通過後，仍要使用 provider 的測試應用程式與非管理員帳號走完瀏覽器流程，確認 callback、cookie、重複登入與登出。不要用正式教師或學生帳號做第一次串接測試。

## 故障排除

### 登入頁沒有出現 provider

先呼叫 `GET /api/v1/auth/providers`。若清單沒有該 key，檢查 registry 是否載入、key 是否一致；若 API 有但畫面沒有，再檢查 `category` 與前端翻譯。

### Provider 顯示 callback 不相符

核對三個位置是否使用同一個公開 origin：QJudge 的 `QJUDGE_PUBLIC_ORIGIN`、provider 管理介面中的 callback，以及瀏覽器實際開啟的 `/auth/{provider}/callback`。正式 OAuth 通常需要 HTTPS。

### Code exchange 失敗

確認 client ID 與 secret 成對存在，token endpoint、redirect URI 與 scope 符合 provider 設定。查看後端日誌時不要輸出 authorization code、access token 或 client secret。

### 登入到錯誤的既有帳號

先查 `ExternalIdentity` 的 provider key 與 subject，再檢查 provider 提供的 email 是否可信。不要直接修改 `User.oauth_id` 當成修復；應先釐清 linking 規則與既有外部身分資料，再進行可追蹤的資料修正。

### 登入成功但沒有教師權限

這是預期的安全邊界。provider 只證明身分，教師、管理員、教室與競賽權限仍需由 QJudge 內的管理流程授予。
