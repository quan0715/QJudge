# Deploy Overhaul 06：刪除舊部署、init／upgrade／rollback 與 CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 dev 刪除舊部署檔案；`deploy/qjudge` 新增 `init`（產生 `.env`）、`upgrade <ref>`（build → 備份 → migrate → up → 健康檢查，失敗自動回到上一版）與 `rollback`；CD 改為 SSH 到 dcslab 執行 `deploy/qjudge upgrade <sha>`。

**Architecture:** 主機上的 repo checkout 就是部署來源：`upgrade` 以 `git checkout --detach <ref>` 切換程式碼，以 `QJUDGE_VERSION=sha-<12>` build 並啟動 image，把目前與上一版 SHA 寫進 `deploy/.version`。image 保留最近 3 版，DB 備份保留最近 10 份，DB 不自動還原。`init` 以 schema 決定要問的 key：產生機密，依 storage／media 模式補上 bundled 預設值，只詢問仍缺的必填 key（`--non-interactive` 時改為列出缺漏）。所有指令共用一個組 compose 指令的 helper，subprocess 以可注入的 runner 執行，單元測試不需要 Docker。

**Tech Stack:** Python 標準函式庫（argparse、subprocess、secrets、urllib、json）、Docker Compose v2、git、GitHub Actions（Tailscale SSH）。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md` §2（最後清理清單）、§9、§10

**計畫系列：** 01–05b（完成）→ **06（本文件）** → 07 CI E2E 全新安裝、刪除 test compose、文件與 skill → 08 dcslab 轉換。

**決定（2026-09-26 使用者確認）：** 舊部署檔案在 dev 直接刪除，包含使用者在 `docker-compose.yml`、`docker-compose.dev.yml`、`scripts/deploy-prod.sh`、`scripts/setup-env.sh`、根目錄 `.env.example` 的未提交修改。main 保留原檔，dcslab 的 hotfix 與現行 CD（手動、只跑 main）不受影響。未追蹤的檔案一律不動（`scripts/livekit/vps/`、`docker-compose.migration.yml`、`scripts/qjudge-deploy.py`、`scripts/migrate_s3_to_minio.py`、`scripts/staging-ip.nginx.conf`、`scripts/tests/test_compose_topology.py`、`scripts/tests/test_deployment_doctor.py`、`docs/operations/*`）。`docker-compose.test.yml`、`frontend/Dockerfile.e2e` 與 E2E workflow 保留到 plan 07。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| 舊部署檔（刪除） | 見 Task 1 清單 |
| `deploy/bootstrap/bootstrap_ai_oauth_keys.py`、`deploy/bootstrap/bootstrap_integrity_secrets.py`（由 `scripts/` 移入） | compose 的一次性機密產生服務 |
| `deploy/qjudge_cli/stack.py`（新增） | app compose 指令、network、runner 型別 |
| `deploy/qjudge_cli/init.py`（新增） | `init` |
| `deploy/qjudge_cli/release.py`（新增） | `upgrade`、`rollback`、備份與 image 清理 |
| `deploy/qjudge_cli/addon.py`、`cli.py`（修改） | 共用 `stack.py`；新增子指令 |
| `.github/workflows/cd-prod.yml`（修改） | SSH 執行 `deploy/qjudge upgrade` |
| `.gitignore`（修改） | `deploy/.env`、`deploy/secrets/`、`deploy/backups/`、`deploy/.version`（確認已有） |

---

### Task 1: 刪除舊部署檔案

**Files:** 見下方清單。

- [ ] **Step 1: 盤點引用**

對下列每個路徑執行 `git grep -n "<檔名>" -- ':!docs/superpowers'`，記錄引用它的檔案。**刪除清單**（只刪已追蹤檔；使用者未提交的修改一併丟棄）：

- `docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.monitoring.yml`、`monitoring/`
- `loadtest/docker-compose.loadtest.yml`（`loadtest/` 下的 Locust 腳本保留）
- `scripts/livekit/` 內已追蹤的檔案（`render_config.py`、`render-config.py`、`test_render_config.py` 等；未追蹤的 `scripts/livekit/vps/` 不動）
- `scripts/db/bootstrap-ai-database.sh`
- `scripts/deploy-prod.sh`、`scripts/setup-env.sh`、`scripts/prepare-prod-release-env.py`、`scripts/check-compose-config.sh`
- 根目錄 `.env.example`

**搬移**：`scripts/bootstrap_ai_oauth_keys.py`、`scripts/bootstrap_integrity_secrets.py` → `deploy/bootstrap/`（`git mv`），`deploy/compose.yml` 的兩個 bootstrap 服務掛載路徑改為 `./bootstrap/<檔名>`。

**保留到 plan 07**：`docker-compose.test.yml`、`frontend/Dockerfile.e2e`、`.github/workflows/e2e-*.yml` 與 `ci.yml` 中使用 test compose 的 job。若清單中的檔案被 `docker-compose.test.yml` 或這些 job 使用（例如 `scripts/db/bootstrap-ai-database.sh` 被 test compose 掛載），該檔保留並在回報中列出。

`backend/config/settings/loadtest.py`：若刪除 overlay 後只剩文件引用，一併刪除；若 `seed_loadtest_data` 等程式仍 import，保留並回報。

- [ ] **Step 2: 刪除與搬移**

```bash
git rm -r --quiet docker-compose.yml docker-compose.dev.yml docker-compose.monitoring.yml monitoring loadtest/docker-compose.loadtest.yml scripts/db/bootstrap-ai-database.sh scripts/deploy-prod.sh scripts/setup-env.sh scripts/prepare-prod-release-env.py scripts/check-compose-config.sh .env.example
git rm -r --quiet $(git ls-files scripts/livekit)
mkdir -p deploy/bootstrap
git mv scripts/bootstrap_ai_oauth_keys.py deploy/bootstrap/bootstrap_ai_oauth_keys.py
git mv scripts/bootstrap_integrity_secrets.py deploy/bootstrap/bootstrap_integrity_secrets.py
```

（`git rm` 對有未提交修改的檔案需要 `-f`；這 5 個檔案的修改依使用者決定丟棄，對它們改用 `git rm -f`。Step 1 若決定保留某檔，從指令中移除。）

- [ ] **Step 3: 修正引用**

1. `deploy/compose.yml`：bootstrap 掛載改為 `./bootstrap/bootstrap_ai_oauth_keys.py:/bootstrap/bootstrap_ai_oauth_keys.py:ro` 與 `./bootstrap/bootstrap_integrity_secrets.py:/bootstrap/bootstrap_integrity_secrets.py:ro`。`docker-compose.test.yml` 若掛載舊路徑，同步改為 `./deploy/bootstrap/...`。
2. `.github/workflows/ci.yml`：
   - `on.push.paths`／`on.pull_request.paths` 移除已刪檔案（`docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.monitoring.yml` 等）。
   - 移除 `bash -n scripts/deploy-prod.sh scripts/check-compose-config.sh` 這類針對已刪腳本的步驟。
   - `integrity-service-unit` job 以 `docker compose -f docker-compose.dev.yml config` 產生 contract 的步驟：改用新 stack（`docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml -f compose.dev.yml config --format json`，並以 `QJUDGE_VERSION=ci` 設定），或該 contract 只驗舊 compose 時連同對應測試刪除；以 `integrity-service/tests/` 的實際斷言決定，回報選擇。
3. `Makefile`：刪除 `loadtest`、`loadtest-build`、`loadtest-down` 與 help 中對應行；其他引用已刪檔案的 target 一併處理。
4. `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh`：移除 `main` 環境（production 操作改用 `deploy/qjudge`），usage 同步；`references/environment-matrix.md` 移除 `main` 列並註明 production 由 `deploy/qjudge` 管理。`CLAUDE.md` 的 wrapper 用法 `<main|dev|test>` 改為 `<dev|test>`，並加一行「production 形狀的操作使用 `deploy/qjudge`」。
5. 測試：刪除只驗證已刪檔案的測試。
   - `ai-service/tests/contract/`：`test_compose_boundaries.py`、`test_setup_env.py`、`test_live_compose_flow.py`、`test_deployment_docs.py` 中斷言舊檔的部分；整檔只為舊檔存在就刪檔，混有 test compose 斷言的保留該部分。
   - `scripts/tests/` 已追蹤的 `test_release_workflows.py`、`test_livekit_compose_contract.py` 等：依斷言對象同樣處理（未追蹤的測試檔不動）。
   - `integrity-service/tests/test_dev_resident_compose.py` 若讀 `docker-compose.dev.yml`：改讀新 stack 的 `config` 輸出或刪除，回報。
6. 最後 `git grep -n -E "docker-compose\.(yml|dev\.yml|monitoring\.yml)|deploy-prod\.sh|setup-env\.sh|prepare-prod-release-env|check-compose-config|bootstrap-ai-database|scripts/livekit|scripts/bootstrap_" -- ':!docs/superpowers' ':!frontend/public/docs'` 只應剩 plan 07 會改寫的公開文件以外的零筆結果（`frontend/public/docs` 由 plan 07 改寫）。

- [ ] **Step 4: 驗證**

```bash
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
deploy/qjudge lint-compose deploy/compose.yml deploy/addons/storage/compose.yml deploy/addons/media/compose.yml
QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml config --quiet
docker compose -f docker-compose.test.yml config --quiet
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config --quiet
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d ai-oauth-bootstrap integrity-bootstrap
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps -a --format '{{.Service}}\t{{.Status}}' | grep bootstrap
```

另跑受影響的測試目錄（ai-service contract 剩餘部分、scripts/tests、integrity-service tests）。Expected：全部通過；bootstrap 服務 `Exited (0)`（既有機密不會被覆寫）。

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(deploy): remove the legacy compose files and deploy scripts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <所有刪除、搬移與修改的路徑>
```

---

### Task 2: 共用 stack helper 與 `init`

**Files:**
- Create: `deploy/qjudge_cli/stack.py`、`deploy/qjudge_cli/init.py`、`deploy/qjudge_cli/tests/test_init.py`
- Modify: `deploy/qjudge_cli/addon.py`、`deploy/qjudge_cli/cli.py`、`deploy/qjudge_cli/tests/test_addon.py`

- [ ] **Step 1: `stack.py`（把 addon 的 network 與 project 名稱移過來）**

```python
"""Compose commands for the QJudge application stack."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Callable

from .schema import Env

NETWORK = "qjudge"
Runner = Callable[..., subprocess.CompletedProcess]


def compose_project(env: Env) -> str:
    return env.get("COMPOSE_PROJECT_NAME", "").strip() or "qjudge"


def app_compose(deploy_dir: Path, env_file: Path, env: Env) -> list[str]:
    return [
        "docker", "compose", "--project-name", compose_project(env),
        "--project-directory", str(deploy_dir), "--env-file", str(env_file),
        "-f", str(deploy_dir / "compose.yml"), "-f", str(deploy_dir / "compose.build.yml"),
    ]


def ensure_network(run: Runner) -> None:
    if run(["docker", "network", "inspect", NETWORK], capture_output=True).returncode != 0:
        run(["docker", "network", "create", NETWORK], check=True)
```

`addon.py` 改為從 `stack.py` import `NETWORK`、`compose_project`、`ensure_network`、`Runner`，刪除自己的副本；`run_addon` 內的 network 兩行改為 `ensure_network(run)`。`test_addon.py` 的 import 依此調整（行為不變，既有測試應全過）。

- [ ] **Step 2: Write the failing tests** — `deploy/qjudge_cli/tests/test_init.py`

```python
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from qjudge_cli.check import check_env
from qjudge_cli.envfile import load
from qjudge_cli.init import build_env, run_init

ORIGIN = {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu"}
BUNDLED = {**ORIGIN, "STORAGE_MODE": "bundled", "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://files.example.edu"}


def no_docker(args, **kwargs):
    return type("Result", (), {"returncode": 0})()


class InitTests(unittest.TestCase):
    def test_bundled_storage_needs_only_origin_and_public_url(self):
        env = build_env(BUNDLED)
        self.assertEqual(check_env(env), [])
        self.assertEqual(env["OBJECT_STORAGE_ENDPOINT_URL"], "http://minio:9000")
        self.assertGreaterEqual(len(env["OBJECT_STORAGE_SECRET_KEY"]), 8)

    def test_generated_secrets_differ_and_pass_password_rules(self):
        env = build_env(BUNDLED)
        passwords = [env[k] for k in ("POSTGRES_ADMIN_PASSWORD", "DB_PASSWORD", "AI_DB_PASSWORD")]
        self.assertEqual(len(set(passwords)), 3)
        self.assertEqual(check_env(env), [])

    def test_given_values_are_kept(self):
        env = build_env({**BUNDLED, "DB_PASSWORD": "chosen-password", "OBJECT_STORAGE_BUCKET": "files"})
        self.assertEqual(env["DB_PASSWORD"], "chosen-password")
        self.assertEqual(env["OBJECT_STORAGE_BUCKET"], "files")

    def test_bundled_media_gets_livekit_keys(self):
        env = build_env({**BUNDLED, "MEDIA_MODE": "bundled"})
        self.assertTrue(env["LIVEKIT_API_KEY"])
        self.assertTrue(env["LIVEKIT_API_SECRET"])

    def test_interactive_asks_only_missing_required_keys(self):
        asked = []
        answers = {"QJUDGE_PUBLIC_ORIGIN": "https://judge.example.edu", "STORAGE_MODE": "bundled",
                   "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://files.example.edu"}

        def ask(key):
            asked.append(key.name)
            return answers.get(key.name, "")

        env = build_env({}, ask=ask)
        self.assertEqual(check_env(env), [])
        self.assertNotIn("DB_PASSWORD", asked)
        self.assertNotIn("OBJECT_STORAGE_ENDPOINT_URL", asked)
        self.assertIn("STORAGE_MODE", asked)

    def test_writes_private_env_and_refuses_to_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            deploy = Path(directory)
            env_file = deploy / ".env"
            with redirect_stdout(io.StringIO()):
                self.assertEqual(run_init(deploy, env_file, BUNDLED, interactive=False, run=no_docker), 0)
                self.assertEqual(env_file.stat().st_mode & 0o777, 0o600)
                self.assertEqual(check_env(load(env_file)), [])
                self.assertTrue((deploy / "secrets" / "integrity").is_dir())
                self.assertEqual(run_init(deploy, env_file, BUNDLED, interactive=False, run=no_docker), 1)

    def test_non_interactive_reports_missing_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            deploy = Path(directory)
            output = io.StringIO()
            with redirect_stdout(output):
                code = run_init(deploy, deploy / ".env", ORIGIN, interactive=False, run=no_docker)
            self.assertEqual(code, 1)
            self.assertIn("STORAGE_MODE", output.getvalue())
            self.assertFalse((deploy / ".env").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `test_init` import ERROR。

- [ ] **Step 4: Implement** — `deploy/qjudge_cli/init.py`

```python
"""Create deploy/.env for a new installation."""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import Callable, Mapping

from .check import check_env
from .envfile import write_private
from .schema import KEYS, Env, Key
from .stack import Runner, ensure_network

Ask = Callable[[Key], str]

GENERATED = {
    "SECRET_KEY": lambda: secrets.token_urlsafe(50),
    "POSTGRES_ADMIN_PASSWORD": lambda: secrets.token_urlsafe(24),
    "DB_PASSWORD": lambda: secrets.token_urlsafe(24),
    "AI_DB_PASSWORD": lambda: secrets.token_urlsafe(24),
    "CREDENTIAL_LEASE_SECRET": lambda: secrets.token_urlsafe(32),
}
# Optional keys worth offering during an interactive setup.
OFFERED = ("MEDIA_MODE", "FRONTEND_BIND_ADDRESS", "QJUDGE_TRUSTED_PROXIES")


def _mode_defaults(env: Env) -> dict[str, Callable[[], str]]:
    defaults: dict[str, Callable[[], str]] = {}
    if env.get("STORAGE_MODE") == "bundled":
        defaults.update({
            "OBJECT_STORAGE_ENDPOINT_URL": lambda: "http://minio:9000",
            "OBJECT_STORAGE_ACCESS_KEY": lambda: "qjudge",
            "OBJECT_STORAGE_SECRET_KEY": lambda: secrets.token_urlsafe(24),
            "OBJECT_STORAGE_BUCKET": lambda: "qjudge",
        })
    if env.get("MEDIA_MODE") == "bundled":
        defaults.update({
            "LIVEKIT_API_KEY": lambda: secrets.token_hex(16),
            "LIVEKIT_API_SECRET": lambda: secrets.token_urlsafe(32),
        })
    return defaults


def _fill(env: Env, makers: Mapping[str, Callable[[], str]]) -> None:
    for name, make in makers.items():
        if not env.get(name, "").strip():
            env[name] = make()


def build_env(values: Mapping[str, str], ask: Ask | None = None) -> Env:
    """Return values plus generated secrets and mode defaults; ask() fills
    the required keys that remain empty (and offers a few optional ones)."""
    env = {name: value.strip() for name, value in values.items()}
    _fill(env, GENERATED)
    offered = False
    while True:
        _fill(env, _mode_defaults(env))
        missing = [key for key in KEYS if key.is_required(env) and not env.get(key.name, "").strip()]
        if ask is None:
            return env
        if missing:
            env[missing[0].name] = ask(missing[0]).strip()
            continue
        if offered:
            return env
        offered = True
        for key in KEYS:
            if key.name in OFFERED and not env.get(key.name, "").strip():
                env[key.name] = ask(key).strip()


def render_env(env: Env) -> str:
    lines = ["# Generated by `deploy/qjudge init`; see deploy/.env.example for every key."]
    lines += [f"{key.name}={env[key.name]}" for key in KEYS if env.get(key.name, "").strip()]
    return "\n".join(lines) + "\n"


def _prompt(key: Key) -> str:
    return input(f"{key.name}: {key.help}\n> ")


def run_init(
    deploy_dir: Path,
    env_file: Path,
    values: Mapping[str, str],
    interactive: bool,
    run: Runner,
    ask: Ask = _prompt,
) -> int:
    if env_file.exists():
        print(f"{env_file} already exists; edit it and run `deploy/qjudge check`")
        return 1
    env = build_env(values, ask if interactive else None)
    problems = check_env(env)
    for problem in problems:
        print(problem)
    if problems:
        return 1
    (deploy_dir / "secrets" / "integrity").mkdir(parents=True, exist_ok=True)
    write_private(env_file, render_env(env))
    ensure_network(run)
    print(f"Wrote {env_file}")
    if env.get("STORAGE_MODE") == "bundled":
        print("Next: deploy/qjudge addon storage up && deploy/qjudge addon storage init")
    if env.get("MEDIA_MODE") == "bundled":
        print("Next: deploy/qjudge addon media up")
    print("Then: deploy/qjudge ingress, and deploy/qjudge upgrade <git ref>")
    return 0
```

（`Key.is_required(env)` 依 schema 現有 API；若名稱不同，依實際 API 調整。）

`cli.py` 加入：

```python
    init_parser = commands.add_parser("init", help="create deploy/.env for a new installation")
    init_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    init_parser.add_argument("--non-interactive", action="store_true", help="fail instead of asking for missing keys")
    init_parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE", help="preset a key")
```

分派：

```python
    if args.command == "init":
        values = dict(item.split("=", 1) for item in args.set)
        return run_init(DEPLOY_DIR, args.env_file, values, not args.non_interactive, subprocess.run)
```

（`--set` 沒有 `=` 時以 argparse error 回報：`parser.error(f"--set expects KEY=VALUE: {item}")`。）

- [ ] **Step 5: Run tests to verify they pass**

```bash
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
deploy/qjudge init --env-file /tmp/qjudge-init-check.env --non-interactive --set QJUDGE_PUBLIC_ORIGIN=https://judge.example.edu --set STORAGE_MODE=bundled --set OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://files.example.edu
deploy/qjudge check --env-file /tmp/qjudge-init-check.env
rm /tmp/qjudge-init-check.env
```

Expected：unittest OK；init 寫出檔案（會 `docker network inspect qjudge`，本地已存在）；check OK。

- [ ] **Step 6: Commit**

```bash
git add deploy/qjudge_cli/stack.py deploy/qjudge_cli/init.py deploy/qjudge_cli/tests/test_init.py
git commit -m "feat(deploy): add qjudge init to create deploy/.env" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/qjudge_cli/stack.py deploy/qjudge_cli/init.py deploy/qjudge_cli/addon.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/tests/test_init.py deploy/qjudge_cli/tests/test_addon.py
```

---

### Task 3: `upgrade` 與 `rollback`

**Files:**
- Create: `deploy/qjudge_cli/release.py`、`deploy/qjudge_cli/tests/test_release.py`
- Modify: `deploy/qjudge_cli/cli.py`

**行為（spec §9）：**

`upgrade <ref>`：
1. `git -C <repo> fetch --tags --prune origin`（失敗只印警告並繼續，ref 可能已在本地），記下目前 `HEAD` 為 `before`；`git checkout --detach <ref>`，取得 `sha` 與 `version = "sha-" + sha[:12]`。
2. `check_env(load(.env))`；有錯 → checkout 回 `before`，exit 1。
3. `ensure_network`；judge image：`docker pull ghcr.io/quan0715/qjudge/judge:latest` 成功就 `docker tag` 為 `oj-judge:latest`；失敗且本機沒有 `oj-judge:latest` 時 `docker build -t oj-judge:latest -f backend/judge/Dockerfile.judge backend/judge`。
4. `QJUDGE_VERSION=<version> <app_compose> build`；失敗 → checkout 回 `before`，exit 1。
5. `<app_compose> up -d postgres pgbouncer redis`，等待 postgres healthy（輪詢 `ps --format json` 的 `Health`，上限 120 秒）。
6. 備份：`deploy/backups/<UTC yyyymmddTHHMMSSZ>-<sha12>/online_judge.dump` 與 `qjudge_ai.dump`，內容來自 `<app_compose> exec -T postgres pg_dump -U qjudge_admin -d <db> -Fc`（stdout 寫檔，檔案 0600）；只保留最近 10 個備份目錄。失敗 → checkout 回 `before`，exit 1。
7. `QJUDGE_VERSION=<version> <app_compose> run --rm` 依序執行 `ai-oauth-bootstrap`、`integrity-bootstrap`（`up` 會先建立所有容器再啟動，而 `integrity-resident` bind mount 的機密檔只由 `integrity-bootstrap` 產生，全新安裝必須先跑）、`migrate`、`ai-migrate`；失敗 → checkout 回 `before`，exit 1（此時 app 服務仍是舊版）。
8. `QJUDGE_VERSION=<version> <app_compose> up -d --remove-orphans`。
9. 健康檢查（上限 300 秒）：`backend`、`ai-service`、`integrity-resident` 的 `Health` 皆為 `healthy`，且 `GET http://<FRONTEND_BIND_ADDRESS 或 127.0.0.1>:<FRONTEND_PORT 或 8080>/api/health/`（`Host` 為 origin 的 host）回 200。
10. 失敗（8 或 9）→ `.version` 有 `current` 時：checkout 回該 SHA 並以 `QJUDGE_VERSION=sha-<current12>` `up -d --remove-orphans`；沒有（第一次安裝）則只 checkout 回 `before`。印出最新備份路徑與 `pg_restore` 指令提示，exit 1。
11. 成功 → 寫 `.version`（`current=<sha>`、`previous=<舊 current>`，第一次安裝沒有 previous）；清理 image：每個 `qjudge/<name>` repository 只保留最近 3 個 `sha-*` tag（依 `docker image ls --format '{{.Tag}}\t{{.CreatedAt}}'` 排序），`docker image rm` 失敗（仍被使用）時略過。

`rollback`：讀 `.version`，沒有 `previous` → exit 1。`git checkout --detach <previous>`，`QJUDGE_VERSION=sha-<previous12> up -d --remove-orphans`，健康檢查；成功則 `.version` 的 current／previous 對調。不還原 DB，印出最新備份與 `pg_restore --clean --dbname <db> <dump>` 提示。

`.version` 格式：

```
current=<40-char sha>
previous=<40-char sha>
```

**實作要點：** `release.py` 內所有外部指令經由注入的 `run`（`subprocess.run` 相容）執行；需要 stdout 的呼叫傳 `capture_output=True, text=True`；compose 指令以 `env={**os.environ, "QJUDGE_VERSION": version}` 傳版本。等待與 HTTP 檢查以可注入的 `sleep`／`http_status` 函式實作，測試時替換。`repo = deploy_dir.parent`。

- [ ] **Step 1: Write the failing tests** — `deploy/qjudge_cli/tests/test_release.py`

用一個假的 runner 記錄每個指令，依指令前綴回傳結果：

```python
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from qjudge_cli.release import read_version, rollback, upgrade
from qjudge_cli.tests.test_check import VALID

OLD = "a" * 40
NEW = "b" * 40


class FakeHost:
    """Answers docker/git commands; fail_on marks a command prefix to fail."""

    def __init__(self, head=OLD, fail_on=(), healthy=True):
        self.head = head
        self.fail_on = fail_on
        self.healthy = healthy
        self.calls = []

    def __call__(self, args, **kwargs):
        self.calls.append((list(args), kwargs.get("env", {}).get("QJUDGE_VERSION")))
        joined = " ".join(args)
        code, out = 0, ""
        if any(prefix in joined for prefix in self.fail_on):
            code = 1
        elif args[:2] == ["git", "-C"] and "checkout" in args:
            self.head = NEW if args[-1] == "v2" else args[-1]
        elif args[:2] == ["git", "-C"] and "rev-parse" in args:
            out = self.head + "\n"
        elif "ps" in args and "--format" in args:
            state = "healthy" if self.healthy else "unhealthy"
            out = "\n".join(json.dumps({"Service": s, "Health": state})
                            for s in ("postgres", "backend", "ai-service", "integrity-resident"))
        elif "pg_dump" in args:
            out = "dump"
        return type("Result", (), {"returncode": code, "stdout": out, "stderr": ""})()


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.deploy = Path(self.directory.name) / "deploy"
        self.deploy.mkdir()
        self.env_file = self.deploy / ".env"
        self.env_file.write_text("".join(f"{k}={v}\n" for k, v in VALID.items()))

    def tearDown(self):
        self.directory.cleanup()

    def _upgrade(self, host, http=200):
        with redirect_stdout(io.StringIO()):
            return upgrade(self.deploy, self.env_file, "v2", run=host, sleep=lambda s: None,
                           http_status=lambda url, host_header: http)

    def test_upgrade_builds_migrates_and_records_versions(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        host = FakeHost()
        self.assertEqual(self._upgrade(host), 0)
        versions = {v for _, v in host.calls if v}
        self.assertEqual(versions, {"sha-" + NEW[:12]})
        order = [" ".join(c) for c, _ in host.calls]
        build = next(i for i, c in enumerate(order) if c.endswith(" build"))
        migrate = next(i for i, c in enumerate(order) if "run --rm migrate" in c)
        up_all = next(i for i, c in enumerate(order) if "--remove-orphans" in c)
        self.assertLess(build, migrate)
        self.assertLess(migrate, up_all)
        self.assertEqual(read_version(self.deploy), {"current": NEW, "previous": OLD})
        self.assertEqual(len(list((self.deploy / "backups").iterdir())), 1)

    def test_build_failure_restores_checkout_without_touching_services(self):
        host = FakeHost(fail_on=(" build",))
        self.assertEqual(self._upgrade(host), 1)
        self.assertEqual(host.head, OLD)
        self.assertFalse(any("--remove-orphans" in " ".join(c) for c, _ in host.calls))

    def test_health_failure_brings_back_previous_version(self):
        (self.deploy / ".version").write_text(f"current={OLD}\n")
        host = FakeHost()
        self.assertEqual(self._upgrade(host, http=502), 1)
        self.assertEqual(host.head, OLD)
        last_up = [v for c, v in host.calls if "--remove-orphans" in c][-1]
        self.assertEqual(last_up, "sha-" + OLD[:12])
        self.assertEqual(read_version(self.deploy), {"current": OLD})

    def test_backups_keep_ten(self):
        backups = self.deploy / "backups"
        for index in range(12):
            (backups / f"20260101T0000{index:02d}Z-old").mkdir(parents=True)
        self.assertEqual(self._upgrade(FakeHost()), 0)
        self.assertEqual(len(list(backups.iterdir())), 10)

    def test_rollback_swaps_versions(self):
        (self.deploy / ".version").write_text(f"current={NEW}\nprevious={OLD}\n")
        host = FakeHost(head=NEW)
        with redirect_stdout(io.StringIO()):
            code = rollback(self.deploy, self.env_file, run=host, sleep=lambda s: None,
                            http_status=lambda url, host_header: 200)
        self.assertEqual(code, 0)
        self.assertEqual(host.head, OLD)
        self.assertEqual(read_version(self.deploy), {"current": OLD, "previous": NEW})

    def test_rollback_without_previous_fails(self):
        (self.deploy / ".version").write_text(f"current={NEW}\n")
        with redirect_stdout(io.StringIO()):
            code = rollback(self.deploy, self.env_file, run=FakeHost(), sleep=lambda s: None,
                            http_status=lambda url, host_header: 200)
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
```

（`FakeHost` 的 checkout 行為：`checkout --detach v2` 讓 HEAD 變成 `NEW`，`checkout --detach <sha>` 讓 HEAD 變成該 sha。實作時 git 指令一律用 `git -C <repo> ...` 形式，讓 fake 能辨識。實作若需要調整 fake 的比對方式，保持測試意圖不變。）

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `test_release` import ERROR。

- [ ] **Step 3: Implement** `release.py`（依上方行為），`cli.py` 加入：

```python
    upgrade_parser = commands.add_parser("upgrade", help="build, back up, migrate and start a git ref")
    upgrade_parser.add_argument("ref")
    upgrade_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    rollback_parser = commands.add_parser("rollback", help="start the previously deployed version again")
    rollback_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
```

分派呼叫 `upgrade(DEPLOY_DIR, args.env_file, args.ref)`／`rollback(DEPLOY_DIR, args.env_file)`（預設參數為 `subprocess.run`、`time.sleep`、以 `urllib.request` 實作的 `http_status`）。`.env` 不存在時印出並 exit 1。

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: OK。

- [ ] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/release.py deploy/qjudge_cli/tests/test_release.py
git commit -m "feat(deploy): add qjudge upgrade and rollback" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/qjudge_cli/release.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/tests/test_release.py
```

---

### Task 4: CD 改用 `deploy/qjudge upgrade`

**Files:**
- Modify: `.github/workflows/cd-prod.yml`

- [ ] **Step 1: 改寫部署步驟**

保留觸發條件（`workflow_dispatch`、只在 `main` 且 `confirm_production`）、secrets 檢查、`Verify release CI`、`Connect to Tailscale`。刪除 `Upload deploy script` 步驟；`Deploy on server` 改為：

```yaml
      - name: Deploy on server
        env:
          PROD_SSH_HOST: ${{ secrets.PROD_SSH_HOST }}
          PROD_SSH_USER: ${{ secrets.PROD_SSH_USER }}
          PROD_DEPLOY_PATH: ${{ secrets.PROD_DEPLOY_PATH }}
          DEPLOY_SHA: ${{ steps.sha.outputs.sha }}
        run: |
          tailscale ssh "$PROD_SSH_USER@$PROD_SSH_HOST" \
            "cd '$PROD_DEPLOY_PATH' && git fetch --tags --prune origin && git checkout --detach '$DEPLOY_SHA' && deploy/qjudge upgrade '$DEPLOY_SHA'"
```

（先 checkout 再執行，確保跑的是該版本的 CLI；`upgrade` 內的 checkout 為同一 SHA。）若 `Checkout` 步驟只為了上傳腳本而存在，一併刪除。

- [ ] **Step 2: 驗證 workflow 語法**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/cd-prod.yml'))" 2>/dev/null || ruby -ryaml -e "YAML.load_file('.github/workflows/cd-prod.yml')"
git grep -n "deploy-prod" -- .github
```

Expected：YAML 可解析；`.github` 內不再引用 `deploy-prod`。此 workflow 只在 main 手動執行，dev 上的修改在 plan 08 前不會被使用。

- [ ] **Step 3: Commit**

```bash
git commit -m "ci(cd): deploy with deploy/qjudge upgrade" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- .github/workflows/cd-prod.yml
```

---

### Task 5: 本地全新安裝與 upgrade／rollback 實測

不動 dev stack（project `online_judge`）。在一個獨立 worktree 以 project `qjudge-e2e` 安裝，完成後完全移除。

- [ ] **Step 1: 準備 worktree 與 storage**

```bash
WT=/private/tmp/qjudge-e2e-wt
git worktree add --detach "$WT" HEAD~1
lsof -nP -iTCP:8080 -sTCP:LISTEN || echo "8080 free"
```

storage 使用 dev 的 MinIO（external 模式，容器經 `host.docker.internal:9000` 連線），先以 dev MinIO 建立 bucket `qjudge-e2e`：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T minio sh -c 'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mb --ignore-existing local/qjudge-e2e'
```

- [ ] **Step 2: init（non-interactive）**

以 dev `deploy/.env` 的 MinIO 帳密（只在 shell 變數中傳遞，不印出）：

```bash
eval "$(python3 - <<'PY'
import shlex, sys
from pathlib import Path
sys.path.insert(0, "deploy")
from qjudge_cli.envfile import load
env = load(Path("deploy/.env"))
print(f"export E2E_KEY={shlex.quote(env['OBJECT_STORAGE_ACCESS_KEY'])} E2E_SECRET={shlex.quote(env['OBJECT_STORAGE_SECRET_KEY'])}")
PY
)"
"$WT/deploy/qjudge" init --non-interactive \
  --set COMPOSE_PROJECT_NAME=qjudge-e2e \
  --set QJUDGE_PUBLIC_ORIGIN=http://localhost:8080 \
  --set STORAGE_MODE=external \
  --set OBJECT_STORAGE_ENDPOINT_URL=http://host.docker.internal:9000 \
  --set OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://localhost:9000 \
  --set OBJECT_STORAGE_ACCESS_KEY="$E2E_KEY" --set OBJECT_STORAGE_SECRET_KEY="$E2E_SECRET" \
  --set OBJECT_STORAGE_BUCKET=qjudge-e2e \
  --set HOST_PROJECT_ROOT="$WT"
```

（此時 HEAD 為 Task 4 的 commit、HEAD~1 為 Task 3 的 commit，兩者都有 `init`／`upgrade`。）

- [ ] **Step 3: 第一次 upgrade（全新安裝，版本 A = HEAD~1）**

```bash
"$WT/deploy/qjudge" upgrade "$(git rev-parse HEAD~1)"
cat "$WT/deploy/.version"
curl -s -o /dev/null -w 'site %{http_code}\n' http://127.0.0.1:8080/
curl -s -o /dev/null -w 'api %{http_code}\n' -H 'Host: localhost:8080' http://127.0.0.1:8080/api/health/
```

Expected：exit 0；`.version` 只有 `current=<A>`；site 200、api 200；`deploy/backups/` 有一個目錄。


- [ ] **Step 4: 第二次 upgrade（版本 B = HEAD）與 rollback**

```bash
"$WT/deploy/qjudge" upgrade "$(git rev-parse HEAD)"
cat "$WT/deploy/.version"
"$WT/deploy/qjudge" rollback
cat "$WT/deploy/.version"
curl -s -o /dev/null -w 'api %{http_code}\n' -H 'Host: localhost:8080' http://127.0.0.1:8080/api/health/
docker image ls 'qjudge/backend' --format '{{.Tag}}'
```

Expected：upgrade 後 `current=B previous=A`；rollback 後 `current=A previous=B`，api 200；`qjudge/backend` 有 `sha-<A12>`、`sha-<B12>` 與 dev 的 `dev` tag；backups 兩個。

- [ ] **Step 5: 失敗路徑（健康檢查失敗會回到上一版）**

在 worktree 內建立一個只存在本地、讓 backend 無法變成 healthy 的 commit C（build 與 migrate 仍會成功），確認 `upgrade C` 會回到目前版本：

```bash
git -C "$WT" checkout --detach "$(git rev-parse HEAD~1)"
python3 - "$WT/deploy/compose.yml" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
text = path.read_text()
old = 'command: ["sh", "-c", "python manage.py collectstatic --noinput && daphne -b 0.0.0.0 -p 8000 config.asgi:application"]'
assert old in text
path.write_text(text.replace(old, 'command: ["sh", "-c", "exit 1"]'))
PY
git -C "$WT" commit -q -m "e2e: broken backend" -- deploy/compose.yml
C=$(git -C "$WT" rev-parse HEAD)
git -C "$WT" checkout --detach "$(sed -n 's/^current=//p' "$WT/deploy/.version")"
"$WT/deploy/qjudge" upgrade "$C"; echo "exit $?"
cat "$WT/deploy/.version"
curl -s -o /dev/null -w 'api %{http_code}\n' -H 'Host: localhost:8080' http://127.0.0.1:8080/api/health/
```

Expected：exit 1；`.version` 不變（current=A）；api 200（已回到 A）。commit C 只存在於本機 object，不在任何 branch。

- [ ] **Step 6: 清除**

```bash
docker compose -p qjudge-e2e --project-directory "$WT/deploy" --env-file "$WT/deploy/.env" -f "$WT/deploy/compose.yml" -f "$WT/deploy/compose.build.yml" down -v --remove-orphans
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^qjudge/.+:sha-' | xargs -r docker image rm
git worktree remove --force "$WT"
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T minio sh -c 'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc rb --force local/qjudge-e2e'
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps --format '{{.Service}}\t{{.Status}}' | sort
```

`down -v` 只對 `qjudge-e2e` project（一次性測試環境），不得用於 `online_judge`。Expected：dev stack 各服務狀態與測試前相同。

- [ ] **Step 7: 記錄結果**

在本計畫檔尾加一段「驗證結果」，記錄實際執行的版本、指令結果與偏差，commit：

```bash
git commit -m "docs(plan): record plan 06 local install and upgrade results" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/superpowers/plans/2026-09-26-deploy-overhaul-06-init-upgrade-cd.md
```

---

## 完成條件

- 舊部署檔案已從 dev 移除，CI 設定與測試不再引用它們（`docker-compose.test.yml` 與 E2E 保留到 plan 07）。
- `deploy/qjudge init`、`upgrade <ref>`、`rollback` 有單元測試；本地以獨立 project 完成全新安裝、upgrade、rollback 與失敗回復的實測。
- CD workflow 改為 `deploy/qjudge upgrade <sha>`。
- dev stack 與其資料不受影響。
