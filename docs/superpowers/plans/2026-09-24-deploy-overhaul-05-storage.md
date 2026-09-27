# Deploy Overhaul 05：Storage 與 MinIO addon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所有物件放在單一 bucket，移除執行期建 bucket、object tagging 與 R2 分支；MinIO 成為 `deploy/addons/storage` addon，以 `deploy/qjudge addon storage up|init` 管理；本地 dev 改用同一份 MinIO 定義。

**Architecture:** 現有 object key 已各自帶開頭（`markdown/`、`integrity/`、`ai-artifacts/`、`contest_*/`、`runs/`），彼此不重疊，所以只要讓各功能指向同一個 bucket，不需要 prefix 層，DB 內的 key 不變。app 讀 `OBJECT_STORAGE_BUCKET`；未設定時沿用舊的各功能 bucket key（dcslab 在 08 轉換前仍用舊 compose）。MinIO addon 是獨立 compose project，接上外部 network `qjudge`（alias `minio`）；root 帳密就是 `OBJECT_STORAGE_ACCESS_KEY`／`OBJECT_STORAGE_SECRET_KEY`，CORS 由 `MINIO_API_CORS_ALLOW_ORIGIN` 設定，bucket 由一次性的 `storage-init` 服務以 `mc mb` 建立。dev overlay 以 `extends` 引用同一份服務定義，MinIO 跑在 dev project 內。

**Tech Stack:** Django settings、boto3、pydantic-settings、Docker Compose v2（`extends`、profiles）、MinIO／mc、Python 標準函式庫 CLI。

**Spec:** `docs/superpowers/specs/2026-09-23-deploy-config-overhaul-design.md` §3（Storage key）、§7、§8

**計畫系列：** 01–04（完成）→ **05 Storage 與 MinIO addon（本文件）** → 05b Media addon（LiveKit；需先確認 dcslab 現行 `qjudge-media` 設定）→ 06 init／upgrade／rollback 與 CD → 07 CI E2E、刪除 test compose、文件 → 08 dcslab 轉換與清理。

**不在本計畫：** `.env` 自動寫入（06 `init`）、dcslab 舊 bucket 複製（08，以 `mc mirror`）、舊 compose 與 `scripts/migrate_s3_to_minio.py` 等舊檔刪除（08）、公開文件（07）。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `backend/config/settings/base.py`（修改） | `OBJECT_STORAGE_BUCKET`；region 常數；移除 R2 判斷、tagging、auto-create、`MARKDOWN_IMAGE_S3_*` 連線別名 |
| `backend/config/settings/loadtest.py`（修改） | 移除 region 覆寫 |
| `backend/apps/contests/services/anticheat_storage.py`（修改） | 移除 tagging 與未使用的 retain／list 函式 |
| `backend/apps/contests/views/exam_evidence.py`（修改） | 上傳 required headers 不再帶 `x-amz-tagging` |
| `backend/apps/core/services/markdown_image_storage.py`、`backend/apps/core/services/__init__.py`（修改） | 移除建 bucket；改用 `OBJECT_STORAGE_*` 連線設定 |
| `ai-service/config.py`、`ai-service/infrastructure/artifacts/s3_artifact_store.py`、`ai-service/main.py`、`ai-service/worker/tasks.py`（修改） | 單一 bucket；移除 region／auto-create |
| `deploy/qjudge_cli/schema.py`、`check.py`、`lint.py`（修改） | storage key 說明、`MINIO_DATA_DIR`、bundled 密碼長度 |
| `deploy/compose.yml`（修改） | 傳 `OBJECT_STORAGE_BUCKET`；AI 直接讀 `OBJECT_STORAGE_*` |
| `deploy/addons/storage/compose.yml`（新增） | MinIO 與 `storage-init` |
| `deploy/qjudge_cli/addon.py`（新增）、`cli.py`、`ingress.py`（修改） | `addon storage up|init`；ingress 列出 storage 入口 |
| `compose.dev.yml`（修改） | dev 的 `minio`／`storage-init`（extends addon） |
| `.github/workflows/ci.yml`（修改） | lint 與 config 檢查涵蓋 addon |

---

### Task 1: Backend 單一 bucket 與移除 tagging／建 bucket

**Files:**
- Modify: `backend/config/settings/base.py`、`backend/config/settings/loadtest.py`
- Modify: `backend/apps/contests/services/anticheat_storage.py`、`backend/apps/contests/views/exam_evidence.py`
- Modify: `backend/apps/core/services/markdown_image_storage.py`、`backend/apps/core/services/__init__.py`
- Test: `backend/apps/core/tests/test_deploy_settings.py`、`backend/apps/core/tests/test_markdown_image_storage.py`（新增）、`backend/apps/contests/tests/test_anticheat_storage.py`（新增）

- [x] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_deploy_settings.py`：`CLEARED_KEYS` 加入 `"OBJECT_STORAGE_BUCKET"`、`"ANTICHEAT_RAW_BUCKET"`、`"INTEGRITY_ARCHIVE_BUCKET"`、`"MARKDOWN_IMAGE_S3_BUCKET"`、`"OBJECT_STORAGE_REGION"`、`"OBJECT_STORAGE_ENDPOINT_URL"`，檔尾加入：

```python
BUCKET_SETTINGS = ["ANTICHEAT_RAW_BUCKET", "INTEGRITY_ARCHIVE_BUCKET", "MARKDOWN_IMAGE_S3_BUCKET"]


def test_single_bucket_serves_every_feature():
    values = load_settings(
        "base",
        {
            "OBJECT_STORAGE_BUCKET": "qjudge",
            "ANTICHEAT_RAW_BUCKET": "ignored",
            "MARKDOWN_IMAGE_S3_BUCKET": "ignored",
        },
        BUCKET_SETTINGS,
    )

    assert values == {name: "qjudge" for name in BUCKET_SETTINGS}


def test_legacy_bucket_keys_apply_without_single_bucket():
    values = load_settings(
        "base",
        {"ANTICHEAT_RAW_BUCKET": "old-raw", "MARKDOWN_IMAGE_S3_BUCKET": "old-markdown"},
        BUCKET_SETTINGS,
    )

    assert values == {
        "ANTICHEAT_RAW_BUCKET": "old-raw",
        "INTEGRITY_ARCHIVE_BUCKET": "old-raw",
        "MARKDOWN_IMAGE_S3_BUCKET": "old-markdown",
    }


def test_storage_region_is_constant():
    values = load_settings(
        "base",
        {
            "OBJECT_STORAGE_REGION": "auto",
            "OBJECT_STORAGE_ENDPOINT_URL": "https://account.r2.cloudflarestorage.com",
        },
        ["OBJECT_STORAGE_REGION"],
    )

    assert values == {"OBJECT_STORAGE_REGION": "us-east-1"}
```

`backend/apps/core/tests/test_markdown_image_storage.py`：

```python
from apps.core.services import markdown_image_storage as storage


class RecordingClient:
    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        def record(**kwargs):
            self.calls.append((name, kwargs))

        return record


def test_store_uploads_without_bucket_checks(monkeypatch, settings):
    settings.MARKDOWN_IMAGE_S3_BUCKET = "qjudge"
    client = RecordingClient()
    monkeypatch.setattr(storage, "get_markdown_image_s3_client", lambda: client)

    storage.store_markdown_image(b"png", f"markdown/2026/09/{'a' * 32}.png", "image/png")

    assert [name for name, _ in client.calls] == ["put_object"]
    assert client.calls[0][1]["Bucket"] == "qjudge"
```

`backend/apps/contests/tests/test_anticheat_storage.py`：

```python
from apps.contests.services.anticheat_storage import generate_put_url


class PresignClient:
    def generate_presigned_url(self, ClientMethod, Params, ExpiresIn):
        self.params = Params
        return "https://files.example.edu/signed"


def test_put_url_carries_no_tagging():
    client = PresignClient()

    generate_put_url("qjudge", "contest_1/user_2/session_x/screen_share/ts_1_seq_0001.webp", client=client)

    assert client.params == {
        "Bucket": "qjudge",
        "Key": "contest_1/user_2/session_x/screen_share/ts_1_seq_0001.webp",
        "ContentType": "image/webp",
    }
```

這兩個新測試不需要 DB。若 `backend/apps/contests/tests/` 的 conftest 有 autouse 的 DB fixture 讓測試需要 DB，改放 `backend/apps/core/tests/test_anticheat_storage.py`。

- [x] **Step 2: Run tests to verify they fail**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python -m pytest -q -p no:cacheprovider apps/core/tests/test_deploy_settings.py apps/core/tests/test_markdown_image_storage.py apps/contests/tests/test_anticheat_storage.py
```

Expected: bucket 與 region 測試 FAIL；markdown 測試 FAIL（呼叫了 `head_bucket`）；anticheat 測試 FAIL（`Tagging` 在參數中）。

- [x] **Step 3: Implement**

`backend/config/settings/base.py`：

1. 刪除 `_endpoint_is_r2` 函式（約第 17–23 行）與 `from urllib.parse import urlparse`（確認檔內無其他使用）。
2. 物件儲存區塊（`# S3-compatible object storage connection settings.` 起，到 `ANTICHEAT_CAPTURE_INTERVAL_SECONDS = 3` 為止）改為：

```python
# ---------------------------------------------------------------------------
# S3-compatible object storage. Every object lives in one bucket; object keys
# already carry their own prefixes (markdown/, integrity/, ai-artifacts/,
# contest_*/, runs/).
# ---------------------------------------------------------------------------
OBJECT_STORAGE_ENDPOINT_URL = env("OBJECT_STORAGE_ENDPOINT_URL", "")
# Browser-facing endpoint used for presigned URLs.
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL = env("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", "")
OBJECT_STORAGE_REGION = "us-east-1"
OBJECT_STORAGE_ACCESS_KEY = env("OBJECT_STORAGE_ACCESS_KEY", "")
OBJECT_STORAGE_SECRET_KEY = env("OBJECT_STORAGE_SECRET_KEY", "")
OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS = 300
OBJECT_STORAGE_BUCKET = env("OBJECT_STORAGE_BUCKET")

# Per-feature bucket keys are read only for hosts still on the legacy compose.
ANTICHEAT_RAW_BUCKET = OBJECT_STORAGE_BUCKET or env("ANTICHEAT_RAW_BUCKET", "anticheat-raw")
INTEGRITY_ARCHIVE_BUCKET = OBJECT_STORAGE_BUCKET or env("INTEGRITY_ARCHIVE_BUCKET", ANTICHEAT_RAW_BUCKET)
INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES = 1073741824
INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES = 268435456
ANTICHEAT_CAPTURE_INTERVAL_SECONDS = 3
```

（刪除的是 `OBJECT_STORAGE_REGION` 的 env 讀取、`_OBJECT_STORAGE_IS_R2`、`OBJECT_STORAGE_OBJECT_TAGGING_ENABLED`、`OBJECT_STORAGE_AUTO_CREATE_BUCKETS`、`MARKDOWN_IMAGE_S3_ENDPOINT_URL`／`_REGION`／`_ACCESS_KEY`／`_SECRET_KEY`。）

3. `MARKDOWN_IMAGE_S3_BUCKET = env("MARKDOWN_IMAGE_S3_BUCKET", "markdown-images")` 改為：

```python
MARKDOWN_IMAGE_S3_BUCKET = OBJECT_STORAGE_BUCKET or env("MARKDOWN_IMAGE_S3_BUCKET", "markdown-images")
```

`backend/config/settings/loadtest.py`：刪除 `OBJECT_STORAGE_REGION = env("OBJECT_STORAGE_REGION", "auto")` 這一行。

`backend/apps/contests/services/anticheat_storage.py`：

1. `generate_put_url` 移除 `tagging` 參數與 `if tagging and settings.OBJECT_STORAGE_OBJECT_TAGGING_ENABLED:` 兩行。
2. 刪除 `tag_object_retain`、`tag_objects_retain`、`list_raw_keys_for_user`（全 repo 無呼叫者；刪除前再以 `git grep -n "tag_object_retain\|tag_objects_retain\|list_raw_keys_for_user"` 確認）。

`backend/apps/contests/views/exam_evidence.py`：`required_headers` 改為

```python
                        "required_headers": {"Content-Type": "image/webp"},
```

`backend/apps/core/services/markdown_image_storage.py`：

1. 刪除 `_BUCKET_READY`、`reset_bucket_ready_cache`、`_ensure_bucket_exists`；`store_markdown_image` 移除 `_ensure_bucket_exists(client)` 呼叫。
2. `get_markdown_image_s3_client` 改用共用設定：

```python
def get_markdown_image_s3_client():
    """Build boto3 S3 client for markdown images."""
    boto3 = _get_boto3()
    kwargs: dict[str, Any] = {
        "aws_access_key_id": settings.OBJECT_STORAGE_ACCESS_KEY,
        "aws_secret_access_key": settings.OBJECT_STORAGE_SECRET_KEY,
        "region_name": settings.OBJECT_STORAGE_REGION,
    }
    if settings.OBJECT_STORAGE_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.OBJECT_STORAGE_ENDPOINT_URL
    return boto3.client("s3", **kwargs)
```

`backend/apps/core/services/__init__.py`：移除 `reset_bucket_ready_cache` 的 import 與 `__all__` 項目。

最後 `git grep -n -E "OBJECT_STORAGE_OBJECT_TAGGING_ENABLED|OBJECT_STORAGE_AUTO_CREATE_BUCKETS|MARKDOWN_IMAGE_S3_(ENDPOINT_URL|REGION|ACCESS_KEY|SECRET_KEY)|reset_bucket_ready_cache|_endpoint_is_r2" -- backend ':!backend/venv'` 應無結果。

- [x] **Step 4: Run tests to verify they pass**

Step 2 的指令全數 PASS。另執行不需 DB 的相關測試：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python -m pytest -q -p no:cacheprovider apps/core/tests/test_env_helper.py apps/core/tests/test_healthcheck.py
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python -m compileall -q apps config
```

需要 DB 的 contests／core API 測試在 CI 執行（本地 DB 帳號無 CREATEDB）。

- [x] **Step 5: Commit**

```bash
git add backend/apps/core/tests/test_markdown_image_storage.py backend/apps/contests/tests/test_anticheat_storage.py
git commit -m "refactor(backend): serve all objects from one bucket without tagging or bucket creation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- backend/config/settings/base.py backend/config/settings/loadtest.py backend/apps/contests/services/anticheat_storage.py backend/apps/contests/views/exam_evidence.py backend/apps/core/services/markdown_image_storage.py backend/apps/core/services/__init__.py backend/apps/core/tests/test_deploy_settings.py backend/apps/core/tests/test_markdown_image_storage.py backend/apps/contests/tests/test_anticheat_storage.py
```

（`exam_evidence.py` 等檔案若另有使用者未提交的修改，只 commit 本任務的 hunk；無法分離時停下回報。）

---

### Task 2: ai-service 單一 bucket

**Files:**
- Modify: `ai-service/config.py`、`ai-service/infrastructure/artifacts/s3_artifact_store.py`、`ai-service/main.py`、`ai-service/worker/tasks.py`
- Test: `ai-service/tests/test_deploy_config.py`、`ai-service/tests/unit/test_artifact_service.py`

- [x] **Step 1: Write the failing tests**

`ai-service/tests/test_deploy_config.py` 檔尾加入：

```python
def test_artifact_bucket_prefers_single_bucket(monkeypatch):
    monkeypatch.setenv("OBJECT_STORAGE_BUCKET", "qjudge")
    monkeypatch.setenv("AI_ARTIFACT_S3_BUCKET", "legacy")

    assert Settings(_env_file=None).artifact_s3_bucket == "qjudge"


def test_artifact_bucket_falls_back_to_legacy_key(monkeypatch):
    monkeypatch.delenv("OBJECT_STORAGE_BUCKET", raising=False)
    monkeypatch.setenv("AI_ARTIFACT_S3_BUCKET", "legacy")

    assert Settings(_env_file=None).artifact_s3_bucket == "legacy"
```

`ai-service/tests/unit/test_artifact_service.py`：

1. 刪除 `test_s3_store_creates_missing_regional_bucket`。
2. `test_s3_store_put_checks_bucket_once_and_uploads_content` 改名為 `test_s3_store_put_uploads_without_bucket_calls`，斷言改為 client 沒有收到 `head_bucket`／`create_bucket`，只收到 `put_object`（依該測試現有的 fake client 寫法調整）。
3. `test_s3_store_presign_uses_browser_endpoint_and_ttl`：移除 `region="ap-northeast-1"` 參數，預期的 `region_name` 改為 `"us-east-1"`。
4. 其他建構 `S3ArtifactStore(... region=..., auto_create_bucket=...)` 的地方移除這兩個參數。

- [x] **Step 2: Run tests to verify they fail**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m pytest -q -p no:cacheprovider tests/test_deploy_config.py tests/unit/test_artifact_service.py
```

（若 dev 容器沒有掛載原始碼或測試依賴，改用 `cd ai-service && uv run pytest ...`，並回報使用的方式。）

Expected: 新的 bucket 測試 FAIL；store 測試因仍呼叫 `head_bucket` 或 `region` 參數不符而 FAIL／ERROR。

- [x] **Step 3: Implement**

`ai-service/config.py`：

1. 刪除 `artifact_storage_region` 與 `artifact_storage_auto_create_bucket` 兩個欄位。
2. `artifact_s3_bucket` 改為：

```python
    # AI_ARTIFACT_S3_BUCKET is read only for hosts still on the legacy compose.
    artifact_s3_bucket: str = Field(
        default="ai-artifacts",
        validation_alias=AliasChoices("OBJECT_STORAGE_BUCKET", "AI_ARTIFACT_S3_BUCKET"),
    )
```

`ai-service/infrastructure/artifacts/s3_artifact_store.py` 的 `S3ArtifactStore`：

1. 建構子移除 `region` 與 `auto_create_bucket` 參數，移除 `self._region`、`self._auto_create_bucket`、`self._bucket_ready`；client kwargs 的 `"region_name"` 固定為 `"us-east-1"`。
2. `_put` 移除 `self._ensure_bucket()`；刪除 `_ensure_bucket` 方法。

`ai-service/main.py` 的 `_artifact_store` 與 `ai-service/worker/tasks.py` 的 `_artifact_store`：移除 `region=...` 與 `auto_create_bucket=...` 兩行。

`git grep -n -E "artifact_storage_region|artifact_storage_auto_create_bucket|auto_create_bucket|_ensure_bucket" -- ai-service ':!ai-service/tests/contract'` 應無結果（contract 測試檢查的是舊 compose，本計畫不動）。

- [x] **Step 4: Run tests to verify they pass**

Step 2 的指令全數 PASS，另跑整個 unit 目錄確認沒有其他測試依賴被刪除的參數：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m pytest -q -p no:cacheprovider tests/unit tests/test_deploy_config.py
```

- [x] **Step 5: Commit**

```bash
git commit -m "refactor(ai): store artifacts in the shared bucket without bucket creation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- ai-service/config.py ai-service/infrastructure/artifacts/s3_artifact_store.py ai-service/main.py ai-service/worker/tasks.py ai-service/tests/test_deploy_config.py ai-service/tests/unit/test_artifact_service.py
```

---

### Task 3: schema 與 compose 傳遞單一 bucket

**Files:**
- Modify: `deploy/qjudge_cli/schema.py`、`deploy/qjudge_cli/check.py`、`deploy/qjudge_cli/lint.py`、`deploy/compose.yml`、`deploy/.env.example`
- Test: `deploy/qjudge_cli/tests/test_check.py`、`deploy/qjudge_cli/tests/test_lint.py`

- [x] **Step 1: Write the failing tests**

`deploy/qjudge_cli/tests/test_check.py`：`VALID` 的 `"OBJECT_STORAGE_SECRET_KEY": "secret"` 改為 `"secret-key"`，`CheckTests` 內加入：

```python
    def test_bundled_storage_secret_needs_eight_characters(self):
        env = with_changes(OBJECT_STORAGE_SECRET_KEY="short")
        self.assertEqual(error_keys(env), ["OBJECT_STORAGE_SECRET_KEY"])

    def test_external_storage_secret_has_no_length_rule(self):
        env = with_changes(STORAGE_MODE="external", OBJECT_STORAGE_SECRET_KEY="short")
        self.assertEqual(check_env(env), [])

    def test_minio_data_dir_is_optional(self):
        self.assertEqual(check_env(with_changes(MINIO_DATA_DIR="/mnt/data/minio")), [])
```

`deploy/qjudge_cli/tests/test_lint.py` 的測試類別內加入：

```python
    def test_minio_data_dir_may_default_to_a_volume(self):
        self.assertEqual(lint_compose_text("      - ${MINIO_DATA_DIR:-minio-data}:/data\n"), [])
```

（`lint_compose_text` 的 import 依該檔現有寫法。）

- [x] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: 新測試 FAIL（無長度規則、`MINIO_DATA_DIR` 為 unknown key、lint 報 default）。

- [x] **Step 3: Implement**

`deploy/qjudge_cli/schema.py` 的 `# Object storage` 區塊改為：

```python
    # Object storage
    Key("STORAGE_MODE", "storage",
        "bundled runs MinIO via `deploy/qjudge addon storage up`; external uses an existing S3-compatible service.",
        required=True),
    Key("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", "storage",
        "Storage URL reachable from browsers; must be HTTPS when the origin is HTTPS.",
        required=True),
    Key("OBJECT_STORAGE_ENDPOINT_URL", "storage",
        "Storage URL reachable from containers; http://minio:9000 in bundled mode.",
        required=True),
    Key("OBJECT_STORAGE_ACCESS_KEY", "storage",
        "Storage access key; also the MinIO root user in bundled mode.",
        required=True, secret=True),
    Key("OBJECT_STORAGE_SECRET_KEY", "storage",
        "Storage secret key; also the MinIO root password (at least 8 characters) in bundled mode.",
        required=True, secret=True),
    Key("OBJECT_STORAGE_BUCKET", "storage", "Bucket holding every QJudge object.", required=True),
    Key("MINIO_DATA_DIR", "storage",
        "Host directory for bundled MinIO data; a Docker volume is used when unset."),
```

`deploy/qjudge_cli/check.py` 的 `_value_problem`，在 `URL_SAFE_PASSWORD_KEYS` 判斷之前加入：

```python
    if name == "OBJECT_STORAGE_SECRET_KEY" and env.get("STORAGE_MODE") == "bundled" and len(value) < 8:
        return "must be at least 8 characters because it is the MinIO root password"
```

`deploy/qjudge_cli/lint.py`：`TOPOLOGY_DEFAULTS` 加入 `"MINIO_DATA_DIR"`。

`deploy/compose.yml`：

1. `x-django-environment` 在 `OBJECT_STORAGE_SECRET_KEY` 之後加入 `OBJECT_STORAGE_BUCKET: ${OBJECT_STORAGE_BUCKET}`。
2. `x-ai-environment` 的四行 `AI_ARTIFACT_STORAGE_*: ${OBJECT_STORAGE_*}` 改為：

```yaml
  OBJECT_STORAGE_ENDPOINT_URL: ${OBJECT_STORAGE_ENDPOINT_URL}
  OBJECT_STORAGE_PUBLIC_ENDPOINT_URL: ${OBJECT_STORAGE_PUBLIC_ENDPOINT_URL}
  OBJECT_STORAGE_ACCESS_KEY: ${OBJECT_STORAGE_ACCESS_KEY}
  OBJECT_STORAGE_SECRET_KEY: ${OBJECT_STORAGE_SECRET_KEY}
  OBJECT_STORAGE_BUCKET: ${OBJECT_STORAGE_BUCKET}
```

重新產生範本：`deploy/qjudge env-example > deploy/.env.example`

- [x] **Step 4: Run tests to verify they pass**

```bash
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
deploy/qjudge lint-compose deploy/compose.yml
QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/compose.yml -f deploy/compose.build.yml config --quiet
deploy/qjudge check
```

Expected：unittest OK；lint 無輸出；config 成功；本地 `deploy/.env`（目前 `STORAGE_MODE=external`）仍 OK。本地 dev 的 storage 在 Task 5 才切換，這個 commit 之後 dev 的上傳仍不可用（切換前本來就無法使用：R2 上沒有預設名稱的 bucket）。

- [x] **Step 5: Commit**

```bash
git commit -m "feat(deploy): pass the single storage bucket and describe bundled MinIO keys" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/qjudge_cli/schema.py deploy/qjudge_cli/check.py deploy/qjudge_cli/lint.py deploy/compose.yml deploy/.env.example deploy/qjudge_cli/tests/test_check.py deploy/qjudge_cli/tests/test_lint.py
```

---

### Task 4: MinIO addon、`qjudge addon` 與 ingress

**Files:**
- Create: `deploy/addons/storage/compose.yml`、`deploy/qjudge_cli/addon.py`
- Modify: `deploy/qjudge_cli/cli.py`、`deploy/qjudge_cli/ingress.py`、`.github/workflows/ci.yml`
- Test: `deploy/qjudge_cli/tests/test_addon.py`（新增）、`deploy/qjudge_cli/tests/test_ingress.py`

- [x] **Step 1: 確認 MinIO image 是否內含 `mc`**

```bash
docker run --rm --entrypoint sh quay.io/minio/minio:latest@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e -c 'command -v mc && mc --version'
```

有 `mc`：`storage-init` 使用同一個 image。沒有：`docker pull quay.io/minio/mc:latest` 後以 `docker image inspect --format '{{index .RepoDigests 0}}'` 取得 digest，`storage-init` 使用 `quay.io/minio/mc@sha256:<digest>`。在回報中寫明採用哪一種。

- [x] **Step 2: Write the failing tests**

`deploy/qjudge_cli/tests/test_addon.py`：

```python
import unittest
from pathlib import Path

from qjudge_cli.addon import addon_command, run_addon
from qjudge_cli.tests.test_check import VALID

DEPLOY = Path("/srv/qjudge/deploy")
ENV_FILE = DEPLOY / ".env"


class Recorder:
    def __init__(self, network_exists=True):
        self.calls = []
        self.network_exists = network_exists

    def __call__(self, args, **kwargs):
        self.calls.append(args)
        missing = args[:3] == ["docker", "network", "inspect"] and not self.network_exists
        return type("Result", (), {"returncode": 1 if missing else 0})()


class AddonTests(unittest.TestCase):
    def test_storage_up_command(self):
        self.assertEqual(
            addon_command(DEPLOY, ENV_FILE, "storage", "up"),
            [
                "docker", "compose", "--project-directory", "/srv/qjudge/deploy",
                "--env-file", "/srv/qjudge/deploy/.env",
                "-f", "/srv/qjudge/deploy/addons/storage/compose.yml",
                "up", "-d", "minio",
            ],
        )

    def test_storage_init_runs_one_off_service(self):
        self.assertEqual(addon_command(DEPLOY, ENV_FILE, "storage", "init")[-3:], ["run", "--rm", "storage-init"])

    def test_refuses_when_storage_is_external(self):
        run = Recorder()
        code = run_addon(DEPLOY, ENV_FILE, {**VALID, "STORAGE_MODE": "external"}, "storage", "up", run=run)
        self.assertEqual(code, 1)
        self.assertEqual(run.calls, [])

    def test_refuses_invalid_env(self):
        run = Recorder()
        code = run_addon(DEPLOY, ENV_FILE, {**VALID, "OBJECT_STORAGE_BUCKET": ""}, "storage", "up", run=run)
        self.assertEqual(code, 1)
        self.assertEqual(run.calls, [])

    def test_creates_missing_network_before_running(self):
        run = Recorder(network_exists=False)
        code = run_addon(DEPLOY, ENV_FILE, VALID, "storage", "init", run=run)
        self.assertEqual(code, 0)
        self.assertEqual(run.calls[1], ["docker", "network", "create", "qjudge"])
        self.assertEqual(run.calls[2][-3:], ["run", "--rm", "storage-init"])


if __name__ == "__main__":
    unittest.main()
```

`deploy/qjudge_cli/tests/test_ingress.py` 的 `IngressTests` 內加入：

```python
    def test_bundled_storage_entry(self):
        text = render_ingress(VALID)
        self.assertIn("Storage  https://files.example.edu", text)
        self.assertIn("http://127.0.0.1:9000", text)

    def test_external_storage_has_no_entry(self):
        self.assertNotIn("Storage", render_ingress({**VALID, "STORAGE_MODE": "external"}))

    def test_tunnel_routes_storage_to_minio(self):
        text = render_ingress({**VALID, "COMPOSE_PROFILES": "tunnel", "TUNNEL_TOKEN": "t"})
        self.assertIn("route files.example.edu -> http://minio:9000", text)

    def test_nginx_includes_storage_server(self):
        text = render_nginx(VALID)
        self.assertIn("server_name files.example.edu;", text)
        self.assertIn("proxy_pass http://127.0.0.1:9000;", text)
        self.assertIn("client_max_body_size 0;", text)
```

- [x] **Step 3: Run tests to verify they fail**

Run: `python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy`
Expected: `test_addon` import ERROR；新的 ingress 測試 FAIL。

- [x] **Step 4: Implement**

`deploy/addons/storage/compose.yml`（`<MINIO_IMAGE>` 為上面的 minio image 完整參照；`<MC_IMAGE>` 依 Step 1 決定）：

```yaml
# Bundled object storage (MinIO). A separate project so application upgrades
# never restart it. Run through `deploy/qjudge addon storage up|init`.
name: ${COMPOSE_PROJECT_NAME:-qjudge}-storage

services:
  minio:
    image: <MINIO_IMAGE>
    restart: unless-stopped
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: ${OBJECT_STORAGE_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${OBJECT_STORAGE_SECRET_KEY}
      MINIO_SERVER_URL: ${OBJECT_STORAGE_PUBLIC_ENDPOINT_URL}
      MINIO_API_CORS_ALLOW_ORIGIN: ${QJUDGE_PUBLIC_ORIGIN}
    volumes:
      - ${MINIO_DATA_DIR:-minio-data}:/data
    ports:
      # The storage reverse proxy connects here; the console stays on loopback.
      - "${FRONTEND_BIND_ADDRESS:-127.0.0.1}:9000:9000"
      - "127.0.0.1:9001:9001"
    networks:
      default:
        aliases: [minio]

  # One-off: `deploy/qjudge addon storage init` creates the bucket.
  storage-init:
    image: <MC_IMAGE>
    profiles: ["init"]
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        for attempt in $$(seq 60); do
          mc alias set local http://minio:9000 "$$MINIO_ROOT_USER" "$$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 && break
          sleep 1
        done
        mc mb --ignore-existing "local/$$OBJECT_STORAGE_BUCKET"
    environment:
      MINIO_ROOT_USER: ${OBJECT_STORAGE_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${OBJECT_STORAGE_SECRET_KEY}
      OBJECT_STORAGE_BUCKET: ${OBJECT_STORAGE_BUCKET}

volumes:
  minio-data:

networks:
  default:
    name: qjudge
    external: true
```

若 `<MC_IMAGE>` 使用獨立的 mc image，其 entrypoint 已是 `mc`，上面的 `entrypoint` 覆寫保持不變即可。

`deploy/qjudge_cli/addon.py`：

```python
"""Run bundled addons, each a compose project next to QJudge."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Callable

from .check import check_env
from .schema import Env

NETWORK = "qjudge"
ADDONS = {
    "storage": {
        "mode_key": "STORAGE_MODE",
        "up": ["up", "-d", "minio"],
        "init": ["run", "--rm", "storage-init"],
    },
}
ACTIONS = ("up", "init")


def addon_command(deploy_dir: Path, env_file: Path, name: str, action: str) -> list[str]:
    return [
        "docker", "compose", "--project-directory", str(deploy_dir), "--env-file", str(env_file),
        "-f", str(deploy_dir / "addons" / name / "compose.yml"), *ADDONS[name][action],
    ]


def run_addon(
    deploy_dir: Path,
    env_file: Path,
    env: Env,
    name: str,
    action: str,
    run: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> int:
    mode_key = ADDONS[name]["mode_key"]
    if env.get(mode_key, "").strip() != "bundled":
        print(f"{mode_key} is not bundled; the {name} addon is not used")
        return 1
    problems = check_env(env)
    for problem in problems:
        print(problem)
    if problems:
        return 1
    if run(["docker", "network", "inspect", NETWORK], capture_output=True).returncode != 0:
        run(["docker", "network", "create", NETWORK], check=True)
    return run(addon_command(deploy_dir, env_file, name, action)).returncode
```

`deploy/qjudge_cli/cli.py`：

1. import 區加入 `from .addon import ACTIONS, ADDONS, run_addon`。
2. `ingress_parser` 之後加入：

```python
    addon_parser = commands.add_parser("addon", help="run a bundled addon")
    addon_parser.add_argument("name", choices=sorted(ADDONS))
    addon_parser.add_argument("action", choices=ACTIONS)
    addon_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
```

3. `ingress` 分支之後加入：

```python
    if args.command == "addon":
        if not args.env_file.is_file():
            print(f"{args.env_file}: not found")
            return 1
        return run_addon(DEPLOY_DIR, args.env_file, load(args.env_file), args.name, args.action)
```

`deploy/qjudge_cli/ingress.py` 整檔改為：

```python
"""Describe the entry points a deployment needs outside QJudge."""

from __future__ import annotations

from urllib.parse import urlsplit

from .schema import Env

MINIO_PORT = 9000


def _bind_address(env: Env) -> str:
    return env.get("FRONTEND_BIND_ADDRESS", "").strip() or "127.0.0.1"


def _frontend(env: Env) -> str:
    port = env.get("FRONTEND_PORT", "").strip() or "8080"
    return f"http://{_bind_address(env)}:{port}"


def _bundled_storage(env: Env) -> str:
    """Public storage URL when QJudge runs MinIO itself, else ''."""
    if env.get("STORAGE_MODE", "").strip() != "bundled":
        return ""
    return env.get("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", "").strip().rstrip("/")


def render_ingress(env: Env) -> str:
    origin = env.get("QJUDGE_PUBLIC_ORIGIN", "").rstrip("/")
    origin_parts = urlsplit(origin)
    host = origin_parts.netloc
    frontend = _frontend(env)
    proxies = env.get("QJUDGE_TRUSTED_PROXIES", "").strip()
    lines = [
        f"Main site  {origin}",
        f"  Reverse proxy -> {frontend} (frontend; serves the site, /api, /o, /.well-known and /mcp)",
        "  The proxy must set Host, X-Forwarded-For and X-Forwarded-Proto, and disable buffering.",
    ]
    if proxies:
        lines.append(f"  Frontend trusts forwarded headers only from: {proxies}")
    lines += [
        "  Check from the proxy host:",
        f"    curl -H 'Host: {host}' {frontend}/api/health/",
        f"  Remote MCP clients connect to {origin}/mcp",
    ]
    # Tunnel routes match by hostname; a port here would never match.
    routes = [(origin_parts.hostname, "http://frontend:80")]
    storage = _bundled_storage(env)
    if storage:
        lines += [
            "",
            f"Storage  {storage}",
            f"  Reverse proxy -> http://{_bind_address(env)}:{MINIO_PORT} "
            "(MinIO; pass Host unchanged, no body size limit, buffering off)",
        ]
        routes.append((urlsplit(storage).hostname, f"http://minio:{MINIO_PORT}"))
    profiles = [item.strip() for item in env.get("COMPOSE_PROFILES", "").split(",")]
    if "tunnel" in profiles:
        lines += ["", "Cloudflare Tunnel"]
        lines += [f"  route {name} -> {target}" for name, target in routes]
    lines += ["", "Run `deploy/qjudge ingress --nginx` for reverse proxy server blocks."]
    return "\n".join(lines) + "\n"


def _server_block(host: str, upstream: str, extra: str = "") -> str:
    return f"""server {{
    listen 443 ssl;
    server_name {host};
    # ssl_certificate     /path/to/fullchain.pem;
    # ssl_certificate_key /path/to/privkey.pem;
{extra}
    location / {{
        proxy_pass {upstream};
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


def render_nginx(env: Env) -> str:
    host = urlsplit(env.get("QJUDGE_PUBLIC_ORIGIN", "")).hostname or "_"
    blocks = [_server_block(host, _frontend(env))]
    storage = _bundled_storage(env)
    if storage:
        blocks.append(
            _server_block(
                urlsplit(storage).hostname or "_",
                f"http://{_bind_address(env)}:{MINIO_PORT}",
                "    client_max_body_size 0;\n",
            )
        )
    return "\n".join(blocks)
```

既有的 `test_tunnel_route_is_listed_when_profile_enabled`、`test_tunnel_route_uses_hostname_without_port` 應仍通過（`route judge.example.edu -> http://frontend:80` 字串不變）。

`.github/workflows/ci.yml` 的 `Deploy Compose Lint and Config` 步驟改為：

```yaml
        run: |
          deploy/qjudge lint-compose deploy/compose.yml deploy/addons/storage/compose.yml
          QJUDGE_VERSION=ci docker compose --project-directory deploy --env-file deploy/.env.example \
            -f deploy/compose.yml -f deploy/compose.build.yml config --quiet
          docker compose --project-directory deploy --env-file deploy/.env.example \
            -f deploy/addons/storage/compose.yml config --quiet
```

- [x] **Step 5: Run tests and checks**

```bash
python3 -m unittest discover -s deploy/qjudge_cli/tests -t deploy
deploy/qjudge lint-compose deploy/compose.yml deploy/addons/storage/compose.yml
docker compose --project-directory deploy --env-file deploy/.env.example -f deploy/addons/storage/compose.yml config
deploy/qjudge addon storage up
```

Expected：unittest OK；lint 無輸出；addon config 顯示 project 名 `qjudge-storage`、`minio` 服務 alias `minio`、volume `minio-data`；`addon storage up` 因本地 `deploy/.env` 為 `STORAGE_MODE=external` 印出 `STORAGE_MODE is not bundled; the storage addon is not used` 並 exit 1（不啟動任何容器）。

- [x] **Step 6: Commit**

```bash
git add deploy/addons/storage/compose.yml deploy/qjudge_cli/addon.py deploy/qjudge_cli/tests/test_addon.py
git commit -m "feat(deploy): add the bundled MinIO addon and list storage in qjudge ingress" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- deploy/addons/storage/compose.yml deploy/qjudge_cli/addon.py deploy/qjudge_cli/cli.py deploy/qjudge_cli/ingress.py deploy/qjudge_cli/tests/test_addon.py deploy/qjudge_cli/tests/test_ingress.py .github/workflows/ci.yml
```

---

### Task 5: 本地 dev 改用 MinIO

**Files:**
- Modify: `compose.dev.yml`
- Local only（不 commit）：`deploy/.env`

- [x] **Step 1: dev overlay 加入 MinIO**

`compose.dev.yml` 的 `services:` 內（`livekit` 之前）加入：

```yaml
  # Same definition as the storage addon, run inside the dev project.
  minio:
    extends:
      file: addons/storage/compose.yml
      service: minio
    environment:
      MINIO_API_CORS_ALLOW_ORIGIN: ${QJUDGE_PUBLIC_ORIGIN},http://localhost:5173

  storage-init:
    extends:
      file: addons/storage/compose.yml
      service: storage-init
```

檔尾 `networks:` 之前加入：

```yaml
volumes:
  minio-data:
```

（若 `compose.dev.yml` 已有 top-level `volumes:`，併入其中。）`extends.file` 的相對路徑以 `qjudge-dc.sh dev config` 驗證：若 `addons/storage/compose.yml` 找不到，改用 `deploy/addons/storage/compose.yml` 並回報。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config --services | sort
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config | grep -n -A12 "^  minio:"
```

Expected：服務清單有 `minio`（`storage-init` 在 profile `init` 中，不會列出或需加 `--profile init` 才列出）；`minio` 的 network 為 dev project 的 default（不是外部 `qjudge`），alias `minio`，volume `minio-data`。

- [x] **Step 2: Cloudflare Tunnel 路由（使用者操作）**

dev 的 origin 是 `https://q-judge-dev.quan.wtf`，瀏覽器與 integrity-resident 需要以 HTTPS 連到 MinIO。請使用者在 Cloudflare Zero Trust 的 dev tunnel 新增 public hostname：`storage-dev.quan.wtf` → `http://minio:9000`。若使用者選用其他 hostname，以下步驟的網址跟著替換。等待使用者確認完成再繼續。

- [x] **Step 3: 改寫本地 `deploy/.env` 的 storage key**

只改這幾行（其餘不動；先備份 `cp deploy/.env deploy/.env.before-minio`）：

```bash
python3 - <<'PY'
import re, secrets
from pathlib import Path
path = Path("deploy/.env")
text = path.read_text()
values = {
    "STORAGE_MODE": "bundled",
    "OBJECT_STORAGE_ENDPOINT_URL": "http://minio:9000",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL": "https://storage-dev.quan.wtf",
    "OBJECT_STORAGE_ACCESS_KEY": "qjudge-dev",
    "OBJECT_STORAGE_SECRET_KEY": secrets.token_urlsafe(24),
    "OBJECT_STORAGE_BUCKET": "qjudge",
}
for key, value in values.items():
    line = f"{key}={value}"
    text, count = re.subn(rf"^{key}=.*$", line, text, flags=re.M)
    if count == 0:
        text = text.rstrip("\n") + f"\n{line}\n"
path.write_text(text)
PY
deploy/qjudge check
```

Expected：`deploy/.env: OK`。

- [x] **Step 4: 啟動 MinIO 並建立 bucket**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d minio
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm storage-init
```

Expected：`storage-init` 印出 `Bucket created successfully` 或 bucket 已存在的訊息，exit 0。

- [x] **Step 5: 搬移既有 dev 物件（R2 → 本地 MinIO，只讀 R2）**

三個 R2 dev bucket 的 key 互不重疊，直接鏡像到 `qjudge`。R2 的 endpoint 與金鑰從 repo 根目錄舊 `.env` 讀取（`OBJECT_STORAGE_ENDPOINT_URL`、`OBJECT_STORAGE_ACCESS_KEY`、`OBJECT_STORAGE_SECRET_KEY`），不寫入任何檔案、不印出：

```bash
eval "$(python3 - <<'PY'
import shlex, sys
from pathlib import Path
sys.path.insert(0, "deploy")
from qjudge_cli.envfile import load
root, deploy = load(Path(".env")), load(Path("deploy/.env"))
values = {
    "R2_ENDPOINT": root["OBJECT_STORAGE_ENDPOINT_URL"],
    "R2_KEY": root["OBJECT_STORAGE_ACCESS_KEY"],
    "R2_SECRET": root["OBJECT_STORAGE_SECRET_KEY"],
    "MINIO_KEY": deploy["OBJECT_STORAGE_ACCESS_KEY"],
    "MINIO_SECRET": deploy["OBJECT_STORAGE_SECRET_KEY"],
}
for name, value in values.items():
    print(f"export {name}={shlex.quote(value)}")
PY
)"
docker run --rm --network online_judge_default \
  -e R2_ENDPOINT -e R2_KEY -e R2_SECRET -e MINIO_KEY -e MINIO_SECRET \
  --entrypoint /bin/sh <MC_IMAGE> -c '
    mc alias set r2 "$R2_ENDPOINT" "$R2_KEY" "$R2_SECRET" --api S3v4 >/dev/null &&
    mc alias set local http://minio:9000 "$MINIO_KEY" "$MINIO_SECRET" >/dev/null &&
    for b in qjudge-dev-markdown-images qjudge-dev-anticheat-raw qjudge-dev-ai-artifacts; do
      mc mirror --overwrite "r2/$b" local/qjudge || exit 1
    done &&
    for b in qjudge-dev-markdown-images qjudge-dev-anticheat-raw qjudge-dev-ai-artifacts; do mc du "r2/$b"; done &&
    mc du local/qjudge'
```

（`<MC_IMAGE>` 與 Task 4 相同。network 名稱以 `docker network ls` 確認 dev project 的 default network。）Expected：local 的總物件數與大小等於三個 R2 bucket 相加。若 R2 讀取失敗，回報錯誤並跳過此步（dev 資料不搬移不影響功能驗證）。

- [x] **Step 6: 重建 app 服務並驗證**

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d backend celery celery-high celery-beat ai-service ai-worker ai-scheduler integrity-resident integrity-reconciler
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py healthcheck
```

後端讀寫與 presigned URL（經 tunnel 的公開網址）：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py shell -c "
from django.conf import settings
from apps.core.services.markdown_image_storage import store_markdown_image, fetch_markdown_image
from apps.contests.services.anticheat_storage import generate_put_url, generate_get_url, get_s3_client
key = 'markdown/2000/01/' + '0' * 32 + '.png'
store_markdown_image(b'dev-check', key, 'image/png')
assert fetch_markdown_image(key).content == b'dev-check'
print('bucket', settings.MARKDOWN_IMAGE_S3_BUCKET, settings.ANTICHEAT_RAW_BUCKET, settings.INTEGRITY_ARCHIVE_BUCKET)
print(generate_put_url(settings.ANTICHEAT_RAW_BUCKET, 'contest_0/dev-check.webp'))
" > /tmp/qjudge-storage-check.txt
cat /tmp/qjudge-storage-check.txt | head -1
PUT_URL=$(tail -1 /tmp/qjudge-storage-check.txt)
curl -s -o /dev/null -w 'presigned put %{http_code}\n' -X PUT -H 'Content-Type: image/webp' --data-binary 'dev-check' "$PUT_URL"
curl -s -o /dev/null -w 'cors preflight %{http_code}\n' -X OPTIONS -H 'Origin: https://q-judge-dev.quan.wtf' -H 'Access-Control-Request-Method: PUT' "$PUT_URL"
```

AI artifact 讀寫：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -c "
import asyncio
from config import get_settings
from main import _artifact_store
store = _artifact_store(get_settings())
async def main():
    await store.put('ai-artifacts/dev-check/0', b'dev-check', 'text/plain')
    assert await store.get('ai-artifacts/dev-check/0') == b'dev-check'
    print('ai bucket', get_settings().artifact_s3_bucket, (await store.presign('ai-artifacts/dev-check/0'))[:40])
asyncio.run(main())
"
```

清除驗證物件：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py shell -c "
from django.conf import settings
from apps.contests.services.anticheat_storage import get_s3_client
get_s3_client().delete_objects(Bucket=settings.OBJECT_STORAGE_BUCKET, Delete={'Objects': [{'Key': k} for k in ['markdown/2000/01/' + '0' * 32 + '.png', 'contest_0/dev-check.webp', 'ai-artifacts/dev-check/0']]})
"
rm /tmp/qjudge-storage-check.txt
```

Expected：healthcheck 通過；三個 bucket 設定都印 `qjudge`；presigned PUT 200；CORS preflight 200 或 204；AI 讀寫成功且 presign 網址以 `https://storage-dev.quan.wtf` 開頭。若 Step 5 有搬移資料，再以瀏覽器（或 curl）打開一張既有題目圖片 `https://q-judge-dev.quan.wtf/api/v1/markdown/images/<既有 key>`，應為 200。

- [x] **Step 7: Commit**

```bash
git commit -m "feat(dev): run the storage addon's MinIO inside the dev project" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- compose.dev.yml
```

---

## 完成條件

- backend 與 ai-service 不再建立 bucket、不使用 object tagging、不判斷 R2；region 固定 `us-east-1`；三個功能都使用 `OBJECT_STORAGE_BUCKET`，未設定時沿用舊 key。
- `deploy/addons/storage/compose.yml` 可由 `deploy/qjudge addon storage up|init` 執行；`ingress` 在 bundled 時列出 storage 入口與 nginx server block。
- CLI unittest、`lint-compose`（含 addon）、compose config 通過；backend／ai-service 相關的非 DB 測試通過，DB 測試由 CI 執行。
- 本地 dev 使用 dev project 內的 MinIO，上傳、下載、presigned PUT 與 CORS 經 tunnel 正常。
- 舊 `docker-compose*.yml`、`scripts/` 與 contract 測試未修改。


## Review 與實作結果（2026-09-24）

已完成程式、CLI、addon 與本機 dev 切換；正式環境未部署。實作在 `codex/storage-overhaul` 隔離分支，修改亦套回原工作目錄供 dev 執行，保留原有其他修改。

### Review 修正

- `COMPOSE_PROJECT_NAME` 優先於 Compose 的 top-level `name`。CLI 現在明確傳入 `--project-name <project>-storage`，確保 addon 與 app 分離；新增回歸測試。直接呼叫 addon compose 時亦須自行指定 project name。
- 固定 `us-east-1` 會使 boto3 預設 presign 回到 SigV2；實測 R2 回 `401 Unauthorized: SigV2 authorization is not supported`。Backend 與 AI client 明確使用標準 `s3v4`，沒有 provider 分支；兩個實際簽名測試先失敗再通過，R2 原物件下載恢復 HTTP 200。
- 指定 MinIO digest 已確認內建 `mc`，server 與 init 共用該 image。
- Backend 使用既有 host Python 3.11 venv；AI 使用 `uv run --with pytest --with pytest-asyncio`，工作目錄為 `ai-service`。DB 測試仍留 CI。Host pytest-django 會為既有 healthcheck SimpleTestCase 嘗試建立 DB，改用 `django.setup()` + unittest 執行其 4 個無 DB 測試。
- 提交依實際相依性合併，未沿用範例中的其他模型署名。

### 驗證證據

- Backend 相關測試 30 passed；healthcheck unit 4 passed；AI unit/config 107 passed；CLI 76 passed。
- Compose lint、base/build/addon/dev config 成功；dev network 為 `online_judge_default`，MinIO volume 為 `online_judge_minio-data`。
- 已透過 Cloudflare 瀏覽器 UI 在 `QJudge-Dev` 新增 `storage-dev.quan.wtf → http://minio:9000`，DNS CNAME 自動建立；公開 readiness HTTP 200。
- `deploy/.env` 改為 bundled 與單一 `qjudge` bucket；舊設定備份於 git-ignored `deploy/backups/storage-05-before-minio.env`，機密未納入版本控制。
- 初始化重複執行成功；backend healthcheck 全數通過。
- Markdown server PUT/GET、公開 presigned PUT/GET、SHA-256 checksum chunk upload、AI PUT/GET 與公開 presign 均成功。
- CORS 接受 dev origin 與 localhost，拒絕其他 origin；從 dev 網頁執行跨來源 fetch，PUT/GET 均 HTTP 200，內容一致。
- 原 R2 dev 資料只讀複製：markdown 20 件／12,679,180 bytes；監考 2,009 件／119,985,005 bytes；AI 936 件／9,478,315 bytes。共 2,965 件／142,142,500 bytes，逐 key 與大小核對一致。既有圖片經 backend API HTTP 200。
- 初次 Python urllib 公開探測被 Cloudflare browser integrity 回 1010；瀏覽器實測與帶明確探測 User-Agent 的請求成功，未放寬 Cloudflare 規則。
- 使用者曾選擇 dcslab external MinIO，已建立空 `qjudge-dev` bucket；之後改回本機。遠端 bucket 保留未使用，未修改正式 MinIO CORS 或正式資料。

Fresh reviewer 對主要實作未提出 actionable findings；後續 SigV4 相容性修正以 RED→GREEN 回歸與真實 R2/MinIO handshake 驗證。尚未執行 CI DB suite，亦未推送或部署正式環境。
