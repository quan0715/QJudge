# Deploy Overhaul 03：app env 瘦身 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 backend settings 中沒有部署者會設定的 env 讀取改為程式常數，讓 settings 只讀 schema key、容器間連線值與過渡期相容 key。

**Architecture:** 只改 `backend/config/settings/`。常數值等於目前的預設值，且與舊 compose 傳入的值相同，因此 dev、CI 與 dcslab（仍用舊 compose）的行為都不變。測試以子程序載入 settings，設定一組錯誤的 env 值，確認 settings 不再受其影響。

**Tech Stack:** Django settings、pytest。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md` §3「推導與瘦身」

**計畫系列：** 01 設定基礎（完成）→ 02 Compose 與 DB（完成）→ **03 app env 瘦身（本文件）** → 04 Gateway 與 ingress → 05 Storage 與 addon → 06 init／upgrade／rollback 與 CD → 07 CI E2E、刪除 test compose、文件 → 08 dcslab 轉換與清理。

## 保留的 env 讀取（本計畫不動）

| 類別 | key | 何時處理 |
|---|---|---|
| schema key | `SECRET_KEY`、`QJUDGE_PUBLIC_ORIGIN`、`DATABASE_URL`、`HOST_PROJECT_ROOT`、`DOCKER_JUDGE_PLATFORM`、`AUTH_EMAIL_PASSWORD_ENABLED`、`QAUTH_PROVIDER_CONNECTIONS_JSON`、`DEFAULT_FROM_EMAIL`、`EMAIL_*`、`OBJECT_STORAGE_ENDPOINT_URL`／`PUBLIC_ENDPOINT_URL`／`ACCESS_KEY`／`SECRET_KEY`、`MEDIA_MODE`、`LIVEKIT_PUBLIC_URL`／`API_KEY`／`API_SECRET` | 保留 |
| 容器間連線 | `REDIS_URL`、`DJANGO_ENV`、`DOCKER_IMAGE_JUDGE`、`AI_OAUTH_SIGNING_PRIVATE_KEY_FILE`、`INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE`、`INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE`、`LIVEKIT_INTERNAL_URL`、`LIVEKIT_ROOM_PREFIX`、`DOCKER_SECCOMP_DISABLED` | 保留 |
| 過渡期相容（舊 compose） | `DB_NAME`／`DB_USER`／`DB_PASSWORD`／`DB_HOST`／`DB_PORT`、`LIVE_MONITORING_ENABLED` | 08 |
| MCP URL | `MCP_PUBLIC_URL` | 04 |
| storage | `OBJECT_STORAGE_REGION`、`OBJECT_STORAGE_OBJECT_TAGGING_ENABLED`、`OBJECT_STORAGE_AUTO_CREATE_BUCKETS`、`ANTICHEAT_RAW_BUCKET`、`INTEGRITY_ARCHIVE_BUCKET`、`MARKDOWN_IMAGE_S3_BUCKET` | 05 |
| LiveKit 伺服器與命名空間 | `LIVEKIT_ENVIRONMENT`、`LIVEKIT_NODE_IP`、`LIVEKIT_STUN_HOST` | 05 |
| 錯誤追蹤 | `GLITCHTIP_DSN`、`SENTRY_TRACES_SAMPLE_RATE`、`SENTRY_ENVIRONMENT` | 不在本系列（目前 compose 未傳，維持原狀） |
| 測試 settings | `backend/config/settings/test.py`、`loadtest.py` 的讀取 | 07 |

ai-service 的 pydantic `Settings` 欄位與 `AI_OAUTH_JWKS_URL`（舊 test compose 用來指向 fake adapter）本計畫不動。

---

### Task 1: base.py 調校值改為常數

**Files:**
- Modify: `backend/config/settings/base.py`
- Test: `backend/apps/core/tests/test_deploy_settings.py`

- [ ] **Step 1: Write the failing test**

在 `backend/apps/core/tests/test_deploy_settings.py` 末尾加入：

```python
BASE_CONSTANTS = {
    "JUDGE_ENGINE_ENABLED": True,
    "JUDGE_MAX_CPU_TIME": 10,
    "JUDGE_MAX_MEMORY": 256,
    "DOCKER_JUDGE_PIDS_LIMIT": 64,
    "DOCKER_JUDGE_TMPFS_SIZE": "100M",
    "DOCKER_JUDGE_TIMEOUT": 60,
    "JUDGE_TEST_RUN_QUEUE": "default",
    "JUDGE_TEST_RUN_TIMEOUT": 120,
    "AI_SERVICE_URL": "http://ai-service:8001",
    "AI_ACCESS_TOKEN_SECONDS": 300,
    "AI_SERVICE_CONNECT_TIMEOUT_SECONDS": 3.0,
    "AI_SERVICE_READ_TIMEOUT_SECONDS": 30.0,
    "AI_SERVICE_WRITE_TIMEOUT_SECONDS": 10.0,
    "AI_SERVICE_POOL_TIMEOUT_SECONDS": 3.0,
    "INTEGRITY_RESIDENT_URL": "http://integrity-resident:8011",
    "INTEGRITY_ACCEPT_GRACE_SECONDS": 300,
    "INTEGRITY_WORKER_CONNECT_TIMEOUT_SECONDS": 1.0,
    "INTEGRITY_WORKER_READ_TIMEOUT_SECONDS": 5.0,
    "OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS": 300,
    "INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES": 1073741824,
    "INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES": 268435456,
    "ANTICHEAT_CAPTURE_INTERVAL_SECONDS": 3,
    "LIVEKIT_TOKEN_TTL_SECONDS": 120,
    "MARKDOWN_IMAGE_MAX_BYTES": 5242880,
}
IGNORED_ENV = {
    "JUDGE_ENGINE_ENABLED": "False",
    "JUDGE_MAX_CPU_TIME": "99",
    "JUDGE_MAX_MEMORY": "99",
    "DOCKER_JUDGE_PIDS_LIMIT": "99",
    "DOCKER_JUDGE_TMPFS_SIZE": "1M",
    "DOCKER_JUDGE_TIMEOUT": "99",
    "JUDGE_TEST_RUN_QUEUE": "other",
    "JUDGE_TEST_RUN_TIMEOUT": "99",
    "AI_SERVICE_URL": "http://other:1",
    "AI_ACCESS_TOKEN_SECONDS": "99",
    "AI_SERVICE_CONNECT_TIMEOUT_SECONDS": "99",
    "AI_SERVICE_READ_TIMEOUT_SECONDS": "99",
    "AI_SERVICE_WRITE_TIMEOUT_SECONDS": "99",
    "AI_SERVICE_POOL_TIMEOUT_SECONDS": "99",
    "INTEGRITY_RESIDENT_URL": "http://other:1",
    "INTEGRITY_ACCEPT_GRACE_SECONDS": "99",
    "INTEGRITY_WORKER_CONNECT_TIMEOUT_SECONDS": "99",
    "INTEGRITY_WORKER_READ_TIMEOUT_SECONDS": "99",
    "OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS": "99",
    "INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES": "99",
    "INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES": "99",
    "ANTICHEAT_CAPTURE_INTERVAL_SECONDS": "99",
    "LIVEKIT_TOKEN_TTL_SECONDS": "99",
    "MARKDOWN_IMAGE_MAX_BYTES": "99",
    "QAUTH_PROVIDER_CONNECTIONS_FILE": "/nonexistent.json",
}


def test_tuning_values_are_constants():
    values = load_settings(
        "base", IGNORED_ENV, list(BASE_CONSTANTS) + ["QAUTH_PROVIDER_CONNECTIONS_FILE"]
    )

    file_path = values.pop("QAUTH_PROVIDER_CONNECTIONS_FILE")
    assert values == BASE_CONSTANTS
    assert file_path.endswith("config/qauth-providers.json")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py::test_tuning_values_are_constants -q`
Expected: FAIL（值等於 `IGNORED_ENV` 設定的值）

- [ ] **Step 3: Implement**

在 `backend/config/settings/base.py` 逐一替換下列賦值（左欄為目前的程式碼，右欄為替換後；行尾既有的註解保留）：

| 目前 | 替換為 |
|---|---|
| `JUDGE_ENGINE_ENABLED = env("JUDGE_ENGINE_ENABLED", "True") == "True"` | `JUDGE_ENGINE_ENABLED = True` |
| `JUDGE_MAX_CPU_TIME = int(env("JUDGE_MAX_CPU_TIME", "10"))` | `JUDGE_MAX_CPU_TIME = 10` |
| `JUDGE_MAX_MEMORY = int(env("JUDGE_MAX_MEMORY", "256"))` | `JUDGE_MAX_MEMORY = 256` |
| `DOCKER_JUDGE_PIDS_LIMIT = int(env("DOCKER_JUDGE_PIDS_LIMIT", "64"))` | `DOCKER_JUDGE_PIDS_LIMIT = 64` |
| `DOCKER_JUDGE_TMPFS_SIZE = env("DOCKER_JUDGE_TMPFS_SIZE", "100M")` | `DOCKER_JUDGE_TMPFS_SIZE = "100M"` |
| `DOCKER_JUDGE_TIMEOUT = int(env("DOCKER_JUDGE_TIMEOUT", "60"))` | `DOCKER_JUDGE_TIMEOUT = 60` |
| `JUDGE_TEST_RUN_QUEUE = env("JUDGE_TEST_RUN_QUEUE", "default")` | `JUDGE_TEST_RUN_QUEUE = "default"` |
| `JUDGE_TEST_RUN_TIMEOUT = int(env("JUDGE_TEST_RUN_TIMEOUT", "120"))` | `JUDGE_TEST_RUN_TIMEOUT = 120` |
| `AI_SERVICE_URL = env("AI_SERVICE_URL", "http://ai-service:8001")` | `AI_SERVICE_URL = "http://ai-service:8001"` |
| `AI_ACCESS_TOKEN_SECONDS = int(env("AI_ACCESS_TOKEN_SECONDS", "300"))` | `AI_ACCESS_TOKEN_SECONDS = 300` |
| `AI_SERVICE_CONNECT_TIMEOUT_SECONDS = float(env(..., "3"))`（多行） | `AI_SERVICE_CONNECT_TIMEOUT_SECONDS = 3.0` |
| `AI_SERVICE_READ_TIMEOUT_SECONDS = float(env(..., "30"))`（多行） | `AI_SERVICE_READ_TIMEOUT_SECONDS = 30.0` |
| `AI_SERVICE_WRITE_TIMEOUT_SECONDS = float(env(..., "10"))`（多行） | `AI_SERVICE_WRITE_TIMEOUT_SECONDS = 10.0` |
| `AI_SERVICE_POOL_TIMEOUT_SECONDS = float(env(..., "3"))`（多行） | `AI_SERVICE_POOL_TIMEOUT_SECONDS = 3.0` |
| `INTEGRITY_RESIDENT_URL = env("INTEGRITY_RESIDENT_URL", "http://integrity-resident:8011")` | `INTEGRITY_RESIDENT_URL = "http://integrity-resident:8011"` |
| `INTEGRITY_ACCEPT_GRACE_SECONDS = int(env("INTEGRITY_ACCEPT_GRACE_SECONDS", "300"))` | `INTEGRITY_ACCEPT_GRACE_SECONDS = 300` |
| `INTEGRITY_WORKER_CONNECT_TIMEOUT_SECONDS = float(env(..., "1.0"))`（多行） | `INTEGRITY_WORKER_CONNECT_TIMEOUT_SECONDS = 1.0` |
| `INTEGRITY_WORKER_READ_TIMEOUT_SECONDS = float(env(..., "5.0"))`（多行） | `INTEGRITY_WORKER_READ_TIMEOUT_SECONDS = 5.0` |
| `OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS = int(env(..., "300"))`（多行） | `OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS = 300` |
| `INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES = int(env(..., "1073741824"))`（多行） | `INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES = 1073741824` |
| `INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES = int(env(..., "268435456"))`（多行） | `INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES = 268435456` |
| `ANTICHEAT_CAPTURE_INTERVAL_SECONDS = int(env(..., "3"))`（多行） | `ANTICHEAT_CAPTURE_INTERVAL_SECONDS = 3` |
| `LIVEKIT_TOKEN_TTL_SECONDS = int(env("LIVEKIT_TOKEN_TTL_SECONDS", "120"))` | `LIVEKIT_TOKEN_TTL_SECONDS = 120` |
| `MARKDOWN_IMAGE_MAX_BYTES = int(env("MARKDOWN_IMAGE_MAX_BYTES", "5242880"))` | `MARKDOWN_IMAGE_MAX_BYTES = 5242880` |
| `QAUTH_PROVIDER_CONNECTIONS_FILE = env("QAUTH_PROVIDER_CONNECTIONS_FILE", str(BASE_DIR / "config" / "qauth-providers.json"))`（多行） | `QAUTH_PROVIDER_CONNECTIONS_FILE = str(BASE_DIR / "config" / "qauth-providers.json")` |

每一行的預設值請以檔案中實際的字串為準；若與上表不同，以檔案為準並在回報中列出。

確認：`grep -nE 'env\(\s*"(JUDGE_ENGINE_ENABLED|JUDGE_MAX_CPU_TIME|JUDGE_MAX_MEMORY|DOCKER_JUDGE_PIDS_LIMIT|DOCKER_JUDGE_TMPFS_SIZE|DOCKER_JUDGE_TIMEOUT|JUDGE_TEST_RUN_QUEUE|JUDGE_TEST_RUN_TIMEOUT|AI_SERVICE_URL|AI_ACCESS_TOKEN_SECONDS|INTEGRITY_RESIDENT_URL|INTEGRITY_ACCEPT_GRACE_SECONDS|LIVEKIT_TOKEN_TTL_SECONDS|MARKDOWN_IMAGE_MAX_BYTES)"' backend/config/settings/base.py` 無輸出；多行的讀取以 `grep -nE '"(AI_SERVICE_[A-Z_]+_TIMEOUT_SECONDS|INTEGRITY_WORKER_[A-Z_]+_TIMEOUT_SECONDS|OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS|INTEGRITY_ARCHIVE_CAPACITY_[A-Z_]+|ANTICHEAT_CAPTURE_INTERVAL_SECONDS|QAUTH_PROVIDER_CONNECTIONS_FILE)"' backend/config/settings/base.py` 確認只剩下賦值左側的名稱、沒有 `env(` 內的字串。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py apps/core/tests/test_public_origin_settings.py apps/core/tests/test_env_helper.py apps/contests/tests/test_livekit_config.py -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py check
```

Expected: 全部 passed；check 無 error

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings/base.py backend/apps/core/tests/test_deploy_settings.py
git commit -m "refactor(backend): make tuning settings constants" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- backend/config/settings/base.py backend/apps/core/tests/test_deploy_settings.py
```

---

### Task 2: prod／dev／database 的 env 讀取

**Files:**
- Modify: `backend/config/settings/prod.py`、`backend/config/settings/dev.py`、`backend/config/settings/database.py`
- Test: `backend/apps/core/tests/test_deploy_settings.py`

- [ ] **Step 1: Write the failing tests**

在 `backend/apps/core/tests/test_deploy_settings.py` 末尾加入：

```python
def test_prod_debug_and_hosts_ignore_env():
    values = load_settings(
        "prod",
        {
            "DJANGO_ENV": "production",
            "SECRET_KEY": "deploy-settings-test-secret",
            "QJUDGE_PUBLIC_ORIGIN": ORIGIN,
            "DEBUG": "True",
            "ALLOWED_HOSTS": "evil.example",
        },
        ["DEBUG", "ALLOWED_HOSTS"],
    )

    assert values["DEBUG"] is False
    assert values["ALLOWED_HOSTS"] == ["judge.example.edu", "localhost", "127.0.0.1", "backend"]


def test_prod_without_origin_allows_no_hosts():
    values = load_settings(
        "prod",
        {"DJANGO_ENV": "production", "SECRET_KEY": "deploy-settings-test-secret", "ALLOWED_HOSTS": "evil.example"},
        ["ALLOWED_HOSTS"],
    )

    assert values["ALLOWED_HOSTS"] == []


def test_dev_debug_and_hosts_ignore_env():
    values = load_settings(
        "dev",
        {"QJUDGE_PUBLIC_ORIGIN": ORIGIN, "DEBUG": "False", "ALLOWED_HOSTS": "tunnel.example"},
        ["DEBUG", "ALLOWED_HOSTS", "CSRF_TRUSTED_ORIGINS"],
    )

    assert values["DEBUG"] is True
    assert values["ALLOWED_HOSTS"] == ["*"]
    assert "https://tunnel.example" not in values["CSRF_TRUSTED_ORIGINS"]


def test_conn_max_age_is_zero_regardless_of_env():
    values = load_settings(
        "base",
        {"DATABASE_URL": "postgresql://u:p@pgbouncer:5432/online_judge", "DB_CONN_MAX_AGE": "60"},
        ["DATABASES"],
    )

    assert values["DATABASES"]["default"]["CONN_MAX_AGE"] == 0
```

並在檔案上方 `CLEARED_KEYS` tuple 內加入 `"DEBUG"`、`"ALLOWED_HOSTS"`、`"DB_CONN_MAX_AGE"`。

- [ ] **Step 2: Run tests to verify they fail**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py -q`
Expected: 新增的四個測試 FAIL

- [ ] **Step 3: Implement**

`backend/config/settings/prod.py`：

1. `DEBUG = env('DEBUG', 'False') == 'True'` 改為 `DEBUG = False`。
2. 把：

```python
else:
    _PUBLIC_ORIGIN = None
    ALLOWED_HOSTS = [
        host for host in env("ALLOWED_HOSTS", "").split(",") if host
    ]
```

替換為：

```python
else:
    # QJUDGE_PUBLIC_ORIGIN is required in production; without it no host is allowed.
    _PUBLIC_ORIGIN = None
    ALLOWED_HOSTS = []
```

`backend/config/settings/dev.py`：

1. `DEBUG = env('DEBUG', 'True') == 'True'` 改為 `DEBUG = True`。
2. `ALLOWED_HOSTS = env('ALLOWED_HOSTS', 'localhost,127.0.0.1,*').split(',')` 改為 `ALLOWED_HOSTS = ["*"]`。
3. 刪除這段（tunnel 網域已由 `QJUDGE_PUBLIC_ORIGIN` 推導進 `CSRF_TRUSTED_ORIGINS`）：

```python
# Cloudflare Tunnel dev domains
for _host in env('ALLOWED_HOSTS', '').split(','):
    _host = _host.strip()
    if _host and _host not in ('localhost', '127.0.0.1', '0.0.0.0', '*'):
        CSRF_TRUSTED_ORIGINS.append(f'https://{_host}')
```

4. 若 `dev.py` 因此不再使用 `env`，保留 `from config.env import env` 只在 `GLITCHTIP_DSN` 等其他讀取仍存在時；否則刪除該 import。

`backend/config/settings/database.py`：`"CONN_MAX_AGE": int(env("DB_CONN_MAX_AGE", "0")),` 改為：

```python
        # PgBouncer pools server connections; Django closes its own after each request.
        "CONN_MAX_AGE": 0,
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py apps/core/tests/test_public_origin_settings.py apps/core/tests/test_env_helper.py -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py check
curl -s -o /dev/null -w 'backend %{http_code}\n' http://127.0.0.1:8000/api/health/
curl -s -o /dev/null -w 'vite %{http_code}\n' http://127.0.0.1:5173/api/health/
```

Expected: 全部 passed；check 無 error；backend 200、vite 200（dev backend 以 `--reload` 載入新 settings）

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings/prod.py backend/config/settings/dev.py backend/config/settings/database.py backend/apps/core/tests/test_deploy_settings.py
git commit -m "refactor(backend): stop reading DEBUG, ALLOWED_HOSTS and CONN_MAX_AGE from env" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- backend/config/settings/prod.py backend/config/settings/dev.py backend/config/settings/database.py backend/apps/core/tests/test_deploy_settings.py
```

---

## 完成條件

- `backend/apps/core/tests/test_deploy_settings.py` 全部通過，`manage.py check` 無 error。
- base／prod／dev／database 只讀「保留的 env 讀取」表內的 key：`python3 -c "import re,pathlib; [print(f, sorted(set(re.findall(r'(?:\benv|_env_truthy)\(\s*[\'\"]([A-Z_0-9]+)', pathlib.Path(f'backend/config/settings/{f}.py').read_text())))) for f in ('base','prod','dev','database')]"` 的輸出都在該表內。
- 本地 dev 的 backend、Vite 健康檢查為 200。
