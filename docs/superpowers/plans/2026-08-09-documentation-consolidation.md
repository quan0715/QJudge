# QJudge Documentation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清除失效與重複的內部文件，並把通過程式契約核對的繁體中文部署指南發布到 `frontend/public/docs`。

**Architecture:** `frontend/public/docs` 是正式公開來源；`docs` 只保留維護程式、API、壓測與營運所需的內部文件。部署內容依讀者旅程拆為主線、儲存、選用功能與故障排除四頁，並以既有 pytest contract、文件翻譯檢查與 Vite docs build 驗證。

**Tech Stack:** Markdown、JSON、Python 3／pytest、Node.js／Vite、Docker Compose v2、Bash

## Global Constraints

- 先完成繁體中文內容；本計畫不修改 `frontend/public/docs/en`、`ja`、`ko` 或三種語言的 `docs.json`。
- 其他語言暫時使用既有 zh-TW fallback；`npm run check:docs` 出現缺少部署翻譯的警告是預期結果，exit code 必須仍為 `0`。
- 不修改 application architecture、部署腳本、Compose 行為或環境變數契約。
- R2 是目前唯一可以寫成可執行步驟的 object storage；MinIO 在相容性實測前只能說明狀態，不提供 `--storage minio` 指令。
- EC2 在真實部署前只能標示尚未驗證，不提供推測性的 instance type、EBS 容量或 Console 點擊流程。
- Grafana、GlitchTip、Recur、billing 與 monitoring 不列為正式部署需求；load-test 自己的 Grafana 只留在壓測文件。
- AI 部署只說明既有 provider API key；`OPENAI_BASE_URL`、`DEEPSEEK_BASE_URL` 與自訂模型註冊不進部署文件。
- Internal MCP 不需要公開 HTTPS；Remote MCP、第三方 OAuth 與 Internet-facing production 才要求公開 HTTPS。
- 指令區塊一次只完成一件事，secret 使用互動輸入，破壞性資料清除指令不進主線。
- 不碰、暫存或刪除工作區中與本任務無關的 modified／untracked files。
- 設計稿與本計畫暫時保留到最後一個任務，避免執行期間失去依據；完成後由 Git history 保存。

## File Map

- Create: `docs/README.md` — 內部文件責任與索引。
- Modify: `docs/api-conventions.md` — 移除已刪除 roadmap 的連結，只保留現行契約。
- Modify: `docs/anticheat-architecture.md` — 對照現行 Exam Integrity 實作確認用語。
- Modify: `docs/i18n.md` — 說明內部語系維護責任與公開文件翻譯檢查。
- Modify: `docs/loadtest.md` — 只保留現有 load-test Compose 可執行流程。
- Modify: `docs/operations/exam-integrity-runbook.md` — 與目前 evidence lifecycle 對齊。
- Keep: `docs/examples/loadtest.env.example` — 壓測專用 object storage 範本。
- Create: `frontend/public/docs/zh-TW/deployment.md` — 最小部署線性主線。
- Create: `frontend/public/docs/zh-TW/deployment-storage.md` — R2 操作與 MinIO 狀態。
- Create: `frontend/public/docs/zh-TW/deployment-options.md` — HTTPS、OAuth、Tunnel、AI、MCP 與 Cloud VM 差異。
- Create: `frontend/public/docs/zh-TW/deployment-troubleshooting.md` — 依主線順序診斷。
- Modify: `frontend/public/docs/config.json` — 新增 `deployment` section。
- Modify: `frontend/src/i18n/locales/zh-TW/docs.json` — 新增繁中導覽文字。
- Modify: `frontend/public/docs/zh-TW/overview.md` — 移除舊分支、PR 與日期快照。
- Modify: `frontend/public/docs/zh-TW/mcp-setup.md` — 只保留外部 client 的連線與授權。
- Modify: `frontend/public/docs/zh-TW/identity-auth-extension.md` — 合併仍有效的 QAuth 維護資訊。
- Modify: `frontend/public/docs/zh-TW/dev-setup.md` — 改為目前開發環境入口。
- Modify: `frontend/public/docs/zh-TW/contributing.md` — 移除舊 agent／PR 工作流。
- Modify: `README.md` — 導向公開文件來源與剩餘內部文件。
- Modify: `ai-service/tests/contract/test_deployment_docs.py` — 將 canonical contract 從 `docs/deployment*` 遷到公開繁中四頁。
- Delete after migration: `docs/deployment.md`、`docs/deployment/`、`docs/user-guide.md`、`docs/developer-guide.md`、`docs/qauth-service-architecture.md`、`docs/cloudflare.md`、`docs/monitoring.md`。
- Delete as history: tracked files under `docs/plans/`、`docs/superpowers/plans/`、`docs/superpowers/specs/`；不刪除其他工作仍在使用的 untracked files。

---

### Task 1: Clean and Re-index Internal Documentation

**Files:**
- Create: `docs/README.md`
- Modify: `docs/api-conventions.md`
- Modify: `docs/anticheat-architecture.md`
- Modify: `docs/i18n.md`
- Modify: `docs/loadtest.md`
- Modify: `docs/operations/exam-integrity-runbook.md`
- Delete: tracked historical files in `docs/plans/`
- Delete: tracked historical files in `docs/superpowers/plans/` except `2026-08-09-documentation-consolidation.md`
- Delete: tracked historical files in `docs/superpowers/specs/` except `2026-08-09-documentation-consolidation-design.md`

**Interfaces:**
- Consumes: current backend integrity services, `loadtest/docker-compose.loadtest.yml`, `frontend/scripts/check-docs-translations.js` and the approved design spec.
- Produces: a short internal index and a temporary two-file execution record; public migration tasks rely on the index to identify documents that may be removed.

- [ ] **Step 1: Record the exact protected dirty paths**

Run:

```bash
git status --short
git ls-files docs/plans docs/superpowers/plans docs/superpowers/specs
```

Expected: the first command shows unrelated chatbot/AI changes that remain untouched; the second command identifies tracked historical documentation. Any untracked plan or spec owned by another active task is excluded from deletion.

- [ ] **Step 2: Create the internal documentation index**

Write `docs/README.md` with these sections and responsibilities:

```markdown
# QJudge 內部文件

這個目錄只保存維護程式與營運系統需要的技術文件。給部署者、教師、學生與系統管理者閱讀的正式內容位於 `frontend/public/docs`。

## 仍在維護的文件

- `api-conventions.md`：前後端共用的 API response 與 query 契約。
- `anticheat-architecture.md`：Exam Integrity 的模組責任與資料生命週期。
- `i18n.md`：前端語系 key 的維護與檢查方式。
- `loadtest.md`：隔離壓測環境的建立、執行與清理。
- `operations/exam-integrity-runbook.md`：Integrity Run 的營運檢查與復原。
- `examples/loadtest.env.example`：壓測專用 object storage 範本。

## 公開文件

正式部署入口：`frontend/public/docs/zh-TW/deployment.md`。
```

- [ ] **Step 3: Remove stale internal claims**

Apply these exact corrections:

- Remove `docs/plans/api-envelope-migration.md` from `api-conventions.md`; describe the migration table as current status, not a roadmap.
- Keep `anticheat-architecture.md` explicit that each evidence source can be `pending`、`available` or `unavailable`, while the API does not expose a `partial` aggregate state.
- In `operations/exam-integrity-runbook.md`, remove the nonexistent `partial` status, retain the implemented `unavailable` meaning, and direct operators to inspect per-source status plus incident/error data before using supported Integrity Run recovery actions.
- In `loadtest.md`, remove production-domain commands and obsolete heartbeat tuning. Keep local/test Compose commands, Locust, the load-test Grafana dashboard, and the warning that `down -v` is valid only for the isolated test environment.
- In `i18n.md`, document `npm run check:i18n` for application keys and `npm run check:docs` for public Markdown coverage; state that deployment translations are intentionally deferred in this phase.

- [ ] **Step 4: Remove tracked historical files with a reviewable patch**

Use `apply_patch` deletions for the tracked files returned in Step 1, excluding the current consolidation design and plan. Do not delete the directories wholesale while unrelated untracked files exist.

- [ ] **Step 5: Verify the retained set and stale terminology**

Run:

```bash
find docs -type f -not -path 'docs/superpowers/*' | sort
rg -n 'docs/plans/|partial.{0,10}unavailable|LT_HEARTBEAT_INTERVAL_SECONDS|https://grafana\.q-judge\.com' \
  docs/README.md docs/api-conventions.md docs/anticheat-architecture.md docs/i18n.md \
  docs/loadtest.md docs/operations/exam-integrity-runbook.md
git diff --check
```

Expected: the first command lists the retained files plus temporary deployment migration sources; the second command returns no matches; `git diff --check` passes.

- [ ] **Step 6: Commit only the internal cleanup**

```bash
git add docs/README.md docs/api-conventions.md docs/anticheat-architecture.md docs/i18n.md docs/loadtest.md docs/operations/exam-integrity-runbook.md
git add -u docs/plans docs/superpowers/plans docs/superpowers/specs
git diff --cached --name-only
git commit -m "docs: remove obsolete internal records"
```

Expected: the staged list contains only documentation paths and preserves the current consolidation design/plan plus unrelated untracked work.

### Task 2: Publish the Minimum Deployment and Storage Journey

**Files:**
- Create: `frontend/public/docs/zh-TW/deployment.md`
- Create: `frontend/public/docs/zh-TW/deployment-storage.md`
- Modify: `ai-service/tests/contract/test_deployment_docs.py`

**Interfaces:**
- Consumes: `scripts/setup-env.sh --target <cloud-vm|self-hosted> --storage r2 --origin <http(s)://host>`, `scripts/deploy-prod.sh <deploy_path> <git_ref>`, `.env.example`, and the three bucket names from `docker-compose.yml`.
- Produces: `PUBLIC_DEPLOYMENT_ROOT`, `DEPLOYMENT_GUIDES` and the public minimum-path/storage contract used by later tasks.

- [ ] **Step 1: Write the failing public-document contract**

Replace the old internal-path constants with:

```python
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_DEPLOYMENT_ROOT = REPOSITORY_ROOT / "frontend/public/docs/zh-TW"
DEPLOYMENT_GUIDES = (
    PUBLIC_DEPLOYMENT_ROOT / "deployment.md",
    PUBLIC_DEPLOYMENT_ROOT / "deployment-storage.md",
    PUBLIC_DEPLOYMENT_ROOT / "deployment-options.md",
    PUBLIC_DEPLOYMENT_ROOT / "deployment-troubleshooting.md",
)
```

Add these tests while retaining `_read` and `_assert_in_order`:

```python
def test_public_deployment_guide_is_a_linear_minimum_path() -> None:
    guide = _read(PUBLIC_DEPLOYMENT_ROOT / "deployment.md")
    _assert_in_order(
        guide,
        (
            "## 1. 先確認這條路適合你",
            "## 2. 準備主機",
            "## 3. 準備檔案儲存",
            "## 4. 取得 QJudge",
            "## 5. 建立環境設定",
            "## 6. 啟動 QJudge",
            "## 7. 建立管理者帳號",
            "## 8. 完成第一次驗收",
            "## 9. 決定是否開放到 Internet",
            "## 10. 更新與暫停",
        ),
    )
    assert "scripts/setup-env.sh" in guide
    assert "scripts/deploy-prod.sh" in guide
    assert "cp .env.example .env" not in guide
    assert not re.search(r"Grafana|GlitchTip|Recur|billing", guide, re.IGNORECASE)


def test_storage_guide_keeps_r2_executable_and_minio_unverified() -> None:
    storage = _read(PUBLIC_DEPLOYMENT_ROOT / "deployment-storage.md")
    for bucket in ("anticheat-raw", "markdown-images", "ai-artifacts"):
        assert bucket in storage
    assert "R2" in storage
    assert "MinIO" in storage
    assert "尚未完成相容性實測" in storage
    assert "--storage minio" not in storage
```

- [ ] **Step 2: Run the focused tests and confirm RED state**

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_public_deployment_guide_is_a_linear_minimum_path \
  ai-service/tests/contract/test_deployment_docs.py::test_storage_guide_keeps_r2_executable_and_minio_unverified \
  -q
```

Expected: FAIL with missing `frontend/public/docs/zh-TW/deployment*.md` files.

- [ ] **Step 3: Write the minimum deployment story**

Create `deployment.md` with the ten tested headings. The content must introduce QJudge before naming containers, then walk through these exact actions:

1. Explain that one Ubuntu LTS Docker host runs the web/API/judge/background services and that R2 stores uploaded files.
2. Explain self-hosted versus Cloud VM in one comparison; both rejoin the same install path after the VM is reachable.
3. Check `git --version`, `python3 --version`, `docker --version`, `docker compose version`, `curl --version`, and `docker info` in separate small blocks.
4. Link to `deployment-storage.md` before asking for credentials.
5. Clone `https://github.com/quan0715/QJudge.git`, enter `QJudge`, and record `git rev-parse HEAD`.
6. Read R2 credentials interactively and run `./scripts/setup-env.sh --target self-hosted --storage r2 --origin http://YOUR_QJUDGE_HOST`; explain when `cloud-vm` replaces `self-hosted`.
7. Check/install `python3-cryptography`, run `python3 scripts/bootstrap_integrity_secrets.py`, then run `./scripts/deploy-prod.sh "$(pwd)" "$(git rev-parse HEAD)"`.
8. Check one-shot services, create the administrator with `docker compose exec backend python manage.py createsuperuser`, inspect `docker compose ps --all`, and call the frontend/backend/AI health endpoints.
9. Ask the reader to log in, create a minimal problem, submit once, and upload/read one Markdown image before adding optional features.
10. Use `git fetch --all --tags --prune` plus an explicit release tag/SHA for updates; use only `docker compose stop` for the normal stop path.

After each command group, state the expected human-visible result and link failures to `deployment-troubleshooting.md`.

- [ ] **Step 4: Write the storage story**

Create `deployment-storage.md` with this order:

1. Explain object storage as the file space for exam evidence, Markdown images and AI artifacts.
2. Explain why the database and object storage solve different problems.
3. Identify R2 as the current supported setup and require three private buckets: `anticheat-raw`, `markdown-images`, `ai-artifacts`.
4. Explain endpoint, access key, secret key, bucket permissions and browser CORS in plain language before showing variable names.
5. Show interactive credential input and the same `setup-env.sh --storage r2` path used by the main guide.
6. Verify upload/read-back and presigned URL behavior without printing credentials.
7. Explain that MinIO uses an S3-compatible API but the current setup script rejects it; mark compatibility testing and any required minimal code change as a separate implementation task.

- [ ] **Step 5: Run the focused tests and review prose**

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_public_deployment_guide_is_a_linear_minimum_path \
  ai-service/tests/contract/test_deployment_docs.py::test_storage_guide_keeps_r2_executable_and_minio_unverified \
  -q
rg -n 'OPENAI_BASE_URL|DEEPSEEK_BASE_URL|--storage minio|Grafana|GlitchTip|Recur|billing' \
  frontend/public/docs/zh-TW/deployment.md \
  frontend/public/docs/zh-TW/deployment-storage.md
```

Expected: pytest PASS; `rg` returns no matches.

- [ ] **Step 6: Commit the first public deployment pages**

```bash
git add ai-service/tests/contract/test_deployment_docs.py frontend/public/docs/zh-TW/deployment.md frontend/public/docs/zh-TW/deployment-storage.md
git commit -m "docs: publish minimum deployment journey"
```

### Task 3: Publish Optional Features and Troubleshooting

**Files:**
- Create: `frontend/public/docs/zh-TW/deployment-options.md`
- Create: `frontend/public/docs/zh-TW/deployment-troubleshooting.md`
- Modify: `ai-service/tests/contract/test_deployment_docs.py`

**Interfaces:**
- Consumes: production Compose `tunnel` profile, `QJUDGE_PUBLIC_ORIGIN`, optional provider/OAuth variables, internal `QJUDGE_MCP_URL`, and health routes.
- Produces: optional-feature and diagnosis contracts; the main deployment page links to both files.

- [ ] **Step 1: Add failing option and troubleshooting contracts**

```python
def test_optional_features_keep_https_boundary_clear() -> None:
    options = _read(PUBLIC_DEPLOYMENT_ROOT / "deployment-options.md")
    assert "AI provider" in options
    assert "Internal MCP" in options
    assert "Remote MCP" in options
    assert "Cloudflare Tunnel" in options
    assert "OAuth" in options
    assert "Internal MCP 不需要公開 HTTPS" in options
    assert "Remote MCP 需要公開 HTTPS" in options
    assert "OPENAI_BASE_URL" not in options
    assert "DEEPSEEK_BASE_URL" not in options


def test_troubleshooting_follows_the_deployment_order() -> None:
    guide = _read(PUBLIC_DEPLOYMENT_ROOT / "deployment-troubleshooting.md")
    _assert_in_order(
        guide,
        (
            "## 1. 主機與工具",
            "## 2. 環境設定",
            "## 3. Compose 與啟動",
            "## 4. Database 與 migration",
            "## 5. 健康檢查",
            "## 6. R2 與檔案",
            "## 7. Judge 與 Integrity",
            "## 8. Tunnel 與 OAuth",
        ),
    )
    assert "down -v" not in guide
```

- [ ] **Step 2: Run the focused tests and confirm RED state**

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_optional_features_keep_https_boundary_clear \
  ai-service/tests/contract/test_deployment_docs.py::test_troubleshooting_follows_the_deployment_order \
  -q
```

Expected: FAIL because the two pages do not exist.

- [ ] **Step 3: Write optional features as decisions made after core validation**

Create `deployment-options.md` in this order:

- Explain private HTTP, reverse proxy, Cloudflare Tunnel and cloud load balancer as ingress choices; Tunnel and R2 are independent services.
- State that Internet-facing production, OAuth callback and Remote MCP require HTTPS, while private-network smoke testing does not.
- Use Cloudflare Tunnel as the concrete example: create Tunnel/hostname in Cloudflare, store `TUNNEL_TOKEN`, set an HTTPS `QJUDGE_PUBLIC_ORIGIN`, and start `docker compose --profile tunnel up -d cloudflared`.
- Explain OAuth only when the reader chooses third-party login; show callback shape with `https://judge.example.com/api/v1/auth/callback/PROVIDER` and require paired client ID/secret.
- Explain that an AI provider call is outbound HTTPS. Show only interactive `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` input and restarting `ai-worker`; do not expose custom base URLs.
- Include the literal sentences `Internal MCP 不需要公開 HTTPS` and `Remote MCP 需要公開 HTTPS`, followed by the network reason and external OAuth requirements.
- Explain Cloud VM differences as VM creation, fixed IP/hostname, firewall, disk and provider permissions. Mark EC2 as the planned cloud example whose values will be added only after a real deployment.

- [ ] **Step 4: Write troubleshooting as a calm diagnostic path**

Create `deployment-troubleshooting.md` with the eight tested headings. Each section must include:

- one symptom statement in user language;
- no more than three initial commands;
- the expected result;
- the next service-specific log command;
- a warning before any operation that can replace secrets or data.

Use `docker compose config --quiet`, `docker compose ps --all`, `docker compose logs --tail=200 SERVICE`, the documented health URLs, R2 endpoint/bucket checks, `docker image inspect oj-judge:latest`, and Tunnel profile commands. Do not include `docker compose down -v` or secret-printing commands.

- [ ] **Step 5: Run the contracts**

```bash
python3 -m pytest ai-service/tests/contract/test_deployment_docs.py -q
```

Expected: all deployment document contracts written so far PASS.

- [ ] **Step 6: Commit the optional-feature pages**

```bash
git add ai-service/tests/contract/test_deployment_docs.py frontend/public/docs/zh-TW/deployment-options.md frontend/public/docs/zh-TW/deployment-troubleshooting.md
git commit -m "docs: add deployment options and recovery guide"
```

### Task 4: Make the Public Deployment Guide Discoverable

**Files:**
- Modify: `frontend/public/docs/config.json`
- Modify: `frontend/src/i18n/locales/zh-TW/docs.json`
- Modify: `README.md`
- Modify: `ai-service/tests/contract/test_deployment_docs.py`

**Interfaces:**
- Consumes: four public deployment slugs from Tasks 2–3 and i18next zh-TW fallback.
- Produces: product navigation, repository entry links and a contract that prevents returning to internal deployment sources.

- [ ] **Step 1: Add a failing discovery contract**

```python
def test_public_navigation_and_readme_use_the_public_source() -> None:
    config = _read(REPOSITORY_ROOT / "frontend/public/docs/config.json")
    labels = _read(REPOSITORY_ROOT / "frontend/src/i18n/locales/zh-TW/docs.json")
    readme = _read(REPOSITORY_ROOT / "README.md")
    assert '"id": "deployment"' in config
    for slug in (
        "deployment",
        "deployment-storage",
        "deployment-options",
        "deployment-troubleshooting",
    ):
        assert f'"{slug}"' in config
    for label in (
        '"deployment": "架設與部署"',
        '"deployment": "從一台主機開始部署"',
        '"deployment-storage": "準備檔案儲存"',
        '"deployment-options": "加入選用功能"',
        '"deployment-troubleshooting": "部署故障排除"',
    ):
        assert label in labels
    assert "](frontend/public/docs/zh-TW/deployment.md)" in readme
    assert "](docs/deployment.md)" not in readme
```

- [ ] **Step 2: Run the discovery contract and confirm RED state**

```bash
python3 -m pytest ai-service/tests/contract/test_deployment_docs.py::test_public_navigation_and_readme_use_the_public_source -q
```

Expected: FAIL because the public config and README still point to the old structure.

- [ ] **Step 3: Add the deployment navigation**

Append this section after `getting-started` in `frontend/public/docs/config.json`:

```json
{
  "id": "deployment",
  "items": [
    "deployment",
    "deployment-storage",
    "deployment-options",
    "deployment-troubleshooting"
  ]
}
```

Add these zh-TW keys:

```json
"nav.sections.deployment": "架設與部署",
"nav.items.deployment": "從一台主機開始部署",
"nav.items.deployment-storage": "準備檔案儲存",
"nav.items.deployment-options": "加入選用功能",
"nav.items.deployment-troubleshooting": "部署故障排除"
```

Insert them into the existing nested `nav.sections` and `nav.items` objects, not as dotted top-level properties.

- [ ] **Step 4: Rewrite the README entry points**

- Link deployment to `frontend/public/docs/zh-TW/deployment.md`.
- Link public user/teacher docs to `frontend/public/docs/zh-TW/overview.md` and describe the product docs page as the formal source.
- Link developer maintenance only to files that remain under `docs`.
- Remove `docs/user-guide.md`, `docs/developer-guide.md`, `docs/monitoring.md` and the claim that repository-internal deployment docs are canonical.

- [ ] **Step 5: Verify navigation, fallback and build**

```bash
python3 -m pytest ai-service/tests/contract/test_deployment_docs.py -q
(cd frontend && npm run check:docs && npm run build:docs)
```

Expected: pytest PASS; `check:docs` reports four missing deployment pages in each of the three deferred languages and exits `0`; docs build succeeds.

- [ ] **Step 6: Commit discovery changes**

```bash
git add README.md frontend/public/docs/config.json frontend/src/i18n/locales/zh-TW/docs.json ai-service/tests/contract/test_deployment_docs.py
git commit -m "docs: expose the public deployment guide"
```

### Task 5: Consolidate Adjacent Traditional Chinese Public Docs

**Files:**
- Modify: `frontend/public/docs/zh-TW/overview.md`
- Modify: `frontend/public/docs/zh-TW/mcp-setup.md`
- Modify: `frontend/public/docs/zh-TW/identity-auth-extension.md`
- Modify: `frontend/public/docs/zh-TW/dev-setup.md`
- Modify: `frontend/public/docs/zh-TW/contributing.md`
- Delete: `docs/user-guide.md`
- Delete: `docs/developer-guide.md`
- Delete: `docs/qauth-service-architecture.md`
- Delete: `docs/cloudflare.md`
- Delete: `docs/monitoring.md`
- Delete: `docs/deployment.md`
- Delete: `docs/deployment/`
- Modify: `ai-service/tests/contract/test_deployment_docs.py`

**Interfaces:**
- Consumes: public deployment pages and the current UI/auth/MCP behavior.
- Produces: one public source for deployer-facing material and no internal duplicate deployment/user/auth/monitoring guides.

- [ ] **Step 1: Add failing ownership and link contracts**

```python
def test_obsolete_internal_guides_are_removed() -> None:
    obsolete = (
        "docs/deployment.md",
        "docs/deployment",
        "docs/user-guide.md",
        "docs/developer-guide.md",
        "docs/qauth-service-architecture.md",
        "docs/cloudflare.md",
        "docs/monitoring.md",
    )
    for relative in obsolete:
        assert not (REPOSITORY_ROOT / relative).exists(), relative


def test_local_links_in_active_documentation_resolve() -> None:
    documents = (
        REPOSITORY_ROOT / "README.md",
        *DEPLOYMENT_GUIDES,
        *sorted((REPOSITORY_ROOT / "docs").glob("*.md")),
        *sorted((REPOSITORY_ROOT / "docs/operations").glob("*.md")),
    )
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for document in documents:
        for raw_target in pattern.findall(_read(document)):
            target = raw_target.split("#", 1)[0]
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved = (document.parent / target).resolve()
            assert resolved.exists(), f"broken link in {document}: {raw_target}"
```

- [ ] **Step 2: Run the ownership contract and confirm RED state**

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_obsolete_internal_guides_are_removed \
  ai-service/tests/contract/test_deployment_docs.py::test_local_links_in_active_documentation_resolve \
  -q
```

Expected: FAIL while obsolete internal sources still exist or active links point to them.

- [ ] **Step 3: Rewrite the five adjacent zh-TW pages**

- `overview.md`: explain QJudge for a first-time student, teacher and deployer; remove dates, branch names, PR numbers and `ta-agent` references.
- `mcp-setup.md`: begin with what MCP lets an external AI client do; keep client connection, OAuth consent and token safety; link server exposure and HTTPS back to `deployment-options.md`.
- `identity-auth-extension.md`: keep current QAuth provider boundary, callback registration, secret handling and test locations; absorb still-valid maintenance details from `docs/qauth-service-architecture.md`.
- `dev-setup.md`: use the current dev Compose entry, current test Compose boundary and repository scripts; separate development from production deployment and link production readers to `deployment.md`.
- `contributing.md`: describe the current branch/test/review expectations without naming an old agent, historical PR or stale migration project.

Apply the Traditional Chinese style constraints: introduce terms on first use, prefer Taiwan usage, use short paragraphs, and avoid AI-generated meta commentary.

- [ ] **Step 4: Delete internal duplicates after content migration**

Use `apply_patch` to remove the seven obsolete paths listed in this task. Confirm all useful R2/Tunnel/QAuth/developer content already exists in the public pages before each deletion.

- [ ] **Step 5: Fix every active local link**

```bash
rg -n 'docs/deployment|docs/user-guide|docs/developer-guide|docs/qauth-service-architecture|docs/cloudflare|docs/monitoring' \
  README.md docs frontend/public/docs/zh-TW ai-service/tests/contract/test_deployment_docs.py \
  --glob '!superpowers/**'
```

Expected: no stale link match; matches inside the current design/plan are allowed only until Task 6 removes those execution records.

- [ ] **Step 6: Run content contracts and frontend checks**

```bash
python3 -m pytest ai-service/tests/contract/test_deployment_docs.py -q
(cd frontend && npm run check:docs && npm run build:docs)
```

Expected: pytest and build PASS; translation warnings remain limited to languages intentionally deferred by this plan.

- [ ] **Step 7: Commit consolidation**

```bash
git add README.md \
  frontend/public/docs/zh-TW/overview.md \
  frontend/public/docs/zh-TW/mcp-setup.md \
  frontend/public/docs/zh-TW/identity-auth-extension.md \
  frontend/public/docs/zh-TW/dev-setup.md \
  frontend/public/docs/zh-TW/contributing.md \
  ai-service/tests/contract/test_deployment_docs.py
git add -u docs
git diff --cached --name-only
git commit -m "docs: consolidate public Traditional Chinese guides"
```

Expected: no unrelated AI/chatbot source or translation file is staged.

### Task 6: Remove Execution Records and Run the Final Gate

**Files:**
- Delete: `docs/superpowers/specs/2026-08-09-documentation-consolidation-design.md`
- Delete: `docs/superpowers/plans/2026-08-09-documentation-consolidation.md`
- Delete: remaining tracked files under `docs/superpowers/` after their owning work is complete
- Verify: all files changed in Tasks 1–5

**Interfaces:**
- Consumes: completed public deployment docs, updated adjacent docs and passing contracts.
- Produces: the final lean `/docs` tree; Git history retains the approved design and execution plan.

- [ ] **Step 1: Confirm no active work owns remaining plan/spec files**

```bash
git status --short
find docs/superpowers -type f -print 2>/dev/null | sort
```

Expected: only the consolidation design/plan and completed tracked records remain. If an unrelated modified or untracked plan/spec is still active, preserve it and report the temporary exception instead of deleting it.

- [ ] **Step 2: Delete completed execution records**

Use `apply_patch` to delete the consolidation design and plan plus any remaining completed tracked records. Remove empty directories only when they contain no protected files.

- [ ] **Step 3: Run the full documentation gate**

```bash
python3 -m pytest ai-service/tests/contract/test_deployment_docs.py -q
python3 -m pytest scripts/tests/test_bootstrap_ai_oauth_keys.py scripts/tests/test_bootstrap_ai_database.py -q
git diff --check
rg -n -i 'Grafana|GlitchTip|Recur|billing|OPENAI_BASE_URL|DEEPSEEK_BASE_URL' \
  frontend/public/docs/zh-TW/deployment*.md README.md
rg -n 'docs/deployment|docs/user-guide|docs/developer-guide|docs/qauth-service-architecture|docs/cloudflare|docs/monitoring' \
  README.md docs frontend/public/docs/zh-TW ai-service/tests/contract/test_deployment_docs.py
(cd frontend && npm run check:docs && npm run build:docs)
```

Expected: pytest, diff check and build PASS; both `rg` commands return no matches; `check:docs` reports the expected 12 missing deployment translations (four pages × three languages) and exits `0`.

- [ ] **Step 4: Review the final file tree and diff**

```bash
find docs -type f | sort
git diff --stat
git status --short
```

Expected: `/docs` contains only `README.md`, the retained technical/runbook files and any explicitly protected active-work record; unrelated workspace changes remain unstaged.

- [ ] **Step 5: Commit the final removal**

```bash
git add -u docs
git diff --cached --name-only
git commit -m "docs: finalize documentation ownership"
```

Do not stage `frontend/src/i18n/locales/en/docs.json`, `ja/docs.json`, `ko/docs.json` or any other unrelated working-tree changes.

## Deferred Follow-up

After the Traditional Chinese deployment path has been executed on a clean local/VM host and corrected from real results, create a separate plan for:

1. EC2 deployment verification and recording the actual AMI, instance, disk, firewall and ingress choices.
2. MinIO compatibility implementation and end-to-end object storage tests.
3. Remaining public student/teacher/admin documentation review against the current UI.
4. English, Japanese and Korean deployment translations plus all four `docs.json` navigation labels.

These items are intentionally outside this implementation plan and do not block publishing the verified Traditional Chinese deployment guide.
