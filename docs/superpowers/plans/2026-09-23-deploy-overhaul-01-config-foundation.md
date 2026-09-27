# Deploy Overhaul 01：設定基礎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立設定管理的基礎：app 讀 env 時空字串視為未設定、CLI schema、`qjudge check` 驗證、由 schema 產生 `deploy/.env.example`，並接進 CI。

**Architecture:** backend 新增 `config/env.py` 單一讀取函式並替換 settings 內所有 `os.getenv`；ai-service 以 pydantic-settings 的 `env_ignore_empty` 達成相同語意。`deploy/qjudge` 是只用 Python 標準函式庫的 CLI，schema 是一份 `Key` 清單，`check` 與 `env-example` 都從它衍生。本計畫不改 compose 與部署流程，現有部署不受影響。

**Tech Stack:** Python 3.11 標準函式庫（CLI、unittest）、Django settings、pydantic-settings、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md`

## 計畫系列

本 spec 拆成下列計畫，依序執行，每份完成後系統可運作：

1. **設定基礎**（本文件）：env helper、schema、`check`、`.env.example`。
2. Compose 與 DB 重組：`deploy/compose.yml`、build／dev overlay、network、pgbouncer／postgres 設定、連線 URL、initdb、compose lint、app env 瘦身與 origin 推導。
3. Gateway 與 `ingress`。
4. Storage 簡化與 storage／media addon。
5. `init`、`upgrade`、`rollback` 與 CD。
6. CI E2E 全新安裝、刪除 test compose、文件與 skill。
7. dcslab 轉換與舊檔案清理。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `backend/config/env.py`（新增） | `env(name, default=None)`：讀取 env，空白與空字串回傳 default |
| `backend/apps/core/tests/test_env_helper.py`（新增） | env helper 測試 |
| `backend/config/settings/{base,prod,dev,test,database}.py`（修改） | 所有 env 讀取改用 `env()`；seccomp 停用改用明確開關 |
| `ai-service/config.py`（修改） | `env_ignore_empty=True` |
| `ai-service/tests/test_config.py`（修改） | 空字串不覆蓋預設的測試 |
| `deploy/qjudge`（新增，可執行） | CLI 入口 |
| `deploy/qjudge_cli/__init__.py`（新增） | package 標記 |
| `deploy/qjudge_cli/envfile.py`（新增） | 解析 `.env` |
| `deploy/qjudge_cli/schema.py`（新增） | `Key` 定義與完整 key 清單 |
| `deploy/qjudge_cli/check.py`（新增） | 依 schema 驗證 env，回傳錯誤清單 |
| `deploy/qjudge_cli/example.py`（新增） | 由 schema 產生 `.env.example` 內容 |
| `deploy/qjudge_cli/cli.py`（新增） | argparse：`check`、`env-example` |
| `deploy/qjudge_cli/tests/*`（新增） | unittest |
| `deploy/.env.example`（新增，產生） | 部署設定範本 |
| `.gitignore`（修改） | 忽略 `deploy/backups/`、`deploy/.version` |
| `.github/workflows/ci.yml`（修改） | 執行 CLI 測試 |

---

### Task 1: backend env helper

**Files:**
- Create: `backend/config/env.py`
- Test: `backend/apps/core/tests/test_env_helper.py`

- [ ] **Step 1: Write the failing test**

`backend/apps/core/tests/test_env_helper.py`：

```python
from config.env import env

KEY = "QJUDGE_TEST_ENV_HELPER"


def test_env_returns_default_when_unset(monkeypatch):
    monkeypatch.delenv(KEY, raising=False)

    assert env(KEY, "fallback") == "fallback"


def test_env_returns_none_without_default(monkeypatch):
    monkeypatch.delenv(KEY, raising=False)

    assert env(KEY) is None


def test_env_treats_empty_string_as_unset(monkeypatch):
    monkeypatch.setenv(KEY, "")

    assert env(KEY, "fallback") == "fallback"


def test_env_treats_whitespace_as_unset(monkeypatch):
    monkeypatch.setenv(KEY, "   ")

    assert env(KEY, "fallback") == "fallback"


def test_env_returns_stripped_value(monkeypatch):
    monkeypatch.setenv(KEY, "  value  ")

    assert env(KEY, "fallback") == "value"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_env_helper.py -q`
Expected: FAIL，`ModuleNotFoundError: No module named 'config.env'`

- [ ] **Step 3: Write minimal implementation**

`backend/config/env.py`：

```python
"""Read environment variables, treating empty values as unset."""

import os


def env(name: str, default: str | None = None) -> str | None:
    """Return the stripped value of ``name``; empty or missing returns ``default``.

    Compose passes unset optional keys as empty strings, so an empty value must
    not override the application's default.
    """
    value = os.environ.get(name, "").strip()
    return value if value else default
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_env_helper.py -q`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/config/env.py backend/apps/core/tests/test_env_helper.py
git commit -m "feat(backend): add env helper that treats empty values as unset"
```

---

### Task 2: settings 改用 env helper

**Files:**
- Modify: `backend/config/settings/base.py`、`prod.py`、`dev.py`、`test.py`、`database.py`
- Test: `backend/apps/core/tests/test_env_helper.py`（新增 seccomp 測試）

- [ ] **Step 1: Write the failing test**

在 `backend/apps/core/tests/test_env_helper.py` 加入以下內容（import 移到檔案頂端既有 import 旁，其餘接在檔案末尾）。它以子程序載入 settings，確認舊的「空字串停用 seccomp」不再生效、新的明確開關生效：

```python
import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _load_seccomp_profile(extra_env: dict[str, str]) -> str | None:
    environment = os.environ.copy()
    environment.pop("DOCKER_SECCOMP_PROFILE", None)
    environment.pop("DOCKER_SECCOMP_DISABLED", None)
    environment.update(extra_env)
    script = (
        "import json\n"
        "from config.settings import base\n"
        "print(json.dumps(base.DOCKER_SECCOMP_PROFILE))\n"
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


def test_empty_seccomp_profile_keeps_default_profile():
    profile = _load_seccomp_profile({"DOCKER_SECCOMP_PROFILE": ""})

    assert profile is not None
    assert profile.endswith("seccomp_profiles/cpp.json")


def test_seccomp_can_be_disabled_explicitly():
    assert _load_seccomp_profile({"DOCKER_SECCOMP_DISABLED": "true"}) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_env_helper.py -q`
Expected: 2 failed（空字串目前會把 profile 設成 `None`；`DOCKER_SECCOMP_DISABLED` 尚未支援）

- [ ] **Step 3: 以 codemod 替換 settings 的 env 讀取**

從 repository 根目錄執行：

```bash
python3 - <<'EOF'
import pathlib
import re

root = pathlib.Path("backend/config/settings")
for name in ("base.py", "prod.py", "dev.py", "test.py", "database.py"):
    path = root / name
    text = path.read_text()
    text = re.sub(r"\bos\.(?:getenv|environ\.get)\(", "env(", text)
    import_line = "from config.env import env\n"
    if import_line not in text:
        if re.search(r"\bos\.", text):
            text = text.replace("import os\n", "import os\n" + import_line, 1)
        else:
            text = text.replace("import os\n", import_line, 1)
    path.write_text(text)
EOF
```

- [ ] **Step 4: 改寫 seccomp 停用邏輯**

在 `backend/config/settings/base.py` 找到：

```python
# 如果環境變數明確停用，則設為 None
if env("DOCKER_SECCOMP_PROFILE") == "":
    DOCKER_SECCOMP_PROFILE = None
```

替換為：

```python
# DOCKER_SECCOMP_DISABLED=true disables the seccomp profile.
if _env_truthy("DOCKER_SECCOMP_DISABLED"):
    DOCKER_SECCOMP_PROFILE = None
```

- [ ] **Step 5: 確認 settings 內已無直接 env 讀取**

Run: `grep -nE "os\.(getenv|environ)" backend/config/settings/*.py`
Expected: 無輸出

- [ ] **Step 6: Run tests and Django check**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend pytest apps/core/tests/test_env_helper.py apps/core/tests/test_public_origin_settings.py -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py check
```

Expected: 所有測試 passed；`System check identified no issues`

- [ ] **Step 7: Commit**

```bash
git add backend/config/settings backend/apps/core/tests/test_env_helper.py
git commit -m "refactor(backend): read settings env through env helper"
```

---

### Task 3: ai-service 忽略空字串 env

**Files:**
- Modify: `ai-service/config.py`（`model_config`）
- Test: `ai-service/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

在 `ai-service/tests/test_config.py` 末尾加入：

```python
def test_empty_env_value_keeps_field_default(monkeypatch):
    monkeypatch.setenv("APP_NAME", "")

    settings = Settings(_env_file=None)

    assert settings.app_name == "AI Service"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service pytest tests/test_config.py -q`
Expected: 1 failed，`assert '' == 'AI Service'`

- [ ] **Step 3: Write minimal implementation**

在 `ai-service/config.py` 的 `Settings.model_config` 加入 `env_ignore_empty=True`：

```python
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )
```

`settings_customise_sources` 已以 `model_config.get("env_ignore_empty")` 傳給自訂 source，不需其他修改。

- [ ] **Step 4: Run test to verify it passes**

Run: `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service pytest tests/test_config.py -q`
Expected: 全部 passed

- [ ] **Step 5: Commit**

```bash
git add ai-service/config.py ai-service/tests/test_config.py
git commit -m "fix(ai): ignore empty env values so defaults apply"
```

---

### Task 4: CLI 骨架與 `.env` 解析

**Files:**
- Create: `deploy/qjudge`、`deploy/qjudge_cli/__init__.py`、`deploy/qjudge_cli/envfile.py`
- Create: `deploy/qjudge_cli/tests/__init__.py`、`deploy/qjudge_cli/tests/test_envfile.py`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing test**

`deploy/qjudge_cli/tests/__init__.py`：空檔案。

`deploy/qjudge_cli/__init__.py`：

```python
"""QJudge deployment CLI."""
```

`deploy/qjudge_cli/tests/test_envfile.py`：

```python
import unittest

from qjudge_cli.envfile import parse


class ParseTests(unittest.TestCase):
    def test_reads_key_values(self):
        self.assertEqual(parse("A=1\nB=two\n"), {"A": "1", "B": "two"})

    def test_skips_comments_and_blank_lines(self):
        self.assertEqual(parse("# note\n\n# A=1\nB=2\n"), {"B": "2"})

    def test_strips_matching_quotes(self):
        self.assertEqual(parse("A=\"x y\"\nB='z'\n"), {"A": "x y", "B": "z"})

    def test_keeps_equals_in_value(self):
        self.assertEqual(parse("A=b=c\n"), {"A": "b=c"})

    def test_accepts_export_prefix(self):
        self.assertEqual(parse("export A=1\n"), {"A": "1"})

    def test_empty_value_is_kept_as_empty_string(self):
        self.assertEqual(parse("A=\n"), {"A": ""})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: ERROR，`ModuleNotFoundError: No module named 'qjudge_cli.envfile'`

- [ ] **Step 3: Write minimal implementation**

`deploy/qjudge_cli/envfile.py`：

```python
"""Parse simple KEY=VALUE .env files."""

from __future__ import annotations

from pathlib import Path


def parse(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def load(path: Path) -> dict[str, str]:
    return parse(path.read_text(encoding="utf-8"))
```

`deploy/qjudge`：

```python
#!/usr/bin/env python3
"""QJudge deployment CLI entry point."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from qjudge_cli.cli import main  # noqa: E402

raise SystemExit(main())
```

Run: `chmod +x deploy/qjudge`

在 `.gitignore` 的 `# Docker` 區塊末尾（`.env.next` 之後）加入：

```gitignore
deploy/backups/
deploy/.version
```

（`*.env` 已忽略 `deploy/.env`，`secrets/` 已忽略 `deploy/secrets/`。）

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `Ran 6 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add deploy/qjudge deploy/qjudge_cli/__init__.py deploy/qjudge_cli/envfile.py deploy/qjudge_cli/tests .gitignore
git commit -m "feat(deploy): add qjudge CLI skeleton and .env parser"
```

---

### Task 5: schema

**Files:**
- Create: `deploy/qjudge_cli/schema.py`
- Test: `deploy/qjudge_cli/tests/test_schema.py`

- [ ] **Step 1: Write the failing test**

`deploy/qjudge_cli/tests/test_schema.py`：

```python
import unittest

from qjudge_cli.schema import FEATURES, KEYS, KEYS_BY_NAME


class SchemaTests(unittest.TestCase):
    def test_key_names_are_unique(self):
        names = [key.name for key in KEYS]
        self.assertEqual(len(names), len(set(names)))

    def test_every_key_uses_a_known_feature(self):
        for key in KEYS:
            self.assertIn(key.feature, FEATURES, key.name)

    def test_every_key_has_help(self):
        for key in KEYS:
            self.assertTrue(key.help, key.name)

    def test_storage_credentials_are_always_required(self):
        key = KEYS_BY_NAME["OBJECT_STORAGE_ACCESS_KEY"]
        self.assertTrue(key.is_required({}))

    def test_livekit_keys_required_only_when_media_enabled(self):
        key = KEYS_BY_NAME["LIVEKIT_API_KEY"]
        self.assertFalse(key.is_required({}))
        self.assertFalse(key.is_required({"MEDIA_MODE": "disabled"}))
        self.assertTrue(key.is_required({"MEDIA_MODE": "external"}))
        self.assertTrue(key.is_required({"MEDIA_MODE": "bundled"}))

    def test_bundled_media_keys_required_only_when_bundled(self):
        key = KEYS_BY_NAME["LIVEKIT_NODE_IP"]
        self.assertFalse(key.is_required({"MEDIA_MODE": "external"}))
        self.assertTrue(key.is_required({"MEDIA_MODE": "bundled"}))

    def test_tunnel_token_required_when_profile_enabled(self):
        key = KEYS_BY_NAME["TUNNEL_TOKEN"]
        self.assertFalse(key.is_required({"COMPOSE_PROFILES": ""}))
        self.assertTrue(key.is_required({"COMPOSE_PROFILES": "tunnel"}))

    def test_oauth_secret_required_when_client_id_set(self):
        key = KEYS_BY_NAME["GITHUB_OAUTH_CLIENT_SECRET"]
        self.assertFalse(key.is_required({}))
        self.assertTrue(key.is_required({"GITHUB_OAUTH_CLIENT_ID": "abc"}))

    def test_generated_secrets_are_marked_secret(self):
        for name in ("SECRET_KEY", "DB_PASSWORD", "AI_DB_PASSWORD", "POSTGRES_ADMIN_PASSWORD"):
            self.assertTrue(KEYS_BY_NAME[name].secret, name)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: ERROR，`No module named 'qjudge_cli.schema'`

- [ ] **Step 3: Write minimal implementation**

`deploy/qjudge_cli/schema.py`：

```python
"""The single list of keys a deployer sets in deploy/.env."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Union

Env = Mapping[str, str]
Requirement = Union[bool, Callable[[Env], bool]]


@dataclass(frozen=True)
class Key:
    name: str
    feature: str
    help: str
    required: Requirement = False
    secret: bool = False

    def is_required(self, env: Env) -> bool:
        if callable(self.required):
            return bool(self.required(env))
        return self.required


FEATURES = ("core", "storage", "media", "ai", "oauth", "smtp", "mcp", "tunnel")

FEATURE_TITLES = {
    "core": "Core",
    "storage": "Object storage",
    "media": "Live monitoring (LiveKit)",
    "ai": "AI providers",
    "oauth": "Third-party login",
    "smtp": "Email",
    "mcp": "Remote MCP",
    "tunnel": "Cloudflare Tunnel",
}


def _media_enabled(env: Env) -> bool:
    return env.get("MEDIA_MODE", "") in {"bundled", "external"}


def _media_bundled(env: Env) -> bool:
    return env.get("MEDIA_MODE", "") == "bundled"


def _profile_enabled(profile: str) -> Callable[[Env], bool]:
    def requirement(env: Env) -> bool:
        profiles = [item.strip() for item in env.get("COMPOSE_PROFILES", "").split(",")]
        return profile in profiles

    return requirement


def _paired_with(other: str) -> Callable[[Env], bool]:
    def requirement(env: Env) -> bool:
        return bool(env.get(other, ""))

    return requirement


def _oauth_pair(provider: str) -> tuple[Key, Key]:
    client_id = f"{provider}_OAUTH_CLIENT_ID"
    client_secret = f"{provider}_OAUTH_CLIENT_SECRET"
    return (
        Key(client_id, "oauth", f"{provider.title()} OAuth client ID.",
            required=_paired_with(client_secret)),
        Key(client_secret, "oauth", f"{provider.title()} OAuth client secret.",
            required=_paired_with(client_id), secret=True),
    )


KEYS: tuple[Key, ...] = (
    # Core
    Key("QJUDGE_PUBLIC_ORIGIN", "core",
        "Origin users open in the browser, e.g. https://judge.example.edu (no path).",
        required=True),
    Key("GATEWAY_BIND_ADDRESS", "core",
        "Address the gateway listens on. Use the VPS private IP when the reverse proxy is on another machine."),
    Key("GATEWAY_PORT", "core", "Port the gateway listens on."),
    Key("QJUDGE_TRUSTED_PROXIES", "core",
        "Comma-separated IPs of the reverse proxy in front of the gateway."),
    Key("COMPOSE_PROJECT_NAME", "core", "Compose project name; keep it unchanged on existing hosts."),
    Key("COMPOSE_PROFILES", "core", "Optional Compose profiles, e.g. tunnel."),
    Key("SECRET_KEY", "core", "Django secret key. Generated by `qjudge init`.",
        required=True, secret=True),
    Key("POSTGRES_ADMIN_PASSWORD", "core",
        "PostgreSQL administrator password (letters and digits). Generated by `qjudge init`.",
        required=True, secret=True),
    Key("DB_PASSWORD", "core",
        "Application database password (letters and digits). Generated by `qjudge init`.",
        required=True, secret=True),
    Key("AI_DB_PASSWORD", "core",
        "AI database password (letters and digits). Generated by `qjudge init`.",
        required=True, secret=True),
    Key("CREDENTIAL_LEASE_SECRET", "core", "AI credential lease secret. Generated by `qjudge init`.",
        required=True, secret=True),
    # Object storage
    Key("STORAGE_MODE", "storage",
        "bundled runs MinIO as a QJudge addon; external uses an existing S3-compatible service.",
        required=True),
    Key("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", "storage",
        "Storage URL reachable from browsers; must be HTTPS when the origin is HTTPS.",
        required=True),
    Key("OBJECT_STORAGE_ENDPOINT_URL", "storage",
        "Storage URL reachable from containers. Written by `qjudge addon storage init` in bundled mode.",
        required=True),
    Key("OBJECT_STORAGE_ACCESS_KEY", "storage",
        "Storage access key. Written by `qjudge addon storage init` in bundled mode.",
        required=True, secret=True),
    Key("OBJECT_STORAGE_SECRET_KEY", "storage",
        "Storage secret key. Written by `qjudge addon storage init` in bundled mode.",
        required=True, secret=True),
    Key("OBJECT_STORAGE_BUCKET", "storage",
        "Bucket name. Written by `qjudge addon storage init` in bundled mode.",
        required=True),
    # Live monitoring
    Key("MEDIA_MODE", "media", "disabled, bundled (LiveKit addon) or external (existing LiveKit)."),
    Key("LIVEKIT_PUBLIC_URL", "media", "LiveKit URL browsers connect to, e.g. wss://live.example.edu.",
        required=_media_enabled),
    Key("LIVEKIT_API_KEY", "media", "LiveKit API key.", required=_media_enabled, secret=True),
    Key("LIVEKIT_API_SECRET", "media", "LiveKit API secret.", required=_media_enabled, secret=True),
    Key("LIVEKIT_NODE_IP", "media", "Public IP LiveKit advertises for media (bundled mode).",
        required=_media_bundled),
    Key("LIVEKIT_TURN_HOST", "media", "DNS-only TURN hostname (bundled mode).",
        required=_media_bundled),
    Key("LIVEKIT_TURN_SECRET", "media", "TURN shared secret (bundled mode).",
        required=_media_bundled, secret=True),
    # AI providers
    Key("OPENAI_API_KEY", "ai", "OpenAI API key.", secret=True),
    Key("OPENAI_BASE_URL", "ai", "OpenAI-compatible base URL override."),
    Key("DEEPSEEK_API_KEY", "ai", "DeepSeek API key.", secret=True),
    Key("DEEPSEEK_BASE_URL", "ai", "DeepSeek base URL override."),
    Key("VLLM_API_KEY", "ai", "Self-hosted vLLM API key.", secret=True),
    Key("VLLM_BASE_URL", "ai", "Self-hosted vLLM OpenAI-compatible URL."),
    # Third-party login
    *_oauth_pair("NYCU"),
    *_oauth_pair("GITHUB"),
    *_oauth_pair("GOOGLE"),
    # Email
    Key("EMAIL_HOST_USER", "smtp", "SMTP username.", required=_paired_with("EMAIL_HOST_PASSWORD")),
    Key("EMAIL_HOST_PASSWORD", "smtp", "SMTP password.",
        required=_paired_with("EMAIL_HOST_USER"), secret=True),
    # Remote MCP
    Key("QJUDGE_REMOTE_MCP_ENABLED", "mcp", "true exposes /mcp for external MCP clients."),
    # Cloudflare Tunnel
    Key("TUNNEL_TOKEN", "tunnel", "Cloudflare Tunnel token; required when COMPOSE_PROFILES includes tunnel.",
        required=_profile_enabled("tunnel"), secret=True),
)

KEYS_BY_NAME: dict[str, Key] = {key.name: key for key in KEYS}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/schema.py deploy/qjudge_cli/tests/test_schema.py
git commit -m "feat(deploy): define deployment key schema"
```

---

### Task 6: `check`

**Files:**
- Create: `deploy/qjudge_cli/check.py`
- Test: `deploy/qjudge_cli/tests/test_check.py`

- [ ] **Step 1: Write the failing test**

`deploy/qjudge_cli/tests/test_check.py`：

```python
import unittest

from qjudge_cli.check import check_env

VALID = {
    "QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu",
    "SECRET_KEY": "s3cret-value",
    "POSTGRES_ADMIN_PASSWORD": "Admin123",
    "DB_PASSWORD": "Web123",
    "AI_DB_PASSWORD": "Ai123",
    "CREDENTIAL_LEASE_SECRET": "lease-secret",
    "STORAGE_MODE": "bundled",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://files.example.edu",
    "OBJECT_STORAGE_ENDPOINT_URL": "http://minio:9000",
    "OBJECT_STORAGE_ACCESS_KEY": "access",
    "OBJECT_STORAGE_SECRET_KEY": "secret",
    "OBJECT_STORAGE_BUCKET": "qjudge",
}


def with_changes(**changes):
    env = dict(VALID)
    for key, value in changes.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    return env


def error_keys(env):
    return [error.split(":", 1)[0] for error in check_env(env)]


class CheckTests(unittest.TestCase):
    def test_valid_env_has_no_errors(self):
        self.assertEqual(check_env(VALID), [])

    def test_missing_required_key(self):
        self.assertEqual(error_keys(with_changes(SECRET_KEY=None)), ["SECRET_KEY"])

    def test_empty_required_key_counts_as_missing(self):
        self.assertEqual(error_keys(with_changes(SECRET_KEY="")), ["SECRET_KEY"])

    def test_unknown_key_is_reported(self):
        self.assertEqual(error_keys(with_changes(FRONTEND_PORT="8080")), ["FRONTEND_PORT"])

    def test_origin_must_not_have_path(self):
        env = with_changes(QJUDGE_PUBLIC_ORIGIN="https://judge.example.edu/app")
        self.assertEqual(error_keys(env), ["QJUDGE_PUBLIC_ORIGIN"])

    def test_origin_must_use_http_or_https(self):
        env = with_changes(QJUDGE_PUBLIC_ORIGIN="judge.example.edu")
        self.assertEqual(error_keys(env), ["QJUDGE_PUBLIC_ORIGIN"])

    def test_public_storage_must_be_https_when_origin_is_https(self):
        env = with_changes(OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="http://files.example.edu")
        self.assertEqual(error_keys(env), ["OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"])

    def test_public_storage_may_be_http_when_origin_is_http(self):
        env = with_changes(
            QJUDGE_PUBLIC_ORIGIN="http://10.0.0.5:8080",
            OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="http://10.0.0.5:9000",
        )
        self.assertEqual(check_env(env), [])

    def test_storage_mode_must_be_known(self):
        self.assertEqual(error_keys(with_changes(STORAGE_MODE="s3")), ["STORAGE_MODE"])

    def test_db_passwords_must_be_alphanumeric(self):
        env = with_changes(DB_PASSWORD="has@symbol", AI_DB_PASSWORD="ok123")
        self.assertEqual(error_keys(env), ["DB_PASSWORD"])

    def test_media_external_requires_livekit_keys(self):
        env = with_changes(MEDIA_MODE="external")
        self.assertEqual(
            error_keys(env),
            ["LIVEKIT_PUBLIC_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
        )

    def test_livekit_url_accepts_wss(self):
        env = with_changes(
            MEDIA_MODE="external",
            LIVEKIT_PUBLIC_URL="wss://live.example.edu",
            LIVEKIT_API_KEY="key",
            LIVEKIT_API_SECRET="secret",
        )
        self.assertEqual(check_env(env), [])

    def test_media_mode_must_be_known(self):
        self.assertEqual(error_keys(with_changes(MEDIA_MODE="local")), ["MEDIA_MODE"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: ERROR，`No module named 'qjudge_cli.check'`

- [ ] **Step 3: Write minimal implementation**

`deploy/qjudge_cli/check.py`：

```python
"""Validate a deployment env against the schema."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from .schema import KEYS, KEYS_BY_NAME, Env

ENUMS = {
    "STORAGE_MODE": ("bundled", "external"),
    "MEDIA_MODE": ("disabled", "bundled", "external"),
}
HTTP_URL_KEYS = {
    "OBJECT_STORAGE_ENDPOINT_URL",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    "OPENAI_BASE_URL",
    "DEEPSEEK_BASE_URL",
    "VLLM_BASE_URL",
}
URL_SAFE_PASSWORD_KEYS = {"POSTGRES_ADMIN_PASSWORD", "DB_PASSWORD", "AI_DB_PASSWORD"}
ALPHANUMERIC = re.compile(r"[A-Za-z0-9]+")


def check_env(env: Env) -> list[str]:
    """Return one message per problem; an empty list means the env is valid."""
    errors: list[str] = []
    for name in sorted(set(env) - set(KEYS_BY_NAME)):
        errors.append(f"{name}: unknown key; see deploy/.env.example for supported keys")
    for key in KEYS:
        value = env.get(key.name, "").strip()
        if not value:
            if key.is_required(env):
                errors.append(f"{key.name}: required. {key.help}")
            continue
        problem = _value_problem(key.name, value, env)
        if problem:
            errors.append(f"{key.name}: {problem}")
    return errors


def _value_problem(name: str, value: str, env: Env) -> str | None:
    if name in ENUMS and value not in ENUMS[name]:
        return "must be one of " + ", ".join(ENUMS[name])
    if name == "QJUDGE_PUBLIC_ORIGIN":
        return _url_problem(value, ("http", "https"), origin_only=True)
    if name == "LIVEKIT_PUBLIC_URL":
        return _url_problem(value, ("ws", "wss", "http", "https"))
    if name in HTTP_URL_KEYS:
        problem = _url_problem(value, ("http", "https"))
        if problem:
            return problem
        if (
            name == "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"
            and env.get("QJUDGE_PUBLIC_ORIGIN", "").startswith("https://")
            and not value.startswith("https://")
        ):
            return "must use https when QJUDGE_PUBLIC_ORIGIN uses https"
        return None
    if name in URL_SAFE_PASSWORD_KEYS and not ALPHANUMERIC.fullmatch(value):
        return "must contain only letters and digits because it is embedded in a database URL"
    return None


def _url_problem(value: str, schemes: tuple[str, ...], *, origin_only: bool = False) -> str | None:
    try:
        parts = urlsplit(value)
        parts.port
    except ValueError:
        return "is not a valid URL"
    if parts.scheme not in schemes or not parts.hostname:
        return f"must start with {' or '.join(s + '://' for s in schemes)} and include a host"
    if origin_only and (parts.path not in ("", "/") or parts.query or parts.fragment):
        return "must not include a path, query, or fragment"
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/check.py deploy/qjudge_cli/tests/test_check.py
git commit -m "feat(deploy): validate deploy env against the schema"
```

---

### Task 7: `.env.example` 產生與 CLI 指令

**Files:**
- Create: `deploy/qjudge_cli/example.py`、`deploy/qjudge_cli/cli.py`、`deploy/.env.example`
- Test: `deploy/qjudge_cli/tests/test_example.py`、`deploy/qjudge_cli/tests/test_cli.py`

- [ ] **Step 1: Write the failing tests**

`deploy/qjudge_cli/tests/test_example.py`：

```python
import unittest
from pathlib import Path

from qjudge_cli.envfile import parse
from qjudge_cli.example import render
from qjudge_cli.schema import KEYS

EXAMPLE_PATH = Path(__file__).resolve().parents[2] / ".env.example"


class ExampleTests(unittest.TestCase):
    def test_lists_every_key(self):
        text = render()
        for key in KEYS:
            self.assertIn(f"{key.name}=", text)

    def test_only_always_required_keys_are_uncommented(self):
        active = set(parse(render()))
        expected = {key.name for key in KEYS if key.required is True}
        self.assertEqual(active, expected)

    def test_committed_example_matches_schema(self):
        self.assertEqual(
            EXAMPLE_PATH.read_text(encoding="utf-8"),
            render(),
            "deploy/.env.example is stale; run: deploy/qjudge env-example > deploy/.env.example",
        )


if __name__ == "__main__":
    unittest.main()
```

`deploy/qjudge_cli/tests/test_cli.py`：

```python
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from qjudge_cli.cli import main
from qjudge_cli.tests.test_check import VALID


def write_env(directory: str, values: dict[str, str]) -> Path:
    path = Path(directory) / ".env"
    path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
    return path


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        output = io.StringIO()
        with redirect_stdout(output):
            code = main(list(args))
        return code, output.getvalue()

    def test_check_passes_for_valid_env(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_env(directory, VALID)
            code, output = self.run_cli("check", "--env-file", str(path))
        self.assertEqual(code, 0)
        self.assertIn("OK", output)

    def test_check_fails_and_lists_problems(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_env(directory, {**VALID, "SECRET_KEY": ""})
            code, output = self.run_cli("check", "--env-file", str(path))
        self.assertEqual(code, 1)
        self.assertIn("SECRET_KEY: required", output)

    def test_check_fails_when_env_file_is_missing(self):
        code, _ = self.run_cli("check", "--env-file", "/nonexistent/.env")
        self.assertEqual(code, 1)

    def test_env_example_prints_rendered_example(self):
        code, output = self.run_cli("env-example")
        self.assertEqual(code, 0)
        self.assertIn("QJUDGE_PUBLIC_ORIGIN=", output)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: ERROR，`No module named 'qjudge_cli.example'`

- [ ] **Step 3: Write minimal implementation**

`deploy/qjudge_cli/example.py`：

```python
"""Render deploy/.env.example from the schema."""

from __future__ import annotations

from .schema import FEATURE_TITLES, FEATURES, KEYS

HEADER = (
    "# QJudge deployment settings.\n"
    "# Generated by `deploy/qjudge env-example`; edit deploy/qjudge_cli/schema.py instead.\n"
    "# Copy to deploy/.env, fill in values, then run `deploy/qjudge check`.\n"
    "# Commented keys are optional or required only for the feature they belong to."
)


def render() -> str:
    lines = [HEADER]
    for feature in FEATURES:
        lines.append("")
        lines.append(f"# --- {FEATURE_TITLES[feature]} ---")
        for key in KEYS:
            if key.feature != feature:
                continue
            lines.append(f"# {key.help}")
            prefix = "" if key.required is True else "# "
            lines.append(f"{prefix}{key.name}=")
    return "\n".join(lines) + "\n"
```

`deploy/qjudge_cli/cli.py`：

```python
"""Command-line interface for QJudge deployments."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .check import check_env
from .envfile import load
from .example import render

DEPLOY_DIR = Path(__file__).resolve().parent.parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="qjudge")
    commands = parser.add_subparsers(dest="command", required=True)
    check_parser = commands.add_parser("check", help="validate deploy/.env")
    check_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    commands.add_parser("env-example", help="print the .env.example generated from the schema")
    args = parser.parse_args(argv)

    if args.command == "env-example":
        sys.stdout.write(render())
        return 0
    return _check(args.env_file)


def _check(env_file: Path) -> int:
    if not env_file.is_file():
        print(f"{env_file}: not found")
        return 1
    errors = check_env(load(env_file))
    for error in errors:
        print(error)
    if errors:
        print(f"{len(errors)} problem(s) in {env_file}")
        return 1
    print(f"{env_file}: OK")
    return 0
```

產生範本：

Run: `deploy/qjudge env-example > deploy/.env.example`

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `OK`

Run: `deploy/qjudge check --env-file deploy/.env.example; echo "exit=$?"`
Expected: 列出空白必填 key 的錯誤，最後一行 `exit=1`

- [ ] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/example.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/tests/test_example.py deploy/qjudge_cli/tests/test_cli.py deploy/.env.example
git commit -m "feat(deploy): add check and env-example commands"
```

---

### Task 8: CI 執行 CLI 測試

**Files:**
- Modify: `.github/workflows/ci.yml`（`static-checks` job，`Deployment Compose Config Check` 之後；以及 `on.push.paths`／`on.pull_request.paths`）

- [ ] **Step 1: 加入 CI step**

在 `static-checks` job 的 `Deployment Compose Config Check` step 之後加入：

```yaml
      - name: Deploy CLI Tests
        run: python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
```

- [ ] **Step 2: 讓 deploy 目錄的變更觸發 CI**

在 `ci.yml` 的 `on.push.paths` 與 `on.pull_request.paths` 清單（兩處都有 `"ai-service/**"`）各加入一行：

```yaml
      - "deploy/**"
```

- [ ] **Step 3: 本機驗證 workflow 語法與測試**

Run:

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
```

Expected: `yaml ok`；unittest `OK`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run deploy CLI tests"
```

---

## 完成條件

- `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy` 全部通過。
- backend `apps/core/tests/test_env_helper.py`、`test_public_origin_settings.py` 通過，`manage.py check` 無問題。
- ai-service `tests/test_config.py` 通過。
- `grep -nE "os\.(getenv|environ)" backend/config/settings/*.py` 無輸出。
- 現有 `docker-compose.yml` 與部署流程未修改。
