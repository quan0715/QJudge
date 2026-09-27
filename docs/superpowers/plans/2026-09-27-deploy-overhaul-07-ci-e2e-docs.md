# Deploy Overhaul 07：CI 全新安裝 E2E、刪除 test compose、文件與 skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI 的整合測試與 E2E 改在「以 `deploy/qjudge init` + `upgrade` 全新安裝的 prod 形狀 stack」上執行，Playwright 與 API 測試直接在 runner 上打 frontend；刪除 `docker-compose.test.yml` 與相關腳本、測試；公開部署文件、E2E 文件、skill 與 `CLAUDE.md` 改為新流程。

**Architecture:** `ci/e2e-stack.sh` 是 CI 與本地共用的安裝腳本：`init --non-interactive`（origin `http://localhost:8080`、bundled MinIO、公開 storage 網址 `http://minio:9000`，runner 以 `/etc/hosts` 把 `minio` 指到 127.0.0.1，瀏覽器與容器用同一個網址）→ `addon storage up|init` → `upgrade <sha>`（真正的安裝流程）→ 疊加 `ci/compose.e2e.yml` 重新 `up`（Django 服務改用 `config.settings.test` 關閉限流、Celery 非 eager、AI 服務改接 `fake-ai-adapters`）→ `seed_e2e_data` → 等待健康。腳本把之後要用的 compose 指令寫到 `$GITHUB_ENV`（本地則印出）。後續參數以 `--set KEY=VALUE` 追加到 `init`，後者覆蓋前者，本地可改用 external storage 與不同 project 名稱。

**Tech Stack:** Bash、Docker Compose v2、GitHub Actions、Playwright、Vitest、pytest。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md` §10、§12

**計畫系列：** 01–06（完成）→ **07（本文件）** → 08 dcslab 轉換。

**決定（2026-09-27 使用者確認）：** `frontend/public/docs/zh-TW/deployment.md`、`deployment-options.md` 直接改寫，使用者未提交的修改一併丟棄。延續先前決定：本地不提供測試 DB，DB 測試與 E2E 在 CI 執行；本地只有 dev。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `ci/e2e-stack.sh`（新增） | 全新安裝 + E2E 覆寫 + seed + 等待 |
| `ci/compose.e2e.yml`（新增） | `fake-ai-adapters`；Django 用 test settings；AI 接 fakes |
| `backend/config/settings/test.py`（修改） | bucket 不寫死；CSRF 包含 origin |
| `.github/workflows/ci.yml`、`e2e-coding.yml`、`e2e-manual.yml`（修改） | 改用 `ci/e2e-stack.sh`；integrity 測試直接 build `Dockerfile.test` |
| `.github/actions/wait-test-stack/`（刪除） | 由腳本取代 |
| `frontend/tests/helpers/setup.ts`、`teardown.ts`、`frontend/playwright.config.e2e.ts`、`frontend/vitest.config.api.ts`（修改） | 不再操作 docker；預設目標 `http://localhost:8080` |
| `docker-compose.test.yml`、`frontend/Dockerfile.e2e`、`frontend/scripts/e2e-env.sh`、`scripts/db/bootstrap-ai-database.sh`（刪除） | 舊 test stack |
| 對應 contract 測試（刪除） | 只驗證舊 test compose |
| `.codex/skills/qjudge-env-compose-owner/**`、`CLAUDE.md`、`Makefile`、`README.md`（修改） | 只剩 dev 與 `deploy/qjudge` |
| `frontend/public/docs/zh-TW/deployment*.md`（改寫）、`frontend/public/docs/*/e2e-testing.md`、`dev-setup.md`（修改） | 新流程 |

---

### Task 1: E2E stack 腳本與覆寫

**Files:**
- Create: `ci/e2e-stack.sh`、`ci/compose.e2e.yml`
- Modify: `backend/config/settings/test.py`

- [ ] **Step 1: `backend/config/settings/test.py`**

1. `OBJECT_STORAGE_BUCKET = "qjudge-test"` 改為 `OBJECT_STORAGE_BUCKET = OBJECT_STORAGE_BUCKET or "qjudge-test"`（CI backend-unit 沒有 bucket 時仍有預設；E2E stack 使用實際 bucket）。
2. `CSRF_TRUSTED_ORIGINS` 清單最前面加入 `FRONTEND_URL`（來自 base，由 `QJUDGE_PUBLIC_ORIGIN` 推導）。

在 dev 容器確認可 import：`.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend python -c "import django; django.setup(); from django.conf import settings; print(settings.OBJECT_STORAGE_BUCKET, settings.CSRF_TRUSTED_ORIGINS[0])"`。

- [ ] **Step 2: `ci/compose.e2e.yml`**

以 `docker-compose.test.yml` 為依據（`fake-ai-adapters` 服務、`x-ai-api-environment`／`x-ai-worker-environment` 中指向 fakes 的變數）寫一個疊加在 `deploy/compose.yml` 之上的覆寫檔：

- `fake-ai-adapters`：`image: qjudge/ai-service:${QJUDGE_VERSION}`（`tests/` 是否在 image 內以 `docker run --rm qjudge/ai-service:<tag> ls tests/fakes` 確認；不在時改用 `build: {context: ../ai-service, dockerfile: Dockerfile}` 或 test compose 原本的 build 方式），command 與 healthcheck 沿用 test compose。
- `ai-service`、`ai-worker`、`ai-scheduler`：只覆寫 test compose 中指向 `fake-ai-adapters` 的變數（MCP、token exchange、JWKS、provider base URL／key 等），`depends_on` 加 `fake-ai-adapters`。DB、Redis、storage 使用 stack 本身的設定；若 AI 測試需要 fakes 當 storage（test compose 如此），照 test compose 覆寫並註明原因。
- Django 服務（`backend`、`celery`、`celery-high`、`celery-beat`、`integrity-reconciler`、`migrate`）：`DJANGO_SETTINGS_MODULE: config.settings.test`、`CELERY_TASK_ALWAYS_EAGER: "false"`。
- 檔頭註解說明：只給 CI E2E 使用，不是部署設定。compose 路徑相對於 `--project-directory deploy`（`../ai-service` 這類）。

驗證：`QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml -f ci/compose.e2e.yml config --quiet`。

- [ ] **Step 3: `ci/e2e-stack.sh`**

```bash
#!/usr/bin/env bash
# Install QJudge from scratch the way a self-hoster does, then switch it to
# the E2E overrides and seed test data. Extra `--set KEY=VALUE` arguments are
# passed to `deploy/qjudge init` and win over the defaults below.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

deploy/qjudge init --non-interactive \
  --set QJUDGE_PUBLIC_ORIGIN=http://localhost:8080 \
  --set STORAGE_MODE=bundled \
  --set OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://minio:9000 \
  --set HOST_PROJECT_ROOT="$ROOT" \
  "$@"

if grep -q '^STORAGE_MODE=bundled$' deploy/.env; then
  deploy/qjudge addon storage up
  deploy/qjudge addon storage init
fi

deploy/qjudge upgrade "$(git rev-parse HEAD)"

version="sha-$(sed -n 's/^current=//p' deploy/.version | cut -c1-12)"
project="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' deploy/.env)"
dc=(docker compose --project-name "${project:-qjudge}" --project-directory deploy --env-file deploy/.env
    -f deploy/compose.yml -f deploy/compose.build.yml -f ci/compose.e2e.yml)

QJUDGE_VERSION="$version" "${dc[@]}" up -d --remove-orphans
for attempt in $(seq 90); do
  if curl --fail --silent --output /dev/null http://localhost:8080/api/health/ \
    && curl --fail --silent --output /dev/null http://localhost:8080/; then
    break
  fi
  if [ "$attempt" = 90 ]; then
    QJUDGE_VERSION="$version" "${dc[@]}" ps
    exit 1
  fi
  sleep 2
done
QJUDGE_VERSION="$version" "${dc[@]}" exec -T backend python manage.py seed_e2e_data

command="QJUDGE_VERSION=$version ${dc[*]}"
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "QJ_DC=$command" >> "$GITHUB_ENV"
else
  echo "$command"
fi
```

（`upgrade` 對 `HEAD` 執行 checkout 是 no-op，但仍走完整的 build／備份／migrate／健康檢查。`FRONTEND_PORT` 若由 `--set` 改變，腳本中的 `8080` 改讀 `.env` 的值。`chmod +x`。）

- [ ] **Step 4: 本地驗證（獨立 worktree，不動 dev stack）**

照 plan 06 Task 5 的方式：`git worktree add --detach /private/tmp/qjudge-e2e07-wt HEAD`（先 commit 本 task 的檔案，或把未 commit 的三個檔案複製進 worktree）；本地 MinIO 的 9000 port 被 dev 佔用，因此以 external storage 使用 dev MinIO（先建 bucket `qjudge-e2e`）並換 project 名稱：

```bash
/private/tmp/qjudge-e2e07-wt/ci/e2e-stack.sh \
  --set COMPOSE_PROJECT_NAME=qjudge-e2e \
  --set STORAGE_MODE=external \
  --set OBJECT_STORAGE_ENDPOINT_URL=http://host.docker.internal:9000 \
  --set OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://localhost:9000 \
  --set OBJECT_STORAGE_ACCESS_KEY=<dev key> --set OBJECT_STORAGE_SECRET_KEY=<dev secret> \
  --set OBJECT_STORAGE_BUCKET=qjudge-e2e
```

（帳密從 dev 的 `deploy/.env` 讀進 shell 變數，不印出。）Expected：腳本 exit 0，印出 compose 指令；`curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/health/` 為 200；`<印出的指令> exec -T backend python -c "import django,os;os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.test');django.setup();from django.contrib.auth import get_user_model as g;print(g().objects.filter(username='teacher').exists())"` 為 True。**保留這個 stack 給 Task 2 使用**，Task 2 結束再清除。

- [ ] **Step 5: Commit**

```bash
git add ci/e2e-stack.sh ci/compose.e2e.yml
git commit -m "ci: install the E2E stack with qjudge init and upgrade" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- ci/e2e-stack.sh ci/compose.e2e.yml backend/config/settings/test.py
```

---

### Task 2: 測試直接在 runner 上打 frontend

**Files:**
- Modify: `frontend/tests/helpers/setup.ts`、`frontend/tests/helpers/teardown.ts`、`frontend/playwright.config.e2e.ts`、`frontend/vitest.config.api.ts`、`frontend/tests/e2e/README.md`
- Modify: `mcp-server/tests/test_integration.py`（預設網址與說明）
- Delete: `frontend/scripts/e2e-env.sh`（先確認沒有 package script 或文件以外的引用）

- [ ] **Step 1: 改寫測試 harness**

- `setup.ts`：移除所有 docker compose 操作（啟動、`ps`、`canQueryDocker`），只保留「等待 backend 與 frontend 健康 + 暖機」。預設健康網址改為 `http://localhost:8080/api/health/` 與 `http://localhost:8080/`（仍可用 `E2E_BACKEND_HEALTH_URLS`／`E2E_FRONTEND_HEALTH_URLS` 覆寫）。沒有環境時直接報錯並提示先執行 `ci/e2e-stack.sh`。
- `teardown.ts`：移除 `docker compose down`；只保留必要的收尾或整檔清空為 no-op（若 config 仍引用）。
- `playwright.config.e2e.ts`：預設 `baseURL` 為 `http://localhost:8080`；更新檔頭說明。
- `vitest.config.api.ts`：更新說明；API 測試的目標網址若寫死 `8002`／`backend-test`，改為讀環境變數，預設 `http://localhost:8080`（找出 `src/infrastructure/api/__tests__/integration/` 內實際使用的設定）。
- `mcp-server/tests/test_integration.py`：`DJANGO_BASE_URL` 預設改為 `http://localhost:8080`，說明同步。`/api/v1/auth/dev/token` 在 `config.settings.test` 下是否可用需確認（若只在 DEBUG 可用，於 `ci/compose.e2e.yml` 或測試中調整並回報）。

- [ ] **Step 2: 本地對 Task 1 的 stack 執行**

```bash
cd frontend && npx playwright install chromium
PLAYWRIGHT_BASE_URL=http://localhost:8080 CI=true E2E_REUSE_ENV=true npm run test:e2e -- tests/e2e/auth.e2e.spec.ts --workers=1
npm run test:api
cd ../mcp-server && DJANGO_BASE_URL=http://localhost:8080 DJANGO_FORWARDED_PROTO=http uv run --quiet pytest tests/test_integration.py -q
```

coding submissions E2E（需要 judge 與非 eager Celery）：

```bash
cd frontend && CI=true E2E_REUSE_ENV=true npm run test:e2e -- tests/e2e/coding-submissions.e2e.spec.ts
```

Expected：全部通過。本機為 arm64、judge image 由 `upgrade` 在本機 build，若 coding E2E 因平台差異失敗，記錄原因（CI 為 x86），不為此修改產品程式。失敗時先判斷是 stack 差異（settings、網址、fakes）還是既有測試問題；stack 差異在 `ci/compose.e2e.yml`／harness 修正。

- [ ] **Step 3: 清除 Task 1 的 stack**

`down -v` 只對 `qjudge-e2e`；刪除 `qjudge/*:sha-*` image、`oj-judge:latest`（若本 task 建立）、worktree（`git worktree remove --force` + `git worktree prune`）與 dev MinIO 的 `qjudge-e2e` bucket；確認 dev stack `ps` 不變。

- [ ] **Step 4: Commit**

```bash
git commit -m "test(e2e): target the installed frontend instead of the test compose" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <修改與刪除的檔案>
```

---

### Task 3: CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`、`.github/workflows/e2e-coding.yml`、`.github/workflows/e2e-manual.yml`
- Delete: `.github/actions/wait-test-stack/`

- [ ] **Step 1: `ci.yml`**

- `integration-tests` job：保留 GHCR 登入（judge image）；以下列步驟取代 test compose：
  1. `echo "127.0.0.1 minio" | sudo tee -a /etc/hosts`
  2. `ci/e2e-stack.sh`
  3. `actions/setup-node`（版本與其他 frontend job 一致）＋ `npm ci`（`working-directory: frontend`）
  4. `npm run test:api`（frontend）
  5. MCP 整合測試：`DJANGO_BASE_URL: http://localhost:8080`
  6. `if: always()` 收集 `$QJ_DC logs --no-color`，上傳 artifact
  - 不需要 cleanup（runner 用完即丟）。移除 `DOCKER_GID`、integrity 測試機密等只為 test compose 準備的步驟。
- `coding-e2e`（呼叫 `e2e-coding.yml`）維持 PR 到 main 時執行。
- `integrity-service-unit` job：以 `docker build -f integrity-service/Dockerfile.test -t integrity-unit-test integrity-service` 與 `docker run --rm -v "$GITHUB_WORKSPACE:/workspace:ro" -e INTEGRITY_DEV_COMPOSE_JSON=/workspace/.tmp/integrity-contract/dev.json -w /workspace/integrity-service integrity-unit-test python -m pytest -q -p no:cacheprovider` 取代 `qjudge-dc.sh test run`（掛載方式以 test compose 的 `integrity-unit-test` 定義為準）。
- `on.*.paths`：移除 `docker-compose.test.yml`，加入 `ci/**`。

- [ ] **Step 2: `e2e-coding.yml` 與 `e2e-manual.yml`**

每個 job 改為：checkout → GHCR 登入 → `/etc/hosts` → `ci/e2e-stack.sh` → setup-node + `npm ci` + `npx playwright install --with-deps chromium` → 在 runner 上執行原本的 Playwright 指令（`CI=true E2E_REUSE_ENV=true`，檔案、`--grep`、`--workers`、輸出目錄沿用原設定）→ `if: always()` 以 `$QJ_DC logs` 收集 log 並上傳 artifact。`e2e-coding.yml` 的「Verify asynchronous judge dispatch is enabled」改為 `$QJ_DC exec -T backend python manage.py shell -c ...`。刪除 `.github/actions/wait-test-stack/`。

- [ ] **Step 3: 驗證**

```bash
for f in .github/workflows/*.yml; do python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$f" || echo "BAD $f"; done
git grep -n -E "docker-compose\.test\.yml|wait-test-stack|qjudge-dc\.sh test|frontend-test|backend-test|localhost:(8002|5174)" -- .github
cd scripts && python3 -m pytest -q tests/test_release_workflows.py
```

Expected：YAML 皆可解析；grep 無結果；workflow 測試通過（若斷言舊 job 結構，依新結構調整）。

- [ ] **Step 4: Commit**

```bash
git commit -m "ci: run integration and E2E tests against a fresh qjudge install" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <修改與刪除的檔案>
```

---

### Task 4: 刪除 test compose 與相關檔案

- [ ] **Step 1: 刪除**

```bash
git rm -r --quiet docker-compose.test.yml frontend/Dockerfile.e2e scripts/db/bootstrap-ai-database.sh
```

以及只驗證 test compose 或上述檔案的測試（先 `git grep` 確認）：`ai-service/tests/contract/test_compose_boundaries.py`、`ai-service/tests/contract/test_live_compose_flow.py`、`scripts/tests/test_livekit_compose_contract.py`、`scripts/tests/test_bootstrap_ai_database.py`；`ai-service/tests/contract/test_deployment_docs.py` 鎖定文件措辭（違反 `CLAUDE.md`「不要用測試鎖死文件措辭」），一併刪除。`scripts/db/` 變空時移除目錄。

- [ ] **Step 2: 修正引用**

- `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh`：移除 `test` 環境，只剩 `dev`；usage 說明 E2E 在 CI 以 `ci/e2e-stack.sh` 執行、production 用 `deploy/qjudge`。
- `Makefile`：移除 `test`、`test-build`、`test-down` 等 test compose target 與 help。
- `loadtest/README.md`、`docs/loadtest.md`：改為對 `ci/e2e-stack.sh` 建立的 stack（或 dev）執行 Locust，只改指令與網址。
- 其他 `git grep -n -E "docker-compose\.test\.yml|qjudge-dc\.sh test|Dockerfile\.e2e|bootstrap-ai-database|oj_backend_test|backend-test|frontend-test"`（排除 `docs/superpowers`）的結果：程式與設定要修；文件留給 Task 5。

- [ ] **Step 3: 驗證並 commit**

```bash
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
cd scripts && python3 -m pytest -q tests && cd ..
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config --quiet
git commit -m "chore: remove the test compose stack" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <刪除與修改的檔案>
```

---

### Task 5: 文件與 skill

**Files:**
- Rewrite: `frontend/public/docs/zh-TW/deployment.md`、`deployment-options.md`、`deployment-storage.md`、`deployment-live-monitoring.md`、`deployment-troubleshooting.md`
- Modify: `frontend/public/docs/{en,ja,ko,zh-TW}/e2e-testing.md`、`frontend/public/docs/{en,zh-TW,...}/dev-setup.md`（依實際存在的語言）、`frontend/public/docs/config.json`（若頁面增減）
- Modify: `.codex/skills/qjudge-env-compose-owner/SKILL.md`、`references/environment-matrix.md`、`CLAUDE.md`、`README.md`

- [ ] **Step 1: 公開部署文件（zh-TW）**

依 spec 與目前的 CLI 實際行為改寫，內容精簡、以操作順序撰寫：

- `deployment.md`：需求（Docker、git）→ `git clone` → `deploy/qjudge init` → bundled storage／media 時的 `addon ... up|init` → `deploy/qjudge ingress`（設定反向代理或 Tunnel）→ `deploy/qjudge upgrade <ref>` → 驗收。升級：`upgrade <ref>`；回退：`rollback`（DB 不自動還原，附 `pg_restore` 說明）；備份位置 `deploy/backups/`。
- `deployment-options.md`：反向代理在同一台（`FRONTEND_BIND_ADDRESS` 預設 127.0.0.1）或另一台（填內網 IP + `QJUDGE_TRUSTED_PROXIES` + 防火牆）；Cloudflare Tunnel（`COMPOSE_PROFILES=tunnel`、`TUNNEL_TOKEN`）；MCP 在 `<origin>/mcp`；AI provider key。
- `deployment-storage.md`：`STORAGE_MODE=bundled|external`、單一 bucket、公開網址需 HTTPS（origin 為 HTTPS 時）、external 需自行設定 CORS 與 bucket。
- `deployment-live-monitoring.md`：`MEDIA_MODE=disabled|bundled|external`；bundled 使用 LiveKit 內建 TURN，主機代理在 443 終止 TLS 轉到 5349，需開的 port；`ingress` 會列出。
- `deployment-troubleshooting.md`：`deploy/qjudge check`、`ingress`、`upgrade` 失敗時的行為與 log 查看（`docker compose -p <project> logs <service>`）。
- 所有 key 名稱、port、指令以 `deploy/qjudge_cli/schema.py`、`ingress.py`、`release.py` 與 `deploy/compose.yml` 為準；不提舊 key、舊腳本或遷移歷史。

- [ ] **Step 2: 開發與 E2E 文件**

- `dev-setup.md`（各語言）：dev 使用 `qjudge-dc.sh dev`，設定檔 `deploy/.env`（`cp deploy/.env.example deploy/.env` 後填寫、`deploy/qjudge check`），storage 用 dev MinIO（`compose.dev.yml` 內），不再有 test 環境；DB 測試在 CI。
- `e2e-testing.md`（各語言）：E2E 在 CI 以 `ci/e2e-stack.sh` 全新安裝後執行；本地如需執行，照該腳本的 `--set` 方式在獨立 worktree 與 project 名稱下安裝（簡述，不重複腳本內容）。

- [ ] **Step 3: skill、CLAUDE.md、README**

- `SKILL.md`、`environment-matrix.md`：只有 `dev`（本地互動開發，資料保留，不加 `-v`）；CI（全新安裝 E2E、DB 測試）；production（`deploy/qjudge init|check|ingress|upgrade|rollback|addon`）。移除 test 環境與其指令。
- `CLAUDE.md`：wrapper 用法改為只有 `dev`；「`test`：backend、frontend、AI service 與隔離式 E2E 測試」改為 DB 測試與 E2E 在 CI（`ci/e2e-stack.sh`）執行。
- `README.md`：開發與部署段落指向上述文件，移除 test compose。

- [ ] **Step 4: 驗證並 commit**

```bash
git grep -n -E "docker-compose\.(yml|dev\.yml|test\.yml)|setup-env\.sh|deploy-prod\.sh|qjudge-dc\.sh (main|test)|LIVE_MONITORING_ENABLED|LIVEKIT_TURN_SECRET|ANTICHEAT_RAW_BUCKET|MARKDOWN_IMAGE_S3_BUCKET|AI_ARTIFACT_S3_BUCKET" -- ':!docs/superpowers' ':!docs/operations'
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-repository-exports.js
cd frontend && npm run check:docs 2>/dev/null || true
```

Expected：grep 無結果（或只剩刻意保留並說明理由者）；docs 檢查（若存在）通過。

```bash
git commit -m "docs: describe the qjudge install, upgrade and CI E2E flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <修改的檔案>
```

---

## 完成條件

- CI 設定中的整合測試、coding E2E、manual E2E 都改用 `ci/e2e-stack.sh`；本地已在獨立 project 驗證 stack 安裝、API 測試、MCP 整合測試與 Playwright auth／coding。
- `docker-compose.test.yml` 與相關檔案、測試已刪除；repo 內只剩 `deploy/`（prod 形狀）、`compose.dev.yml`（dev）與 `ci/compose.e2e.yml`（CI 覆寫）。
- 公開部署文件、E2E／dev 文件、skill、`CLAUDE.md` 描述新流程。
- CI 在 GitHub 上的實際執行需要 push；是否 push 由使用者決定。
