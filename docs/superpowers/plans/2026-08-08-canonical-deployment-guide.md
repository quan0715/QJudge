# Canonical Deployment Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 repository 內的部署文件重構為 QJudge 唯一、正式、可驗證的架設與部署指南。

**Architecture:** `docs/deployment.md` 是從零開始的線性最小部署流程，`docs/deployment/` 依責任拆分前置資源、物件儲存、AI/MCP、HTTPS/OAuth、EC2 與故障排除。README 只提供入口；Cloudflare 文件保留平台背景並導回正式指南。純文字 contract tests 固定文件結構、狀態標示、必要連結與已移除的舊環境契約。

**Tech Stack:** Markdown、Python 3.11、pytest、Docker Compose v2、Bash 3.2+

## Global Constraints

- `docs/deployment.md` 是唯一線性主流程，不建立 EC2、自有主機兩套重複步驟。
- Cloud VM 與自有主機共用 QJudge 安裝流程；EC2 文件只處理供應商差異。
- 最小部署不需要 Grafana、GlitchTip、Recur、Cloudflare Tunnel、Tailscale、第三方 OAuth 或 Remote MCP。
- `.env` 只能由 `scripts/setup-env.sh` 建立；文件不得恢復 `cp .env.example .env`。
- R2 是目前已實作的 S3-compatible storage 初始化路徑。
- MinIO 在相容性測試完成前必須標示 `MinIO：尚未提供`，不得提供宣稱可用的操作指令。
- EC2 在實際部署完成前必須標示 `部署狀態：尚未驗證`。
- 文件不得宣稱乾淨 Linux 主機的完整部署已驗證；第一階段只驗證文件契約、env、Compose 與資料庫邊界。
- 現有 `docs/cloudflare.md` 的歷史外部狀態只能作為背景，不得成為最小部署前置條件。
- 保留工作區內與本任務無關的 AI service、backend BFF 與 `.deepagents` 修改。

---

## File Structure

- Create: `ai-service/tests/contract/test_deployment_docs.py` — 正式部署文件的結構、連結與狀態契約。
- Rewrite: `docs/deployment.md` — 從零開始的最小部署主線。
- Create: `docs/deployment/prerequisites.md` — 服務功能、必要性及自架／雲端方案。
- Create: `docs/deployment/object-storage.md` — S3 共用契約、R2 現況與 MinIO 邊界。
- Create: `docs/deployment/ai-and-mcp.md` — 無 HTTPS 與公開 HTTPS 情境的 AI/MCP 設定界線。
- Create: `docs/deployment/https-and-oauth.md` — HTTPS 選項、OAuth 條件及 Cloudflare Tunnel 實例。
- Create: `docs/deployment/ec2.md` — EC2 特有步驟與後續實測表格。
- Create: `docs/deployment/troubleshooting.md` — 診斷順序、常見錯誤與安全恢復操作。
- Modify: `README.md` — 將部署導覽收斂到正式指南。
- Modify: `docs/cloudflare.md` — 將正式操作導回 deployment 分支文件。

### Task 1: Define The Documentation Contract

**Files:**
- Create: `ai-service/tests/contract/test_deployment_docs.py`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-08-repository-deployment-guide-design.md` 的文件清單與狀態文字。
- Produces: `GUIDES: tuple[Path, ...]` 與六個文件 contract tests，供 Tasks 2–6 逐步轉綠。

- [ ] **Step 1: Write the failing documentation contract**

建立以下測試；測試只檢查可持續維護的結構與安全邊界，不逐字鎖死整篇中文內容：

```python
"""Contracts for the repository's canonical deployment guide."""

from __future__ import annotations

import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DEPLOYMENT_ROOT = REPOSITORY_ROOT / "docs/deployment"
GUIDES = (
    DEPLOYMENT_ROOT / "prerequisites.md",
    DEPLOYMENT_ROOT / "object-storage.md",
    DEPLOYMENT_ROOT / "ai-and-mcp.md",
    DEPLOYMENT_ROOT / "https-and-oauth.md",
    DEPLOYMENT_ROOT / "ec2.md",
    DEPLOYMENT_ROOT / "troubleshooting.md",
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _assert_in_order(text: str, values: tuple[str, ...]) -> None:
    positions = [text.index(value) for value in values]
    assert positions == sorted(positions)


def test_canonical_deployment_guide_is_a_linear_minimum_path() -> None:
    guide = _read(REPOSITORY_ROOT / "docs/deployment.md")
    _assert_in_order(
        guide,
        (
            "## 1. 適用範圍",
            "## 2. 最小部署架構",
            "## 3. 部署前準備",
            "## 4. 取得 QJudge",
            "## 5. 建立環境設定",
            "## 6. 啟動服務",
            "## 7. 初始化系統",
            "## 8. 驗收",
            "## 9. 選用功能",
            "## 10. 更新與停止服務",
        ),
    )
    assert "scripts/setup-env.sh" in guide
    assert "scripts/deploy-prod.sh" in guide
    assert "cp .env.example .env" not in guide
    assert not re.search(r"Grafana|GlitchTip|Recur", guide, re.IGNORECASE)


def test_all_supporting_deployment_guides_exist_and_are_linked() -> None:
    main = _read(REPOSITORY_ROOT / "docs/deployment.md")
    for guide in GUIDES:
        assert guide.is_file(), f"missing deployment guide: {guide}"
        relative = guide.relative_to(REPOSITORY_ROOT / "docs").as_posix()
        assert f"]({relative})" in main


def test_unverified_storage_and_cloud_paths_are_explicit() -> None:
    storage = _read(DEPLOYMENT_ROOT / "object-storage.md")
    ec2 = _read(DEPLOYMENT_ROOT / "ec2.md")
    assert "MinIO：尚未提供" in storage
    assert "部署狀態：尚未驗證" in ec2
    assert "--storage minio" not in storage


def test_ai_mcp_and_https_guides_keep_https_optional() -> None:
    ai_mcp = _read(DEPLOYMENT_ROOT / "ai-and-mcp.md")
    https_oauth = _read(DEPLOYMENT_ROOT / "https-and-oauth.md")
    assert "不需要公開 HTTPS" in ai_mcp
    assert "Remote MCP" in ai_mcp
    assert "OAuth" in https_oauth
    assert "Cloudflare Tunnel" in https_oauth


def test_readme_and_cloudflare_notes_point_to_the_canonical_guide() -> None:
    readme = _read(REPOSITORY_ROOT / "README.md")
    cloudflare = _read(REPOSITORY_ROOT / "docs/cloudflare.md")
    assert "](docs/deployment.md)" in readme
    assert "](deployment.md)" in cloudflare
    assert "](deployment/https-and-oauth.md)" in cloudflare
    assert "](deployment/object-storage.md)" in cloudflare


def test_local_markdown_links_resolve() -> None:
    documents = (
        REPOSITORY_ROOT / "README.md",
        REPOSITORY_ROOT / "docs/deployment.md",
        REPOSITORY_ROOT / "docs/cloudflare.md",
        *GUIDES,
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

- [ ] **Step 2: Run the contract to verify RED state**

Run:

```bash
python3 -m pytest ai-service/tests/contract/test_deployment_docs.py -q
```

Expected: FAIL because `docs/deployment/` files and the numbered main-guide sections do not exist.

- [ ] **Step 3: Commit the failing contract**

```bash
git add ai-service/tests/contract/test_deployment_docs.py
git commit -m "test: define canonical deployment guide contract"
```

### Task 2: Rewrite The Linear Minimum Deployment Guide

**Files:**
- Rewrite: `docs/deployment.md`

**Interfaces:**
- Consumes: `scripts/setup-env.sh --target <cloud-vm|self-hosted> --storage r2 --origin <URL>`、`scripts/deploy-prod.sh <deploy_path> <git_ref>`、`.env.example` 的十項 operator inputs。
- Produces: 十節固定順序的主指南，以及六個 supporting guide 的相對連結。

- [ ] **Step 1: Replace the Compose-centric document with the operator flow**

使用以下章節與內容邊界：

```markdown
# QJudge 正式架設與部署指南

> 驗證狀態：env、Compose 與資料庫邊界已驗證；乾淨 Linux 主機的完整流程尚未驗證。

## 1. 適用範圍
說明 self-hosted 與 cloud-vm 共用本流程；EC2 差異連至 supporting guide。

## 2. 最小部署架構
列出 Docker host、Compose-managed services、R2；明確排除 Tunnel、OAuth、監控與計費。

## 3. 部署前準備
連到 prerequisites，並提供 git、python3、docker、docker compose、curl 的版本檢查指令。

## 4. 取得 QJudge
使用 git clone、cd 與 git rev-parse HEAD；正式環境應固定 commit 或 release tag。

## 5. 建立環境設定
export 四個 OBJECT_STORAGE_* 後執行 setup-env.sh；禁止複製 .env.example。

## 6. 啟動服務
先執行 bootstrap_integrity_secrets.py，再以目前 commit 呼叫 deploy-prod.sh。

## 7. 初始化系統
說明 migration 由 one-shot Compose services 執行，並提供 createsuperuser 指令。

## 8. 驗收
列出 compose ps、web curl、管理員登入、評測、object upload 的檢查方式與未設定選用功能的核心流程檢查。

## 9. 選用功能
只提供六份 supporting guide 的用途與連結。

## 10. 更新與停止服務
更新仍呼叫 deploy-prod.sh 並固定 git ref；停止使用 docker compose stop，不提供 volume 刪除命令。
```

主流程的啟動指令固定為：

```bash
python3 scripts/bootstrap_integrity_secrets.py
QJUDGE_REF="$(git rev-parse HEAD)"
./scripts/deploy-prod.sh "$(pwd)" "$QJUDGE_REF"
```

在指令前說明 `deploy-prod.sh` 會強制切換到指定 ref，部署主機不得保存未提交修改。

- [ ] **Step 2: Run the main-guide contract**

Run:

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_canonical_deployment_guide_is_a_linear_minimum_path \
  -q
```

Expected: PASS.

- [ ] **Step 3: Check removed default dependencies do not return**

Run:

```bash
rg -n -i 'grafana|glitchtip|recur|cp \.env\.example \.env' docs/deployment.md
```

Expected: no output, exit code 1.

- [ ] **Step 4: Commit the main guide**

```bash
git add docs/deployment.md
git commit -m "docs: establish canonical deployment path"
```

### Task 3: Document Prerequisites And Object Storage

**Files:**
- Create: `docs/deployment/prerequisites.md`
- Create: `docs/deployment/object-storage.md`

**Interfaces:**
- Consumes: production Compose service topology、四個 `OBJECT_STORAGE_*` inputs、`setup-env.sh` 目前只接受 `r2` 的行為。
- Produces: 必要／選用服務分類、self-hosted／cloud-vm 差異表、R2 可執行設定與 MinIO 未提供邊界。

- [ ] **Step 1: Write `prerequisites.md`**

文件至少包含：

```markdown
# 部署前準備與服務選擇

## 必要軟體
64-bit Linux、Git、Python 3、Docker Engine、Docker Compose v2、curl。

## 服務功能與部署責任
用表格區分 PostgreSQL、Redis、S3-compatible storage、AI provider、MCP、公開入口；標示 QJudge Compose 管理、外部必要或外部選用。

## 開源與雲端方案
PostgreSQL／RDS、Redis／ElastiCache、MinIO／R2／S3、Caddy 或 Nginx／Cloudflare Tunnel、OpenAI-compatible local model／cloud provider。

## 自有主機與 Cloud VM 的差異
只比較主機建立、IP、防火牆、磁碟、IAM／provider policy 與維護責任；QJudge 安裝步驟保持共用。

## 主機檢查
提供 uname、free、df、git、python3、docker 與 docker compose 的唯讀檢查指令。
```

開源／雲端方案只能描述可用選擇，不得暗示 QJudge 已驗證所有組合。

- [ ] **Step 2: Write `object-storage.md`**

文件至少包含：

```markdown
# S3-compatible Object Storage

## QJudge 使用物件儲存的功能
anti-cheat evidence、Markdown images、AI artifacts。

## 共用環境契約
只列四個 operator-managed OBJECT_STORAGE_*；region、bucket、TTL 由 Compose 管理。

## Cloudflare R2
提供 endpoint 取得方式、最小權限原則、shell export 與 setup-env.sh --storage r2 範例。

## MinIO：尚未提供
說明 S3 API 相容不等於現有初始化流程已驗證；列出後續必須通過的 path-style URL、HTTP/private network、bucket bootstrap、presigned URL 與 integration tests，不提供 --storage minio 指令。

## 驗收
列出 application upload、download、presigned URL、三種用途的隔離檢查。
```

- [ ] **Step 3: Run storage and link-target contracts**

Run:

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_unverified_storage_and_cloud_paths_are_explicit \
  -q
```

Expected: FAIL only because `ec2.md` is created in Task 5. Confirm the storage assertion no longer raises by running:

```bash
python3 - <<'PY'
from pathlib import Path

text = Path("docs/deployment/object-storage.md").read_text()
assert "MinIO：尚未提供" in text
assert "--storage minio" not in text
PY
```

Expected: exit 0.

- [ ] **Step 4: Commit prerequisite and storage guides**

```bash
git add docs/deployment/prerequisites.md docs/deployment/object-storage.md
git commit -m "docs: explain deployment resources and storage"
```

### Task 4: Document AI, MCP, HTTPS, And OAuth Boundaries

**Files:**
- Create: `docs/deployment/ai-and-mcp.md`
- Create: `docs/deployment/https-and-oauth.md`

**Interfaces:**
- Consumes: internal `http://qjudge-mcp:9000/mcp` Compose route、optional `OPENAI_*`／`DEEPSEEK_*` inputs、optional `MCP_PUBLIC_URL`／`TUNNEL_TOKEN`、`tunnel` profile。
- Produces: 不需公開 HTTPS 的內部路徑與需要 HTTPS 的外部 OAuth／Remote MCP 路徑。

- [ ] **Step 1: Write `ai-and-mcp.md`**

文件要直接回答：

- QJudge 核心、AI service 與內部 qjudge-mcp 容器互連不需要公開 HTTPS。
- 使用雲端 AI API 是 outbound HTTPS，不代表 QJudge 必須有公開 HTTPS。
- 私有網路內的 OpenAI-compatible endpoint 可用 `OPENAI_BASE_URL` 或 `DEEPSEEK_BASE_URL`，但容器必須能解析並連到該位址。
- 對外提供 Remote MCP 時，client、token exchange 與 OAuth redirect 才需要穩定的公開 HTTPS origin。
- API key 與 base URL 是選用設定；未設定 provider 時不得宣稱 AI 生成功能可用。

章節必須包含文字 `不需要公開 HTTPS` 與 `Remote MCP`。

- [ ] **Step 2: Write `https-and-oauth.md`**

文件至少比較：

1. 既有反向代理搭配 ACME（Caddy 或 Nginx）。
2. Cloudflare Tunnel。
3. 僅在私有網路／VPN 使用 HTTP，不啟用公開 OAuth。

全新安裝的 Cloudflare Tunnel 範例要在第一次初始化前提供 token：

```bash
export TUNNEL_TOKEN=...
export OBJECT_STORAGE_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
export OBJECT_STORAGE_ACCESS_KEY=...
export OBJECT_STORAGE_SECRET_KEY=...
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin https://judge.example.com
docker compose --profile tunnel up -d cloudflared
```

既有部署不得為了加入 token 重跑 `setup-env.sh --force`，因為它會重新產生資料庫與應用 secrets。既有 `.env` 應透過 secret manager 或安全編輯方式加入 `TUNNEL_TOKEN`，再啟動 `tunnel` profile。

- [ ] **Step 3: Run the AI/MCP/HTTPS contract**

Run:

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_ai_mcp_and_https_guides_keep_https_optional \
  -q
```

Expected: PASS.

- [ ] **Step 4: Commit optional connectivity guides**

```bash
git add docs/deployment/ai-and-mcp.md docs/deployment/https-and-oauth.md
git commit -m "docs: separate internal and public connectivity"
```

### Task 5: Add EC2 Verification Scaffold And Troubleshooting

**Files:**
- Create: `docs/deployment/ec2.md`
- Create: `docs/deployment/troubleshooting.md`

**Interfaces:**
- Consumes: 共用 `docs/deployment.md` 流程、AWS EC2 尚未實測的限制、現有 setup/deploy script 錯誤訊息。
- Produces: 不重複 QJudge 主流程的 EC2 差異清單，以及依序診斷 env、Compose、migration、health、storage 的 runbook。

- [ ] **Step 1: Write `ec2.md` without unverified procedural claims**

文件開頭固定為：

```markdown
# AWS EC2 部署差異

> 部署狀態：尚未驗證
```

內容只列出後續實測要決定及記錄的項目：Ubuntu AMI 與 architecture、instance type、root volume、Elastic IP、Security Group inbound 22/80/443、outbound R2／image registry／AI provider、IAM 是否需要、SSH、Docker 安裝、驗證矩陣。QJudge 安裝步驟連回 `../deployment.md`，不得複製。

不要提供尚未執行過的完整 AWS Console 點擊流程，也不要列 GCE、Azure 等額外供應商。

- [ ] **Step 2: Write `troubleshooting.md` as a diagnostic order**

依序包含：

1. `./scripts/setup-env.sh` 輸入錯誤與成對 credential 錯誤。
2. `docker compose config --quiet` interpolation 問題。
3. `docker compose ps --all` 與 `docker compose logs --tail=200 <service>`。
4. `ai-db-bootstrap`、`ai-migrate`、backend migration 狀態。
5. R2 endpoint、credential、clock 與 presigned URL。
6. Docker socket UID/GID、judge image 與 integrity secrets。
7. Tunnel profile 未啟用時 `cloudflared` 不應出現，這不是故障。

所有指令預設唯讀或可重試；`down -v`、刪除 volumes、清除資料庫等破壞性指令不放入一般故障排除。

- [ ] **Step 3: Run EC2 status contract**

Run:

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_unverified_storage_and_cloud_paths_are_explicit \
  -q
```

Expected: PASS.

- [ ] **Step 4: Commit platform and troubleshooting guides**

```bash
git add docs/deployment/ec2.md docs/deployment/troubleshooting.md
git commit -m "docs: add EC2 verification and troubleshooting guides"
```

### Task 6: Consolidate Navigation And Verify The Guide Set

**Files:**
- Modify: `README.md`
- Modify: `docs/cloudflare.md`
- Test: `ai-service/tests/contract/test_deployment_docs.py`

**Interfaces:**
- Consumes: Tasks 2–5 的七份正式部署文件。
- Produces: repository 首頁與 Cloudflare 背景文件的單一正式入口，以及全部通過的 link contract。

- [ ] **Step 1: Reduce README deployment content to the canonical entry point**

保留開發環境快速啟動，但將 production env 表格、CD 細節與重複部署敘述縮減為：

```markdown
## 架設與部署

正式的最小部署流程、外部服務選擇與驗收方式，請參考
[QJudge 正式架設與部署指南](docs/deployment.md)。
```

文件導覽也只保留同一連結，不複製 supporting guide 清單。

- [ ] **Step 2: Make Cloudflare notes a supporting reference**

在 `docs/cloudflare.md` 開頭加入：

```markdown
QJudge 的正式部署主線請先閱讀 [正式架設與部署指南](deployment.md)。
HTTPS、OAuth 與 Tunnel 操作以 [HTTPS 與 OAuth](deployment/https-and-oauth.md)
為準；R2 操作以 [S3-compatible Object Storage](deployment/object-storage.md) 為準。
```

移除與新文件重複的完整 Tunnel／R2 指令，但保留歷史 MCP snapshot、zone／route 背景與 Cloudflare Pages／Realtime 說明。

- [ ] **Step 3: Run all documentation contracts**

Run:

```bash
python3 -m pytest ai-service/tests/contract/test_deployment_docs.py -q
```

Expected: 6 passed.

- [ ] **Step 4: Run env and Compose regression contracts**

Run:

```bash
bash -n scripts/setup-env.sh scripts/deploy-prod.sh
python3 -m pytest \
  ai-service/tests/contract/test_setup_env.py \
  ai-service/tests/contract/test_compose_boundaries.py \
  integrity-service/tests/test_compose_contract.py \
  -q
```

Expected: all tests pass. The existing pytest-asyncio loop-scope deprecation warning does not fail the run.

- [ ] **Step 5: Scan for stale contracts and broken formatting**

Run:

```bash
rg -n -i \
  'cp \.env\.example \.env|TUNNEL_TOKEN.*required|Grafana.*required|GlitchTip.*required|Recur.*required' \
  README.md docs/deployment.md docs/deployment docs/cloudflare.md
git diff --check
```

Expected: `rg` prints no matches and exits 1; `git diff --check` exits 0.

- [ ] **Step 6: Review the final guide against the design spec**

Read in order:

```text
docs/deployment.md
docs/deployment/prerequisites.md
docs/deployment/object-storage.md
docs/deployment/ai-and-mcp.md
docs/deployment/https-and-oauth.md
docs/deployment/ec2.md
docs/deployment/troubleshooting.md
```

Confirm the main path can be read without opening optional pages, no unverified path is presented as complete, and Cloud VM／self-hosted differences appear only where they change an operator action.

- [ ] **Step 7: Commit navigation and final contracts**

```bash
git add README.md docs/cloudflare.md ai-service/tests/contract/test_deployment_docs.py
git commit -m "docs: publish canonical deployment guide navigation"
```

## Completion Evidence

Before reporting completion, record:

- Documentation contract test count and exit code.
- Env／Compose contract test count and exit code.
- `git diff --check` exit code.
- The exact Git commits created for Tasks 1–6.
- Remaining unverified work: MinIO compatibility, clean Linux end-to-end deployment, AWS EC2 deployment.

### Task 7: Move Custom Model Endpoints Out Of Deployment Scope

**Files:**
- Modify: `ai-service/tests/contract/test_deployment_docs.py`
- Modify: `.env.example`
- Modify: `docs/deployment/ai-and-mcp.md`
- Modify: `docs/deployment/prerequisites.md`

**Interfaces:**
- Consumes: 現有 `OPENAI_API_KEY`、`DEEPSEEK_API_KEY` provider inputs，以及底層仍支援 `OPENAI_BASE_URL`、`DEEPSEEK_BASE_URL` 的 model factory。
- Produces: 只說明既有 provider credential 的部署文件；自訂 endpoint 能力保留在程式，但不出現在 deployment contract。

- [ ] **Step 1: Add a failing deployment-scope contract**

在 `test_deployment_docs.py` 新增：

```python
def test_custom_model_endpoints_are_outside_deployment_scope() -> None:
    documents = (
        REPOSITORY_ROOT / ".env.example",
        REPOSITORY_ROOT / "docs/deployment.md",
        *GUIDES,
    )
    for document in documents:
        text = _read(document)
        assert "OPENAI_BASE_URL" not in text, document
        assert "DEEPSEEK_BASE_URL" not in text, document
```

- [ ] **Step 2: Run the test to verify RED state**

Run:

```bash
python3 -m pytest \
  ai-service/tests/contract/test_deployment_docs.py::test_custom_model_endpoints_are_outside_deployment_scope \
  -q
```

Expected: FAIL because `.env.example` and `docs/deployment/ai-and-mcp.md` still mention both Base URL variables.

- [ ] **Step 3: Remove custom endpoint documentation**

Apply these exact scope changes:

- `.env.example` keeps `OPENAI_API_KEY` and `DEEPSEEK_API_KEY`, but removes both Base URL comment lines.
- `ai-and-mcp.md` provider table lists only the two API keys.
- `ai-and-mcp.md` removes the private OpenAI-compatible endpoint section and any instruction to export a Base URL.
- `prerequisites.md` describes AI provider as an optional existing cloud provider credential; it does not list a self-hosted endpoint or model proxy.
- Do not modify `scripts/setup-env.sh`, `ai-service/config.py` or `model_factory.py`; those belong to the future model-extension surface.

- [ ] **Step 4: Run documentation and capability regression tests**

Run:

```bash
cd ai-service
python3 -m pytest \
  tests/contract/test_deployment_docs.py \
  tests/contract/test_setup_env.py \
  tests/unit/test_provider_endpoint_config.py \
  -q
```

Expected: all tests pass. `test_provider_endpoint_config.py` proves the hidden extension capability remains available.

- [ ] **Step 5: Scan and commit**

Run:

```bash
rg -n 'OPENAI_BASE_URL|DEEPSEEK_BASE_URL' .env.example docs/deployment.md docs/deployment
git diff --check
```

Expected: `rg` has no matches and exits 1; `git diff --check` exits 0.

Commit:

```bash
git add \
  .env.example \
  ai-service/tests/contract/test_deployment_docs.py \
  docs/deployment/ai-and-mcp.md \
  docs/deployment/prerequisites.md
git commit -m "docs: separate custom model endpoint guidance"
```
