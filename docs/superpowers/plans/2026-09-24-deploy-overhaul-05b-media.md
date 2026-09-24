# Deploy Overhaul 05b：Media addon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 LiveKit 與 coturn 做成獨立、固定 image 版本的 media addon，提供 `qjudge addon media init|up`，並讓 `qjudge ingress` 顯示 WebSocket、媒體與 TURN 入口。

**Architecture:** `MEDIA_MODE=bundled` 時，CLI 將 LiveKit 與 coturn 設定寫入 gitignored 的 `deploy/secrets/`，再以獨立 `qjudge-media` Compose project 啟動。LiveKit 與 coturn 都加入共享 `qjudge` network；LiveKit 透過 `rtc.turn_servers` 廣告 UDP/TCP 3478 與 TLS 443 的獨立 coturn，並提供 `livekit:7880` tunnel upstream。coturn 以 `external-ip` 宣告公開節點 IP；Docker 同埠映射 3478 與 relay traffic，TLS listener 綁在主機 loopback 5349，由既有 HAProxy SNI route 對外提供 443。`external` 與 `disabled` 不執行 bundled addon。

**dcslab 唯讀現況（2026-09-24）：** `qjudge-media` 正在執行 LiveKit `v1.13.7` 與 coturn `4.6.3`；目前兩者用 host network。LiveKit 使用 HTTP 7880、TCP 7881、UDP 50000–50099，coturn 使用 UDP/TCP 3478、UDP relay 50300–50399，外部 HAProxy 另將 TCP 443/TLS 轉到 coturn TLS 5349。現行 Coturn 憑證在 `/etc/letsencrypt/live/qjudge-media/`。app 與執行中服務的 API key／TURN secret 相符，但 `.env` 的 `LIVEKIT_NODE_IP` 與 LiveKit `node_ip` 不同；plan 08 必須在轉換前釐清。05b 只建置與本機驗證，不改 dcslab。

**Review fixes（2026-09-24，取代下文相衝突的描述）：** coturn 改用 project-local `turn` network，不再加入 `qjudge`；設定拒絕所有 relay peer，只允許 `LIVEKIT_NODE_IP`，並關閉 TCP relay、multicast peer 與 CLI。憑證路徑改為 certbot 預設 lineage `/etc/letsencrypt/live/<LIVEKIT_TURN_HOST>/`，`qjudge ingress` 列出 certbot deploy hook 需執行的 coturn restart 命令。`addon media up` 不再 `--force-recreate`，只重建 rendered config 有變動的服務，其餘 `up -d`。實測發現 coturn 會把等於 `external-ip` 的 peer 位址改寫成自己的 relay 位址，因此 bridge network 下 relay 到 `LIVEKIT_NODE_IP` 到不了 LiveKit（加 ACL 前即如此），dcslab 轉換前的 relay-only TURN 測試必須通過。

**Tech Stack:** Python 標準函式庫 CLI、Docker Compose v2、LiveKit Server、coturn。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md` §§2–4、6、8、13。

## Global Constraints

- 機密放在主機 `deploy/.env` 與 `deploy/secrets/`。
- 共用 network 固定名稱 `qjudge`，宣告為 `external: true`；app 與 addon 都掛在這個 network。`init`、`upgrade`、`addon up` 執行前若不存在就建立。
- MinIO、LiveKit、coturn 不在 base。
- MinIO 與 LiveKit/coturn 各自是獨立 compose project，image 固定版本。
- `qjudge upgrade` 不會重啟 addon；addon 用 `qjudge addon <name> up` 啟動或套用新版（image 版本寫在 addon compose）。
- `external` 模式不啟動 addon，只使用 `.env` 的連線設定。
- 第 1 到 7 階段期間，dcslab 仍以舊流程部署 hotfix；app 對舊 key 的 fallback 保留至階段 08。
- 本地 dev 使用 `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev …`；media 容器驗證使用臨時 Compose project、臨時 TLS 憑證和不衝突的 host port，不改動現行 dev 或 dcslab 服務。
- 本地 DB 帳號沒有 CREATEDB，需要 DB 的 backend 測試交給 CI。
- 禁止 `docker compose down -v` 或刪除 volume；保留所有既有未提交修改，只 stage 本計畫明列的檔案。
- 不增加非必要 schema 欄位、防呆或相容機制；不新增 GUIDE／SUMMARY 文件。
- Commit trailer：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

- `MEDIA_MODE=external` 或 `disabled`：`addon media init|up` 不得改 `.env`、產生 bundled config 或執行 Compose。Task 2 對兩種 mode 都測試 init 與 up。
- media 機密缺漏：`init` 只填空值，保留既有 API key／secret 與 TURN secret，以支援既有服務遷移。Task 2 測試。
- media config 寫檔：LiveKit 與 coturn 設定必須含相同 API／TURN secret，檔案權限為 `0600`，命令與標準輸出不得洩漏機密。Task 1、2 測試。
- TURN 與 LiveKit 網路：LiveKit 埠與 coturn relay 埠不得重疊；coturn 必須透過 `external-ip` 和同埠映射接受 3478 UDP/TCP 與 50300–50399 UDP；TLS 5349 只綁 loopback，保留既有 HAProxy TCP 443 SNI route。Task 1、2 測試及 Compose config。
- ingress 模式：bundled 要列出 WebSocket proxy、媒體埠、TURN 埠與 tunnel hostname；external/disabled 不列 bundled 路由。Task 3 測試。

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `deploy/qjudge_cli/media_config.py`（新增） | 產生 LiveKit JSON 與 coturn 設定檔；寫入時限制為 owner-only |
| `deploy/qjudge_cli/envfile.py`（修改） | 只更新指定 `.env` key，保留其他行與註解 |
| `deploy/qjudge_cli/addon.py`、`cli.py`（修改） | media init/up、設定產生與 Compose project 執行 |
| `deploy/addons/media/compose.yml`（新增） | 固定版本 LiveKit + coturn addon |
| `compose.dev.yml`（修改） | 明確標記 dev 繼續使用自己的 LiveKit port range |
| `deploy/qjudge_cli/ingress.py`（修改） | bundled media 的反向代理、tunnel 與 UDP/TCP 入口說明 |
| `deploy/qjudge_cli/tests/test_media_config.py`（新增）、`test_addon.py`、`test_ingress.py`、`test_schema.py`（修改） | config、CLI、ingress 與 schema 行為測試 |
| `deploy/.env.example`、`.github/workflows/ci.yml`（修改） | media schema 說明與 Compose lint/config CI |

---

### Task 1: LiveKit 與 coturn runtime config

**Files:**
- Create: `deploy/qjudge_cli/media_config.py`
- Create: `deploy/qjudge_cli/tests/test_media_config.py`

**Interfaces:**
- Produces: `render_livekit_config(env: Env) -> str`、`render_coturn_config(env: Env) -> str`、`write_media_config(deploy_dir: Path, env: Env) -> tuple[Path, Path]`。
- Runtime file names are `deploy/secrets/livekit.json` and `deploy/secrets/turnserver.conf`; each is written with mode `0600`.

- [x] **Step 1: Write failing tests**

新增 fixture，使用 `LIVEKIT_API_KEY=qjudge-key`、`LIVEKIT_API_SECRET=qjudge-api-secret`、`LIVEKIT_NODE_IP=192.0.2.10`、`LIVEKIT_TURN_HOST=turn.example.test`、`LIVEKIT_TURN_SECRET=qjudge-turn-secret`。測試 JSON 的 `port=7880`、`rtc.tcp_port=7881`、`rtc.port_range_start=50000`、`rtc.port_range_end=50099`、`rtc.node_ip`、`rtc.use_external_ip=false`、API key map 與 `rtc.turn_servers` 內 UDP/TCP 3478 及 TLS 443 coturn host/port/shared-secret 設定（TTL 3600 秒），且不啟用 LiveKit 內建 TURN；測試 coturn 的 3478 listener、5349 TLS listener、`qjudge-media` 憑證路徑、相同 realm/secret、50300–50399 relay range、`external-ip=192.0.2.10`、`proc-user=nobody`、`proc-group=nogroup`，且不將公開 IP 指定為容器內的 `listening-ip` 或 `relay-ip`；測試 `write_media_config` 寫入兩個檔案且 mode 為 `0600`。

- [x] **Step 2: Run tests and verify they fail**

Run: `python3 -m unittest deploy.qjudge_cli.tests.test_media_config -v`

Expected: FAIL，因 `media_config` 尚不存在。

- [x] **Step 3: Implement the minimal renderer**

用標準函式庫 `json.dumps` 輸出 LiveKit JSON；在 `rtc.turn_servers` 加入同一 `LIVEKIT_TURN_HOST` 的 UDP/TCP 3478 server 與 TLS 443 server，皆使用 `LIVEKIT_TURN_SECRET`、TTL 3600；不啟用 LiveKit 內建 TURN。coturn 設定 UDP/TCP 3478、TLS 5349、TLS 1.2+ 與 `qjudge-media` 憑證路徑 `/etc/letsencrypt/live/qjudge-media/{fullchain.pem,privkey.pem}`。不指定 `listening-ip`／`relay-ip`，讓它使用 container network interface；以 `external-ip=LIVEKIT_NODE_IP` 宣告公開節點 IP，並由 Docker 同埠映射轉送 3478 與 relay traffic。啟用 shared-secret authentication，設定 `proc-user=nobody` 與 `proc-group=nogroup`。以 owner-only 權限建立或覆寫 `deploy/secrets/` 內的設定檔。不輸出任何 secret。

- [x] **Step 4: Run tests and verify they pass**

Run: `python3 -m unittest deploy.qjudge_cli.tests.test_media_config -v`

Expected: PASS。

- [x] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/media_config.py deploy/qjudge_cli/tests/test_media_config.py
git commit -m "feat(deploy): render bundled media configuration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/qjudge_cli/media_config.py deploy/qjudge_cli/tests/test_media_config.py
```

### Task 2: Media addon Compose 與 CLI

**Files:**
- Create: `deploy/addons/media/compose.yml`
- Modify: `compose.dev.yml`
- Modify: `deploy/qjudge_cli/envfile.py`、`addon.py`、`cli.py`
- Modify: `deploy/qjudge_cli/tests/test_addon.py`

**Interfaces:**
- Consumes Task 1: `write_media_config(deploy_dir, env)`。
- Produces: `qjudge addon media init` fills only empty `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_TURN_SECRET`; `qjudge addon media up` writes runtime config and runs `docker compose … up -d --force-recreate livekit coturn` under `<COMPOSE_PROJECT_NAME>-media` so file-based config changes take effect.
- `media init` uses `secrets.token_hex`/`secrets.token_urlsafe`; it must not print the generated values.
- `envfile.py` produces `write_values(path: Path, updates: Mapping[str, str]) -> None`, which preserves unrelated lines and writes the updated env file with mode `0600`.

- [x] **Step 1: Write failing tests**

在 `test_addon.py` 加入以下 imports 與 `AddonTests` methods：

```python
from contextlib import redirect_stdout
from io import StringIO
from qjudge_cli.envfile import load
from stat import S_IMODE
from tempfile import TemporaryDirectory
from unittest.mock import patch


    def test_media_up_uses_separate_project_and_starts_both_services(self):
        command = addon_command(DEPLOY, ENV_FILE, "media", "up", "qjudge-app")
        self.assertEqual(command[-5:], ["up", "-d", "--force-recreate", "livekit", "coturn"])
        self.assertEqual(command[command.index("--project-name") + 1], "qjudge-app-media")


    def test_media_init_generates_only_missing_values_and_preserves_existing(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "MEDIA_MODE=bundled\nLIVEKIT_NODE_IP=192.0.2.10\n"
                "LIVEKIT_TURN_HOST=turn.example.test\nLIVEKIT_API_KEY=existing-key\n"
                "# keep this comment\n"
            )
            output = StringIO()
            with patch("qjudge_cli.addon.secrets.token_urlsafe", side_effect=["generated-api", "generated-turn"]), redirect_stdout(output):
                code = run_addon(DEPLOY, env_file, load(env_file), "media", "init")
            values = load(env_file)
            self.assertEqual(code, 0)
            self.assertEqual(values["LIVEKIT_API_KEY"], "existing-key")
            self.assertEqual(values["LIVEKIT_API_SECRET"], "generated-api")
            self.assertEqual(values["LIVEKIT_TURN_SECRET"], "generated-turn")
            self.assertIn("# keep this comment", env_file.read_text())
            self.assertNotIn("generated-api", output.getvalue())
            self.assertNotIn("generated-turn", output.getvalue())
            self.assertEqual(S_IMODE(env_file.stat().st_mode), 0o600)


    def test_media_init_generates_all_empty_credentials(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("MEDIA_MODE=bundled\n")
            output = StringIO()
            with patch("qjudge_cli.addon.secrets.token_hex", return_value="generated-key"), patch(
                "qjudge_cli.addon.secrets.token_urlsafe", side_effect=["generated-api", "generated-turn"]
            ), redirect_stdout(output):
                code = run_addon(DEPLOY, env_file, load(env_file), "media", "init")
            values = load(env_file)
            self.assertEqual(code, 0)
            self.assertEqual(values["LIVEKIT_API_KEY"], "generated-key")
            self.assertEqual(values["LIVEKIT_API_SECRET"], "generated-api")
            self.assertEqual(values["LIVEKIT_TURN_SECRET"], "generated-turn")
            self.assertNotIn("generated-key", output.getvalue())
            self.assertNotIn("generated-api", output.getvalue())
            self.assertNotIn("generated-turn", output.getvalue())


    def test_media_init_refuses_disabled_or_external_mode_without_side_effects(self):
        for mode in ("external", "disabled"):
            with self.subTest(mode=mode), TemporaryDirectory() as directory:
                env_file = Path(directory) / ".env"
                env_file.write_text(f"MEDIA_MODE={mode}\n")
                run = Recorder()
                code = run_addon(DEPLOY, env_file, load(env_file), "media", "init", run=run)
                self.assertEqual(code, 1)
                self.assertEqual(env_file.read_text(), f"MEDIA_MODE={mode}\n")
                self.assertEqual(run.calls, [])


    def test_media_init_preserves_existing_api_and_turn_secrets(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "MEDIA_MODE=bundled\nLIVEKIT_API_KEY=existing-key\n"
                "LIVEKIT_API_SECRET=existing-api-secret\nLIVEKIT_TURN_SECRET=existing-turn-secret\n"
            )
            with patch("qjudge_cli.addon.secrets.token_hex") as token_hex, patch(
                "qjudge_cli.addon.secrets.token_urlsafe"
            ) as token_urlsafe:
                code = run_addon(DEPLOY, env_file, load(env_file), "media", "init")
            values = load(env_file)
            self.assertEqual(code, 0)
            self.assertEqual(values["LIVEKIT_API_KEY"], "existing-key")
            self.assertEqual(values["LIVEKIT_API_SECRET"], "existing-api-secret")
            self.assertEqual(values["LIVEKIT_TURN_SECRET"], "existing-turn-secret")
            token_hex.assert_not_called()
            token_urlsafe.assert_not_called()


    def test_media_up_refuses_external_mode_without_compose(self):
        for mode in ("external", "disabled"):
            with self.subTest(mode=mode), TemporaryDirectory() as directory:
                deploy_dir = Path(directory)
                env_file = deploy_dir / ".env"
                env_file.write_text(f"MEDIA_MODE={mode}\n")
                run = Recorder()
                code = run_addon(deploy_dir, env_file, load(env_file), "media", "up", run=run)
                self.assertEqual(code, 1)
                self.assertEqual(run.calls, [])
                self.assertFalse((deploy_dir / "secrets").exists())
```

另加入 `test_media_up_writes_config_before_compose`：用暫存 deploy dir 與完整 `VALID` + bundled media 值；在 `Recorder` 收到第一個 Compose 命令時斷言兩個 config 已存在且 command 不含 API/TURN secret。加入 `test_media_up_creates_shared_network_before_compose`：令 `Recorder(network_exists=False)`，斷言 network create 發生於 compose up 之前。加入 `test_media_init_updates_last_duplicate_empty_credential`，確保重複 key 會更新最後一個有效 assignment；加入 env writer 的 replace 失敗測試，確認原 `.env` 完整保留且暫存檔清除，以及已存在所有 credentials 時 init 不呼叫 writer。Compose 測試也確認 coturn 以 root 讀取 `0600` config、mount `/etc/letsencrypt`、loopback publish 5349，並由 `proc-user/group` 降權。測試 image reference 固定為 dcslab 已運行且核對過的 LiveKit `v1.13.7@sha256:6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3` 與 coturn `4.6.3@sha256:71c3c990283385567f11794ee692e3a47b66fd9b0bb39e42afbe776e331dd888`。

- [x] **Step 2: Run tests and verify they fail**

Run: `python3 -m unittest deploy.qjudge_cli.tests.test_addon -v`

Expected: FAIL，因 addon 尚未登記 `media`，且 `.env` 尚無指定 key 更新能力。

- [x] **Step 3: Implement media addon**

`deploy/addons/media/compose.yml` 定義獨立 `<COMPOSE_PROJECT_NAME>-media` project；`livekit` 以 `livekit` network alias 加入 external `qjudge`，掛載 `secrets/livekit.json`，HTTP 7880 只綁定 `${FRONTEND_BIND_ADDRESS:-127.0.0.1}`，並公開 TCP 7881、UDP 50000–50099。`coturn` 也加入 external `qjudge`，掛載 `secrets/turnserver.conf` 和主機 `/etc/letsencrypt`（read-only），映射 UDP/TCP 3478、UDP 50300–50399，並只將 TLS 5349 綁在主機 `127.0.0.1` 供現有 HAProxy 使用；外部 TLS 443 route 保持不變。因 image 預設使用 `nobody:nogroup` 而設定檔是 `0600`，容器以 root 啟動讀取設定，再由 Coturn 設定降權回 `nobody:nogroup`。`external-ip` 設為 `LIVEKIT_NODE_IP`，listener/relay 使用 container network interface。兩個 image 使用上方 digest pin。

`compose.dev.yml` 的 LiveKit 維持 dev 專用 config 與 7883/7884、50100–50199 埠，只把過期的「media addon exists」註解改成說明此隔離用途；不要讓 prod addon 的埠套用到 dev project。

`envfile.py` 增加只更新指定 key 的寫入函式，保留其他行、註解與既有非空值；只在值有變動時，以同目錄 `0600` 暫存檔和原子替換更新 `.env`，並更新重複 key 中最後生效的那一行。media `init` 僅適用 `MEDIA_MODE=bundled`，填入缺漏的三個 secret 並限制 `.env` 為 owner-only。media `up` 經 `check_env`，先確保 network、產生 config，再以 addon 專屬 project 執行 `up -d --force-recreate livekit coturn`，讓 bind-mounted runtime config 更新生效。storage 的 `init|up` 行為維持不變。

- [x] **Step 4: Run focused tests**

Run: `python3 -m unittest deploy.qjudge_cli.tests.test_media_config deploy.qjudge_cli.tests.test_addon -v`

Expected: PASS；測試使用暫存 `.env` 與暫存 deploy dir，不讀寫 `deploy/.env` 或正式 `deploy/secrets/`。

- [x] **Step 5: Commit**

```bash
git add deploy/addons/media/compose.yml compose.dev.yml deploy/qjudge_cli/envfile.py deploy/qjudge_cli/addon.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/tests/test_addon.py
git commit -m "feat(deploy): add bundled LiveKit and coturn addon" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/addons/media/compose.yml compose.dev.yml deploy/qjudge_cli/envfile.py deploy/qjudge_cli/addon.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/tests/test_addon.py
```

### Task 3: Media ingress instructions

**Files:**
- Modify: `deploy/qjudge_cli/ingress.py`
- Modify: `deploy/qjudge_cli/tests/test_ingress.py`

**Interfaces:**
- Consumes existing `Env`, `render_ingress`, and `render_nginx` interfaces.
- Bundled LiveKit reverse proxy upstream is `http://<FRONTEND_BIND_ADDRESS-or-127.0.0.1>:7880`; tunnel upstream is `http://livekit:7880`.

- [x] **Step 1: Write failing tests**

Test that bundled mode reports the `LIVEKIT_PUBLIC_URL` hostname, HTTP/WebSocket proxy to port 7880, TCP 7881, UDP 50000–50099, TURN UDP/TCP 3478, TLS 443 through the existing HAProxy SNI route to loopback 5349, and coturn UDP relay range 50300–50399. With the `tunnel` profile, assert the hostname routes to `http://livekit:7880`. `render_nginx` must include WebSocket `Upgrade` and `Connection` headers for the LiveKit hostname. Test both external and disabled modes omit all bundled media entries.

- [x] **Step 2: Run tests and verify they fail**

Run: `python3 -m unittest deploy.qjudge_cli.tests.test_ingress -v`

Expected: FAIL because ingress currently only describes frontend and storage.

- [x] **Step 3: Implement media ingress output**

Add the bundled media hostname to the tunnel route list and describe the proxy, public UDP/TCP media and TURN ports, and the existing HAProxy TCP 443 SNI route to host-loopback Coturn TLS 5349. Generate a separate nginx server block with WebSocket upgrade headers; do not change the HAProxy/nginx config itself, and retain the existing frontend and storage output unchanged.

- [x] **Step 4: Run tests and verify they pass**

Run: `python3 -m unittest deploy.qjudge_cli.tests.test_ingress -v`

Expected: PASS。

- [x] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/ingress.py deploy/qjudge_cli/tests/test_ingress.py
git commit -m "feat(deploy): describe bundled media ingress" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/qjudge_cli/ingress.py deploy/qjudge_cli/tests/test_ingress.py
```

### Task 4: Schema example and CI Compose checks

**Files:**
- Modify: `deploy/qjudge_cli/schema.py`、`deploy/.env.example`
- Modify: `.github/workflows/ci.yml`
- Modify: `deploy/qjudge_cli/tests/test_schema.py`

- [x] **Step 1: Add focused assertions**

在 `test_schema.py` 加入 `test_media_mode_documents_addon_commands`，斷言 `KEYS_BY_NAME["MEDIA_MODE"].help` 含 `qjudge addon media init|up`。Add the media addon Compose file to the CI lint and config checks.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `python3 -m unittest deploy.qjudge_cli.tests.test_schema deploy.qjudge_cli.tests.test_example -v`

Expected: 新增的 schema test FAIL，因 `MEDIA_MODE.help` 尚未提及 media addon CLI。

- [x] **Step 3: Update schema/example and CI**

Regenerate with `deploy/qjudge env-example > deploy/.env.example`. Extend `lint-compose` and `docker compose config --quiet` to include `deploy/addons/media/compose.yml`, using the same `deploy/.env.example` fixture as storage.

- [x] **Step 4: Run the complete deploy CLI and Compose checks**

Run:

```bash
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
deploy/qjudge lint-compose deploy/compose.yml deploy/addons/storage/compose.yml deploy/addons/media/compose.yml
QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml config --quiet
docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/addons/storage/compose.yml config --quiet
docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/addons/media/compose.yml config --quiet
```

Expected: all tests and Compose checks pass. Use only the checked-in env example for config resolution; runtime validation is isolated as described below.

- [x] **Step 5: Commit**

```bash
git add deploy/qjudge_cli/schema.py deploy/.env.example .github/workflows/ci.yml deploy/qjudge_cli/tests/test_schema.py
git commit -m "ci(deploy): validate bundled media compose" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/qjudge_cli/schema.py deploy/.env.example .github/workflows/ci.yml deploy/qjudge_cli/tests/test_schema.py
```

### Local media runtime validation

The user authorized starting containers for local verification. Use a temporary Compose project and isolated Docker network, generated test-only LiveKit/TURN credentials, and a self-signed certificate at the expected `qjudge-media` path. Copy the addon Compose file into the temporary project and remap only host-side ports to unused validation ports because the running dev stack owns UDP 3478 and UDP 50300–50309; container-side ports remain 7880, 7881, 50000–50099, 3478, 50300–50399, and 5349.

- [x] Render runtime config into the temporary project and verify files are mode `0600`; never read or mount `deploy/.env`, `deploy/secrets/`, or the real `/etc/letsencrypt` tree.
- [x] Start LiveKit and Coturn with `docker compose up -d --wait`; confirm both remain running and LiveKit accepts the config.
- [x] Run `openssl s_client` against the remapped Coturn TLS host port using the generated test certificate as the CA; require a successful TLS handshake and the expected test hostname.
- [x] Confirm Coturn runs as `nobody` after reading its mounted 0600 config.
- [x] Stop and remove only the temporary validation project with `docker compose down` (without `-v`); verify no validation containers remain.

Do not start the addon using real deployment credentials or production certificate files. The temporary test verifies process startup and local TLS only; it does not verify public DNS, HAProxy, TURN allocation, or media relay from an external network.

## 計畫自我檢查

- 覆蓋 spec：§4 compose network、§6 media ingress、§8 addon init/up/external modes、§13 階段 4 的 media addon；不提前處理階段 5–8。
- dcslab media contract：沿用已核對的 image digest、API/TURN shared-secret 結構、LiveKit `rtc.turn_servers` 廣告 UDP/TCP 3478 與 TLS 443、LiveKit ports 7880/7881/50000–50099、coturn 3478/50300–50399/TLS 5349。外部 HAProxy 仍處理 TLS 443；addon 綁 loopback 5349 並 read-only 掛載既有 `qjudge-media` 憑證。
- 網路：LiveKit 與 coturn 都加入 external `qjudge` network。coturn 透過 `external-ip` 宣告公開位址，Docker 對 3478 與 relay range 作同埠映射，TLS 5349 僅供主機 HAProxy 連線；符合 §4 共用 network 決定。
- 本機 runtime：Linux/ARM64 使用固定 digest image 啟動 LiveKit 與 Coturn；兩者持續 running 且無重啟，Coturn PID 1 降權至 UID 65534，對臨時憑證的 TLS 1.3 handshake 與主機名驗證通過。只測本機容器與 TLS listener，不代表外部 HAProxy、DNS、TURN allocation 或 media relay 已驗收。
- Review Focus：5 項已分配至 Tasks 1–3；Task 4 由 schema/example 和 CI Compose 檢查涵蓋。
- Task 2 的 env writer 只更新三個 media credential keys；不觸碰其他部署設定，也不自動啟動服務。
- `deploy/.env.example` 與 schema 維持產生一致；CI 僅做 Compose config，不部署或變更真實服務。
