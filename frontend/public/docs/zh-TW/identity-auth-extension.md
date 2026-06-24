> 文件狀態：草稿，2026-06-23  
> 適用範圍：`backend/apps/users`、`backend/apps/oauth`、`frontend/src/features/auth`  
> 目標讀者：QJudge 維護者、部署學校的系統管理者、準備串接 SSO/OAuth 的貢獻者

# 身份模組維護與擴充草稿

## 目標

身份模組的責任是把外部身份轉換成 QJudge 內部使用者與登入工作階段。外部身份可以來自 Email/Password、學校 SSO、OAuth 2.0、OpenID Connect，後續也可能包含 SAML 2.0、CAS 或 LDAP。

QJudge 內部仍應維持單一授權模型：所有登入方式最後都簽發 QJudge 自己的 JWT，系統其他模組只依賴 `User`、role、permission 與 classroom/contest 權限，不直接依賴第三方 provider 的 token 或 claims。

## 目前現況

目前身份流程主要分成三塊：

- `backend/apps/users`
  - 管理 `User`、`UserProfile`、Email/Password、JWT cookie、登入紀錄、角色與教師啟用。
  - `services.py` 已有 `BaseOAuthService`、`NYCUOAuthService`、`GitHubOAuthService`、`GoogleOAuthService` 與 `OAUTH_PROVIDERS` registry。
  - `views/auth.py` 提供 generic provider dispatch：`/api/v1/auth/<provider>/login` 與 `/api/v1/auth/<provider>/callback`。
- `backend/apps/oauth`
  - 這是 QJudge 對外提供給 MCP/CLI 的 OAuth authorization server。
  - 它不是第三方登入入口，維護時必須和 `apps.users` 的外部登入 adapter 分清楚。
- `frontend/src/features/auth`
  - `auth.repository.ts` 可以用任意 `provider` 字串取得登入 URL 與送 callback。
  - `LoginScreen.tsx`、`CampusSsoScreen.tsx` 仍把可見 provider 寫死在畫面內，目前校園 SSO 只列出 NYCU。

目前設計已經有 provider registry 的雛形，但還不是完整可插拔架構。新增一所學校時，仍需要修改後端設定、後端 provider class、前端校園清單與翻譯文字。

## 核心維護原則

1. 外部身份只在身份模組內處理。
   - contest、classroom、AI、submission 等模組不得直接讀 OAuth access token 或學校 claims。
   - 這些模組只能依賴 QJudge 內部的 `User`、role、membership、permission。

2. JWT 是 QJudge 內部 session，不是外部 provider token。
   - 外部 token 只用於完成登入、取得 userinfo 或必要的同步資料。
   - 除非有明確需求，不應把第三方 access token 長期保存。

3. Provider 設定與 provider 邏輯要分離。
   - 設定描述「這個學校的 issuer/client/scopes/claim mapping」。
   - adapter 描述「如何完成 OAuth/OIDC/SAML/CAS 流程」。
   - 新增學校時應優先新增設定，而不是新增一個硬寫 class。

4. 帳號連結必須可追蹤、可審計、可回復。
   - 同一個 QJudge user 可以綁定多個外部身份。
   - 同一個外部身份不能綁到多個 QJudge user。
   - 自動用 email 合併帳號前，必須確認 provider 回傳的 email 已驗證。

## 目前不足與建議解法

| 不足 | 風險 | 建議解法 |
| --- | --- | --- |
| `User` 只有單一 `auth_provider` + `oauth_id` | 無法同時綁定多個 provider；最近一次登入會覆蓋原登入來源 | 新增 `ExternalIdentity` model，以 `(provider_key, subject)` 作唯一鍵，`User.auth_provider` 改為 display/meta 欄位或逐步淡出 |
| provider 清單寫在 `services.py` 與前端畫面 | 開源後每所學校都要改程式碼 | 新增 `IdentityProvider` 設定來源與 `/api/v1/auth/providers` endpoint，由前端動態渲染 |
| OAuth state 產生後沒有完整的 callback 驗證流程 | 容易留下 CSRF、login injection 或 callback 混淆風險 | 使用 signed state + cache session，callback 必須驗證 `state`、`redirect_uri`、provider、TTL；OIDC 額外驗證 `nonce` |
| 尚未標準化 OIDC 驗證 | Google/OIDC 類 provider 目前偏向 userinfo fallback，id_token 驗證不足 | 對 OIDC provider 實作 discovery、JWKS 驗章、issuer/audience/exp/nonce 驗證 |
| Email 自動合併規則過寬 | 未驗證 email 或 provider bug 可能誤綁既有帳號 | 只有 `email_verified=true` 才允許自動連結；否則建立 pending link 並要求既有帳號登入確認 |
| 校園 SSO UI 寫死 NYCU | 其他學校部署時要改 frontend code | provider metadata 回傳 `display_name`、`logo_url`、`category`、`enabled`、`sort_order` |
| provider secret 全在 settings env | 多學校、多環境管理不易，旋轉 secret 缺乏流程 | 支援 env JSON 或 DB 設定；secret 以環境變數或加密欄位注入，不進 Git |
| role mapping 尚未模組化 | 學校 claim 無法自動映射 teacher/student/admin | 增加 claim mapping policy：domain allowlist、groups、affiliation、manual override 優先順序 |
| `apps.oauth` 與 OAuth login 命名容易混淆 | 維護者可能把 QJudge OAuth server 和外部登入串接混在一起 | 文件與程式命名上使用 `identity providers` / `external auth` 指稱第三方登入；`apps.oauth` 明確標示為 QJudge OAuth server |

## 建議目標架構

### 後端模組切分

建議在 `backend/apps/users` 內先收斂出 identity 子模組，後續若規模變大再獨立成 `backend/apps/identity`。

```text
backend/apps/users/
  identity/
    models.py              # IdentityProvider, ExternalIdentity
    registry.py            # adapter registry
    adapters/
      base.py              # AuthProviderAdapter contract
      oauth2.py            # generic OAuth 2.0
      oidc.py              # OpenID Connect
      saml.py              # future
      cas.py               # future
    services/
      login_session.py     # state/nonce/PKCE lifecycle
      account_linking.py   # external identity -> User resolution
      claim_mapping.py     # role/profile/classroom mapping
    views.py               # providers/login/callback endpoints
```

核心 contract：

```python
class AuthProviderAdapter:
    protocol: str

    def build_authorization_url(self, provider, redirect_uri, state, nonce, code_challenge) -> str:
        ...

    def exchange_callback(self, provider, code, redirect_uri, code_verifier) -> ExternalProfile:
        ...

    def normalize_profile(self, provider, raw_claims) -> ExternalProfile:
        ...
```

`ExternalProfile` 至少包含：

- `provider_key`
- `subject`
- `email`
- `email_verified`
- `username`
- `display_name`
- `avatar_url`
- `raw_claims`

### 資料模型

建議新增：

```python
class IdentityProvider(models.Model):
    key = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    protocol = models.CharField(max_length=20)  # oauth2, oidc, saml, cas
    enabled = models.BooleanField(default=False)
    category = models.CharField(max_length=20, default="social")  # campus, social, enterprise
    issuer = models.URLField(blank=True)
    authorize_url = models.URLField(blank=True)
    token_url = models.URLField(blank=True)
    userinfo_url = models.URLField(blank=True)
    jwks_url = models.URLField(blank=True)
    scopes = models.CharField(max_length=255, blank=True)
    client_id_env = models.CharField(max_length=100)
    client_secret_env = models.CharField(max_length=100, blank=True)
    claim_mapping = models.JSONField(default=dict)
    role_mapping = models.JSONField(default=dict)
    ui_metadata = models.JSONField(default=dict)


class ExternalIdentity(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="external_identities")
    provider = models.ForeignKey(IdentityProvider, on_delete=models.PROTECT)
    subject = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    email_verified = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)
    raw_claims = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider", "subject"], name="unique_external_identity"),
        ]
```

保留 `User.email` unique 可以維持現有登入體驗；若未來要支援沒有 email 的校園身份，應先定義 QJudge 的 primary account key，再調整 user model 約束。

### 登入流程

1. 前端呼叫 `GET /api/v1/auth/providers` 取得啟用中的 provider 清單。
2. 使用者選 provider，前端呼叫 `GET /api/v1/auth/<provider>/login`。
3. 後端建立 login session：
   - 產生 `state`、`nonce`、`code_verifier`。
   - 以 cache 保存 provider、redirect_uri、next path、TTL。
   - 回傳 authorization URL。
4. 使用者完成學校 SSO/OAuth。
5. 前端 callback 呼叫 `POST /api/v1/auth/<provider>/callback`，送出 `code`、`state`、`redirect_uri`。
6. 後端驗證 state/session，交換 token，驗證 OIDC id_token 或取得 userinfo。
7. `account_linking` 解析外部身份：
   - 先找 `(provider, subject)` 是否已有 `ExternalIdentity`。
   - 若無，且 email 已驗證，可依 email 找既有 user 並建立 link。
   - 若 email 未驗證或有衝突，建立 pending link，要求使用者用既有方式登入確認。
   - 都不存在時建立新 user。
8. `claim_mapping` 更新 profile、role 或學校資訊。
9. QJudge 簽發內部 JWT cookie，前端進入登入後頁面。

## 新增學校 SSO/OAuth 的建議流程

### 1. 判斷協定

- 優先使用 OpenID Connect。若學校提供 `.well-known/openid-configuration`、`issuer`、`jwks_uri`，就走 OIDC。
- 只有 OAuth 2.0 + userinfo 時，必須確認 userinfo 回傳穩定的 subject 與 email 驗證狀態。
- 若學校只提供 SAML 2.0 或 CAS，應新增對應 adapter，不要把 SAML/CAS 塞進 OAuth service。

### 2. 新增 provider 設定

建議部署設定使用 env JSON 或 admin seed，例如：

```json
{
  "key": "example-university",
  "name": "Example University",
  "protocol": "oidc",
  "enabled": true,
  "category": "campus",
  "issuer": "https://sso.example.edu",
  "scopes": "openid email profile",
  "client_id_env": "EXAMPLE_UNIVERSITY_OIDC_CLIENT_ID",
  "client_secret_env": "EXAMPLE_UNIVERSITY_OIDC_CLIENT_SECRET",
  "claim_mapping": {
    "subject": "sub",
    "email": "email",
    "email_verified": "email_verified",
    "username": "preferred_username",
    "display_name": "name"
  },
  "role_mapping": {
    "teacher": {
      "claim": "groups",
      "contains": ["faculty", "teacher"]
    },
    "student": {
      "claim": "groups",
      "contains": ["student"]
    }
  },
  "ui_metadata": {
    "logo_url": "/school-logos/example-university.png",
    "button_label": "使用 Example University SSO 登入"
  }
}
```

### 3. 加入前端顯示

前端不應再維護 `CAMPUS_PROVIDERS` 常數。畫面應讀取後端 provider metadata：

- `category=campus` 顯示在校園身份驗證頁。
- `category=social` 顯示在一般登入頁。
- `enabled=false` 不顯示。
- logo 與 label 由 provider metadata 或 i18n key 決定。

### 4. 補測試

最低測試範圍：

- provider registry 能依 `key` 找到設定與 adapter。
- login URL 包含正確 client、redirect、scope、state、PKCE challenge。
- callback 會拒絕缺少或錯誤的 state。
- OIDC id_token 驗證 issuer、audience、exp、nonce。
- `ExternalIdentity` 建立後，第二次登入會回到同一個 user。
- 已驗證 email 可以連結既有 user；未驗證 email 不會自動合併。
- provider disabled 時 login endpoint 回 404 或 400。
- 前端 provider list 可渲染 campus/social provider。

## 相容性與遷移計畫

### Phase 1：補文件與安全底線

- 保留現有 `BaseOAuthService`。
- 補 state 驗證、callback TTL、provider enabled 檢查。
- 補 `/api/v1/auth/providers`，讓前端先從後端讀 provider 清單。
- 把 NYCU/GitHub/Google 的 UI 清單從畫面常數移到 provider metadata。

### Phase 2：新增資料模型

- 新增 `IdentityProvider` 與 `ExternalIdentity`。
- 以 migration 將既有 `User.auth_provider` + `oauth_id` 回填成 `ExternalIdentity`。
- `User.auth_provider` 先保留為相容欄位，但新邏輯以 `ExternalIdentity` 為準。

### Phase 3：抽 adapter

- 將 `NYCUOAuthService`、`GitHubOAuthService`、`GoogleOAuthService` 收斂成 `OAuth2Adapter` 與 `OIDCAdapter` 的設定案例。
- Provider 特例只能放在小型 hook，例如 GitHub primary email lookup，不應散落在主登入流程。

### Phase 4：支援更多校園協定

- 若有學校需要 SAML 2.0，新增 `SAMLAdapter`，登入結果仍輸出同一個 `ExternalProfile`。
- 若有學校需要 CAS，新增 `CASAdapter`。
- classroom 或 course roster 同步應另開「校務資料同步」模組，不應塞進登入 callback。

## 維護 Checklist

新增或調整 provider 前，確認：

- provider key 穩定、全小寫、不可重命名；若要改名需提供資料遷移。
- subject claim 穩定且不可重複，不能用 display name。
- email claim 是否保證已驗證。
- redirect URI 已在第三方平台註冊，且與 `FRONTEND_URL`/部署網域一致。
- callback 驗證 `state`、`nonce`、PKCE、issuer、audience。
- provider secret 不進 Git、不印在 log。
- 登入失敗 log 只記 provider、錯誤類型、request id，不記 access token 或完整 claims。
- role mapping 不得自動給 admin；admin 仍應由 QJudge 管理者手動授權。
- 若 provider 暫停或 secret 過期，Email/Password 或至少 admin emergency login 仍可使用。

## 待定問題

- 是否允許部署者完全關閉 Email/Password，只保留學校 SSO？
- teacher 身份要由 SSO claims 自動賦予，還是維持目前教師啟用邀請流程？
- 多校共用一套 QJudge 時，是否需要在 user/profile 上保存 institution？
- 若兩個學校回傳相同 email，是否允許同一個 QJudge user 綁定兩個校園身份？
- 是否需要管理介面讓 admin 啟用/停用 provider，或先以 env/seed 管理即可？

---

本草稿先定義身份模組的維護邊界與演進方向。下一步可以把 Phase 1 拆成實作 issue：補 state/PKCE、provider metadata endpoint、前端動態 provider list，這三項會立即降低開源部署時的修改成本。
