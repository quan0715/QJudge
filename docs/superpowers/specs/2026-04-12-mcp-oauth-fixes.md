# MCP OAuth 修復設計

**日期:** 2026-04-12
**目標:** 修復 MCP OAuth flow 的三類問題，讓 ChatGPT、Notion AI、Claude Code、Cursor 等客戶端都能順利完成 OAuth 認證。

---

## 問題與修復

### 修復 1: DCR redirect_uri 放寬 HTTPS 限制

**檔案:** `backend/apps/oauth/views.py`

**問題:** `dynamic_client_registration` 的 redirect_uri 驗證要求 HTTP/HTTPS 都必須是 loopback 地址。第三方 app（ChatGPT、Notion AI）使用非 loopback 的 HTTPS redirect URI（如 `https://chatgpt.com/aip/...`），導致 DCR 回 400 → 客戶端顯示 "Failed to set up OAuth client registration"。

**修法:** 將 `views.py:106-128` 的驗證邏輯改為：
- **HTTPS** → 允許任意 host
- **HTTP** → 仍限 loopback（localhost, 127.0.0.1, [::1]）
- **cursor://, vscode://** → 維持現狀允許

```python
# Before
if parsed.scheme in {"http", "https"} and parsed.hostname not in loopback_hosts:
    return 400

# After
if parsed.scheme == "http" and parsed.hostname not in loopback_hosts:
    return 400
```

### 修復 2: DCR grant_types 預設值符合 RFC 7591

**檔案:** `backend/apps/oauth/views.py`

**問題:** `body.get("grant_types", [])` 預設為空 list。RFC 7591 §2 規定未提供時預設為 `["authorization_code"]`，但空 list 觸發 400。

**修法:**
```python
# Before
grant_types = body.get("grant_types", [])

# After
grant_types = body.get("grant_types", ["authorization_code"])
```

### 修復 3: OAuth 登入 redirect 狀態保留

這個問題實際包含兩個 bug：

#### Bug 3a: backend 產生絕對 URL，被前端安全檢查擋掉

**檔案:** `backend/apps/oauth/views.py`

**問題:** `authorize_redirect` 使用 `request.build_absolute_uri()` 產生 `next=https://q-judge.com/o/authorize/?...`。但 `LoginScreen.tsx:42-46` 的 open-redirect 防護會拒絕所有 `http://` / `https://` 開頭的 URL。即使 email/password 直接登入也無法跳回 OAuth flow。

**修法:** 改用 `request.get_full_path()` 產生相對路徑（`/o/authorize/?client_id=...`），安全且能通過前端檢查。

```python
# Before
full_url = request.build_absolute_uri()

# After
full_url = request.get_full_path()
```

#### Bug 3b: next 參數在 auth 頁面切換時遺失

**檔案:**
- `frontend/src/features/auth/pending-actions/types.ts`
- `frontend/src/features/auth/pending-actions/registry.ts`
- `frontend/src/features/auth/screens/LoginScreen.tsx`

**問題:** 使用者在 login 頁選擇 Campus SSO 或跳到 register 頁時，`buildAuthLink()` 只保留已註冊的 pending actions。`next` 不在 registry 中，被丟棄。

**修法:**

1. **types.ts** — `banner` 改為 optional（OAuth redirect 不需要顯示 banner）：
   ```typescript
   banner: { titleKey: string; subtitleKey: string } | null;
   ```

2. **registry.ts** — 新增 `oauth_next` pending action：
   ```typescript
   {
     key: "oauth_next",
     storageKey: "qjudge.oauth_next",
     priority: -20,          // 最高優先，在 teacher_activation (-10) 之前
     queryParam: "next",
     banner: null,            // 不顯示 banner
     getRedirectPath: (url) => url,  // 直接 redirect 到存的 URL
   }
   ```

3. **LoginScreen.tsx** — 移除手動的 `next` 處理邏輯（lines 40-47），改為統一走 `getAuthedLandingPath`：
   ```typescript
   // Before: 手動讀 searchParams.get("next") + 安全檢查
   // After: 統一用 getAuthedLandingPath(user)，oauth_next 作為最高優先 pending action 自動處理
   window.location.href = getAuthedLandingPath(safeData.user);
   ```

4. **PendingActionBanner** — 需處理 `banner: null` 的情況（不渲染）。

---

## 影響範圍

| 客戶端 | 修復前 | 修復後 |
|--------|--------|--------|
| ChatGPT / Notion AI | DCR 400（redirect_uri 被拒） | DCR 成功，完整 OAuth flow |
| Claude Code CLI | 已正常（loopback redirect） | 不影響 |
| Cursor / VS Code | 已正常（cursor:// scheme） | 不影響 |
| 未登入使用者 | 登入後 OAuth 狀態遺失 | 登入後自動跳回 authorize 頁 |

## 測試計劃

- backend DCR test: 新增 HTTPS 非 loopback redirect_uri 測試（應通過）
- backend DCR test: 新增省略 grant_types 的測試（應通過）
- backend DCR test: 確認 HTTP 非 loopback 仍被拒
- backend authorize test: 確認 next URL 為相對路徑
- frontend: 確認 `next` 參數在 login → SSO → 回 login 後仍存在
- E2E: 模擬未登入使用者完成 OAuth flow
