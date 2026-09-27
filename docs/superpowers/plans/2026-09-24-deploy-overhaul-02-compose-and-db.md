# Deploy Overhaul 02：Compose 與 DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `deploy/compose.yml`（prod 形狀）、`deploy/compose.build.yml` 與 `compose.dev.yml`，DB 全部經 pgbouncer 並以單一 URL 連線，app 改由 `QJUDGE_PUBLIC_ORIGIN` 推導 URL、以 `MEDIA_MODE` 控制監考，最後把本地 dev 切換到新檔案且保留既有資料。

**Architecture:** compose 只傳 schema 內的使用者 key 與容器間連線常數，預設值留在 app。pgbouncer（session mode）以掛載的 `pgbouncer.ini` 同時服務 `online_judge` 與 `qjudge_ai`，userlist 由 image entrypoint 依 `DATABASE_URLS` 產生。新 DB 由 postgres 的 `initdb.d` 腳本建立。dev 以 overlay 覆寫程式碼來源與 port，project 名稱由 `deploy/.env` 的 `COMPOSE_PROJECT_NAME` 指定（本地主目錄為 `online_judge`，沿用既有 volume）。舊 `docker-compose*.yml` 不動，dcslab 繼續用舊流程；app 在新 key 未設定時讀舊 key，確保舊 compose 仍可運作。

**Tech Stack:** Docker Compose v2（`!override`／`!reset`）、PostgreSQL 15、PgBouncer 1.24（edoburu image）、Django、FastAPI／SQLAlchemy async／psycopg_pool、Python 標準函式庫 CLI。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md`（第 3、4、5 節）

**計畫系列：** 01 設定基礎（完成）→ **02 Compose 與 DB（本文件）** → 03 app env 瘦身 → 04 Gateway 與 ingress（含 MCP URL 與 `/mcp`）→ 05 Storage 與 addon → 06 init／upgrade／rollback 與 CD → 07 CI E2E、刪除 test compose、文件 → 08 dcslab 轉換與清理。

**本計畫刻意不處理：** MCP public URL（仍由舊 key 或 dev overlay 提供，04 處理）、`frontend` 改名 `gateway`（04）、storage 旋鈕與單一 bucket（05）、LiveKit addon（05；dev overlay 暫時保留 livekit 服務）。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `deploy/qjudge_cli/schema.py`、`check.py`（修改） | 加入 dev 專用 key；DB 密碼允許 URL unreserved 字元 |
| `deploy/qjudge_cli/lint.py`（新增） | compose lint：只允許 schema key 與內部變數、禁止非空預設值 |
| `deploy/qjudge_cli/cli.py`（修改） | 新增 `lint-compose` 指令 |
| `backend/config/settings/base.py`、`prod.py`、`dev.py`（修改） | 由 origin 推導 URL；`MEDIA_MODE`；`LIVEKIT_INTERNAL_URL` 推導 |
| `backend/apps/core/tests/test_deploy_settings.py`（新增） | settings 推導測試 |
| `ai-service/config.py`、`main.py`（修改） | issuer 由 origin 推導 |
| `ai-service/infrastructure/database/base.py`（修改） | engine pool 上限 |
| `ai-service/infrastructure/checkpoints/langgraph_store.py`（修改） | pool 上限 5、以 `SET search_path` 取代 `options` |
| `ai-service/tests/test_deploy_config.py`（新增） | 上述 AI 測試 |
| `mcp-server/config.py`（修改）、`mcp-server/tests/test_config.py`（新增） | issuer 由 origin 推導 |
| `deploy/postgres/initdb.d/10-qjudge-databases.sh`（新增） | 新資料目錄建立兩個 DB 與 role |
| `deploy/pgbouncer/pgbouncer.ini`（新增） | 兩個 DB 的 pool 設定 |
| `deploy/compose.yml`（新增） | prod 形狀服務定義 |
| `deploy/compose.build.yml`（新增） | 自建 image 的 build 設定 |
| `compose.dev.yml`（新增） | 本地 dev overlay |
| `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh`（修改） | `dev` 改用新檔案 |
| `.github/workflows/ci.yml`（修改） | compose lint 與 `docker compose config` 驗證 |

---

### Task 1: schema 調整

**Files:**
- Modify: `deploy/qjudge_cli/schema.py`、`deploy/qjudge_cli/check.py`、`deploy/.env.example`
- Test: `deploy/qjudge_cli/tests/test_schema.py`、`deploy/qjudge_cli/tests/test_check.py`

- [ ] **Step 1: Write the failing tests**

在 `deploy/qjudge_cli/tests/test_schema.py` 的 `SchemaTests` 類別內加入：

```python
    def test_dev_keys_are_optional(self):
        for name in ("HOST_PROJECT_ROOT", "DOCKER_JUDGE_PLATFORM"):
            self.assertEqual(KEYS_BY_NAME[name].feature, "dev")
            self.assertFalse(KEYS_BY_NAME[name].is_required({}))
```

在 `deploy/qjudge_cli/tests/test_check.py` 的 `CheckTests` 類別內加入：

```python
    def test_db_passwords_accept_url_unreserved_characters(self):
        env = with_changes(DB_PASSWORD="qjudge_web-dev.1~x")
        self.assertEqual(check_env(env), [])
```

並把既有的 `test_db_passwords_must_be_alphanumeric` 改名為 `test_db_passwords_reject_url_reserved_characters`（內容不變）。

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: FAIL（`KeyError: 'HOST_PROJECT_ROOT'`；新密碼測試回報 `DB_PASSWORD`）

- [ ] **Step 3: Implement**

`deploy/qjudge_cli/schema.py`：

1. `FEATURES` 改為：

```python
FEATURES = ("core", "storage", "media", "ai", "oauth", "smtp", "mcp", "tunnel", "dev")
```

2. `FEATURE_TITLES` 加入 `"dev": "Local development only",`。

3. 在 `KEYS` tuple 最後（`TUNNEL_TOKEN` 那筆之後）加入：

```python
    # Local development only
    Key("HOST_PROJECT_ROOT", "dev", "Absolute path of the checkout on the Docker host (local development)."),
    Key("DOCKER_JUDGE_PLATFORM", "dev", "Judge container platform, e.g. linux/amd64 on Apple Silicon."),
```

4. 三個密碼 key 的 help 文字中的 `(letters and digits)` 改為 `(letters, digits and -._~)`。

`deploy/qjudge_cli/check.py`：

```python
URL_SAFE = re.compile(r"[A-Za-z0-9._~-]+")
```

取代 `ALPHANUMERIC` 定義，並把 `_value_problem` 內的判斷改為：

```python
    if name in URL_SAFE_PASSWORD_KEYS and not URL_SAFE.fullmatch(value):
        return "may contain only letters, digits and -._~ because it is embedded in a database URL"
```

重新產生範本：`deploy/qjudge env-example > deploy/.env.example`

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/schema.py deploy/qjudge_cli/check.py deploy/qjudge_cli/tests/test_schema.py deploy/qjudge_cli/tests/test_check.py deploy/.env.example
git commit -m "feat(deploy): add dev keys and allow URL-safe DB passwords" -- deploy/qjudge_cli/schema.py deploy/qjudge_cli/check.py deploy/qjudge_cli/tests/test_schema.py deploy/qjudge_cli/tests/test_check.py deploy/.env.example
```

---

### Task 2: backend 由 origin 推導 URL

**Files:**
- Modify: `backend/config/settings/base.py`、`prod.py`、`dev.py`
- Test: `backend/apps/core/tests/test_deploy_settings.py`（新增）

- [ ] **Step 1: Write the failing test**

`backend/apps/core/tests/test_deploy_settings.py`：

```python
import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[3]
ORIGIN = "https://judge.example.edu"
CLEARED_KEYS = (
    "QJUDGE_PUBLIC_ORIGIN",
    "FRONTEND_URL",
    "OAUTH_ISSUER_URL",
    "CORS_ALLOWED_ORIGINS",
    "CSRF_TRUSTED_ORIGINS",
    "MARKDOWN_IMAGE_PUBLIC_BASE_URL",
    "MEDIA_MODE",
    "LIVE_MONITORING_ENABLED",
    "LIVE_MONITORING_PROVIDER",
    "LIVEKIT_PUBLIC_URL",
    "LIVEKIT_INTERNAL_URL",
)


def load_settings(module: str, extra_env: dict[str, str], names: list[str]) -> dict:
    environment = os.environ.copy()
    for key in CLEARED_KEYS:
        environment.pop(key, None)
    environment.update(extra_env)
    script = (
        "import json\n"
        f"from config.settings import {module} as s\n"
        f"print(json.dumps({{n: getattr(s, n) for n in {names!r}}}, default=str))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_urls_derive_from_public_origin_and_ignore_legacy_keys():
    values = load_settings(
        "base",
        {
            "QJUDGE_PUBLIC_ORIGIN": ORIGIN + "/",
            "FRONTEND_URL": "https://ignored.example",
            "OAUTH_ISSUER_URL": "https://ignored.example",
            "MARKDOWN_IMAGE_PUBLIC_BASE_URL": "https://ignored.example",
        },
        ["FRONTEND_URL", "OAUTH_ISSUER_URL", "MARKDOWN_IMAGE_PUBLIC_BASE_URL"],
    )

    assert values == {
        "FRONTEND_URL": ORIGIN,
        "OAUTH_ISSUER_URL": ORIGIN,
        "MARKDOWN_IMAGE_PUBLIC_BASE_URL": ORIGIN,
    }


def test_frontend_url_defaults_to_local_vite_without_origin():
    values = load_settings("base", {}, ["FRONTEND_URL", "OAUTH_ISSUER_URL"])

    assert values == {
        "FRONTEND_URL": "http://localhost:5173",
        "OAUTH_ISSUER_URL": "http://localhost:5173",
    }


def test_prod_trusts_only_the_public_origin():
    values = load_settings(
        "prod",
        {
            "DJANGO_ENV": "production",
            "SECRET_KEY": "deploy-settings-test-secret",
            "QJUDGE_PUBLIC_ORIGIN": ORIGIN,
            "CORS_ALLOWED_ORIGINS": "https://other.example",
            "CSRF_TRUSTED_ORIGINS": "https://other.example",
        },
        ["CORS_ALLOWED_ORIGINS", "CSRF_TRUSTED_ORIGINS"],
    )

    assert values == {
        "CORS_ALLOWED_ORIGINS": [ORIGIN],
        "CSRF_TRUSTED_ORIGINS": [ORIGIN],
    }


def test_dev_trusts_origin_and_local_vite():
    values = load_settings(
        "dev",
        {"QJUDGE_PUBLIC_ORIGIN": ORIGIN},
        ["CSRF_TRUSTED_ORIGINS"],
    )

    assert ORIGIN in values["CSRF_TRUSTED_ORIGINS"]
    assert "http://localhost:5173" in values["CSRF_TRUSTED_ORIGINS"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py -q`
Expected: `test_urls_derive_from_public_origin_and_ignore_legacy_keys` 與 `test_prod_trusts_only_the_public_origin` FAIL

- [ ] **Step 3: Implement**

`backend/config/settings/base.py`，把：

```python
FRONTEND_URL = env(
    "FRONTEND_URL",
    _QJUDGE_PUBLIC_ORIGIN.url if _QJUDGE_PUBLIC_ORIGIN else "http://localhost:5173",
)
# OAuth issuer defaults to FRONTEND_URL (same domain in production)
OAUTH_ISSUER_URL = env("OAUTH_ISSUER_URL", FRONTEND_URL).rstrip("/")
```

替換為：

```python
FRONTEND_URL = (
    _QJUDGE_PUBLIC_ORIGIN.url if _QJUDGE_PUBLIC_ORIGIN else "http://localhost:5173"
)
# Backend, AI service and MCP server all use the public origin as OAuth issuer.
OAUTH_ISSUER_URL = FRONTEND_URL
```

同檔把：

```python
MARKDOWN_IMAGE_PUBLIC_BASE_URL = env(
    "MARKDOWN_IMAGE_PUBLIC_BASE_URL",
    env("FRONTEND_URL", ""),
).strip()
```

替換為：

```python
MARKDOWN_IMAGE_PUBLIC_BASE_URL = FRONTEND_URL
```

`backend/config/settings/prod.py`，把：

```python
# CORS settings
# CORS settings
CORS_ALLOWED_ORIGINS = [origin.strip('/') for origin in env('CORS_ALLOWED_ORIGINS', '').split(',') if origin]
if env('FRONTEND_URL'):
    CORS_ALLOWED_ORIGINS.append(env('FRONTEND_URL').strip('/'))

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS = [origin.strip('/') for origin in env('CSRF_TRUSTED_ORIGINS', '').split(',') if origin]
if env('FRONTEND_URL'):
    CSRF_TRUSTED_ORIGINS.append(env('FRONTEND_URL').strip('/'))
```

替換為：

```python
# CORS and CSRF trust only the public origin.
CORS_ALLOWED_ORIGINS = [FRONTEND_URL]
CSRF_TRUSTED_ORIGINS = [FRONTEND_URL]
```

`backend/config/settings/dev.py`，把：

```python
# CORS settings
CORS_ALLOWED_ORIGINS = [origin.strip('/') for origin in env('CORS_ALLOWED_ORIGINS', '').split(',') if origin]
if env('FRONTEND_URL'):
    CORS_ALLOWED_ORIGINS.append(env('FRONTEND_URL').strip('/'))

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS = [origin.strip('/') for origin in env('CSRF_TRUSTED_ORIGINS', '').split(',') if origin]
if env('FRONTEND_URL'):
    CSRF_TRUSTED_ORIGINS.append(env('FRONTEND_URL').strip('/'))
```

替換為：

```python
CORS_ALLOWED_ORIGINS = [FRONTEND_URL]
CSRF_TRUSTED_ORIGINS = [FRONTEND_URL]
```

（其後保留 localhost Vite 與 tunnel host 的迴圈。）

確認沒有其他地方讀這些 env：`grep -nE "env\(['\"](FRONTEND_URL|OAUTH_ISSUER_URL|CORS_ALLOWED_ORIGINS|CSRF_TRUSTED_ORIGINS|MARKDOWN_IMAGE_PUBLIC_BASE_URL)" backend/config/settings/*.py`，Expected: 無輸出。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py apps/core/tests/test_public_origin_settings.py apps/core/tests/test_env_helper.py -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py check
```

Expected: 全部 passed；check 無 error

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings/base.py backend/config/settings/prod.py backend/config/settings/dev.py backend/apps/core/tests/test_deploy_settings.py
git commit -m "refactor(backend): derive public URLs from QJUDGE_PUBLIC_ORIGIN" -- backend/config/settings/base.py backend/config/settings/prod.py backend/config/settings/dev.py backend/apps/core/tests/test_deploy_settings.py
```

---

### Task 3: backend `MEDIA_MODE`

**Files:**
- Modify: `backend/config/settings/base.py`
- Test: `backend/apps/core/tests/test_deploy_settings.py`

- [ ] **Step 1: Write the failing tests**

在 `backend/apps/core/tests/test_deploy_settings.py` 末尾加入：

```python
MEDIA_NAMES = ["LIVE_MONITORING_ENABLED", "LIVE_MONITORING_PROVIDER", "LIVEKIT_INTERNAL_URL"]


def test_media_mode_external_enables_livekit_and_derives_server_url():
    values = load_settings(
        "base",
        {"MEDIA_MODE": "external", "LIVEKIT_PUBLIC_URL": "wss://live.example.edu/"},
        MEDIA_NAMES,
    )

    assert values == {
        "LIVE_MONITORING_ENABLED": True,
        "LIVE_MONITORING_PROVIDER": "livekit",
        "LIVEKIT_INTERNAL_URL": "https://live.example.edu",
    }


def test_media_disabled_by_default():
    values = load_settings("base", {}, MEDIA_NAMES)

    assert values["LIVE_MONITORING_ENABLED"] is False
    assert values["LIVE_MONITORING_PROVIDER"] == "disabled"


def test_media_mode_wins_over_legacy_flag():
    values = load_settings(
        "base",
        {"MEDIA_MODE": "disabled", "LIVE_MONITORING_ENABLED": "true"},
        MEDIA_NAMES,
    )

    assert values["LIVE_MONITORING_ENABLED"] is False


def test_legacy_flag_still_enables_media_without_media_mode():
    values = load_settings("base", {"LIVE_MONITORING_ENABLED": "true"}, MEDIA_NAMES)

    assert values["LIVE_MONITORING_ENABLED"] is True


def test_explicit_internal_url_overrides_derived_url():
    values = load_settings(
        "base",
        {
            "MEDIA_MODE": "bundled",
            "LIVEKIT_PUBLIC_URL": "ws://localhost:7883",
            "LIVEKIT_INTERNAL_URL": "http://livekit:7883",
        },
        MEDIA_NAMES,
    )

    assert values["LIVEKIT_INTERNAL_URL"] == "http://livekit:7883"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py -q`
Expected: `test_media_mode_external_enables_livekit_and_derives_server_url` 與 `test_media_mode_wins_over_legacy_flag` FAIL

- [ ] **Step 3: Implement**

在 `backend/config/settings/base.py` 的 `_env_truthy` 函式之後加入：

```python
def _livekit_server_url(public_url: str) -> str:
    """LiveKit serves its API on the signaling host; map ws(s) to http(s)."""
    if public_url.startswith("wss://"):
        return "https://" + public_url[len("wss://"):]
    if public_url.startswith("ws://"):
        return "http://" + public_url[len("ws://"):]
    return public_url
```

把：

```python
LIVE_MONITORING_ENABLED = _env_truthy("LIVE_MONITORING_ENABLED")

# Self-hosted LiveKit monitoring.  The provider is intentionally a narrow
# deployment switch: an enabled deployment must use LiveKit, while the
# disabled default carries no dependency on the SFU service.
LIVE_MONITORING_PROVIDER = env(
    "LIVE_MONITORING_PROVIDER",
    "livekit" if LIVE_MONITORING_ENABLED else "disabled",
).strip().lower()
```

替換為：

```python
# MEDIA_MODE selects live monitoring. LIVE_MONITORING_ENABLED is read only when
# MEDIA_MODE is unset, so hosts still on the legacy compose keep working.
MEDIA_MODE = (
    env("MEDIA_MODE")
    or ("external" if _env_truthy("LIVE_MONITORING_ENABLED") else "disabled")
).lower()
LIVE_MONITORING_ENABLED = MEDIA_MODE in {"bundled", "external"}
LIVE_MONITORING_PROVIDER = "livekit" if LIVE_MONITORING_ENABLED else "disabled"
```

把：

```python
LIVEKIT_PUBLIC_URL = env("LIVEKIT_PUBLIC_URL", "").strip().rstrip("/")
LIVEKIT_INTERNAL_URL = env("LIVEKIT_INTERNAL_URL", "").strip().rstrip("/")
```

替換為：

```python
LIVEKIT_PUBLIC_URL = env("LIVEKIT_PUBLIC_URL", "").rstrip("/")
LIVEKIT_INTERNAL_URL = env(
    "LIVEKIT_INTERNAL_URL", _livekit_server_url(LIVEKIT_PUBLIC_URL)
).rstrip("/")
```

確認其他程式只讀 `settings.LIVE_MONITORING_*`：`grep -rn "LIVE_MONITORING_ENABLED\|LIVE_MONITORING_PROVIDER" backend/apps --include='*.py' | grep -v tests | grep -v "settings\."`，Expected: 無輸出（若有，改成讀 `settings`）。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_deploy_settings.py -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/contests -q -k "live or monitoring or livekit"
```

Expected: 全部 passed

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings/base.py backend/apps/core/tests/test_deploy_settings.py
git commit -m "feat(backend): select live monitoring with MEDIA_MODE" -- backend/config/settings/base.py backend/apps/core/tests/test_deploy_settings.py
```

---

### Task 4: ai-service issuer 與連線池

**Files:**
- Modify: `ai-service/config.py`、`ai-service/main.py`、`ai-service/infrastructure/database/base.py`、`ai-service/infrastructure/checkpoints/langgraph_store.py`
- Test: `ai-service/tests/test_deploy_config.py`（新增）

- [ ] **Step 1: Write the failing tests**

`ai-service/tests/test_deploy_config.py`：

```python
import asyncio

import pytest

from config import Settings, get_settings
from infrastructure.checkpoints import langgraph_store
from infrastructure.database.base import create_async_engine_from_settings
from main import _oauth_locations


def test_oauth_issuer_comes_from_public_origin(monkeypatch):
    monkeypatch.setenv("QJUDGE_PUBLIC_ORIGIN", "https://judge.example.edu/")
    monkeypatch.setenv("AI_OAUTH_ISSUER", "https://ignored.example")

    issuer, _ = _oauth_locations(Settings(_env_file=None))

    assert issuer == "https://judge.example.edu"


def test_oauth_issuer_falls_back_to_legacy_key(monkeypatch):
    monkeypatch.delenv("QJUDGE_PUBLIC_ORIGIN", raising=False)
    monkeypatch.setenv("AI_OAUTH_ISSUER", "https://legacy.example/")

    issuer, _ = _oauth_locations(Settings(_env_file=None))

    assert issuer == "https://legacy.example"


def test_engine_pool_is_bounded(monkeypatch):
    monkeypatch.setenv("AI_DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
    monkeypatch.delenv("AI_DB_USER", raising=False)
    monkeypatch.delenv("AI_DB_NAME", raising=False)
    get_settings.cache_clear()
    try:
        engine = create_async_engine_from_settings()
        assert engine.pool.size() == 5
        assert engine.pool._max_overflow == 5
    finally:
        get_settings.cache_clear()


class _StopSetup(Exception):
    pass


def test_checkpoint_pool_sets_schema_without_startup_options(monkeypatch):
    captured = {}

    def fake_pool(**kwargs):
        captured.update(kwargs)
        raise _StopSetup

    monkeypatch.setattr(langgraph_store, "AsyncConnectionPool", fake_pool)
    store = langgraph_store.LangGraphCheckpointStore(
        database_url="postgresql://user:pass@localhost:5432/db",
        schema="ai_checkpoint",
    )

    with pytest.raises(_StopSetup):
        asyncio.run(store.setup())

    assert captured["max_size"] == 5
    assert "options" not in captured["kwargs"]

    executed = []

    class FakeConnection:
        async def execute(self, statement):
            executed.append(repr(statement))

    asyncio.run(captured["configure"](FakeConnection()))
    assert "search_path" in executed[0]
    assert "ai_checkpoint" in executed[0]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service pytest tests/test_deploy_config.py -q`
Expected: issuer、pool、checkpoint 測試 FAIL（legacy fallback 測試可能已通過）

- [ ] **Step 3: Implement**

`ai-service/config.py`，在 `qjudge_mcp_url: str = "http://qjudge-mcp:9000/mcp"` 這行之後加入：

```python
    qjudge_public_origin: str = Field(
        default="", validation_alias=AliasChoices("QJUDGE_PUBLIC_ORIGIN")
    )
```

`ai-service/main.py`，把 `_oauth_locations` 的：

```python
    issuer = os.environ.get("AI_OAUTH_ISSUER", "").strip().rstrip("/")
```

替換為：

```python
    # AI_OAUTH_ISSUER is read only when the origin is unset (legacy compose).
    issuer = (
        settings.qjudge_public_origin or os.environ.get("AI_OAUTH_ISSUER", "")
    ).strip().rstrip("/")
```

`ai-service/infrastructure/database/base.py`，`create_async_engine(...)` 呼叫改為：

```python
    return create_async_engine(
        normalize_async_database_url(database_url),
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
    )
```

`ai-service/infrastructure/checkpoints/langgraph_store.py`：

1. 在 `configurable` 方法之後加入：

```python
    async def _use_schema(self, connection) -> None:
        await connection.execute(
            sql.SQL("SET search_path TO {}").format(sql.Identifier(self._schema))
        )
```

2. `setup` 內的 pool 建立改為：

```python
        pool = AsyncConnectionPool(
            conninfo=_psycopg_url(self._database_url),
            min_size=1,
            max_size=5,
            # PgBouncer rejects the "options" startup parameter, so the schema
            # is selected after each connection is opened.
            configure=self._use_schema,
            kwargs={"autocommit": True, "prepare_threshold": 0},
            open=False,
        )
```

`ai-service/infrastructure/agent/deepagent_adapter.py` 的 `setup` docstring 中 `A pool (min=1, max=10)` 改為 `A pool (min=1, max=5)`。

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service pytest tests/test_deploy_config.py tests/test_config.py -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service pytest tests -q --ignore=tests/integration --ignore=tests/contract
```

Expected: 全部 passed

- [ ] **Step 5: Commit**

```bash
git add ai-service/config.py ai-service/main.py ai-service/infrastructure/database/base.py ai-service/infrastructure/checkpoints/langgraph_store.py ai-service/infrastructure/agent/deepagent_adapter.py ai-service/tests/test_deploy_config.py
git commit -m "feat(ai): derive issuer from origin and bound DB pools for pgbouncer" -- ai-service/config.py ai-service/main.py ai-service/infrastructure/database/base.py ai-service/infrastructure/checkpoints/langgraph_store.py ai-service/infrastructure/agent/deepagent_adapter.py ai-service/tests/test_deploy_config.py
```

---

### Task 5: mcp-server issuer

**Files:**
- Modify: `mcp-server/config.py`
- Test: `mcp-server/tests/test_config.py`（新增）

- [ ] **Step 1: Write the failing test**

`mcp-server/tests/test_config.py`：

```python
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_issuer(extra_env: dict[str, str]) -> str:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in ("QJUDGE_PUBLIC_ORIGIN", "OAUTH_ISSUER_URL")
    }
    environment.update(extra_env)
    result = subprocess.run(
        [sys.executable, "-c", "import json, config; print(json.dumps(config.OAUTH_ISSUER_URL))"],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip())


def test_issuer_comes_from_public_origin():
    issuer = load_issuer(
        {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu/", "OAUTH_ISSUER_URL": "https://ignored.example"}
    )

    assert issuer == "https://judge.example.edu"


def test_issuer_falls_back_to_legacy_key():
    assert load_issuer({"OAUTH_ISSUER_URL": "https://legacy.example/"}) == "https://legacy.example"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp-server && uv run --with pytest pytest tests/test_config.py -q; cd ..`
Expected: `test_issuer_comes_from_public_origin` FAIL

- [ ] **Step 3: Implement**

`mcp-server/config.py`，把：

```python
OAUTH_ISSUER_URL = os.getenv(
    "OAUTH_ISSUER_URL", "http://localhost:8000"
).rstrip("/")
```

替換為：

```python
QJUDGE_PUBLIC_ORIGIN = os.getenv("QJUDGE_PUBLIC_ORIGIN", "").strip().rstrip("/")
# The public origin is the OAuth issuer; OAUTH_ISSUER_URL is read only when the
# origin is unset (legacy compose).
OAUTH_ISSUER_URL = (
    QJUDGE_PUBLIC_ORIGIN or os.getenv("OAUTH_ISSUER_URL", "http://localhost:8000")
).rstrip("/")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp-server && uv run --with pytest pytest tests -q; cd ..`
Expected: 全部 passed

- [ ] **Step 5: Commit**

```bash
git add mcp-server/config.py mcp-server/tests/test_config.py
git commit -m "feat(mcp): derive OAuth issuer from QJUDGE_PUBLIC_ORIGIN" -- mcp-server/config.py mcp-server/tests/test_config.py
```

---

### Task 6: compose lint

**Files:**
- Create: `deploy/qjudge_cli/lint.py`
- Modify: `deploy/qjudge_cli/cli.py`
- Test: `deploy/qjudge_cli/tests/test_lint.py`（新增）

- [ ] **Step 1: Write the failing tests**

`deploy/qjudge_cli/tests/test_lint.py`：

```python
import unittest

from qjudge_cli.lint import lint_compose_text


class LintTests(unittest.TestCase):
    def test_schema_keys_and_empty_defaults_pass(self):
        text = "A: ${SECRET_KEY}\nB: ${OPENAI_API_KEY:-}\n"
        self.assertEqual(lint_compose_text(text), [])

    def test_unknown_variable_is_reported(self):
        self.assertEqual(
            lint_compose_text("A: ${ANTICHEAT_RAW_BUCKET:-}\n"),
            ["line 1: ANTICHEAT_RAW_BUCKET is not in the schema"],
        )

    def test_non_empty_default_is_reported(self):
        self.assertEqual(
            lint_compose_text("A: ${MEDIA_MODE:-disabled}\n"),
            ["line 1: MEDIA_MODE must not have a default in compose; defaults belong to the app"],
        )

    def test_topology_defaults_are_allowed(self):
        text = 'ports: ["${GATEWAY_BIND_ADDRESS:-127.0.0.1}:${GATEWAY_PORT:-8080}:80"]\nname: ${COMPOSE_PROJECT_NAME:-qjudge}\n'
        self.assertEqual(lint_compose_text(text), [])

    def test_internal_variables_are_allowed(self):
        self.assertEqual(lint_compose_text("image: qjudge/backend:${QJUDGE_VERSION}\n"), [])

    def test_escaped_dollar_is_ignored(self):
        self.assertEqual(lint_compose_text("cmd: echo $${HOME}\n"), [])

    def test_comments_are_ignored(self):
        self.assertEqual(lint_compose_text("# uses ${UNKNOWN_KEY}\n"), [])


if __name__ == "__main__":
    unittest.main()
```

在 `deploy/qjudge_cli/tests/test_cli.py` 的 `CliTests` 類別內加入：

```python
    def test_lint_compose_reports_problems(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "compose.yml"
            path.write_text("A: ${UNKNOWN_KEY}\n")
            code, output = self.run_cli("lint-compose", str(path))
        self.assertEqual(code, 1)
        self.assertIn("UNKNOWN_KEY", output)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: ERROR，`No module named 'qjudge_cli.lint'`

- [ ] **Step 3: Implement**

`deploy/qjudge_cli/lint.py`：

```python
"""Check that compose files only pass schema keys and hold no app defaults."""

from __future__ import annotations

import re

from .schema import KEYS_BY_NAME

INTERNAL_VARIABLES = {"QJUDGE_VERSION"}
TOPOLOGY_DEFAULTS = {"GATEWAY_BIND_ADDRESS", "GATEWAY_PORT", "COMPOSE_PROJECT_NAME"}
REFERENCE = re.compile(r"(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?([-?])([^}]*))?\}")


def lint_compose_text(text: str) -> list[str]:
    problems: list[str] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if line.lstrip().startswith("#"):
            continue
        for match in REFERENCE.finditer(line):
            name, operator, default = match.group(1), match.group(2), match.group(3)
            if name not in KEYS_BY_NAME and name not in INTERNAL_VARIABLES:
                problems.append(f"line {number}: {name} is not in the schema")
            elif operator == "-" and default and name not in TOPOLOGY_DEFAULTS:
                problems.append(
                    f"line {number}: {name} must not have a default in compose; "
                    "defaults belong to the app"
                )
    return problems
```

`deploy/qjudge_cli/cli.py`：

1. import 區加入 `from .lint import lint_compose_text`。
2. `main` 內，在 `commands.add_parser("env-example", ...)` 之後加入：

```python
    lint_parser = commands.add_parser("lint-compose", help="check compose files against the schema")
    lint_parser.add_argument("files", type=Path, nargs="+")
```

3. 把指令分派改為：

```python
    if args.command == "env-example":
        sys.stdout.write(render())
        return 0
    if args.command == "lint-compose":
        return _lint(args.files)
    return _check(args.env_file)
```

4. 檔尾加入：

```python
def _lint(files: list[Path]) -> int:
    failed = False
    for path in files:
        for problem in lint_compose_text(path.read_text(encoding="utf-8")):
            print(f"{path}: {problem}")
            failed = True
    return 1 if failed else 0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/lint.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/tests/test_lint.py deploy/qjudge_cli/tests/test_cli.py
git commit -m "feat(deploy): lint compose files against the schema" -- deploy/qjudge_cli/lint.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/tests/test_lint.py deploy/qjudge_cli/tests/test_cli.py
```

---

### Task 7: postgres initdb 與 pgbouncer 設定

**Files:**
- Create: `deploy/postgres/initdb.d/10-qjudge-databases.sh`
- Create: `deploy/pgbouncer/pgbouncer.ini`

- [ ] **Step 1: 建立 initdb 腳本**

`deploy/postgres/initdb.d/10-qjudge-databases.sh`：

```sh
#!/bin/sh
# Runs once, when the PostgreSQL data directory is empty. Existing installs
# already have these roles and databases; change passwords with ALTER ROLE.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v web_password="$QJUDGE_DB_PASSWORD" \
  -v ai_password="$QJUDGE_AI_DB_PASSWORD" <<'SQL'
CREATE ROLE qjudge_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'web_password';
CREATE ROLE qjudge_ai LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'ai_password';
CREATE DATABASE online_judge OWNER qjudge_web;
CREATE DATABASE qjudge_ai OWNER qjudge_ai;
REVOKE ALL ON DATABASE online_judge FROM PUBLIC;
REVOKE ALL ON DATABASE qjudge_ai FROM PUBLIC;
SQL
```

Run: `chmod +x deploy/postgres/initdb.d/10-qjudge-databases.sh`

- [ ] **Step 2: 以全新資料目錄驗證 initdb 腳本**

Run:

```bash
docker run --rm -d --name qjudge-initdb-check \
  -e POSTGRES_USER=qjudge_admin -e POSTGRES_PASSWORD=adminpw -e POSTGRES_DB=postgres \
  -e QJUDGE_DB_PASSWORD=webpw -e QJUDGE_AI_DB_PASSWORD=aipw \
  -v "$PWD/deploy/postgres/initdb.d:/docker-entrypoint-initdb.d:ro" postgres:15-alpine
until docker exec qjudge-initdb-check pg_isready -U qjudge_admin -d postgres -h 127.0.0.1 >/dev/null 2>&1; do sleep 1; done
sleep 2
docker exec qjudge-initdb-check psql -U qjudge_admin -d postgres -tAc \
  "SELECT datname FROM pg_database WHERE datname IN ('online_judge','qjudge_ai') ORDER BY 1; SELECT rolname, rolsuper, rolcreatedb FROM pg_roles WHERE rolname IN ('qjudge_web','qjudge_ai') ORDER BY 1;"
docker exec -e PGPASSWORD=webpw qjudge-initdb-check psql -h 127.0.0.1 -U qjudge_web -d online_judge -tAc "SELECT current_user"
docker rm -f qjudge-initdb-check
```

Expected: 列出 `online_judge`、`qjudge_ai`；`qjudge_ai|f|f`、`qjudge_web|f|f`；最後一個查詢輸出 `qjudge_web`

- [ ] **Step 3: 建立 pgbouncer 設定**

`deploy/pgbouncer/pgbouncer.ini`：

```ini
; Session mode keeps SELECT FOR UPDATE, advisory locks and SET search_path
; working. Connection budget: postgres max_connections=400 =
; online_judge 300 (+10 reserve) + qjudge_ai 60 (+10 reserve) + 20 for admin.
[databases]
online_judge = host=postgres port=5432 dbname=online_judge pool_size=300
qjudge_ai = host=postgres port=5432 dbname=qjudge_ai pool_size=60

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
; The image entrypoint writes userlist.txt from DATABASE_URLS.
auth_type = plain
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = session
max_client_conn = 2000
reserve_pool_size = 10
reserve_pool_timeout = 3
query_wait_timeout = 120
server_idle_timeout = 600
client_idle_timeout = 0
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits
log_connections = 0
log_disconnections = 0
log_stats = 0
```

- [ ] **Step 4: Commit**

```bash
git add deploy/postgres/initdb.d/10-qjudge-databases.sh deploy/pgbouncer/pgbouncer.ini
git commit -m "feat(deploy): add postgres initdb and pgbouncer config for both databases" -- deploy/postgres/initdb.d/10-qjudge-databases.sh deploy/pgbouncer/pgbouncer.ini
```

---

### Task 8: `deploy/compose.yml` 與 `deploy/compose.build.yml`

**Files:**
- Create: `deploy/compose.yml`、`deploy/compose.build.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 建立 `deploy/compose.yml`**

```yaml
# QJudge application (production shape). Compose reads ./.env from this
# directory. Build definitions: compose.build.yml. Local dev: ../compose.dev.yml.
# Only schema keys from .env and container wiring belong here; app defaults
# live in the application (see deploy/qjudge lint-compose).
name: ${COMPOSE_PROJECT_NAME:-qjudge}

x-django-environment: &django_environment
  DJANGO_ENV: production
  DJANGO_SETTINGS_MODULE: config.settings.prod
  QJUDGE_PUBLIC_ORIGIN: ${QJUDGE_PUBLIC_ORIGIN}
  SECRET_KEY: ${SECRET_KEY}
  DATABASE_URL: postgresql://qjudge_web:${DB_PASSWORD}@pgbouncer:5432/online_judge
  REDIS_URL: redis://redis:6379/0
  NYCU_OAUTH_CLIENT_ID: ${NYCU_OAUTH_CLIENT_ID:-}
  NYCU_OAUTH_CLIENT_SECRET: ${NYCU_OAUTH_CLIENT_SECRET:-}
  GITHUB_OAUTH_CLIENT_ID: ${GITHUB_OAUTH_CLIENT_ID:-}
  GITHUB_OAUTH_CLIENT_SECRET: ${GITHUB_OAUTH_CLIENT_SECRET:-}
  GOOGLE_OAUTH_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID:-}
  GOOGLE_OAUTH_CLIENT_SECRET: ${GOOGLE_OAUTH_CLIENT_SECRET:-}
  EMAIL_HOST_USER: ${EMAIL_HOST_USER:-}
  EMAIL_HOST_PASSWORD: ${EMAIL_HOST_PASSWORD:-}
  OBJECT_STORAGE_ENDPOINT_URL: ${OBJECT_STORAGE_ENDPOINT_URL}
  OBJECT_STORAGE_PUBLIC_ENDPOINT_URL: ${OBJECT_STORAGE_PUBLIC_ENDPOINT_URL}
  OBJECT_STORAGE_ACCESS_KEY: ${OBJECT_STORAGE_ACCESS_KEY}
  OBJECT_STORAGE_SECRET_KEY: ${OBJECT_STORAGE_SECRET_KEY}
  MEDIA_MODE: ${MEDIA_MODE:-}
  LIVEKIT_PUBLIC_URL: ${LIVEKIT_PUBLIC_URL:-}
  LIVEKIT_API_KEY: ${LIVEKIT_API_KEY:-}
  LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET:-}
  HOST_PROJECT_ROOT: ${HOST_PROJECT_ROOT:-}
  JUDGE_TMP_DIR: /judge_tmp
  AI_OAUTH_SIGNING_PRIVATE_KEY_FILE: /run-secrets/ai-oauth-ed25519-private.pem
  INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE: /run-secrets/integrity/resident-service-token
  INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE: /run-secrets/integrity/integrity-worker-signing-key

x-ai-environment: &ai_environment
  AI_DATABASE_URL: postgresql+psycopg://qjudge_ai:${AI_DB_PASSWORD}@pgbouncer:5432/qjudge_ai
  AI_REDIS_URL: redis://redis:6379/2
  QJUDGE_PUBLIC_ORIGIN: ${QJUDGE_PUBLIC_ORIGIN}
  CREDENTIAL_LEASE_SECRET: ${CREDENTIAL_LEASE_SECRET}
  AI_ARTIFACT_STORAGE_ENDPOINT_URL: ${OBJECT_STORAGE_ENDPOINT_URL}
  AI_ARTIFACT_STORAGE_PUBLIC_ENDPOINT_URL: ${OBJECT_STORAGE_PUBLIC_ENDPOINT_URL}
  AI_ARTIFACT_STORAGE_ACCESS_KEY: ${OBJECT_STORAGE_ACCESS_KEY}
  AI_ARTIFACT_STORAGE_SECRET_KEY: ${OBJECT_STORAGE_SECRET_KEY}
  OPENAI_API_KEY: ${OPENAI_API_KEY:-}
  OPENAI_BASE_URL: ${OPENAI_BASE_URL:-}
  DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
  DEEPSEEK_BASE_URL: ${DEEPSEEK_BASE_URL:-}
  VLLM_API_KEY: ${VLLM_API_KEY:-}
  VLLM_BASE_URL: ${VLLM_BASE_URL:-}

services:
  postgres:
    image: postgres:15-alpine
    restart: always
    command: postgres -c max_connections=400 -c shared_buffers=256MB -c work_mem=4MB
    environment:
      POSTGRES_DB: postgres
      POSTGRES_USER: qjudge_admin
      POSTGRES_PASSWORD: ${POSTGRES_ADMIN_PASSWORD}
      QJUDGE_DB_PASSWORD: ${DB_PASSWORD}
      QJUDGE_AI_DB_PASSWORD: ${AI_DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/initdb.d:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U qjudge_admin -d postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgbouncer:
    image: edoburu/pgbouncer:v1.24.1-p1
    restart: always
    environment:
      AUTH_TYPE: plain
      DATABASE_URLS: postgres://qjudge_web:${DB_PASSWORD}@postgres:5432/online_judge,postgres://qjudge_ai:${AI_DB_PASSWORD}@postgres:5432/qjudge_ai
    volumes:
      - ./pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h localhost -p 5432 -U qjudge_web -d online_judge"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  migrate:
    image: qjudge/backend:${QJUDGE_VERSION}
    restart: "no"
    command: ["python", "manage.py", "migrate", "--noinput"]
    environment: *django_environment
    depends_on:
      pgbouncer:
        condition: service_healthy

  ai-migrate:
    image: qjudge/ai-service:${QJUDGE_VERSION}
    restart: "no"
    healthcheck:
      disable: true
    command: ["sh", "-c", "python -m alembic upgrade head && python -m infrastructure.checkpoints.langgraph_store setup"]
    environment: *ai_environment
    depends_on:
      pgbouncer:
        condition: service_healthy

  ai-oauth-bootstrap:
    image: qjudge/backend:${QJUDGE_VERSION}
    restart: "no"
    command:
      - python
      - /bootstrap/bootstrap_ai_oauth_keys.py
      - --private-key
      - /oauth-secrets/ai-oauth-ed25519-private.pem
      - --public-key
      - /oauth-secrets/ai-oauth-ed25519-public.pem
    volumes:
      - ../scripts/bootstrap_ai_oauth_keys.py:/bootstrap/bootstrap_ai_oauth_keys.py:ro
      - ./secrets:/oauth-secrets
    network_mode: none

  integrity-bootstrap:
    image: qjudge/backend:${QJUDGE_VERSION}
    user: "0:0"
    restart: "no"
    command: ["python", "/bootstrap/bootstrap_integrity_secrets.py", "--secrets-dir", "/bootstrap-secrets", "--resident-gid", "10001"]
    volumes:
      - ../scripts/bootstrap_integrity_secrets.py:/bootstrap/bootstrap_integrity_secrets.py:ro
      - ./secrets/integrity:/bootstrap-secrets
    network_mode: none

  ai-service:
    image: qjudge/ai-service:${QJUDGE_VERSION}
    restart: always
    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
    environment: *ai_environment
    depends_on:
      ai-migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "curl", "--fail", "--silent", "--max-time", "8", "http://localhost:8001/health/ready"]
      interval: 30s
      timeout: 10s
      retries: 3

  ai-worker:
    image: qjudge/ai-service:${QJUDGE_VERSION}
    restart: always
    healthcheck:
      disable: true
    command: ["celery", "-A", "worker.celery_app:celery_app", "worker", "--queues=qjudge-ai", "--concurrency=2", "--loglevel=INFO"]
    environment: *ai_environment
    depends_on:
      ai-migrate:
        condition: service_completed_successfully

  ai-scheduler:
    image: qjudge/ai-service:${QJUDGE_VERSION}
    restart: always
    healthcheck:
      disable: true
    command: ["celery", "-A", "worker.celery_app:celery_app", "beat", "--loglevel=INFO", "--schedule=/tmp/celerybeat-schedule"]
    environment: *ai_environment
    depends_on:
      ai-migrate:
        condition: service_completed_successfully

  backend:
    image: qjudge/backend:${QJUDGE_VERSION}
    restart: always
    command: ["sh", "-c", "python manage.py collectstatic --noinput && daphne -b 0.0.0.0 -p 8000 config.asgi:application"]
    volumes:
      - static_volume:/app/staticfiles
      - media_volume:/app/media
      - judge_tmp:/judge_tmp
      - ./secrets:/run-secrets:ro
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
    environment: *django_environment
    depends_on:
      migrate:
        condition: service_completed_successfully
      ai-oauth-bootstrap:
        condition: service_completed_successfully
      integrity-bootstrap:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
      ai-service:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import os; from urllib.request import Request, urlopen; host = os.environ['QJUDGE_PUBLIC_ORIGIN'].split('://', 1)[1].rstrip('/'); r = urlopen(Request('http://localhost:8000/api/health/', headers={'Host': host, 'X-Forwarded-Proto': 'https'}), timeout=4); assert r.status == 200"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s

  celery-high:
    image: qjudge/backend:${QJUDGE_VERSION}
    restart: always
    command: ["celery", "-A", "config", "worker", "-l", "info", "-Q", "high_priority", "--concurrency=2"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - judge_tmp:/judge_tmp
    environment: *django_environment
    depends_on:
      migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
      judge-image:
        condition: service_started
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G

  celery:
    image: qjudge/backend:${QJUDGE_VERSION}
    restart: always
    command: ["celery", "-A", "config", "worker", "-l", "info", "-Q", "default", "--concurrency=2"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - judge_tmp:/judge_tmp
    environment: *django_environment
    depends_on:
      migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
      judge-image:
        condition: service_started
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G

  celery-beat:
    image: qjudge/backend:${QJUDGE_VERSION}
    restart: always
    command: ["celery", "-A", "config", "beat", "-l", "info", "--schedule=/tmp/celerybeat-schedule"]
    environment: *django_environment
    depends_on:
      migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy

  integrity-resident-data-init:
    image: qjudge/integrity-resident:${QJUDGE_VERSION}
    user: "0:0"
    restart: "no"
    read_only: true
    command: ["sh", "-c", "chown 10001:10001 /run-data && chmod 0700 /run-data"]
    volumes:
      - integrity_resident_data:/run-data
    network_mode: none
    cap_drop: [ALL]
    cap_add: [CHOWN, FOWNER]
    security_opt: ["no-new-privileges:true"]

  integrity-resident:
    image: qjudge/integrity-resident:${QJUDGE_VERSION}
    user: "10001:10001"
    restart: always
    read_only: true
    command: ["uvicorn", "integrity_service.resident.app:app", "--host", "0.0.0.0", "--port", "8011", "--workers", "1"]
    environment:
      BACKEND_INTERNAL_URL: http://backend:8000
      INTEGRITY_RESIDENT_DATA_ROOT: /run-data
      INTEGRITY_RESIDENT_PUBLIC_KEY_FILE: /run-secrets/backend-public-key
      INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE: /run-secrets/resident-service-token
    volumes:
      - integrity_resident_data:/run-data
      - type: bind
        source: ./secrets/integrity/backend-public-key
        target: /run-secrets/backend-public-key
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: ./secrets/integrity/resident-service-token
        target: /run-secrets/resident-service-token
        read_only: true
        bind:
          create_host_path: false
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    depends_on:
      integrity-bootstrap:
        condition: service_completed_successfully
      integrity-resident-data-init:
        condition: service_completed_successfully
      backend:
        condition: service_started
    healthcheck:
      test: ["CMD", "python", "-c", "from urllib.request import urlopen; assert urlopen('http://localhost:8011/ready').status == 200"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

  integrity-reconciler:
    image: qjudge/backend:${QJUDGE_VERSION}
    restart: always
    command: ["python", "manage.py", "reconcile_integrity"]
    volumes:
      - ./secrets:/run-secrets:ro
    environment: *django_environment
    depends_on:
      migrate:
        condition: service_completed_successfully
      integrity-resident:
        condition: service_healthy

  qjudge-mcp:
    image: qjudge/mcp:${QJUDGE_VERSION}
    restart: unless-stopped
    environment:
      DJANGO_BASE_URL: http://backend:8000
      QJUDGE_PUBLIC_ORIGIN: ${QJUDGE_PUBLIC_ORIGIN}
      OAUTH_JWKS_URL: http://backend:8000/.well-known/jwks.json
    depends_on:
      - backend

  frontend:
    image: qjudge/frontend:${QJUDGE_VERSION}
    restart: always
    ports:
      - "${GATEWAY_BIND_ADDRESS:-127.0.0.1}:${GATEWAY_PORT:-8080}:80"
    depends_on:
      - backend

  cloudflared:
    image: cloudflare/cloudflared:2025.9.1
    restart: always
    profiles: ["tunnel"]
    command: ["tunnel", "--no-autoupdate", "run", "--token", "${TUNNEL_TOKEN}"]
    depends_on:
      - frontend

  # Makes sure the judge runtime image exists before workers start.
  judge-image:
    image: oj-judge:latest
    command: ["true"]
    restart: "no"
    network_mode: none

volumes:
  postgres_data:
  static_volume:
  media_volume:
  judge_tmp:
  integrity_resident_data:

networks:
  default:
    name: qjudge
    external: true
```

- [ ] **Step 2: 建立 `deploy/compose.build.yml`**

```yaml
# Build the self-built images locally. Every service sharing an image lists the
# same build so `docker compose build` produces the tag regardless of order.
x-backend-build: &backend_build
  context: ../backend
  dockerfile: Dockerfile
  args:
    DJANGO_ENV: ${QJUDGE_BUILD_ENV:-production}
x-ai-build: &ai_build
  context: ../ai-service
  dockerfile: Dockerfile
x-integrity-build: &integrity_build
  context: ../integrity-service
  dockerfile: Dockerfile.resident

services:
  migrate:
    build: *backend_build
  ai-oauth-bootstrap:
    build: *backend_build
  integrity-bootstrap:
    build: *backend_build
  backend:
    build: *backend_build
  celery-high:
    build: *backend_build
  celery:
    build: *backend_build
  celery-beat:
    build: *backend_build
  integrity-reconciler:
    build: *backend_build
  ai-migrate:
    build: *ai_build
  ai-service:
    build: *ai_build
  ai-worker:
    build: *ai_build
  ai-scheduler:
    build: *ai_build
  integrity-resident-data-init:
    build: *integrity_build
  integrity-resident:
    build: *integrity_build
  qjudge-mcp:
    build:
      context: ..
      dockerfile: mcp-server/Dockerfile
  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
```

- [ ] **Step 3: lint 與 compose config 驗證**

先確認 `cloudflare/cloudflared:2025.9.1` 存在：`docker manifest inspect cloudflare/cloudflared:2025.9.1 >/dev/null && echo ok`。若不存在，改用 `docker run --rm cloudflare/cloudflared:latest --version` 取得目前版本號並寫入。

Run:

```bash
deploy/qjudge lint-compose deploy/compose.yml
QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml config --quiet && echo "config ok"
QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml config --services | sort
```

Expected: lint 無輸出；`config ok`；服務清單包含 postgres、pgbouncer、redis、migrate、ai-migrate、ai-oauth-bootstrap、integrity-bootstrap、ai-service、ai-worker、ai-scheduler、backend、celery-high、celery、celery-beat、integrity-resident-data-init、integrity-resident、integrity-reconciler、qjudge-mcp、frontend、judge-image（cloudflared 在 profile 內不列出）。

- [ ] **Step 4: CI 加入 lint 與 config 驗證**

在 `.github/workflows/ci.yml` 的 `static-checks` job、`Deploy CLI Tests` step 之後加入：

```yaml
      - name: Deploy Compose Lint and Config
        run: |
          deploy/qjudge lint-compose deploy/compose.yml
          QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example \
            -f deploy/compose.yml -f deploy/compose.build.yml config --quiet
```

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`
Expected: `yaml ok`

- [ ] **Step 5: Commit**

```bash
git add deploy/compose.yml deploy/compose.build.yml .github/workflows/ci.yml
git commit -m "feat(deploy): add production-shaped compose and build definitions" -- deploy/compose.yml deploy/compose.build.yml .github/workflows/ci.yml
```

---

### Task 9: `compose.dev.yml` 與 `qjudge-dc.sh`

**Files:**
- Create: `compose.dev.yml`
- Modify: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh`

- [ ] **Step 1: 建立 `compose.dev.yml`**

路徑以 project directory（`deploy/`）為基準，所以 repo 內的目錄寫成 `../<dir>`。

```yaml
# Local development overlay for deploy/compose.yml: source mounts, hot reload,
# localhost ports and dev-only wiring. Use via
# .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev <args>.
x-dev-django-environment: &dev_django_environment
  DJANGO_ENV: development
  DJANGO_SETTINGS_MODULE: config.settings.dev
  DOCKER_IMAGE_JUDGE: ghcr.io/quan0715/qjudge/judge:latest
  DOCKER_JUDGE_PLATFORM: ${DOCKER_JUDGE_PLATFORM:-linux/amd64}
  LIVEKIT_INTERNAL_URL: http://livekit:7883
  LIVEKIT_ROOM_PREFIX: qjudge-dev-exam
  # MCP public URL moves to the gateway plan; dev keeps the direct port.
  MCP_PUBLIC_URL: http://localhost:9002

x-dev-backend: &dev_backend
  volumes:
    - ../backend:/app
  environment: *dev_django_environment

services:
  postgres:
    ports:
      - "127.0.0.1:${DEV_POSTGRES_PORT:-5432}:5432"
  pgbouncer:
    ports:
      - "127.0.0.1:${DEV_PGBOUNCER_PORT:-6432}:5432"
  redis:
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    ports:
      - "127.0.0.1:${DEV_REDIS_PORT:-6379}:6379"

  migrate: *dev_backend
  integrity-reconciler: *dev_backend
  celery-beat: *dev_backend
  backend:
    <<: *dev_backend
    command: ["python", "-m", "uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app"]
    ports:
      - "127.0.0.1:${DEV_BACKEND_PORT:-8000}:8000"
  celery:
    <<: *dev_backend
    command: ["celery", "-A", "config.celery", "worker", "--loglevel=info", "-Q", "celery,default"]
  celery-high:
    <<: *dev_backend
    command: ["celery", "-A", "config.celery", "worker", "--loglevel=info", "-Q", "high_priority", "--concurrency=2"]

  ai-migrate:
    volumes:
      - ../ai-service:/app
  ai-service:
    volumes:
      - ../ai-service:/app
    ports:
      - "127.0.0.1:${DEV_AI_PORT:-8001}:8001"
  ai-worker:
    volumes:
      - ../ai-service:/app
  ai-scheduler:
    volumes:
      - ../ai-service:/app

  judge-image:
    image: ghcr.io/quan0715/qjudge/judge:latest
    platform: ${DOCKER_JUDGE_PLATFORM:-linux/amd64}

  qjudge-mcp:
    environment:
      MCP_PUBLIC_URL: http://localhost:9002
    ports:
      - "127.0.0.1:${DEV_MCP_PORT:-9002}:9000"

  frontend:
    image: qjudge/frontend-dev:dev
    build:
      context: ../frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ../frontend:/app
      - ../backend:/backend:ro
      - /app/node_modules
    ports: !override
      - "127.0.0.1:${DEV_FRONTEND_PORT:-5173}:5173"
    environment:
      VITE_API_TARGET: http://backend:8000
      VITE_STORYBOOK_TARGET: http://storybook:6006
      VITE_MCP_PUBLIC_URL: http://localhost:9002/mcp
    depends_on:
      - storybook

  storybook:
    image: qjudge/frontend-dev:dev
    build:
      context: ../frontend
      dockerfile: Dockerfile.dev
    command: ["npm", "run", "storybook", "--", "--host", "0.0.0.0", "--ci"]
    volumes:
      - ../frontend:/app
      - /app/node_modules
    ports:
      - "127.0.0.1:${DEV_STORYBOOK_PORT:-6006}:6006"
    environment:
      VITE_API_TARGET: http://backend:8000
    depends_on:
      - backend

  # Kept here until the media addon exists (plan 05).
  livekit:
    image: livekit/livekit-server:v1.13.7@sha256:6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3
    profiles: ["live-monitoring"]
    restart: unless-stopped
    command: ["--config", "/run/livekit/livekit.json"]
    read_only: true
    security_opt: ["no-new-privileges:true"]
    volumes:
      - type: bind
        source: ../.tmp/livekit/dev.json
        target: /run/livekit/livekit.json
        read_only: true
        bind:
          create_host_path: false
    ports:
      - "7883:7883"
      - "7884:7884"
      - "50100-50199:50100-50199/udp"
      - "3478:3478/udp"
      - "50300-50309:50300-50309/udp"

# Each checkout gets its own project network instead of the shared external one.
networks:
  default: !reset {}
```

- [ ] **Step 2: 修改 `qjudge-dc.sh`**

把 `case "$ENV_NAME" in` 區塊內的 `main`、`dev`、`test` 三個分支改為：

```bash
  main)
    COMPOSE_ARGS=(-f "$ROOT_DIR/docker-compose.yml")
    ;;
  dev)
    COMPOSE_ARGS=(
      --project-directory "$ROOT_DIR/deploy"
      -f "$ROOT_DIR/deploy/compose.yml"
      -f "$ROOT_DIR/deploy/compose.build.yml"
      -f "$ROOT_DIR/compose.dev.yml"
    )
    export QJUDGE_VERSION=dev QJUDGE_BUILD_ENV=development
    ;;
  test)
    COMPOSE_ARGS=(-f "$ROOT_DIR/docker-compose.test.yml")
    ;;
```

最後一行改為：

```bash
exec "$DOCKER_BIN" compose "${COMPOSE_ARGS[@]}" "$@"
```

- [ ] **Step 3: 驗證 dev overlay 設定**

以範本產生暫時的 env 驗證合併結果（不啟動服務）：

```bash
tmp_env="$(mktemp)"
sed -e 's/^QJUDGE_PUBLIC_ORIGIN=$/QJUDGE_PUBLIC_ORIGIN=http:\/\/localhost:5173/' deploy/.env.example > "$tmp_env"
echo "COMPOSE_PROJECT_NAME=online_judge" >> "$tmp_env"
QJUDGE_VERSION=dev QJUDGE_BUILD_ENV=development docker compose --project-directory deploy --env-file "$tmp_env" \
  -f deploy/compose.yml -f deploy/compose.build.yml -f compose.dev.yml config > /tmp/qjudge-dev-config.yml && echo "config ok"
grep -nE "^name:|online_judge_postgres_data|name: online_judge_default|/app$|5173:5173" /tmp/qjudge-dev-config.yml | head -20
rm -f "$tmp_env"
```

Expected: `config ok`；`name: online_judge`；volume 名稱 `online_judge_postgres_data`；network 為 `online_judge_default`（不是 external 的 `qjudge`）；backend 有 `../backend` 對應 `/app`；frontend 只發布 `127.0.0.1:5173:5173`（沒有 8080）。若 `networks: default: !reset {}` 未讓 network 變回 project 內建，改為：

```yaml
networks:
  default: !override
    name: ${COMPOSE_PROJECT_NAME:-qjudge}_default
```

並重新驗證。

- [ ] **Step 4: Commit**

```bash
git add compose.dev.yml .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh
git commit -m "feat(dev): run local dev on deploy/compose.yml with a dev overlay" -- compose.dev.yml .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh
```

---

### Task 10: 本地 dev 切換

此 task 會重建本地 dev 容器。**不可使用 `down -v`，不可刪除任何 volume。** 由 controller（非 subagent）執行，每一步確認後再往下。

**Files:**
- Create（本機、不 commit）：`deploy/.env`；移動 `secrets/` → `deploy/secrets/`

- [ ] **Step 1: 記錄切換前的資料基準**

```bash
docker compose -f docker-compose.dev.yml exec -T backend python manage.py shell -c "from django.contrib.auth import get_user_model as g; from apps.contests.models import Contest; print('users', g().objects.count(), 'contests', Contest.objects.count())"
```

記下數字。（Task 9 之後 `qjudge-dc.sh dev` 已指向新檔案，所以這一步直接用舊的 `docker-compose.dev.yml`。）

- [ ] **Step 2: 產生 `deploy/.env`**

從根目錄 `.env` 轉出 schema 內的 key，補上 dev 預設密碼與模式。腳本不輸出任何值：

```bash
python3 - <<'EOF'
import pathlib, sys
sys.path.insert(0, "deploy")
from qjudge_cli.envfile import load
from qjudge_cli.schema import KEYS_BY_NAME

old = load(pathlib.Path(".env"))
new = {name: old[name] for name in KEYS_BY_NAME if old.get(name)}
new.setdefault("POSTGRES_ADMIN_PASSWORD", "qjudge_admin_dev")
new.setdefault("DB_PASSWORD", "qjudge_web_dev")
new.setdefault("AI_DB_PASSWORD", "qjudge_ai_dev")
new.setdefault("CREDENTIAL_LEASE_SECRET", "dev-credential-lease-secret-change-me")
new.setdefault("QJUDGE_PUBLIC_ORIGIN", "http://localhost:5173")
new["COMPOSE_PROJECT_NAME"] = "online_judge"
new["STORAGE_MODE"] = "external"
new.setdefault("OBJECT_STORAGE_BUCKET", "qjudge")
# The dev LiveKit container is treated as an existing server, so no TURN keys are needed.
if old.get("LIVE_MONITORING_ENABLED", "").lower() in {"1", "true", "yes", "on"}:
    new["MEDIA_MODE"] = "external"
profiles = []
if old.get("TUNNEL_TOKEN"):
    profiles.append("tunnel")
if new.get("MEDIA_MODE"):
    profiles.append("live-monitoring")
if profiles:
    new["COMPOSE_PROFILES"] = ",".join(profiles)
target = pathlib.Path("deploy/.env")
if target.exists():
    raise SystemExit("deploy/.env already exists; not overwriting")
target.write_text("".join(f"{k}={v}\n" for k, v in new.items()))
target.chmod(0o600)
print("wrote deploy/.env with keys:", ", ".join(sorted(new)))
EOF
deploy/qjudge check --env-file deploy/.env
```

Expected: `deploy/.env: OK`。若 `check` 回報缺少的 key，依訊息從根目錄 `.env` 或舊 compose 的 dev 預設值補上後重跑。印出 `QJUDGE_PUBLIC_ORIGIN` 的值請使用者確認（非機密）：`grep '^QJUDGE_PUBLIC_ORIGIN=' deploy/.env`。

- [ ] **Step 3: 確認 DB 密碼與既有 role 一致**

既有 volume 的 role 密碼是舊 dev 設定的值。以新 `.env` 的密碼直連測試：

```bash
set -a; . deploy/.env; set +a
docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD="$DB_PASSWORD" postgres psql -h 127.0.0.1 -U qjudge_web -d online_judge -tAc "select 1"
docker compose -f docker-compose.dev.yml exec -T -e PGPASSWORD="$AI_DB_PASSWORD" postgres psql -h 127.0.0.1 -U qjudge_ai -d qjudge_ai -tAc "select 1"
```

Expected: 兩行 `1`。失敗時代表 `.env` 的密碼與既有 role 不同，改回根目錄 `.env` 或舊 compose 預設的值。

- [ ] **Step 4: 移動 secrets 並停掉舊 dev（不加 -v）**

```bash
docker compose -f docker-compose.dev.yml down
mv secrets deploy/secrets
docker network create qjudge 2>/dev/null || true
```

- [ ] **Step 5: 以新設定啟動**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps --format '{{.Service}}\t{{.State}}\t{{.Status}}'
docker volume ls --format '{{.Name}}' | grep '^online_judge_postgres_data$'
```

Expected: 服務皆 running（一次性服務 exited 0）；沒有新建 `qjudge_postgres_data`。

- [ ] **Step 6: 驗證**

```bash
DC=.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh
curl -s -o /dev/null -w 'backend %{http_code}\n' http://127.0.0.1:8000/api/health/
curl -s -o /dev/null -w 'vite %{http_code}\n' http://127.0.0.1:5173/api/health/
curl -s http://127.0.0.1:8001/health/ready; echo
$DC dev exec -T backend python manage.py shell -c "from django.db import connection; from django.contrib.auth import get_user_model as g; from apps.contests.models import Contest; print(connection.settings_dict['HOST'], 'users', g().objects.count(), 'contests', Contest.objects.count())"
$DC dev exec -T -e PGPASSWORD="$(grep '^DB_PASSWORD=' deploy/.env | cut -d= -f2-)" pgbouncer psql -h 127.0.0.1 -p 5432 -U qjudge_web -d online_judge -tAc "select current_database()"
$DC dev exec -T celery celery -A config inspect ping --timeout 5 | tail -2
$DC dev logs --since 2m ai-migrate | tail -5
```

Expected: backend 200、vite 200；AI `{"status":"ready",...}`；DB host `pgbouncer`，users／contests 與 Step 1 相同；pgbouncer 查詢回 `online_judge`；celery 回 pong；ai-migrate 無錯誤（證明 alembic 與 checkpoint setup 可經 pgbouncer 執行）。

- [ ] **Step 7: 回報**

回報上述輸出。根目錄 `.env` 保留不動（舊流程與其他 worktree 可能使用），`deploy/.env` 與 `deploy/secrets/` 不 commit。

---

## 完成條件

- `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy` 通過；`deploy/qjudge lint-compose deploy/compose.yml` 無輸出。
- backend `test_deploy_settings.py`、ai-service `test_deploy_config.py`、mcp-server `test_config.py` 通過。
- `docker compose ... config` 對 prod 形狀與 dev overlay 皆成功。
- 本地 dev 以新檔案運作，資料筆數與切換前相同，DB 連線經 pgbouncer。
- 舊 `docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.test.yml` 與 `deploy-prod.sh` 未修改。
