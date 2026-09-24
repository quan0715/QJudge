# Deploy Overhaul 04：Gateway 與 ingress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端 nginx 容器成為 `gateway`，分流所有 HTTP 路徑（含 `/mcp`），只信任指定反向代理的 `X-Forwarded-*`；MCP 公開網址由 origin 推導；新增 `qjudge ingress` 列出需要設定的入口。

**Architecture:** MCP 的 resource 網址沿用現行語意（base URL，endpoint 為 base + `/mcp`），base 預設為 `QJUDGE_PUBLIC_ORIGIN`；RFC 9728 的 protected-resource metadata 由 gateway 轉給 MCP server，其餘 `/.well-known` 仍交給 backend。gateway 的真實 IP 設定由 nginx image 的 `/docker-entrypoint.d` 腳本依 `QJUDGE_TRUSTED_PROXIES` 產生；`X-Forwarded-Proto` 以上游傳入值為準，缺少時用 `$scheme`。本地 dev 由 Vite 扮演 gateway，以相同路徑規則代理。舊 compose 傳的 `MCP_PUBLIC_URL` 仍被採用，dcslab 不受影響。

**Tech Stack:** nginx（官方 image entrypoint）、Vite dev proxy、React、Django、FastMCP、Python 標準函式庫 CLI。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md` §6

**計畫系列：** 01、02、03（完成）→ **04 Gateway 與 ingress（本文件）** → 05 Storage 與 addon → 06 init／upgrade／rollback 與 CD → 07 CI E2E、刪除 test compose、文件 → 08 dcslab 轉換與清理。

**影響：** dcslab 轉換（08）後，Remote MCP 網址會從 `https://mcp.q-judge.com/mcp` 變成 `<origin>/mcp`，已設定的外部 MCP client 需要更新網址。storage 與 LiveKit 的入口在 05 加入 `ingress`。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `backend/config/settings/base.py`（修改） | `MCP_PUBLIC_URL` 預設為 origin |
| `mcp-server/config.py`（修改） | `MCP_PUBLIC_URL` 預設為 origin |
| `frontend/src/features/auth/components/settings/MCPSetupPanel.tsx`（修改） | MCP 網址為目前網站 origin + `/mcp` |
| `frontend/vite.config.ts`（修改） | dev 代理 `/mcp` 與 protected-resource metadata |
| `frontend/nginx/default.conf`（修改） | gateway 路由、`/mcp`、forwarded proto |
| `frontend/nginx/00-forwarded-proto.conf`（新增） | `map` 定義（http context） |
| `frontend/nginx/20-qjudge-real-ip.sh`（新增） | 啟動時依 `QJUDGE_TRUSTED_PROXIES` 產生 real IP 設定 |
| `frontend/Dockerfile`（修改） | 複製上述檔案 |
| `deploy/compose.yml`、`deploy/compose.build.yml`、`compose.dev.yml`（修改） | `frontend` 改名 `gateway`，傳 `QJUDGE_TRUSTED_PROXIES`，移除 dev 的 MCP 網址覆寫 |
| `deploy/qjudge_cli/schema.py`、`check.py`（修改） | trusted proxies 條件必填與格式；移除 `QJUDGE_REMOTE_MCP_ENABLED` |
| `deploy/qjudge_cli/ingress.py`（新增）、`cli.py`（修改） | `qjudge ingress [--nginx]` |

---

### Task 1: MCP 網址由 origin 推導

**Files:**
- Modify: `backend/config/settings/base.py`、`mcp-server/config.py`
- Test: `backend/apps/core/tests/test_deploy_settings.py`、`mcp-server/tests/test_config.py`

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_deploy_settings.py`：在 `CLEARED_KEYS` 加入 `"MCP_PUBLIC_URL"`，並在檔尾加入：

```python
def test_mcp_public_url_defaults_to_public_origin():
    values = load_settings("base", {"QJUDGE_PUBLIC_ORIGIN": ORIGIN}, ["MCP_PUBLIC_URL"])

    assert values["MCP_PUBLIC_URL"] == ORIGIN


def test_legacy_mcp_public_url_still_wins():
    values = load_settings(
        "base",
        {"QJUDGE_PUBLIC_ORIGIN": ORIGIN, "MCP_PUBLIC_URL": "https://mcp.example.edu/"},
        ["MCP_PUBLIC_URL"],
    )

    assert values["MCP_PUBLIC_URL"] == "https://mcp.example.edu"
```

`mcp-server/tests/test_config.py`：把 `load_issuer` 的排除清單改為 `("QJUDGE_PUBLIC_ORIGIN", "OAUTH_ISSUER_URL", "MCP_PUBLIC_URL")`，並在檔尾加入：

```python
def load_public_url(extra_env: dict[str, str]) -> str:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in ("QJUDGE_PUBLIC_ORIGIN", "OAUTH_ISSUER_URL", "MCP_PUBLIC_URL")
    }
    environment.update(extra_env)
    result = subprocess.run(
        [sys.executable, "-c", "import json, config; print(json.dumps(config.MCP_PUBLIC_URL))"],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip())


def test_public_url_defaults_to_public_origin():
    assert load_public_url({"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu/"}) == "https://judge.example.edu"


def test_legacy_public_url_still_wins():
    url = load_public_url(
        {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu", "MCP_PUBLIC_URL": "https://mcp.example.edu/"}
    )

    assert url == "https://mcp.example.edu"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py -q
cd mcp-server && uv run --with pytest pytest tests/test_config.py -q; cd ..
```

Expected: backend `test_mcp_public_url_defaults_to_public_origin`、`test_legacy_mcp_public_url_still_wins` FAIL；mcp 兩個新測試 FAIL

- [ ] **Step 3: Implement**

`backend/config/settings/base.py`，把：

```python
# MCP server public URL (served at /mcp via streamable-http transport)
MCP_PUBLIC_URL = env("MCP_PUBLIC_URL", "http://localhost:9000")
```

替換為：

```python
# Base URL of the MCP server; clients connect to <base>/mcp through the gateway.
# MCP_PUBLIC_URL is read only for hosts still on the legacy compose.
MCP_PUBLIC_URL = (env("MCP_PUBLIC_URL") or FRONTEND_URL).rstrip("/")
```

若 `MCP_PUBLIC_URL` 目前定義在 `FRONTEND_URL` 之前，把整段移到 `OAUTH_ISSUER_URL = FRONTEND_URL` 之後。

`mcp-server/config.py`，把：

```python
MCP_PUBLIC_URL = os.getenv("MCP_PUBLIC_URL", "http://localhost:9000")
```

刪除，並在 `QJUDGE_PUBLIC_ORIGIN = ...` 那行之後加入：

```python
# Base URL of this server behind the gateway; MCP_PUBLIC_URL is read only for
# hosts still on the legacy compose.
MCP_PUBLIC_URL = (
    os.getenv("MCP_PUBLIC_URL", "").strip() or QJUDGE_PUBLIC_ORIGIN or "http://localhost:9000"
).rstrip("/")
```

確認 `DJANGO_FORWARDED_PROTO` 的定義仍在 `MCP_PUBLIC_URL` 之後（它會讀這兩個值）。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py -q
cd mcp-server && uv run --with pytest pytest tests -q; cd ..
```

Expected: 全部 passed

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings/base.py backend/apps/core/tests/test_deploy_settings.py mcp-server/config.py mcp-server/tests/test_config.py
git commit -m "feat: derive MCP public URL from QJUDGE_PUBLIC_ORIGIN" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- backend/config/settings/base.py backend/apps/core/tests/test_deploy_settings.py mcp-server/config.py mcp-server/tests/test_config.py
```

---

### Task 2: 前端 MCP 網址與 Vite 代理

**Files:**
- Modify: `frontend/src/features/auth/components/settings/MCPSetupPanel.tsx`、`frontend/vite.config.ts`
- Test: `frontend/src/features/auth/components/settings/MCPSetupPanel.test.tsx`（新增）

- [ ] **Step 1: Write the failing test**

`frontend/src/features/auth/components/settings/MCPSetupPanel.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MCPSetupPanel from "./MCPSetupPanel";

describe("MCPSetupPanel", () => {
  it("shows the MCP endpoint on the current site origin", () => {
    render(<MCPSetupPanel />);

    expect(
      screen.getAllByText((content) => content.includes(`${window.location.origin}/mcp`)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText((content) => content.includes("mcp.q-judge.com"))).toBeNull();
  });
});
```

先讀 `MCPSetupPanel.tsx` 確認它是 default export 或 named export、是否需要 props 或 provider；依實際情況調整 import 與 render（例如包上既有的 i18n／theme test wrapper，參考同目錄或 `frontend/src` 其他 `*.test.tsx` 的寫法），但斷言保持相同。

- [ ] **Step 2: Run test to verify it fails**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npx vitest run src/features/auth/components/settings/MCPSetupPanel.test.tsx`
（Task 4 才會把服務改名為 `gateway`，此時仍用 `frontend`。）
Expected: FAIL（顯示 `https://mcp.q-judge.com/mcp`）

- [ ] **Step 3: Implement**

`MCPSetupPanel.tsx`，把：

```tsx
const MCP_URL = import.meta.env.VITE_MCP_PUBLIC_URL || "https://mcp.q-judge.com/mcp";
```

替換為：

```tsx
// The gateway serves the MCP endpoint on the same origin as the site.
const MCP_URL = `${window.location.origin}/mcp`;
```

`frontend/vite.config.ts` 的 `server.proxy`：在 `'/.well-known': {` 那一項**之前**加入（Vite 依 key 順序比對，較長的路徑要在前面）：

```ts
        // MCP endpoint and its OAuth protected-resource metadata (RFC 9728).
        '/.well-known/oauth-protected-resource': {
          target: env.VITE_MCP_TARGET || 'http://localhost:9000',
          changeOrigin: false,
        },
        '/mcp': {
          target: env.VITE_MCP_TARGET || 'http://localhost:9000',
          changeOrigin: false,
        },
```

確認沒有其他地方使用 `VITE_MCP_PUBLIC_URL`：`grep -rn "VITE_MCP_PUBLIC_URL" frontend/src frontend/*.ts frontend/.env* 2>/dev/null`，Expected: 無輸出。

- [ ] **Step 4: Run tests and gates**

Run：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npx vitest run src/features/auth/components/settings/MCPSetupPanel.test.tsx
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
```

Expected: 測試 passed；typecheck 無錯；兩個 lint 無新增錯誤（若既有錯誤與本變更無關，回報即可）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/auth/components/settings/MCPSetupPanel.tsx frontend/src/features/auth/components/settings/MCPSetupPanel.test.tsx frontend/vite.config.ts
git commit -m "feat(frontend): show MCP endpoint on the site origin and proxy it in dev" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- frontend/src/features/auth/components/settings/MCPSetupPanel.tsx frontend/src/features/auth/components/settings/MCPSetupPanel.test.tsx frontend/vite.config.ts
```

---

### Task 3: gateway nginx

**Files:**
- Modify: `frontend/nginx/default.conf`、`frontend/Dockerfile`
- Create: `frontend/nginx/00-forwarded-proto.conf`、`frontend/nginx/20-qjudge-real-ip.sh`

- [ ] **Step 1: 建立 forwarded proto map**

`frontend/nginx/00-forwarded-proto.conf`：

```nginx
# Keep the scheme reported by the reverse proxy in front of the gateway;
# fall back to the gateway's own scheme when no proxy sets it.
map $http_x_forwarded_proto $qjudge_forwarded_proto {
    default $http_x_forwarded_proto;
    ""      $scheme;
}
```

- [ ] **Step 2: 建立 real IP 腳本**

`frontend/nginx/20-qjudge-real-ip.sh`：

```sh
#!/bin/sh
# Trust X-Forwarded-For only from QJUDGE_TRUSTED_PROXIES (comma-separated IPs or
# CIDRs). Unset trusts every peer, which is safe only while the gateway port is
# bound to 127.0.0.1 or reachable only through a local tunnel.
set -eu

proxies="${QJUDGE_TRUSTED_PROXIES:-0.0.0.0/0,::/0}"
{
  echo "real_ip_header X-Forwarded-For;"
  echo "real_ip_recursive on;"
  echo "$proxies" | tr ',' '\n' | while read -r proxy; do
    if [ -n "$proxy" ]; then
      echo "set_real_ip_from $proxy;"
    fi
  done
} > /etc/nginx/conf.d/10-real-ip.conf
```

Run: `chmod +x frontend/nginx/20-qjudge-real-ip.sh`

- [ ] **Step 3: 改寫 `frontend/nginx/default.conf`**

先讀目前檔案，保留 `location /` 內既有的 `add_header Link ...` 與 `text/markdown` 規則，其餘改為：

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Shared headers for every request proxied to backend services.
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $qjudge_forwarded_proto;

    location /api/ {
        proxy_pass http://backend:8000;
        # A location that sets any proxy_set_header no longer inherits the
        # server-level ones, so repeat them before the SSE-specific header.
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $qjudge_forwarded_proto;
        # Server-sent events
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }

    # MCP endpoint and its OAuth protected-resource metadata (RFC 9728).
    # Longer prefix than /.well-known/, so it wins for these paths.
    location /.well-known/oauth-protected-resource {
        proxy_pass http://qjudge-mcp:9000;
    }

    location /mcp {
        proxy_pass http://qjudge-mcp:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $qjudge_forwarded_proto;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    location /.well-known/ {
        proxy_pass http://backend:8000;
    }

    location /o/ {
        proxy_pass http://backend:8000;
    }

    location /django-admin/ {
        proxy_pass http://backend:8000;
    }

    location /admin/ {
        proxy_pass http://backend:8000;
    }

    location /static/ {
        proxy_pass http://backend:8000;
    }

    location /media/ {
        proxy_pass http://backend:8000;
    }

    # SPA routes; keep last.
    location / {
        # (保留原檔此處的 add_header Link 三行與 text/markdown 的 if 區塊，內容不變)
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 4: 修改 Dockerfile**

`frontend/Dockerfile` 把：

```dockerfile
# Copy nginx config
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
```

替換為：

```dockerfile
# Gateway config: routes, forwarded-proto map, and real IP from trusted proxies.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/00-forwarded-proto.conf /etc/nginx/conf.d/00-forwarded-proto.conf
COPY --chmod=755 nginx/20-qjudge-real-ip.sh /docker-entrypoint.d/20-qjudge-real-ip.sh
```

- [ ] **Step 5: 以 stub 上游驗證路由與 header**

不 build 前端 image，改用 `nginx:alpine` 掛載設定檔，並以兩個 Python stub 扮演 backend 與 qjudge-mcp（回傳收到的路徑與 header）。以下使用暫時的 network 與容器名稱，結束後刪除：

```bash
docker network create qjudge-gw-check
stub='import http.server, json, os
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"name": os.environ["NAME"], "path": self.path,
            "proto": self.headers.get("X-Forwarded-Proto"), "real_ip": self.headers.get("X-Real-IP")}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)
http.server.HTTPServer(("", int(os.environ["PORT"])), H).serve_forever()'
docker run -d --name qjudge-gw-backend --network qjudge-gw-check --network-alias backend -e NAME=backend -e PORT=8000 python:3.11-alpine python -c "$stub"
docker run -d --name qjudge-gw-mcp --network qjudge-gw-check --network-alias qjudge-mcp -e NAME=mcp -e PORT=9000 python:3.11-alpine python -c "$stub"
mkdir -p .tmp/gw-html && echo spa > .tmp/gw-html/index.html
docker run -d --name qjudge-gw --network qjudge-gw-check -p 127.0.0.1:18090:80 \
  -e QJUDGE_TRUSTED_PROXIES=172.16.0.0/12,127.0.0.1 \
  -v "$PWD/frontend/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/frontend/nginx/00-forwarded-proto.conf:/etc/nginx/conf.d/00-forwarded-proto.conf:ro" \
  -v "$PWD/frontend/nginx/20-qjudge-real-ip.sh:/docker-entrypoint.d/20-qjudge-real-ip.sh:ro" \
  -v "$PWD/.tmp/gw-html:/usr/share/nginx/html:ro" nginx:alpine
sleep 3
docker exec qjudge-gw nginx -t
docker exec qjudge-gw cat /etc/nginx/conf.d/10-real-ip.conf
for path in /api/health/ /mcp /.well-known/oauth-protected-resource /.well-known/oauth-protected-resource/mcp /.well-known/jwks.json /o/token/ /media/x /exam/123; do
  printf '%-45s ' "$path"; curl -s -H 'X-Forwarded-Proto: https' -H 'X-Forwarded-For: 203.0.113.9' "http://127.0.0.1:18090$path"; echo
done
printf '%-45s ' "no proxy headers"; curl -s http://127.0.0.1:18090/api/health/; echo
docker rm -f qjudge-gw qjudge-gw-backend qjudge-gw-mcp; docker network rm qjudge-gw-check; rm -rf .tmp/gw-html
```

Expected：`nginx -t` 成功；`10-real-ip.conf` 含兩行 `set_real_ip_from`；
- `/api/health/`、`/.well-known/jwks.json`、`/o/token/`、`/media/x` → `"name": "backend"`
- `/mcp`、`/.well-known/oauth-protected-resource`、`/.well-known/oauth-protected-resource/mcp` → `"name": "mcp"`
- `/exam/123` → `spa`
- 帶 header 的請求 `"proto": "https"`、`"real_ip": "203.0.113.9"`；不帶 header 的請求 `"proto": "http"`

- [ ] **Step 6: Commit**

```bash
git add frontend/nginx/default.conf frontend/nginx/00-forwarded-proto.conf frontend/nginx/20-qjudge-real-ip.sh frontend/Dockerfile
git commit -m "feat(gateway): route /mcp and trust forwarded headers from configured proxies" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- frontend/nginx/default.conf frontend/nginx/00-forwarded-proto.conf frontend/nginx/20-qjudge-real-ip.sh frontend/Dockerfile
```

---

### Task 4: compose 改名 gateway

**Files:**
- Modify: `deploy/compose.yml`、`deploy/compose.build.yml`、`compose.dev.yml`

- [ ] **Step 1: `deploy/compose.yml`**

1. 服務 `frontend:` 改名為 `gateway:`，並改為：

```yaml
  gateway:
    image: qjudge/gateway:${QJUDGE_VERSION}
    restart: always
    environment:
      QJUDGE_TRUSTED_PROXIES: ${QJUDGE_TRUSTED_PROXIES:-}
    ports:
      - "${GATEWAY_BIND_ADDRESS:-127.0.0.1}:${GATEWAY_PORT:-8080}:80"
    networks:
      default:
        # Existing Cloudflare Tunnel routes point at http://frontend:80.
        aliases: [frontend]
    depends_on:
      - backend
      - qjudge-mcp
```

2. `cloudflared` 的 `depends_on` 由 `frontend` 改為 `gateway`。

`deploy/compose.build.yml`：`frontend:` 改名為 `gateway:`（build 內容不變）。

- [ ] **Step 2: `compose.dev.yml`**

1. `frontend:` 服務改名為 `gateway:`，並加入同樣的 alias（dev tunnel 路由指向 `frontend`）：

```yaml
    networks:
      default:
        aliases: [frontend]
```

2. 該服務 `environment` 移除 `VITE_MCP_PUBLIC_URL`，加入 `VITE_MCP_TARGET: http://qjudge-mcp:9000`。
3. `x-dev-django-environment` 移除 `MCP_PUBLIC_URL` 與其上方註解；`qjudge-mcp` 服務移除 `environment:` 區塊（保留 `ports`）。
4. 確認 `storybook` 或其他服務沒有 `depends_on: frontend`；有的話改為 `gateway`。

- [ ] **Step 3: 驗證設定**

```bash
deploy/qjudge lint-compose deploy/compose.yml
QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml config --services | sort
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config --services | sort
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config | grep -nE "aliases|- frontend|VITE_MCP|MCP_PUBLIC_URL"
```

Expected：lint 無輸出；兩份清單都有 `gateway`、沒有 `frontend`；dev config 有 `frontend` alias 與 `VITE_MCP_TARGET`，沒有 `MCP_PUBLIC_URL`。

- [ ] **Step 4: 重建本地 dev 前端與相關服務**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --remove-orphans gateway qjudge-mcp backend cloudflared
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps --format '{{.Service}}\t{{.Status}}' | sort
curl -s -o /dev/null -w 'vite %{http_code}\n' http://127.0.0.1:5173/
curl -s -o /dev/null -w 'api %{http_code}\n' http://127.0.0.1:5173/api/health/
curl -s -o /dev/null -w 'prm %{http_code}\n' http://127.0.0.1:5173/.well-known/oauth-protected-resource
curl -s -o /dev/null -w 'mcp %{http_code}\n' -X POST -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{}' http://127.0.0.1:5173/mcp
curl -s http://127.0.0.1:8000/.well-known/mcp/server-card.json | python3 -m json.tool | grep endpoint
```

`--remove-orphans` 只會移除本 project 中已不存在於設定的容器（舊的 `frontend` 容器），不會碰 volume。

Expected：vite 200、api 200；prm 200；mcp 401（未帶 token，代表已到達 MCP server）；server card 的 endpoint 為 `<QJUDGE_PUBLIC_ORIGIN>/mcp`。

- [ ] **Step 5: Commit**

```bash
git add deploy/compose.yml deploy/compose.build.yml compose.dev.yml
git commit -m "feat(deploy): rename frontend service to gateway" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/compose.yml deploy/compose.build.yml compose.dev.yml
```

---

### Task 5: trusted proxies 驗證與 `qjudge ingress`

**Files:**
- Modify: `deploy/qjudge_cli/schema.py`、`deploy/qjudge_cli/check.py`、`deploy/qjudge_cli/cli.py`、`deploy/.env.example`
- Create: `deploy/qjudge_cli/ingress.py`
- Test: `deploy/qjudge_cli/tests/test_check.py`、`deploy/qjudge_cli/tests/test_ingress.py`（新增）、`deploy/qjudge_cli/tests/test_schema.py`

- [ ] **Step 1: Write the failing tests**

`deploy/qjudge_cli/tests/test_check.py` 的 `CheckTests` 內加入：

```python
    def test_trusted_proxies_required_when_gateway_is_not_local(self):
        env = with_changes(GATEWAY_BIND_ADDRESS="10.0.0.5")
        self.assertEqual(error_keys(env), ["QJUDGE_TRUSTED_PROXIES"])

    def test_trusted_proxies_optional_when_gateway_is_local(self):
        self.assertEqual(check_env(with_changes(GATEWAY_BIND_ADDRESS="127.0.0.1")), [])

    def test_trusted_proxies_must_be_addresses(self):
        env = with_changes(GATEWAY_BIND_ADDRESS="10.0.0.5", QJUDGE_TRUSTED_PROXIES="10.0.0.2, nginx-host")
        self.assertEqual(error_keys(env), ["QJUDGE_TRUSTED_PROXIES"])

    def test_trusted_proxies_accept_ips_and_cidrs(self):
        env = with_changes(GATEWAY_BIND_ADDRESS="10.0.0.5", QJUDGE_TRUSTED_PROXIES="10.0.0.2, 192.168.0.0/24")
        self.assertEqual(check_env(env), [])
```

`deploy/qjudge_cli/tests/test_schema.py` 的 `SchemaTests` 內加入：

```python
    def test_remote_mcp_toggle_is_gone(self):
        self.assertNotIn("QJUDGE_REMOTE_MCP_ENABLED", KEYS_BY_NAME)
```

`deploy/qjudge_cli/tests/test_ingress.py`：

```python
import unittest

from qjudge_cli.ingress import render_ingress, render_nginx
from qjudge_cli.tests.test_check import VALID


class IngressTests(unittest.TestCase):
    def test_local_gateway_defaults(self):
        text = render_ingress(VALID)
        self.assertIn("https://judge.example.edu", text)
        self.assertIn("http://127.0.0.1:8080", text)
        self.assertIn("curl -H 'Host: judge.example.edu' http://127.0.0.1:8080/api/health/", text)
        self.assertIn("/mcp", text)

    def test_remote_proxy_uses_bind_address(self):
        env = {**VALID, "GATEWAY_BIND_ADDRESS": "10.0.0.5", "GATEWAY_PORT": "18080",
               "QJUDGE_TRUSTED_PROXIES": "10.0.0.2"}
        text = render_ingress(env)
        self.assertIn("http://10.0.0.5:18080", text)
        self.assertIn("10.0.0.2", text)

    def test_tunnel_route_is_listed_when_profile_enabled(self):
        text = render_ingress({**VALID, "COMPOSE_PROFILES": "tunnel", "TUNNEL_TOKEN": "t"})
        self.assertIn("http://gateway:80", text)

    def test_nginx_server_block(self):
        text = render_nginx({**VALID, "GATEWAY_BIND_ADDRESS": "10.0.0.5"})
        self.assertIn("server_name judge.example.edu;", text)
        self.assertIn("proxy_pass http://10.0.0.5:8080;", text)
        self.assertIn("proxy_set_header X-Forwarded-Proto $scheme;", text)
        self.assertIn("proxy_buffering off;", text)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: FAIL／ERROR（新測試）

- [ ] **Step 3: Implement**

`deploy/qjudge_cli/schema.py`：

1. 在 `_media_enabled` 之前加入：

```python
LOCAL_BIND_ADDRESSES = {"", "127.0.0.1", "localhost", "::1"}


def _gateway_not_local(env: Env) -> bool:
    return env.get("GATEWAY_BIND_ADDRESS", "").strip() not in LOCAL_BIND_ADDRESSES
```

2. `QJUDGE_TRUSTED_PROXIES` 那筆改為：

```python
    Key("QJUDGE_TRUSTED_PROXIES", "core",
        "Comma-separated IPs or CIDRs of the reverse proxy; required when the gateway is not bound to 127.0.0.1.",
        required=_gateway_not_local),
```

3. 刪除 `QJUDGE_REMOTE_MCP_ENABLED` 那筆，並從 `FEATURES` 與 `FEATURE_TITLES` 移除 `"mcp"`。

`deploy/qjudge_cli/check.py`：

1. import 區加入 `import ipaddress`。
2. `_value_problem` 開頭（`ENUMS` 判斷之前）加入：

```python
    if name == "QJUDGE_TRUSTED_PROXIES":
        for item in value.split(","):
            try:
                ipaddress.ip_network(item.strip(), strict=False)
            except ValueError:
                return f"'{item.strip()}' is not an IP address or CIDR"
        return None
```

`deploy/qjudge_cli/ingress.py`：

```python
"""Describe the entry points a deployment needs outside QJudge."""

from __future__ import annotations

from urllib.parse import urlsplit

from .schema import Env


def _gateway(env: Env) -> str:
    address = env.get("GATEWAY_BIND_ADDRESS", "").strip() or "127.0.0.1"
    port = env.get("GATEWAY_PORT", "").strip() or "8080"
    return f"http://{address}:{port}"


def render_ingress(env: Env) -> str:
    origin = env.get("QJUDGE_PUBLIC_ORIGIN", "").rstrip("/")
    host = urlsplit(origin).netloc
    gateway = _gateway(env)
    proxies = env.get("QJUDGE_TRUSTED_PROXIES", "").strip()
    lines = [
        f"Main site  {origin}",
        f"  Reverse proxy -> {gateway} (gateway; serves the site, /api, /o, /.well-known and /mcp)",
        "  The proxy must set Host, X-Forwarded-For and X-Forwarded-Proto, and disable buffering.",
    ]
    if proxies:
        lines.append(f"  Gateway trusts forwarded headers only from: {proxies}")
    lines += [
        "  Check from the proxy host:",
        f"    curl -H 'Host: {host}' {gateway}/api/health/",
        f"  Remote MCP clients connect to {origin}/mcp",
    ]
    profiles = [item.strip() for item in env.get("COMPOSE_PROFILES", "").split(",")]
    if "tunnel" in profiles:
        lines += ["", f"Cloudflare Tunnel  route {host} -> http://gateway:80"]
    lines += ["", "Run `deploy/qjudge ingress --nginx` for a reverse proxy server block."]
    return "\n".join(lines) + "\n"


def render_nginx(env: Env) -> str:
    host = urlsplit(env.get("QJUDGE_PUBLIC_ORIGIN", "")).hostname or "_"
    gateway = _gateway(env)
    return f"""server {{
    listen 443 ssl;
    server_name {host};
    # ssl_certificate     /path/to/fullchain.pem;
    # ssl_certificate_key /path/to/privkey.pem;

    location / {{
        proxy_pass {gateway};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 300s;
    }}
}}
"""
```

`deploy/qjudge_cli/cli.py`：

1. import 區加入 `from .ingress import render_ingress, render_nginx`。
2. 新增子指令（放在 `lint-compose` 之後）：

```python
    ingress_parser = commands.add_parser("ingress", help="list the entry points to configure outside QJudge")
    ingress_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    ingress_parser.add_argument("--nginx", action="store_true", help="print a reverse proxy server block")
```

3. 分派加入（在 `lint-compose` 分支之後）：

```python
    if args.command == "ingress":
        env = load(args.env_file)
        sys.stdout.write(render_nginx(env) if args.nginx else render_ingress(env))
        return 0
```

重新產生範本：`deploy/qjudge env-example > deploy/.env.example`

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
deploy/qjudge lint-compose deploy/compose.yml
deploy/qjudge check --env-file deploy/.env
deploy/qjudge ingress
deploy/qjudge ingress --nginx
```

Expected：unittest `OK`；lint 無輸出；本地 `deploy/.env` 仍 `OK`（若因 `QJUDGE_REMOTE_MCP_ENABLED` 等已移除的 key 報 unknown，從本地 `deploy/.env` 刪除該行）；`ingress` 列出本地 origin 與 `http://127.0.0.1:8080`。

- [ ] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/schema.py deploy/qjudge_cli/check.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/ingress.py deploy/qjudge_cli/tests/test_check.py deploy/qjudge_cli/tests/test_schema.py deploy/qjudge_cli/tests/test_ingress.py deploy/.env.example
git commit -m "feat(deploy): validate trusted proxies and add qjudge ingress" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/qjudge_cli/schema.py deploy/qjudge_cli/check.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/ingress.py deploy/qjudge_cli/tests/test_check.py deploy/qjudge_cli/tests/test_schema.py deploy/qjudge_cli/tests/test_ingress.py deploy/.env.example
```

---

## 完成條件

- backend、mcp-server、前端、CLI 的測試通過；`lint-compose` 無輸出；兩份 compose config 成功。
- stub 驗證：路由分流正確，`X-Forwarded-Proto`／`X-Real-IP` 依 trusted proxies 行為正確。
- 本地 dev：`gateway`（Vite）提供網站、`/api`、`/.well-known/oauth-protected-resource` 與 `/mcp`；server card endpoint 為 `<origin>/mcp`。
- 舊 `docker-compose*.yml` 未修改。
