# 嚴格考試模式簡化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 `Contest.webcam_required` 取代依裝置設定的 `anticheat_device_policy`，移除平板監考路徑、無用的版本號與 `Contest.admins`，並把建立競賽縮成兩步。

**Architecture:** anticheat-config 與凍結的 policy snapshot 只帶 `webcam_required`；證據與 LiveKit 來源一律是螢幕分享，加上 `webcam_required` 為真時的 webcam。前端監考計畫只看「能否分享螢幕／開 webcam」與「是否要求 webcam」，偵測項目固定。平板、PWA、viewport 分支整段刪除，以 git tag 保留。管理權只看 `owner` 與 classroom 角色。不做舊資料相容。

**Tech Stack:** Django 4.2 + DRF、PostgreSQL、pytest-django；React + TypeScript + Carbon、Vitest；FastMCP（`mcp-server`）。

**Spec:** `docs/superpowers/specs/2026-09-30-strict-mode-simplification-design.md`

## Global Constraints

- 分支：`codex/strict-mode-simplification`（已從 `origin/dev` 建立）。使用者工作區有未追蹤檔案（`chatgpt-app-submission.json`、`docs/legal-drafts/`、`docs/operations/*.md`、`docs/plugin-submission-review.md`、`output/`）：每次 commit 只 `git add` 該任務列出的路徑，**禁止** `git add -A` / `git add .`。
- 每個 commit 訊息結尾加上：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 容器指令一律用 `docker compose -p online_judge ...`，不使用 `qjudge-dc.sh`。**禁止** `down -v`。
- **不要**對 dev 資料庫執行 `migrate`，直到 Task 12 取得使用者同意。Task 2 之後 dev 網站讀 contest 的頁面會因缺少 `webcam_required` 欄位而出錯，這是預期狀態。
- 不做舊資料相容：migration 不搬舊設定；讀取端不處理舊 snapshot 形狀；不加 fallback 或防呆分支。
- 版本號：刪除 anticheat-config 的 `version` 與 policy snapshot 的 `version`；`REGISTRY_VERSION` 保留（存進 run、integrity-service schema 必填、證據服務比對），改為 `"2026-09-30.1"`。
- anticheat-config 回傳 `{"webcam_required": <bool>}`，有進行中的 run 時另帶 `integrity_run`；policy snapshot 保留 batch／evidence 參數並帶 `"webcam_required": <bool>`，不再有 `device_policy`。
- `webcam_required`：`BooleanField(default=False, verbose_name='要求 Webcam', help_text='嚴格考試模式下，考生除了分享螢幕，也須開啟 Webcam')`。
- 嚴格模式固定規則：螢幕分享（主要來源）＋全螢幕＋多螢幕偵測＋滑鼠離開偵測；webcam 只能是次要來源。
- 發布時仍必須有開始與結束時間（不改）。
- 建立視窗兩種類型的嚴格模式都預設關閉。
- i18n：任何新增或刪除的 key 必須四個語言（`en`、`ja`、`ko`、`zh-TW`）同步；`en` 不得含 CJK；locale 檔以 `json.dumps(..., ensure_ascii=False, indent=2, sort_keys=True) + "\n"` 寫回（現有檔案即此格式）。不少畫面文字只存在於程式的預設值（`t(key, "預設")`），JSON 裡沒有；刪除清單只列 JSON 中存在的 key。
- 行號以**該任務開始前**的檔案為準。同一檔案有多處修改時由下往上改，或以文中引用的程式內容定位。

### 指令

後端需要資料庫的測試跑在臨時 Postgres（不碰 dev 資料）。每個工作階段開始先確保它存在：

```bash
docker ps --filter name=qjudge-testdb --format '{{.Names}}' | grep -q qjudge-testdb || docker run -d --rm --name qjudge-testdb --network online_judge_default -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test_oj postgres:15-alpine
```

下文以 `BT <path>` 代表：

```bash
docker compose -p online_judge exec -T -e DATABASE_URL=postgresql://test:test@qjudge-testdb:5432/test_oj -e REDIS_URL=redis://redis:6379/15 backend python -m pytest -q --ds=config.settings.test -p no:cacheprovider <path>
```

以 `FT <path>` 代表 `docker compose -p online_judge exec -T frontend npx vitest run <path>`，以 `TC` 代表 `docker compose -p online_judge exec -T frontend npm run typecheck`，以 `MT` 代表 `(cd mcp-server && python3 -m pytest tests -q -p no:cacheprovider)`。

基準（2026-09-30，本分支起點）：後端 1417 passed；前端 213 files / 1171 tests passed；typecheck、naming、architecture、repository exports、Carbon `--all`、i18n check 全部通過；MCP 88 passed / 17 skipped。

## Review Focus

1. **考試進行中老師切換「要求 Webcam」**：已開始的 run 必須沿用自己凍結的 `webcam_required`，只有之後的 run 採用新值。Task 2 `test_running_exam_keeps_its_frozen_webcam_setting`（config 與 `integrity_run.policy_snapshot` 各自的值）與 `test_allowed_sources_follow_the_frozen_webcam_setting`；前端 Task 6 mapper 測試分別對應兩個值，Task 7 的消費端先取 `integrityRun.webcamRequired`。
2. **run 不要求 webcam 時送來 webcam 證據**：必須以 `evidence_source_disabled` 拒收。Task 2 `test_manifest_rejects_webcam_evidence_when_the_run_does_not_require_it`。
3. **前端訊號與事件定義的契約**：snapshot 缺少任何前端訊號時完整性檢查會 fail closed。Task 7 先移除前端 `viewport_*` 訊號，Task 8 才刪 registry 的 `viewport`，並新增 `test_registry_covers_every_frontend_signal`。
4. **不能分享螢幕的瀏覽器（iPad、手機）進入嚴格考試**：考前檢查必須擋下並顯示「需使用電腦」。Task 7 `refuses a browser that cannot share its screen`；畫面文字在 Task 12 以瀏覽器移除 `getDisplayMedia` 手動確認。
5. **`webcam_required = True` 但嚴格模式關閉**：設定頁的「要求 Webcam」不可切換。Task 9 `locks the webcam switch while strict mode is off`。

---

### Task 1: 以 git tag 保留平板邏輯

**Files:** 無（只建立 tag）

**Interfaces:**
- Produces: tag `archive/tablet-anticheat`，指向刪除任何平板程式前的 commit。

- [ ] **Step 1: 確認目前 commit 仍含平板邏輯**

Run: `git show HEAD:frontend/src/features/contest/domain/deviceClassification.ts | head -3`
Expected: 印出 `import {` 開頭的檔案內容（非錯誤）。

- [ ] **Step 2: 建立 annotated tag 並推送**

```bash
git tag -a archive/tablet-anticheat -m "Last commit with tablet/PWA/viewport anti-cheat before removal (see docs/superpowers/specs/2026-09-30-strict-mode-simplification-design.md §5)"
git push origin archive/tablet-anticheat
```

- [ ] **Step 3: 驗證**

Run: `git ls-remote --tags origin archive/tablet-anticheat`
Expected: 一行 `<sha>\trefs/tags/archive/tablet-anticheat`。

---

### Task 2: 後端以 `webcam_required` 取代裝置設定與版本號

**Files:**
- Modify: `backend/apps/contests/models/contest.py:10,95-99`
- Delete: `backend/apps/contests/models/policies.py`
- Modify: `backend/apps/contests/models/__init__.py:4,40`
- Modify: `backend/apps/contests/migrations/0001_baseline.py:153`
- Create: `backend/apps/contests/migrations/0006_contest_webcam_required.py`
- Modify: `backend/apps/contests/services/anticheat_config.py`（整檔）
- Modify: `backend/apps/contests/services/livekit_service.py:30,261-279,343`
- Modify: `backend/apps/contests/services/integrity_evidence.py:209-226,303-305`
- Modify: `backend/apps/contests/serializers.py:126,379`
- Test: `backend/apps/contests/tests/test_anticheat_config_api.py`
- Create: `backend/apps/contests/tests/services/test_livekit_allowed_sources.py`
- Modify（fixture）: `backend/apps/contests/tests/integrity/test_evidence_chunks.py:125-150,748-780`、`tests/integrity/test_upload_grants.py:181`、`tests/integrity/test_internal_commands.py:214-218`、`tests/integrity/test_batch_gateway.py:221`、`tests/test_exam_live.py:103-108`、`tests/test_live_monitoring_presence.py:64-68`

**Interfaces:**
- Produces: `Contest.webcam_required: bool`；`build_contest_anticheat_config(contest) -> {"webcam_required": bool}`；`build_integrity_policy_snapshot(contest)` 含 `"webcam_required"`、不含 `version`／`device_policy`；`livekit_service._allowed_sources(run) -> tuple[str, ...]`；`integrity_evidence._enabled_sources(run)` 只讀 `run.policy_snapshot["webcam_required"]`。API 欄位 `webcam_required`（detail 與 create/update serializer）。

- [ ] **Step 1: 更新 anticheat config API 測試**

`test_anticheat_config_api.py` 頂端加 `from apps.contests.serializers import ContestCreateUpdateSerializer`，並把 `test_participant_can_fetch_anticheat_config`（第 41-67 行）換成：

```python
    def test_participant_can_fetch_anticheat_config(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"webcam_required": False})

    def test_config_follows_webcam_required(self):
        self.contest.webcam_required = True
        self.contest.save(update_fields=["webcam_required"])
        self.client.force_authenticate(user=self.student)

        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.data, {"webcam_required": True})

    def test_running_exam_keeps_its_frozen_webcam_setting(self):
        ExamIntegrityRun.objects.create(
            contest=self.contest,
            registry_version="frozen-registry",
            session_state="active",
            policy_snapshot=build_integrity_policy_snapshot(self.contest),
            registry_snapshot={"version": "frozen-registry", "definitions": {}},
        )
        self.contest.webcam_required = True
        self.contest.save(update_fields=["webcam_required"])
        self.client.force_authenticate(user=self.student)

        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertTrue(resp.data["webcam_required"])
        self.assertFalse(resp.data["integrity_run"]["policy_snapshot"]["webcam_required"])

    def test_update_serializer_accepts_webcam_required(self):
        serializer = ContestCreateUpdateSerializer(
            self.contest, data={"webcam_required": True}, partial=True
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.contest.refresh_from_db()
        self.assertTrue(self.contest.webcam_required)
```

同檔其他修改：
- `test_live_integrity_run_returns_its_frozen_snapshots_for_student` 的 `policy_snapshot = {"version": 1, "device_policy": {"desktop": {"enabled": False}}}` 改為 `policy_snapshot = {"webcam_required": False}`。
- `test_integrity_policy_snapshot_is_json_serializable_and_uses_normalized_policy` 的 `self.assertEqual(snapshot["version"], 1)` 換成：

```python
        self.assertIs(snapshot["webcam_required"], False)
        self.assertNotIn("version", snapshot)
        self.assertNotIn("device_policy", snapshot)
```

- `test_contest_participant_can_fetch_anticheat_config_when_classroom_bound` 的 `self.assertIn("device_policy", resp.data)` 改為 `self.assertIn("webcam_required", resp.data)`。

- [ ] **Step 2: 寫 LiveKit 來源測試**

`backend/apps/contests/tests/services/test_livekit_allowed_sources.py`：

```python
from types import SimpleNamespace

from apps.contests.services.livekit_service import _allowed_sources


def test_allowed_sources_follow_the_frozen_webcam_setting():
    assert _allowed_sources(SimpleNamespace(policy_snapshot={"webcam_required": False})) == (
        "screen_share",
    )
    assert _allowed_sources(SimpleNamespace(policy_snapshot={"webcam_required": True})) == (
        "screen_share",
        "webcam",
    )
```

- [ ] **Step 3: 更新證據測試**

`tests/integrity/test_evidence_chunks.py` 的 `integrity_run` fixture（第 125-150 行）中，把整個 `"device_policy": {...},`（含 `desktop` 與 `tablet`）換成一行 `"webcam_required": True,`，並刪除 `"version": 1,`。

把 `test_manifest_rejects_source_disabled_by_frozen_policy`（約第 748-780 行）整個換成：

```python
@pytest.mark.django_db
def test_manifest_rejects_webcam_evidence_when_the_run_does_not_require_it(
    api_client,
    incident_event,
    participant,
    integrity_run,
    object_store,
):
    policy = dict(integrity_run.policy_snapshot)
    policy["webcam_required"] = False
    integrity_run.policy_snapshot = policy
    integrity_run.save(update_fields=["policy_snapshot"])
    api_client.force_authenticate(participant.user)

    response = post_manifest(
        api_client,
        incident_event,
        [descriptor(seq=1, start=1_000_000, end=1_005_000, source="webcam")],
    )

    assert response.status_code == 400
    assert response.json()["code"] == "evidence_source_disabled"
    assert ExamEvidenceChunk.objects.count() == 0
    object_store.generate_presigned_url.assert_not_called()
```

其他 fixture（讓 run 帶合法的新 snapshot）：
- `tests/integrity/test_upload_grants.py:181`：`run.policy_snapshot = {"device_policy": {}}` 改為 `run.policy_snapshot = {"webcam_required": False}`。
- `tests/integrity/test_internal_commands.py:214-218` 的 `policy_snapshot={...}` 刪除 `"version": 1,`，加 `"webcam_required": False,`。
- `tests/integrity/test_batch_gateway.py:221`：`policy_snapshot={},` 改為 `policy_snapshot={"webcam_required": False},`。
- `tests/test_exam_live.py:103-108` 與 `tests/test_live_monitoring_presence.py:64-68` 的 `ExamIntegrityRun.objects.create(...)` 都加 `policy_snapshot={"webcam_required": False},`。

- [ ] **Step 4: 確認測試失敗**

Run: `BT apps/contests/tests/test_anticheat_config_api.py apps/contests/tests/services/test_livekit_allowed_sources.py apps/contests/tests/integrity/test_evidence_chunks.py`
Expected: FAIL（`webcam_required` 欄位不存在、`_allowed_sources` 參數個數不符、`_enabled_sources` 仍讀 `device_policy`）。

- [ ] **Step 5: 修改 model**

`models/contest.py`：刪除第 10 行 `from .policies import default_anticheat_device_policy`，並把第 95-99 行的 `anticheat_device_policy = models.JSONField(...)` 換成：

```python
    webcam_required = models.BooleanField(
        default=False,
        verbose_name='要求 Webcam',
        help_text='嚴格考試模式下，考生除了分享螢幕，也須開啟 Webcam',
    )
```

`git rm backend/apps/contests/models/policies.py`。`models/__init__.py` 刪除第 4 行 `from .policies import default_anticheat_device_policy` 與 `__all__` 中的 `"default_anticheat_device_policy",`。

`migrations/0001_baseline.py` 第 153 行 `default=apps.contests.models.default_anticheat_device_policy,` 改為 `default=dict,`。

- [ ] **Step 6: 建立 migration**

`backend/apps/contests/migrations/0006_contest_webcam_required.py`：

```python
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0005_remove_participant_score_rank"),
    ]

    operations = [
        migrations.AddField(
            model_name="contest",
            name="webcam_required",
            field=models.BooleanField(
                default=False,
                help_text="嚴格考試模式下，考生除了分享螢幕，也須開啟 Webcam",
                verbose_name="要求 Webcam",
            ),
        ),
        migrations.RemoveField(
            model_name="contest",
            name="anticheat_device_policy",
        ),
    ]
```

- [ ] **Step 7: 改寫 `anticheat_config.py`（整檔）**

```python
"""Frozen anti-cheat policy builders."""
from __future__ import annotations


def build_contest_anticheat_config(contest) -> dict:
    """Return only the policy needed before a run is active."""
    return {"webcam_required": contest.webcam_required}


def build_integrity_policy_snapshot(contest) -> dict:
    """Freeze the browser/worker contract for one integrity run."""
    return {
        "batch_interval_ms": 5_000,
        "suspect_after_ms": 15_000,
        "disconnected_after_ms": 30_000,
        "evidence": {
            "chunk_ms": 5_000,
            "minimum_local_buffer_ms": 60_000,
            "local_cap_ms": 300_000,
            "local_cap_bytes_per_source": 100_000_000,
            "screen": {
                "width": 1280,
                "height": 720,
                "fps": 5,
                "bitrate": 800_000,
            },
            "webcam": {
                "width": 640,
                "height": 480,
                "fps": 10,
                "bitrate": 350_000,
            },
        },
        "webcam_required": contest.webcam_required,
    }
```

- [ ] **Step 8: 修改來源判斷**

`livekit_service.py`：刪除第 30 行 `from apps.contests.services.anticheat_config import normalize_anticheat_device_policy`；第 261-279 行 `_allowed_sources` 改為：

```python
def _allowed_sources(run: ExamIntegrityRun) -> tuple[str, ...]:
    if run.policy_snapshot["webcam_required"]:
        return LIVE_SOURCES
    return ("screen_share",)
```

第 343 行改為 `allowed_sources = _allowed_sources(run)`。

`integrity_evidence.py`：第 209-226 行 `_enabled_sources` 改為：

```python
def _enabled_sources(run: ExamIntegrityRun) -> frozenset[str]:
    if run.policy_snapshot["webcam_required"]:
        return frozenset({"screen_share", "webcam"})
    return frozenset({"screen_share"})
```

並刪除第 303-305 行：

```python
    policy = run.policy_snapshot
    if type(policy) is not dict or type(policy.get("device_policy")) is not dict:
        raise IntegrityEvidenceRejected("invalid_frozen_policy")
```

- [ ] **Step 9: 修改 serializer**

`serializers.py` 第 126 行（`ContestDetailSerializer.Meta.fields`）與第 379 行（`ContestCreateUpdateSerializer.Meta.fields`）的 `'anticheat_device_policy',` 都改為 `'webcam_required',`。

- [ ] **Step 10: 確認沒有殘留與 migration 漂移**

Run: `grep -rnE "anticheat_device_policy|default_anticheat_device_policy|normalize_anticheat_device_policy|device_policy" backend/apps --include='*.py' | grep -v "/migrations/000[16]"`
Expected: 沒有結果（`test_evidence_chunks.py` 的 tablet 偽裝測試只用 `device_kind`，不含 `device_policy`）。

Run: `docker compose -p online_judge exec -T -e DATABASE_URL=postgresql://test:test@qjudge-testdb:5432/test_oj backend python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`

- [ ] **Step 11: 測試通過**

Run: `BT apps/contests/tests/test_anticheat_config_api.py apps/contests/tests/services apps/contests/tests/integrity apps/contests/tests/test_exam_live.py apps/contests/tests/test_live_monitoring_presence.py apps/contests/tests/models`
Expected: 全部 PASS。若有其他以 `ExamIntegrityRun.objects.create(...)` 建立、沒帶 snapshot 的 fixture 因 `KeyError: 'webcam_required'` 失敗，在該 fixture 加 `policy_snapshot={"webcam_required": False}` 後重跑。若 `test_upload_grants.py` 因「螢幕分享固定開啟」而改變行為（例如開始要求螢幕證據），停下來回報，不要放寬斷言。

- [ ] **Step 12: Commit**

```bash
git add backend/apps/contests/models/contest.py backend/apps/contests/models/__init__.py backend/apps/contests/models/policies.py backend/apps/contests/migrations/0001_baseline.py backend/apps/contests/migrations/0006_contest_webcam_required.py backend/apps/contests/services/anticheat_config.py backend/apps/contests/services/livekit_service.py backend/apps/contests/services/integrity_evidence.py backend/apps/contests/serializers.py backend/apps/contests/tests
git commit -F - <<'EOF'
feat(contests): replace the device policy with webcam_required

Strict mode always records the screen; the webcam is the only
per-contest option. The anti-cheat config and frozen policy carry
webcam_required and no longer have version numbers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

（`backend/apps/contests/tests` 只會包含本任務改過的測試檔；commit 前以 `git diff --cached --stat` 確認。）

---

### Task 3: MCP contest manager 改收 `webcam_required`

**Files:**
- Modify: `mcp-server/server.py:922,933-940,969`
- Modify: `mcp-server/TOOLS.md:109`
- Test: `mcp-server/tests/test_server.py:1067-1112`

**Interfaces:**
- Consumes: Task 2 的 API 欄位 `webcam_required`。
- Produces: `qjudge_contest_manager(..., webcam_required: bool | None = None)`。

- [ ] **Step 1: 改寫測試**

把 `test_qjudge_contest_manager_update_accepts_policy_object_and_clear_fields`（第 1067-1088 行）換成：

```python
def test_qjudge_contest_manager_update_sends_webcam_required_and_clear_fields(monkeypatch):
    captured = {}
    contest_uuid = "33333333-3333-3333-3333-333333333333"

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["json_body"] = json_body
        return {"id": contest_uuid}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(
        server.qjudge_contest_manager(
            "update",
            DummyContext(),
            contest_id=contest_uuid,
            webcam_required=False,
            clear_fields=["end_time"],
        )
    )

    assert captured["json_body"] == {"webcam_required": False, "end_time": None}
```

把 `test_update_schema_types_policy_as_object`（第 1106-1110 行）換成：

```python
def test_update_schema_replaces_the_device_policy_with_webcam_required():
    tools = {tool.name: tool for tool in run(server.mcp.list_tools())}
    properties = tools["qjudge_contest_manager"].inputSchema["properties"]

    assert "anticheat_device_policy" not in properties
    assert any(option.get("type") == "boolean" for option in properties["webcam_required"]["anyOf"])
```

- [ ] **Step 2: 確認失敗**

Run: `MT`
Expected: 2 個 FAIL（`unexpected keyword argument 'webcam_required'`、`KeyError: 'webcam_required'`）。

- [ ] **Step 3: 修改 `server.py` 與文件**

第 922 行 `anticheat_device_policy: dict[str, Any] | None = None,` 改為 `webcam_required: bool | None = None,`。

docstring 的 update 說明（第 933-940 行）中 `anticheat_device_policy (object: {"desktop": {...}, "tablet": {...}}),` 一行改為 `webcam_required (strict mode also requires a webcam),`。

第 969 行 `"anticheat_device_policy": anticheat_device_policy,` 改為 `"webcam_required": webcam_required,`。

`TOOLS.md` 第 109 行改為：

```
| `webcam_required` | bool?（嚴格考試模式是否也要求 webcam） | update |
```

- [ ] **Step 4: 測試通過**

Run: `MT`
Expected: 88 passed, 17 skipped（數量不變）。

- [ ] **Step 5: Commit**

```bash
git add mcp-server/server.py mcp-server/TOOLS.md mcp-server/tests/test_server.py
git commit -F - <<'EOF'
feat(mcp): update webcam_required instead of the device policy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 後端移除平板裝置分類與 PWA 紀錄

**Files:**
- Modify: `backend/apps/contests/services/anti_cheat_session.py:44-67,155`
- Modify: `backend/apps/contests/services/precheck_record.py:63-93,107`
- Test: `backend/apps/contests/tests/services/test_anti_cheat_session.py:108-156`
- Test: `backend/apps/contests/tests/exam/test_precheck_record.py`
- Modify: `backend/apps/contests/tests/integrity/test_evidence_chunks.py:14,30-34,292-306,664-746` 及所有 `bind_active_device(...)` 呼叫
- Modify: `backend/apps/contests/tests/test_live_monitoring_presence.py:75`

**Interfaces:**
- Consumes: Task 2（`_allowed_sources` 已不讀 `device_kind`）。
- Produces: active session payload 不含 `device_kind`；`precheck.device` 只保留 `screen_share_supported`、`webcam_supported`、`active_sources`；頂層不再保留 `pwa_mode`。

- [ ] **Step 1: 改寫 active session 測試**

把 `test_anti_cheat_session.py` 第 108-156 行（`@pytest.mark.parametrize(("user_agent", "expected_device_kind"), ...)` 與 `test_active_session_binds_server_classified_device_kind`）換成：

```python
@pytest.mark.django_db
def test_active_session_does_not_classify_the_device(published_exam, student):
    enrol_candidates(published_exam, student)
    participant = ContestParticipant.objects.create(
        contest=published_exam,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
    )
    request = RequestFactory().post(
        "/exam/start",
        data={"device_kind": "tablet"},
        HTTP_USER_AGENT="Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    )

    set_active_session(published_exam, participant, request, "device-a")

    active = get_active_session(published_exam.id, student.id)
    assert active["device_id"] == "device-a"
    assert "device_kind" not in active
```

- [ ] **Step 2: 改寫 precheck record 測試**

`test_precheck_record.py`：`VALID_PAYLOAD` 刪除 `"pwa_mode": False,`，`device` 改為：

```python
    "device": {
        "screen_share_supported": True,
        "webcam_supported": False,
        "active_sources": ["screen_share"],
    },
```

`test_drops_fields_of_the_wrong_shape_instead_of_storing_them` 中的 `"device": {"device_kind": "desktop", "is_tablet": "yes"},` 改為 `"device": {"screen_share_supported": True, "webcam_supported": "yes"},`，最後一個斷言改為 `self.assertEqual(normalized["device"], {"screen_share_supported": True})`。

在 `PrecheckRecordNormalizeTests` 加：

```python
    def test_tablet_and_pwa_fields_are_not_stored(self):
        normalized = normalize_precheck_payload(
            {
                "fullscreen": True,
                "pwa_mode": True,
                "device": {
                    "device_kind": "tablet",
                    "is_tablet": True,
                    "is_ipad_like": True,
                    "is_pwa_mode": True,
                    "pointer_profile": "touch_only",
                    "supports_fine_pointer": False,
                    "primary_source_module": "webcam",
                    "screen_share_supported": False,
                },
            }
        )

        self.assertNotIn("pwa_mode", normalized)
        self.assertEqual(normalized["device"], {"screen_share_supported": False})
```

- [ ] **Step 3: 確認失敗**

Run: `BT apps/contests/tests/services/test_anti_cheat_session.py apps/contests/tests/exam/test_precheck_record.py`
Expected: FAIL（`device_kind` 仍在 active session；`pwa_mode`、`device_kind` 仍被保留）。

- [ ] **Step 4: 修改 `anti_cheat_session.py` 與 `precheck_record.py`**

`anti_cheat_session.py`：刪除第 44-67 行整個 `classify_active_session_device_kind`，並刪除 `set_active_session` payload 中的 `"device_kind": classify_active_session_device_kind(user_agent),`（第 155 行）。

`precheck_record.py` 的 `_clean_device`（第 63-93 行）改為：

```python
def _clean_device(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    device: dict[str, Any] = {}
    for key in ("screen_share_supported", "webcam_supported"):
        cleaned = _clean_bool(value.get(key))
        if cleaned is not None:
            device[key] = cleaned
    sources = value.get("active_sources")
    if isinstance(sources, list):
        device["active_sources"] = [
            source
            for source in (_clean_str(item) for item in sources[:8])
            if source is not None
        ]
    return device
```

第 107 行改為 `for key in ("is_extended", "fullscreen", "webcam_granted"):`。

- [ ] **Step 5: 清掉測試裡的裝置類型**

`tests/integrity/test_evidence_chunks.py`：
- 刪除三個平板偽裝測試：`test_spoofed_event_device_kind_cannot_suppress_bound_desktop_source`、`test_missing_or_unknown_device_binding_cannot_suppress_evidence_source`、`test_spoofed_tablet_user_agent_cannot_narrow_frozen_source_union`（第 664-746 行）。
- `bind_active_device`（第 292-306 行）改為：

```python
def bind_active_device(participant):
    cache.set(
        active_session_key(
            participant.contest_id,
            participant.user_id,
        ),
        {
            "contest_id": participant.contest_id,
            "participant_id": participant.id,
            "user_id": participant.user_id,
            "device_id": "bound-device",
        },
        timeout=300,
    )
```

- 更新所有呼叫，並刪除事件 metadata fixture 中的 `"device_kind": "desktop",`（第 169、1269、1512、1744、1865、1928、2127 行，後端不再讀取）：

```bash
sed -i '' -E \
  -e 's/bind_active_device\(([a-z_]+), "desktop"\)/bind_active_device(\1)/' \
  -e '/^[[:space:]]*"device_kind": "desktop",$/d' \
  backend/apps/contests/tests/integrity/test_evidence_chunks.py
```
- 刪除不再使用的 import：第 14 行 `from django.test import RequestFactory`，以及 `anti_cheat_session` import 清單中的 `set_active_session,`（`get_active_session` 仍被第 446 行使用，保留）。

`tests/test_live_monitoring_presence.py:75` 刪除 `"device_kind": "desktop",`。

- [ ] **Step 6: 測試通過**

Run: `BT apps/contests/tests/services apps/contests/tests/exam apps/contests/tests/integrity apps/contests/tests/test_live_monitoring_presence.py apps/contests/tests/test_exam_live.py`
Expected: 全部 PASS。

Run: `grep -rnE "classify_active_session_device_kind|device_kind|is_ipad_like|is_pwa_mode" backend/apps/contests --include='*.py' | grep -v "attendance"`
Expected: 只剩 `test_anti_cheat_session.py` 新測試中刻意送出的 `"device_kind": "tablet"` 與 `"device_kind" not in active`，以及 `test_precheck_record.py` 新測試刻意送出的 `"device_kind": "tablet"`（簽到相關的 `device_kind` 已由 `grep -v attendance` 排除）。

- [ ] **Step 7: Commit**

```bash
git add backend/apps/contests/services/anti_cheat_session.py backend/apps/contests/services/precheck_record.py backend/apps/contests/tests/services/test_anti_cheat_session.py backend/apps/contests/tests/exam/test_precheck_record.py backend/apps/contests/tests/integrity/test_evidence_chunks.py backend/apps/contests/tests/test_live_monitoring_presence.py
git commit -F - <<'EOF'
refactor(contests): drop tablet device classification from exam sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: 移除 `Contest.admins`

**Files:**
- Modify: `backend/apps/contests/models/contest.py:124-131`
- Create: `backend/apps/contests/migrations/0007_remove_contest_admins.py`
- Modify: `backend/apps/contests/permissions.py:15,49-62,80,160-189`
- Modify: `backend/apps/contests/managers.py:31,63`
- Modify: `backend/apps/contests/views/contest.py:173,329-354`
- Modify: `backend/apps/contests/access_policy.py:172-175`
- Modify: `backend/apps/contests/serializers.py:97,146,255-258`
- Modify: `backend/apps/contests/services/export_service.py:18,121-126`
- Modify: `backend/apps/question_bank/bank_workflows.py:159,363,394,496`
- Delete: `backend/apps/contests/tests/admins/`
- Test: `backend/apps/contests/tests/access/test_scope_roles.py`
- Create: `backend/apps/contests/tests/access/test_removed_admin_endpoints.py`
- Create: `backend/apps/contests/tests/exporters/test_contest_results_csv_roles.py`
- Modify: `backend/apps/contests/tests/test_participant_dashboard_api.py:1-60`
- Modify: `backend/apps/contests/tests/listings/test_inactive_access.py:147-155`

**Interfaces:**
- Produces: `Contest` 無 `admins`；contest scope 的 `co_owner` 只來自 classroom 的 manager／TA；`permissions._contest_of(obj)`。

- [ ] **Step 1: 更新 scope role 測試並新增權限類測試**

`test_scope_roles.py` 的 `contest` fixture（第 82-92 行）改為：

```python
@pytest.fixture
def contest(owner: User, co_owner: User) -> Contest:
    c = Contest.objects.create(
        name="Scope Role Test Contest",
        owner=owner,
        status="published",
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    classroom = Classroom.objects.create(
        name="Scope Role Classroom",
        owner=owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    ClassroomMember.objects.create(classroom=classroom, user=co_owner, role="ta")
    ClassroomContest.objects.create(classroom=classroom, contest=c)
    return c
```

在檔案末尾加：

```python
@pytest.mark.django_db
def test_object_permissions_resolve_the_contest_from_either_shape(
    owner: User, co_owner: User, outsider: User, contest: Contest
) -> None:
    from types import SimpleNamespace

    from apps.contests.permissions import IsContestLifecycleOwner, IsContestOwnerOrAdmin

    def request_for(user):
        return SimpleNamespace(user=user)

    related = SimpleNamespace(contest=contest)
    manage = IsContestOwnerOrAdmin()
    lifecycle = IsContestLifecycleOwner()

    assert manage.has_object_permission(request_for(co_owner), None, contest) is True
    assert manage.has_object_permission(request_for(co_owner), None, related) is True
    assert manage.has_object_permission(request_for(outsider), None, contest) is False
    assert lifecycle.has_object_permission(request_for(owner), None, contest) is True
    assert lifecycle.has_object_permission(request_for(co_owner), None, related) is False
```

- [ ] **Step 2: 新增被移除 API 的測試**

`backend/apps/contests/tests/access/test_removed_admin_endpoints.py`：

```python
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest
from apps.users.models import User


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "action"),
    [("get", "admins"), ("post", "add_admin"), ("post", "remove_admin")],
)
def test_contest_admin_endpoints_are_removed(method: str, action: str) -> None:
    owner = User.objects.create_user(
        username="removed_admin_owner",
        email="removed_admin_owner@example.com",
        password="pass",
        role="teacher",
    )
    contest = Contest.objects.create(
        name="No Co-admins",
        owner=owner,
        status="published",
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    client = APIClient()
    client.force_authenticate(user=owner)

    response = getattr(client, method)(f"/api/v1/contests/{contest.id}/{action}/")

    assert response.status_code == 404
```

- [ ] **Step 3: 新增成績匯出身分測試**

`backend/apps/contests/tests/exporters/test_contest_results_csv_roles.py`：

```python
import csv
import io
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.utils import timezone

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.contests.models import Contest
from apps.contests.services.export_service import build_contest_results_csv_response
from apps.users.models import User


def _user(username: str, role: str = "student") -> User:
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pass", role=role
    )


def _standing(user: User) -> dict:
    return {
        "user": {"id": user.id, "username": user.username, "email": user.email},
        "display_name": user.username,
        "solved": 0,
        "total_score": 0,
        "time": 0,
        "problems": {},
    }


@pytest.mark.django_db
def test_results_csv_labels_the_owner_and_classroom_staff_as_managers():
    owner = _user("csv_owner", "teacher")
    ta = _user("csv_ta", "teacher")
    student = _user("csv_student")
    contest = Contest.objects.create(
        name="CSV Roles",
        owner=owner,
        status="published",
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    classroom = Classroom.objects.create(
        name="CSV Room", owner=owner, invite_code=uuid4().hex[:8].upper()
    )
    ClassroomMember.objects.create(classroom=classroom, user=ta, role="ta")
    ClassroomMember.objects.create(classroom=classroom, user=student, role="student")
    ClassroomContest.objects.create(classroom=classroom, contest=contest)
    scoreboard = SimpleNamespace(
        problems=[], standings=[_standing(owner), _standing(ta), _standing(student)]
    )

    text = build_contest_results_csv_response(contest, scoreboard).content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))

    assert {row[0]: row[3] for row in rows[1:4]} == {
        "csv_owner": "管理者",
        "csv_ta": "管理者",
        "csv_student": "參賽者",
    }
```

- [ ] **Step 4: 讓現有測試改用 classroom 角色**

`test_participant_dashboard_api.py`：import 區加 `from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember`，並把 `_create_contest` 中的 `contest.admins.add(self.teacher)` 換成：

```python
        classroom = Classroom.objects.create(
            name=f"{contest_type} dashboard classroom",
            owner=self.owner,
            invite_code=uuid4().hex[:8].upper(),
        )
        ClassroomMember.objects.create(classroom=classroom, user=self.teacher, role="ta")
        ClassroomMember.objects.create(classroom=classroom, user=self.student, role="student")
        ClassroomContest.objects.create(classroom=classroom, contest=contest)
```

`listings/test_inactive_access.py`：刪除 `test_contest_admin_can_access_draft_contest`（第 147-155 行）。

`git rm -r backend/apps/contests/tests/admins`。

- [ ] **Step 5: 移除 model 欄位並建立 migration**

`models/contest.py` 刪除第 124-131 行（`# Multiple admins/teachers for contest management` 註解與 `admins = models.ManyToManyField(...)`）。

`backend/apps/contests/migrations/0007_remove_contest_admins.py`：

```python
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0006_contest_webcam_required"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="admins",
        ),
    ]
```

- [ ] **Step 6: 確認失敗**

Run: `BT apps/contests/tests/access apps/contests/tests/exporters/test_contest_results_csv_roles.py apps/contests/tests/test_participant_dashboard_api.py`
Expected: FAIL（權限類以 `hasattr(obj, 'admins')` 判斷失效；CSV 把 TA 標成 `參賽者`；`contest.admins` 相關 `AttributeError`／`FieldError`）。

- [ ] **Step 7: 修改 `permissions.py`**

第 15 行註解改為 `#: Roles allowed for irreversible lifecycle operations (toggle status, archive, delete).`

`_native_contest_scope`（第 49-62 行）改為：

```python
def _native_contest_scope(user, contest) -> str:
    """
    Scope derived only from the contest record (owner, registration).
    Used together with classroom-derived scope so binding never strips contest owners.
    """
    if contest.owner_id == user.id:
        return 'owner'
    from .models import ContestParticipant  # local import avoids cycles

    if ContestParticipant.objects.filter(contest=contest, user=user).exists():
        return 'participant'
    return 'outsider'
```

`get_contest_scope_role` docstring 的 `co_owner        – co-admin added via admins M2M` 改為 `co_owner        – classroom manager or TA`。

在 `class IsContestOwnerOrAdmin` 之前加：

```python
def _contest_of(obj):
    from .models import Contest  # local import avoids cycles

    return obj if isinstance(obj, Contest) else getattr(obj, 'contest', None)
```

兩個權限類中的 `contest = obj if hasattr(obj, 'admins') else getattr(obj, 'contest', None)` 都改為 `contest = _contest_of(obj)`；`IsContestLifecycleOwner` docstring 的 `toggle status, archive, delete,\n    manage admins.` 改為 `toggle status, archive, delete.`。

- [ ] **Step 8: 修改 queryset、view、access policy、serializer**

`managers.py` 第 31 行 `Q(owner=user) | Q(admins=user)` 改為 `Q(owner=user)`；第 63 行 `Q(registrations__user=user) | Q(owner=user) | Q(admins=user)` 改為 `Q(registrations__user=user) | Q(owner=user)`。

`views/contest.py` 第 173 行改為 `return queryset.select_related("owner")`；刪除第 329-354 行（`# ========== Admin Management ==========` 與 `admins`、`add_admin`、`remove_admin`）。`_classroom_roster_admin_gate` 仍被參與者 API 使用，保留。

`access_policy.py` 刪除第 172-175 行（`# Admin Management (owner-only)` 與 `'admins'`、`'add_admin'`、`'remove_admin'`）。

`serializers.py` 刪除第 97 行 `admins = serializers.SerializerMethodField()`、第 146 行 `'admins',`、第 255-258 行 `get_admins`。

- [ ] **Step 9: 修改匯出與題庫**

`services/export_service.py` 第 18 行改為：

```python
from .participation import _classroom_staff_ids, attempted_participants, get_contest_classroom
```

`_get_admin_user_ids`（第 121-126 行）改為：

```python
def _get_admin_user_ids(contest):
    """Owner plus the bound classroom's staff: the rows labelled 管理者."""
    admin_ids = {contest.owner_id} if contest.owner_id else set()
    classroom = get_contest_classroom(contest)
    if classroom is not None:
        admin_ids |= _classroom_staff_ids(classroom)
    return admin_ids
```

`question_bank/bank_workflows.py` 四處（第 159、363、394、496 行）的 `Q(contest__owner=user) | Q(contest__admins=user)` 都改為 `Q(contest__owner=user)`。

- [ ] **Step 10: 確認沒有殘留並檢查 migration**

Run: `grep -rnE "contest__admins|Q\(admins=user\)|\.admins\.(add|all|filter)|'admins'" backend/apps --include='*.py' | grep -vE "classroom|/migrations/|Classroom"`
Expected: 沒有結果。

Run: `docker compose -p online_judge exec -T -e DATABASE_URL=postgresql://test:test@qjudge-testdb:5432/test_oj backend python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`

- [ ] **Step 11: 測試通過**

Run: `BT apps/contests apps/question_bank apps/classrooms`
Expected: 全部 PASS。若 `test_participant_dashboard_api.py` 因綁定 classroom 出現與管理權無關的失敗，回報並貼出錯誤，不要改測試斷言。

- [ ] **Step 12: Commit**

```bash
git add backend/apps/contests/models/contest.py backend/apps/contests/migrations/0007_remove_contest_admins.py backend/apps/contests/permissions.py backend/apps/contests/managers.py backend/apps/contests/views/contest.py backend/apps/contests/access_policy.py backend/apps/contests/serializers.py backend/apps/contests/services/export_service.py backend/apps/question_bank/bank_workflows.py backend/apps/contests/tests/admins backend/apps/contests/tests/access backend/apps/contests/tests/exporters/test_contest_results_csv_roles.py backend/apps/contests/tests/test_participant_dashboard_api.py backend/apps/contests/tests/listings/test_inactive_access.py
git commit -F - <<'EOF'
refactor(contests): drop contest co-admins in favour of classroom roles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: 前端資料層讀 `webcam_required`，刪除 config 版本號

**Files:**
- Modify: `frontend/src/core/entities/contest.entity.ts:281,416-424,449-453,620-633`
- Modify: `frontend/src/core/ports/contest.repository.ts`
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts:144`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts:94-97,518-534`
- Modify: `frontend/src/infrastructure/mappers/contestAnticheat.mapper.ts:116-146`
- Modify: `frontend/src/features/contest/anticheat/integrity/useIntegrityRuntime.ts:50-67`
- Modify: `frontend/src/features/contest/components/ExamModeWrapper.tsx:188`
- Modify: `frontend/src/shared/mocks/contest.mock.ts`
- Modify（fixture）: `frontend/src/features/contest/anticheat/integrity/residentIntegritySession.test.ts`、`frontend/src/features/contest/contexts/IntegrityUploadProvider.test.tsx`、`frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.test.tsx`
- Test: `frontend/src/infrastructure/mappers/contest.mapper.test.ts:143-192`、`frontend/src/features/contest/anticheat/integrity/IntegrityRuntime.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 config／snapshot 形狀。
- Produces: `ContestDetail.webcamRequired: boolean`、`ContestIntegrityRun.webcamRequired: boolean`、`ContestAnticheatConfig = { webcamRequired: boolean; devicePolicy; integrityRun? }`（無 `version`；`devicePolicy` 到 Task 10 才刪）、`ContestUpdateRequest.webcamRequired?`、`ContestUpdatePayload.webcamRequired?`、`enabledEvidenceSources(policy)` 依 `webcam_required`。

- [ ] **Step 1: 改寫 mapper 測試**

`contest.mapper.test.ts` 的 `maps only device policy and the frozen integrity run`（第 143-192 行）換成：

```ts
    it("maps webcamRequired from the config and from the frozen run separately", () => {
      const config = mapContestAnticheatConfigDto({
        webcam_required: true,
        integrity_run: {
          id: "run-1",
          session_state: "active",
          health: "healthy",
          participant_id: "7",
          policy_snapshot: { webcam_required: false },
          registry_snapshot: { version: "registry-1", definitions: {} },
        },
      });

      expect(config.webcamRequired).toBe(true);
      expect(config).not.toHaveProperty("version");
      expect(config.integrityRun?.participantId).toBe(7);
      expect(config.integrityRun?.webcamRequired).toBe(false);
    });

    it("maps webcamRequired on contest detail and updates", () => {
      expect(
        mapContestDetailDto({
          id: "contest-1",
          name: "Exam",
          webcam_required: true,
          permissions: {},
          problems: [],
        } as any).webcamRequired,
      ).toBe(true);
      expect(mapContestUpdateRequestToDto({ webcamRequired: true })).toEqual({
        webcam_required: true,
      });
    });
```

`IntegrityRuntime.test.tsx`：第 4 行 import 加入 `enabledEvidenceSources`，檔案末尾加：

```ts
describe("enabledEvidenceSources", () => {
  it("always records the screen and adds the webcam only when the run requires it", () => {
    expect([...enabledEvidenceSources({ webcam_required: false })]).toEqual(["screen_share"]);
    expect([...enabledEvidenceSources({ webcam_required: true })]).toEqual(["screen_share", "webcam"]);
  });
});
```

- [ ] **Step 2: 確認失敗**

Run: `FT src/infrastructure/mappers/contest.mapper.test.ts src/features/contest/anticheat/integrity/IntegrityRuntime.test.tsx`
Expected: FAIL（mapper 要求 `version`；`webcamRequired` 為 `undefined`；`enabledEvidenceSources` 仍讀 `device_policy`）。

- [ ] **Step 3: 型別與 DTO**

`contest.entity.ts`：
- `ContestDetail` 的 `cheatDetectionEnabled: boolean;` 下一行加 `webcamRequired: boolean;`
- `ContestIntegrityRun` 的 `devicePolicy: ContestAnticheatDevicePolicy;` 下一行加 `webcamRequired: boolean;`
- `ContestAnticheatConfig` 刪除 `version: number;`，在 `devicePolicy` 下一行加 `webcamRequired: boolean;`
- `ContestUpdateRequest` 的 `anticheatDevicePolicy?: ContestAnticheatDevicePolicy;` 下一行加 `webcamRequired?: boolean;`

`core/ports/contest.repository.ts` 的 `ContestUpdatePayload`：`anticheatDevicePolicy?: ContestAnticheatDevicePolicy;` 下一行加 `webcamRequired?: boolean;`

`contest.dto.ts` 的 `ContestDetailDto`：`anticheat_device_policy?: AnticheatDevicePolicyDto;` 下一行加 `webcam_required?: boolean;`

- [ ] **Step 4: mapper、證據來源與版本條件**

`contest.mapper.ts`：`mapContestDetailDto` 的 `cheatDetectionEnabled: !!dto.cheat_detection_enabled,` 下一行加 `webcamRequired: !!dto.webcam_required,`；`mapContestUpdateRequestToDto` 的 dto 物件中 `anticheat_device_policy: anticheatDevicePolicy,` 下一行加 `webcam_required: request.webcamRequired,`。

`contestAnticheat.mapper.ts`：`mapIntegrityRun` 回傳物件的 `devicePolicy: ...,` 之後加 `webcamRequired: policySnapshot.webcam_required === true,`；`mapContestAnticheatConfigDto` 改為：

```ts
export function mapContestAnticheatConfigDto(dto: unknown): ContestAnticheatConfig {
  const root = ensureObject(dto, "root");
  return {
    devicePolicy: mapAnticheatDevicePolicyDto(
      root.device_policy as AnticheatDevicePolicyDto | undefined,
    ),
    webcamRequired: root.webcam_required === true,
    ...(root.integrity_run === undefined
      ? {}
      : { integrityRun: mapIntegrityRun(root.integrity_run) }),
  };
}
```

`useIntegrityRuntime.ts` 第 50-67 行（`// Device classification is browser supplied...` 註解與 `enabledEvidenceSources`）改為：

```ts
// Screen share always records; the frozen policy only decides the webcam.
export const enabledEvidenceSources = (
  policy: Record<string, unknown> | undefined,
): Set<"screen_share" | "webcam"> =>
  new Set(policy?.webcam_required === true ? ["screen_share", "webcam"] : ["screen_share"]);
```

`ExamModeWrapper.tsx` 的 `integrityRuntimeEnabled` 刪除 `anticheatConfig?.version === 3 &&` 一行（第 188 行）。

`shared/mocks/contest.mock.ts`：`cheatDetectionEnabled: true,` 下一行加 `webcamRequired: false,`。

- [ ] **Step 5: 更新 integrity run fixture**

```bash
sed -i '' \
  -e 's/device_policy: { desktop: { enabled: true, sources: { screen_share: { enabled: true } } } }/webcam_required: false/' \
  -e 's/devicePolicy: {} as never/devicePolicy: {} as never, webcamRequired: false/' \
  frontend/src/features/contest/anticheat/integrity/residentIntegritySession.test.ts \
  frontend/src/features/contest/contexts/IntegrityUploadProvider.test.tsx \
  frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.test.tsx
grep -n "device_policy" frontend/src/features/contest/anticheat/integrity/residentIntegritySession.test.ts
```

Expected: `grep` 沒有結果。

- [ ] **Step 6: 測試與型別檢查**

Run: `FT src/infrastructure/mappers src/features/contest/anticheat src/features/contest/contexts src/features/contest/screens/paperExam`
Expected: 全部 PASS。

Run: `TC`
Expected: 無錯誤。若有其他以字面值建立 `ContestDetail` 而缺少 `webcamRequired`、或讀取 `anticheatConfig.version` 的錯誤，前者在 `cheatDetectionEnabled` 旁加 `webcamRequired: false`，後者刪除該版本判斷，重跑到乾淨為止。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/core/entities/contest.entity.ts frontend/src/core/ports/contest.repository.ts frontend/src/infrastructure/api/dto/contest.dto.ts frontend/src/infrastructure/mappers/contest.mapper.ts frontend/src/infrastructure/mappers/contestAnticheat.mapper.ts frontend/src/infrastructure/mappers/contest.mapper.test.ts frontend/src/features/contest/anticheat/integrity/useIntegrityRuntime.ts frontend/src/features/contest/anticheat/integrity/IntegrityRuntime.test.tsx frontend/src/features/contest/components/ExamModeWrapper.tsx frontend/src/shared/mocks/contest.mock.ts frontend/src/features/contest/anticheat/integrity/residentIntegritySession.test.ts frontend/src/features/contest/contexts/IntegrityUploadProvider.test.tsx frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.test.tsx
git commit -F - <<'EOF'
feat(frontend): read webcam_required and drop the config version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

（若 Step 6 修了其他檔案，一併列入 `git add`。）

---

### Task 7: 前端監考規則移除平板分支

**Files:**
- Rewrite: `frontend/src/features/contest/domain/anticheatModulePolicy.ts`、`anticheatModulePolicy.test.ts`
- Delete: `frontend/src/features/contest/domain/deviceClassification.ts`
- Delete: `frontend/src/features/contest/hooks/useViewportMonitoring.ts`、`useViewportMonitoring.test.ts`
- Modify: `frontend/src/features/contest/domain/examSensorStatus.ts`、`examSensorStatus.test.ts`
- Modify: `frontend/src/features/contest/components/exam/ExamModals.tsx`
- Modify: `frontend/src/features/contest/components/ExamModeWrapper.tsx`
- Modify: `frontend/src/features/contest/hooks/useMouseLeaveMonitoring.ts`
- Modify: `frontend/src/features/contest/screens/precheck/ExamPrecheckScreen.tsx`
- Modify: `frontend/src/features/contest/screens/precheck/precheckEnvironment.ts`、`precheckEnvironment.test.ts`
- Modify: `frontend/src/features/contest/hooks/useExamSessionFlow.ts`、`useExamSessionFlow.test.ts`
- Modify: `frontend/src/features/contest/hooks/useContestExamActions.ts`
- Modify: `frontend/src/features/contest/anticheat/integrity/frontendIntegritySignals.ts`、`useIntegrityRuntime.ts`
- Modify: `frontend/src/i18n/locales/{en,ja,ko,zh-TW}/contest.json`

**Interfaces:**
- Consumes: Task 6 的 `ContestAnticheatConfig.webcamRequired`、`ContestIntegrityRun.webcamRequired`。
- Produces:
  - `detectAnticheatCapability(): AnticheatCapability`，`AnticheatCapability = { screenShareSupported: boolean; webcamSupported: boolean }`
  - `resolveDeviceMonitoringPlan(capability: AnticheatCapability, webcamRequired: boolean): DeviceMonitoringPlan`
  - `buildExamEntryDeviceMetadata(capability, plan): { screen_share_supported: boolean; webcam_supported: boolean; active_sources: AnticheatSourceModule[] }`
  - `ExamSensorSource` 不再含 `pwa_required`、`split_view`、`viewport`；`FRONTEND_INTEGRITY_SIGNAL_IDS` 不再含 `viewport_*`。

- [ ] **Step 1: 改寫監考規則測試（整檔）**

`anticheatModulePolicy.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExamEntryDeviceMetadata,
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "./anticheatModulePolicy";

const desktop = { screenShareSupported: true, webcamSupported: true };

describe("resolveDeviceMonitoringPlan", () => {
  it("records only the screen when the contest does not require a webcam", () => {
    const plan = resolveDeviceMonitoringPlan(desktop, false);

    expect(plan.allowed).toBe(true);
    expect(plan.sources.screenShare).toMatchObject({ active: true, role: "primary" });
    expect(plan.sources.webcam).toMatchObject({ enabled: false, active: false, role: null });
    expect(plan.detectors).toEqual({ fullscreen: true, multiDisplay: true, mouseLeave: true });
    expect(plan.precheck).toEqual({
      requireScreenShare: true,
      requireWebcam: false,
      enableWebcam: false,
      requireFullscreen: true,
      requireSingleMonitor: true,
    });
  });

  it("adds the webcam as a secondary source when the contest requires it", () => {
    const plan = resolveDeviceMonitoringPlan(desktop, true);

    expect(plan.allowed).toBe(true);
    expect(plan.sources.webcam).toMatchObject({ enabled: true, active: true, role: "secondary" });
    expect(plan.runtime).toEqual({
      enableScreenShareCapture: true,
      enableWebcamCapture: true,
      monitorScreenShareStream: true,
      monitorWebcamStream: true,
    });
  });

  it("refuses a browser that cannot share its screen, such as a tablet", () => {
    const plan = resolveDeviceMonitoringPlan(
      { screenShareSupported: false, webcamSupported: true },
      false,
    );

    expect(plan.allowed).toBe(false);
    expect(plan.missingEnabledSources).toEqual(["screen_share"]);
    expect(plan.sources.screenShare.role).toBeNull();
  });

  it("refuses a required webcam the browser cannot open", () => {
    const plan = resolveDeviceMonitoringPlan(
      { screenShareSupported: true, webcamSupported: false },
      true,
    );

    expect(plan.allowed).toBe(false);
    expect(plan.missingEnabledSources).toEqual(["webcam"]);
  });
});

describe("buildExamEntryDeviceMetadata", () => {
  it("reports capability and the sources that will record", () => {
    const plan = resolveDeviceMonitoringPlan(desktop, true);

    expect(buildExamEntryDeviceMetadata(desktop, plan)).toEqual({
      screen_share_supported: true,
      webcam_supported: true,
      active_sources: ["screen_share", "webcam"],
    });
  });
});

describe("detectAnticheatCapability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads screen share and webcam support from the media APIs", () => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });

    expect(detectAnticheatCapability()).toEqual({
      screenShareSupported: false,
      webcamSupported: true,
    });
  });
});
```

- [ ] **Step 2: 確認失敗**

Run: `FT src/features/contest/domain/anticheatModulePolicy.test.ts`
Expected: FAIL（舊實作需要 device policy、回傳 `deviceKind` 等欄位）。

- [ ] **Step 3: 改寫 `anticheatModulePolicy.ts`（整檔）**

```ts
import {
  supportsDisplayMediaApi,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";

export interface AnticheatCapability {
  screenShareSupported: boolean;
  webcamSupported: boolean;
}

export type AnticheatSourceModule = "screen_share" | "webcam";

/**
 * Strict mode has one rule set: the screen share is the primary evidence and
 * fullscreen, multi-display and mouse-leave detection are always on. A browser
 * that cannot share its screen (tablets, phones) cannot take a strict exam.
 */
export interface DeviceMonitoringPlan {
  allowed: boolean;
  missingEnabledSources: AnticheatSourceModule[];
  sources: {
    screenShare: {
      enabled: boolean;
      available: boolean;
      active: boolean;
      role: "primary" | null;
    };
    webcam: {
      enabled: boolean;
      available: boolean;
      active: boolean;
      role: "secondary" | null;
    };
  };
  detectors: {
    fullscreen: boolean;
    multiDisplay: boolean;
    mouseLeave: boolean;
  };
  precheck: {
    requireScreenShare: boolean;
    requireWebcam: boolean;
    enableWebcam: boolean;
    requireFullscreen: boolean;
    requireSingleMonitor: boolean;
  };
  runtime: {
    enableScreenShareCapture: boolean;
    enableWebcamCapture: boolean;
    monitorScreenShareStream: boolean;
    monitorWebcamStream: boolean;
  };
}

export interface ExamEntryDeviceMetadata {
  screen_share_supported: boolean;
  webcam_supported: boolean;
  active_sources: AnticheatSourceModule[];
}

export const detectAnticheatCapability = (): AnticheatCapability => ({
  screenShareSupported: supportsDisplayMediaApi(),
  webcamSupported: supportsUserMediaApi(),
});

export const resolveDeviceMonitoringPlan = (
  capability: AnticheatCapability,
  webcamRequired: boolean,
): DeviceMonitoringPlan => {
  const screenShareActive = capability.screenShareSupported;
  const webcamActive = webcamRequired && capability.webcamSupported;
  const missingEnabledSources: AnticheatSourceModule[] = [];
  if (!screenShareActive) missingEnabledSources.push("screen_share");
  if (webcamRequired && !webcamActive) missingEnabledSources.push("webcam");

  return {
    allowed: missingEnabledSources.length === 0,
    missingEnabledSources,
    sources: {
      screenShare: {
        enabled: true,
        available: capability.screenShareSupported,
        active: screenShareActive,
        role: screenShareActive ? "primary" : null,
      },
      webcam: {
        enabled: webcamRequired,
        available: capability.webcamSupported,
        active: webcamActive,
        role: webcamActive ? "secondary" : null,
      },
    },
    detectors: { fullscreen: true, multiDisplay: true, mouseLeave: true },
    precheck: {
      requireScreenShare: screenShareActive,
      requireWebcam: webcamActive,
      enableWebcam: webcamActive,
      requireFullscreen: true,
      requireSingleMonitor: true,
    },
    runtime: {
      enableScreenShareCapture: screenShareActive,
      enableWebcamCapture: webcamActive,
      monitorScreenShareStream: screenShareActive,
      monitorWebcamStream: webcamActive,
    },
  };
};

export const buildExamEntryDeviceMetadata = (
  capability: AnticheatCapability,
  monitoringPlan: DeviceMonitoringPlan,
): ExamEntryDeviceMetadata => ({
  screen_share_supported: capability.screenShareSupported,
  webcam_supported: capability.webcamSupported,
  active_sources: [
    ...(monitoringPlan.runtime.enableScreenShareCapture ? ["screen_share" as const] : []),
    ...(monitoringPlan.runtime.enableWebcamCapture ? ["webcam" as const] : []),
  ],
});
```

`git rm frontend/src/features/contest/domain/deviceClassification.ts frontend/src/features/contest/hooks/useViewportMonitoring.ts frontend/src/features/contest/hooks/useViewportMonitoring.test.ts`

Run: `FT src/features/contest/domain/anticheatModulePolicy.test.ts`
Expected: PASS。

- [ ] **Step 4: 感測器狀態（測試與實作）**

`examSensorStatus.test.ts`：`quiet` 刪除 `pwaRequired`、`viewportInterrupted`、`isTablet`；`keeps policy problems ahead of every sensor` 刪除 `pwaRequired: true,`；刪除 `splits viewport interruption by device class` 測試；`examSensorTone` 測試刪除 `pwa_required` 與 `viewport` 兩行；`isSensorRecoverableByModal` 測試刪除 `pwa_required` 一行，可恢復清單改為 `["screen_share", "webcam", "fullscreen", "mouse_leave", "multiple_displays"]`。

`examSensorStatus.ts`：

```ts
export type ExamSensorSource =
  | "policy_unavailable"
  | "screen_share"
  | "webcam"
  | "fullscreen"
  | "mouse_leave"
  | "multiple_displays";

export type ExamSensorTone = "warning" | "critical";

export interface ExamSensorSnapshot {
  /** Anti-cheat policy could not be resolved for this device. */
  policyUnavailable: boolean;
  screenShareInterrupted: boolean;
  webcamInterrupted: boolean;
  fullscreenInterrupted: boolean;
  mouseLeaveInterrupted: boolean;
  multiDisplayInterrupted: boolean;
}
```

`resolveActiveExamSensorSource` 刪除 `if (snapshot.pwaRequired) return "pwa_required";` 與整個 `if (snapshot.viewportInterrupted) {...}`；`CRITICAL_SOURCES` 刪除 `"pwa_required",`；`OVERLAY_SOURCES` 改為 `new Set(["policy_unavailable"])`。

Run: `FT src/features/contest/domain/examSensorStatus.test.ts`
Expected: PASS。

- [ ] **Step 5: `ExamModals.tsx`**

第 3 行改為 `import { CheckmarkFilled, ScreenOff, VideoOff } from "@carbon/icons-react";`；刪除 `const isTablet = activeSource === "split_view";` 與 `const showViewportRecovery = ...`；刪除 `{/* Viewport / Split View Recovery Modal */}` 起到該 `</Modal>` 為止（第 179-217 行）。

- [ ] **Step 6: `useMouseLeaveMonitoring.ts`**

`UseMouseLeaveMonitoringConfig` 刪除 `isTablet?: boolean;` 與 `supportsFinePointer?: boolean;`；參數刪除 `isTablet = false,` 與 `supportsFinePointer = false,`；刪除第 41 行 `const effectiveEnabled = ...`，`if (!effectiveEnabled || examSubmitted)` 改為 `if (!enabled || examSubmitted)`，依賴陣列 `[effectiveEnabled, examSubmitted]` 改為 `[enabled, examSubmitted]`。

- [ ] **Step 7: `ExamModeWrapper.tsx`**

- 刪除第 47 行 `import { useViewportMonitoring } ...`。
- 第 122-132 行改為：

```tsx
  const capability = detectAnticheatCapability();
  const monitoringPlan = resolveDeviceMonitoringPlan(
    capability,
    anticheatConfig?.integrityRun?.webcamRequired ?? anticheatConfig?.webcamRequired ?? false,
  );
  const effectiveRequiresFullscreen =
    requiresFullscreen && monitoringPlan.precheck.requireFullscreen;
  const screenModuleRole =
    monitoringPlan.sources.screenShare.role ?? "secondary";
  const webcamModuleRole = monitoringPlan.sources.webcam.role ?? "secondary";
```

- 刪除 `const pwaGuardFailed = ...`（第 143-146 行）與 `const viewportMonitorEnabled = ...`（第 173-177 行）。
- 刪除 `const viewport = useViewportMonitoring({...});`（第 328-334 行）。
- `useMouseLeaveMonitoring({...})` 刪除 `isTablet: capability.isTablet,` 與 `supportsFinePointer: capability.supportsFinePointer,`。
- `shouldShowLockScreen` 改為：

```tsx
  const shouldShowLockScreen =
    (examState.isLocked || shouldShowPolicyUnavailableScreen) && isAnsweringPath();
```

- `lockReasonText` 改為：

```tsx
  const lockReasonText = shouldShowPolicyUnavailableScreen
    ? policyUnavailableText
    : examState.lockReason;
```

- `activeSensorSource` 改為：

```tsx
  const activeSensorSource = useMemo(
    () =>
      resolveActiveExamSensorSource({
        policyUnavailable: shouldShowPolicyUnavailableScreen,
        screenShareInterrupted: screenShare.reauth.inProgress,
        webcamInterrupted: webcam.interrupted,
        fullscreenInterrupted: fullscreen.interrupted,
        mouseLeaveInterrupted: mouseLeave.interrupted,
        multiDisplayInterrupted: multiDisplay.interrupted,
      }),
    [
      fullscreen.interrupted,
      mouseLeave.interrupted,
      multiDisplay.interrupted,
      screenShare.reauth.inProgress,
      shouldShowPolicyUnavailableScreen,
      webcam.interrupted,
    ],
  );
```

- [ ] **Step 8: `precheckEnvironment.ts` 與測試**

- `EnvironmentCheckFilter` 刪除 `requirePwaMode: boolean;`；`createEnvironmentChecks` 的 `if (!filter || !filter.skipFullscreen || filter.requirePwaMode)` 改為 `if (!filter || !filter.skipFullscreen)`。
- `runStartPreflightValidation` 的 options 型別與解構刪除 `requirePwaOnTablet`、`isPwaMode`；刪除 `if (requirePwaOnTablet && !isPwaMode) { return fail({...}); }`（第 358-366 行）。
- `RunEnvChecksOptions` 與 `runEnvChecks` 解構刪除 `requirePwaOnTablet`、`isPwaMode`；刪除 `if (requirePwaOnTablet && !isPwaMode) { ... return; }`（第 584-599 行）。
- `skipFullscreenCheck` 與其狀態文字保留（測試以它略過 jsdom 的全螢幕）。

`precheckEnvironment.test.ts` 第 91-92 與 143-144 行刪除 `requirePwaOnTablet: false,`、`isPwaMode: false,`。

- [ ] **Step 9: `ExamPrecheckScreen.tsx`**

- 第 77-103 行改為：

```tsx
  const capability = detectAnticheatCapability();
  const monitoringPlan = resolveDeviceMonitoringPlan(
    capability,
    anticheatConfig?.integrityRun?.webcamRequired ?? anticheatConfig?.webcamRequired ?? false,
  );
  const entryDeviceMetadata = buildExamEntryDeviceMetadata(capability, monitoringPlan);
  const skipFullscreenCheck = !monitoringPlan.precheck.requireFullscreen;
  const entrySourceLabel = entryDeviceMetadata.active_sources.length
    ? entryDeviceMetadata.active_sources
        .map((source) =>
          source === "screen_share"
            ? t("precheck.entryDevice.source.screenShare", "螢幕畫面")
            : t("precheck.entryDevice.source.webcam", "Webcam")
        )
        .join(" + ")
    : t("precheck.entryDevice.source.none", "未啟用監考來源");
```

- `environmentRequirements` 刪除 `...(monitoringPlan.precheck.requirePwaMode ? [...] : []),`（第 119-121 行）。
- `checkFilter` 刪除 `requirePwaMode: monitoringPlan.precheck.requirePwaMode,`；其 `useEffect` 依賴刪除 `checkFilter.requirePwaMode,`。
- `runEnvChecks({...})`、`handleStart` 與倒數 `useEffect` 內的兩次 `runStartPreflightValidation(t, {...})` 都刪除 `requirePwaOnTablet: ...,` 與 `isPwaMode: capability.isPwaMode,`；三個依賴陣列都刪除 `capability.isPwaMode,` 與 `monitoringPlan.precheck.requirePwaMode,`。
- `startSession({ precheck: {...} })` 刪除 `pwa_mode: capability.isPwaMode,`。
- 第 618-623 行刪除顯示 `{entryDeviceLabel}` 與 `{entryModeLabel}` 的兩個 `<Tag>`，只保留監考來源的 `<Tag type="purple">`。
- 不支援畫面（第 653-679 行）的 `<p>` 與其後的「偵測到的裝置」`<div>` 改為：

```tsx
                <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1rem", lineHeight: 1.6 }}>
                  {monitoringPlan.missingEnabledSources.includes("screen_share")
                    ? t(
                        "precheck.environment.deviceUnsupported.screenShareRequired",
                        "嚴格考試模式需使用電腦瀏覽器（必須能分享螢幕）。請改用電腦重新進入。",
                      )
                    : t(
                        "precheck.environment.deviceUnsupported.missingCapabilities",
                        "本考試需要 {{sources}}，但此裝置或瀏覽器不支援。請換用支援的裝置或瀏覽器後重試。",
                        { sources: t("precheck.entryDevice.source.webcam", "Webcam") },
                      )}
                </p>
```

- 第 768-774 行的第一個 `<li>` 改為：

```tsx
                  <li dangerouslySetInnerHTML={{ __html: t("precheck.instruction.keepFullscreen") }} />
```

- [ ] **Step 10: 送出與離開時的來源**

`useExamSessionFlow.ts`：刪除第 22-25 行 `anticheatModulePolicy` import；`submitExam` 刪除第 75-82 行（`monitoringPlan`、`sourceModule`、`moduleRole`），`payload` 改為 `module: "screen_share",`、`module_role: "primary",`，`endExam` 的 `source_module: sourceModule,` 改為 `source_module: "screen_share",`。

`useExamSessionFlow.test.ts`：刪除 `anticheatDevicePolicy: undefined,`（第 24 行）與整個 `vi.mock("@/features/contest/domain/anticheatModulePolicy", ...)`（第 49-58 行）；第一個測試的 `emit` 斷言改為：

```ts
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "exam_submit_initiated",
        payload: expect.objectContaining({ module: "screen_share", module_role: "primary" }),
      }),
    );
```

`useContestExamActions.ts`：刪除第 43-46 行 import 與第 81-89 行 `resolveMonitoringModules`；第 139 與 201 行的 `const { primarySourceModule: sourceModule } = resolveMonitoringModules();` 都改為 `const sourceModule = "screen_share" as const;`；第 192 與 274 行依賴陣列刪除 `resolveMonitoringModules,`。

- [ ] **Step 11: 前端訊號清單**

`frontendIntegritySignals.ts` 刪除 `"viewport_interrupted",` 與 `"viewport_restored",`；`useIntegrityRuntime.ts` 的 `import.meta.glob` 清單刪除 `"../../hooks/useViewportMonitoring.ts",`。

- [ ] **Step 12: i18n**

Run: `grep -rnE "pwaRequiredOnTablet|splitViewDetected|viewportInterrupted(Title|Heading|Desc)|viewportSensorWarning|tabletRequiresPwa|keepPwaMode|deviceKindDisabled|deviceUnsupported\.detected|entryDevice\.(kind|mode)|requirements\.pwa" frontend/src --include='*.ts' --include='*.tsx'`
Expected: 沒有結果。

```bash
python3 - <<'EOF'
import json
from pathlib import Path

# Only keys present in the JSON. The removed exam.splitView*/viewport*/
# pwaRequiredOnTablet and deviceUnsupported.* texts were code fallbacks only.
REMOVE = [
    "exam.monitoringReminder.pwa_required",
    "exam.monitoringReminder.split_view",
    "exam.monitoringReminder.viewport",
    "precheck.entryDevice.kind",
    "precheck.entryDevice.mode",
    "precheck.environment.requirements.pwa",
    "precheck.environment.errors.tabletRequiresPwa",
    "precheck.instruction.keepPwaMode",
]
ADD = {
    "precheck.environment.deviceUnsupported.screenShareRequired": {
        "zh-TW": "嚴格考試模式需使用電腦瀏覽器（必須能分享螢幕）。請改用電腦重新進入。",
        "en": "Strict exam mode needs a computer browser that can share its screen. Switch to a computer and try again.",
        "ja": "厳格試験モードでは画面共有ができるパソコンのブラウザが必要です。パソコンに切り替えて再度お試しください。",
        "ko": "엄격 시험 모드는 화면 공유가 가능한 컴퓨터 브라우저가 필요합니다. 컴퓨터로 다시 접속해 주세요.",
    },
}

for lang in ["en", "ja", "ko", "zh-TW"]:
    path = Path(f"frontend/src/i18n/locales/{lang}/contest.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    for dotted in REMOVE:
        *parents, leaf = dotted.split(".")
        node = data
        for key in parents:
            node = node[key]
        del node[leaf]
    for dotted, values in ADD.items():
        *parents, leaf = dotted.split(".")
        node = data
        for key in parents:
            node = node.setdefault(key, {})
        node[leaf] = values[lang]
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
EOF
python3 scripts/i18n/i18n_check.py
```

Expected: 腳本無 `KeyError`；`All i18n checks completed.`。

- [ ] **Step 13: 相關測試、型別與架構檢查**

Run: `TC`
Expected: 無錯誤（若仍有編譯錯誤，錯誤位置就是尚未刪乾淨的平板分支，依本任務規則刪除）。

Run: `FT src/features/contest src/infrastructure`
Expected: 全部 PASS，包含 `anticheat/integrity/IntegrityRuntime.test.tsx`（實際發出的訊號與 `FRONTEND_INTEGRITY_SIGNAL_IDS` 一致）。

Run: `grep -rnE "isTablet|isPwaMode|isIPadLike|requirePwaMode|enableViewportIntegrity|deviceClassification|useViewportMonitoring|primarySourceModule" frontend/src --include='*.ts' --include='*.tsx'`
Expected: 沒有結果。

Run: `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src && node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src`
Expected: 兩者 passed。

- [ ] **Step 14: Commit**

```bash
git add frontend/src/features/contest/domain frontend/src/features/contest/hooks/useViewportMonitoring.ts frontend/src/features/contest/hooks/useViewportMonitoring.test.ts frontend/src/features/contest/hooks/useMouseLeaveMonitoring.ts frontend/src/features/contest/hooks/useExamSessionFlow.ts frontend/src/features/contest/hooks/useExamSessionFlow.test.ts frontend/src/features/contest/hooks/useContestExamActions.ts frontend/src/features/contest/components/ExamModeWrapper.tsx frontend/src/features/contest/components/exam/ExamModals.tsx frontend/src/features/contest/screens/precheck frontend/src/features/contest/anticheat/integrity/frontendIntegritySignals.ts frontend/src/features/contest/anticheat/integrity/useIntegrityRuntime.ts frontend/src/i18n/locales
git commit -F - <<'EOF'
refactor(frontend): monitor strict exams with one desktop rule set

Tablet, PWA and viewport branches are gone; a browser that cannot
share its screen is told to use a computer. The removed code is kept
under the archive/tablet-anticheat tag.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: 移除 `viewport` 事件定義

**Files:**
- Modify: `backend/apps/contests/integrity/registry.py:8,192-208`
- Test: `backend/apps/contests/tests/integrity/test_registry.py:24,68,112,116-124`
- Modify: `frontend/src/features/contest/constants/eventTaxonomy.ts:39-44`

**Interfaces:**
- Consumes: Task 7（前端已不再要求 `viewport_*` 訊號）。
- Produces: `REGISTRY_VERSION = "2026-09-30.1"`；registry 不含 `viewport`。

- [ ] **Step 1: 更新 registry 測試**

`test_registry.py`：第 24 行版本改為 `"2026-09-30.1"`；第 68 行刪除 `"viewport": 5_000,`；第 112 行改為 `for recorded in ("fullscreen_integrity", "mouse_leave"):`；把 `test_incident_evidence_asks_the_source_its_device_actually_captures`（第 116-124 行）換成：

```python
def test_incident_evidence_asks_the_source_that_captured_it():
    definitions = build_registry_snapshot()["definitions"]

    assert "viewport" not in definitions
    assert definitions["webcam"]["evidence"]["sources"] == ["webcam"]
    assert definitions["screen_share"]["evidence"]["sources"] == ["screen_share"]
    assert definitions["multi_display"]["evidence"]["sources"] == ["screen_share"]


# Mirrors FRONTEND_INTEGRITY_SIGNAL_IDS in
# frontend/src/features/contest/anticheat/integrity/frontendIntegritySignals.ts.
# The browser refuses to record when a run's registry misses any of these.
FRONTEND_SIGNALS = {
    "clipboard_action",
    "exam_entered",
    "exam_submit_initiated",
    "exit_fullscreen_triggered",
    "forbidden_action",
    "fullscreen_restored",
    "listener_tampered",
    "mouse_leave_restored",
    "mouse_leave_triggered",
    "multi_display_restored",
    "multi_display_triggered",
    "screen_share_interrupted",
    "screen_share_restored",
    "health_snapshot",
    "webcam_interrupted",
    "webcam_restored",
}


def test_registry_covers_every_frontend_signal():
    signals = {
        signal
        for definition in build_registry_snapshot()["definitions"].values()
        for signal in definition["signals"].values()
        if isinstance(signal, str) and signal
    }

    assert FRONTEND_SIGNALS <= signals
```

- [ ] **Step 2: 確認失敗**

Run: `BT apps/contests/tests/integrity/test_registry.py`
Expected: FAIL（版本仍是 `2026-09-10.1`，`viewport` 仍存在）；`test_registry_covers_every_frontend_signal` 已 PASS。

- [ ] **Step 3: 修改 registry 與事件圖示**

`registry.py` 第 8 行改為 `REGISTRY_VERSION = "2026-09-30.1"`；刪除 `# Tablet-only (see resolveDeviceMonitoringPlan) ...` 註解與整個 `"viewport": _definition(...)`（第 192-208 行）。

`eventTaxonomy.ts` 的 `getEventTypeIcon` 中：

```ts
  if (
    eventType.includes("multi_display") ||
    eventType.includes("multiple_displays") ||
    eventType.includes("split_view") ||
    eventType.includes("viewport")
  )
    return View;
```

改為：

```ts
  if (eventType.includes("multi_display") || eventType.includes("multiple_displays"))
    return View;
```

- [ ] **Step 4: 測試通過**

Run: `BT apps/contests/tests/integrity apps/contests/tests/exam`
Expected: 全部 PASS。

Run: `FT src/features/contest`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/apps/contests/integrity/registry.py backend/apps/contests/tests/integrity/test_registry.py frontend/src/features/contest/constants/eventTaxonomy.ts
git commit -F - <<'EOF'
refactor(integrity): retire the tablet-only viewport event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: 設定視窗的防作弊區塊縮成兩個開關

**Files:**
- Rewrite: `frontend/src/features/contest/components/admin/settings/CheatDetectionPanel.tsx`、`CheatDetectionPanel.test.tsx`
- Delete: `frontend/src/features/contest/components/admin/settings/anticheatPolicyModel.ts`、`anticheatPolicyModel.test.ts`、`anticheatPolicyUtils.ts`
- Modify: `frontend/src/features/contest/components/admin/settings/index.ts:6`
- Modify: `frontend/src/features/contest/components/admin/settings/ContestSettingsModal.stories.tsx:12,31,287-318`
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminContestSettingsScreen.tsx:17,261`
- Modify: `frontend/src/features/contest/components/admin/examEditor/hooks/useExamAutoSave.ts:44`
- Modify: `frontend/src/i18n/locales/{en,ja,ko,zh-TW}/contest.json`

**Interfaces:**
- Consumes: Task 6 的 `ContestDetail.webcamRequired`、`ContestUpdatePayload.webcamRequired`。
- Produces: 設定表單欄位 `webcamRequired`（自動儲存送 `webcam_required`）。

- [ ] **Step 1: 改寫面板測試（整檔）**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { createMockContest, stubT } from "@/shared/mocks/contest.mock";
import CheatDetectionPanel from "./CheatDetectionPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

const createProps = (
  form: Record<string, unknown>,
  overrides?: Partial<ContestSettingsPanelProps>,
): ContestSettingsPanelProps => ({
  t: stubT,
  tc: stubT,
  contest: createMockContest(),
  form,
  getState: () => undefined,
  onRetry: () => {},
  onChange: vi.fn(),
  onConfirmedChange: vi.fn(),
  ...overrides,
});

describe("CheatDetectionPanel", () => {
  it("offers only the strict mode and webcam switches", () => {
    render(<CheatDetectionPanel {...createProps({ cheatDetectionEnabled: true, webcamRequired: false })} />);

    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.getByRole("switch", { name: "要求 Webcam" })).toBeInTheDocument();
    expect(screen.queryByText("允許平板作答")).not.toBeInTheDocument();
    expect(screen.queryByText("啟用螢幕分享")).not.toBeInTheDocument();
  });

  it("saves webcamRequired when the webcam switch changes", () => {
    const onChange = vi.fn();
    render(
      <CheatDetectionPanel
        {...createProps({ cheatDetectionEnabled: true, webcamRequired: false }, { onChange })}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "要求 Webcam" }));

    expect(onChange).toHaveBeenCalledWith("webcamRequired", true);
  });

  it("locks the webcam switch while strict mode is off", () => {
    render(<CheatDetectionPanel {...createProps({ cheatDetectionEnabled: false, webcamRequired: true })} />);

    expect(screen.getByRole("switch", { name: "要求 Webcam" })).toBeDisabled();
  });

  it("confirms before turning strict mode on", () => {
    const onConfirmedChange = vi.fn();
    render(
      <CheatDetectionPanel
        {...createProps({ cheatDetectionEnabled: false, webcamRequired: false }, { onConfirmedChange })}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "enableExamMode" }));

    expect(onConfirmedChange).toHaveBeenCalledWith(
      "cheatDetectionEnabled",
      true,
      "啟用後考生須使用可分享螢幕的電腦作答，確定啟用？",
    );
  });
});
```

- [ ] **Step 2: 確認失敗**

Run: `FT src/features/contest/components/admin/settings/CheatDetectionPanel.test.tsx`
Expected: FAIL（找不到「要求 Webcam」、開關數量不是 2）。

- [ ] **Step 3: 改寫 `CheatDetectionPanel.tsx`（整檔）**

```tsx
import { Toggle } from "@carbon/react";
import { SectionSaveIndicator } from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import { ActionRow, Section } from "@/shared/layout/SettingsPanel";
import type { ContestSettingsPanelProps } from "./contestSettingsPanel.types";

export default function CheatDetectionPanel({
  t,
  form,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
}: ContestSettingsPanelProps) {
  const strictModeEnabled = (form.cheatDetectionEnabled as boolean) ?? false;

  return (
    <Section
      title={t("settings.examModeSettings", "防作弊監控設定")}
      action={
        <SectionSaveIndicator
          fields={["cheatDetectionEnabled", "webcamRequired"]}
          getState={getState}
          onRetry={onRetry}
        />
      }
    >
      <ActionRow
        label={t("settings.enableExamMode")}
        labelId="settings-exam-mode-label"
        description={t(
          "settings.enableExamModeDesc",
          "考生須使用可分享螢幕的電腦作答，並固定偵測全螢幕、多螢幕與滑鼠離開。"
        )}
      >
        <Toggle
          id="settings-exam-mode"
          aria-labelledby="settings-exam-mode-label"
          hideLabel
          size="sm"
          toggled={strictModeEnabled}
          onToggle={(checked) => {
            const msg = checked
              ? t(
                  "settings.confirmEnableExamMode",
                  "啟用後考生須使用可分享螢幕的電腦作答，確定啟用？"
                )
              : t("settings.confirmDisableExamMode", "關閉後將停用本場考試的防作弊監控，確定關閉？");
            onConfirmedChange("cheatDetectionEnabled", checked, msg);
          }}
        />
      </ActionRow>

      <ActionRow
        label={t("settings.anticheat.requireWebcam", "要求 Webcam")}
        labelId="settings-require-webcam-label"
        description={t(
          "settings.anticheat.requireWebcamDesc",
          "考生除了分享螢幕，也需開啟 Webcam。"
        )}
      >
        <Toggle
          id="settings-require-webcam"
          aria-labelledby="settings-require-webcam-label"
          hideLabel
          size="sm"
          toggled={(form.webcamRequired as boolean) ?? false}
          disabled={!strictModeEnabled}
          onToggle={(checked) => onChange("webcamRequired", checked)}
        />
      </ActionRow>
    </Section>
  );
}
```

`git rm frontend/src/features/contest/components/admin/settings/anticheatPolicyModel.ts frontend/src/features/contest/components/admin/settings/anticheatPolicyModel.test.ts frontend/src/features/contest/components/admin/settings/anticheatPolicyUtils.ts`

`settings/index.ts` 刪除第 6 行 `export { sanitizeAnticheatPolicy } from "./anticheatPolicyUtils";`。

- [ ] **Step 4: 表單初始化、自動儲存與 stories**

`AdminContestSettingsScreen.tsx`：刪除第 17 行 `sanitizeAnticheatPolicy` import；第 261 行改為 `webcamRequired: contest.webcamRequired ?? false,`。

`useExamAutoSave.ts` 第 44 行改為 `webcamRequired: "webcamRequired",`。

`ContestSettingsModal.stories.tsx`：刪除第 12 行 import；第 31 行改為 `webcamRequired: mockContest.webcamRequired,`；刪除 `/* ── Tablet without webcam ── */` 起的 `CheatDetectionTabletWithoutWebcam` story（第 287-318 行）。

- [ ] **Step 5: i18n**

Run: `grep -rnE "settings\.anticheat\.(accessPolicy|allowDesktop|allowTablet|enableScreenShare|enableWebcam|evidencePolicy|tablet|webcamOnly)" frontend/src --include='*.ts' --include='*.tsx'`
Expected: 沒有結果。

```bash
python3 - <<'EOF'
import json
from pathlib import Path

REMOVE = [
    "settings.anticheat." + key
    for key in [
        "accessPolicy", "allowDesktop", "allowDesktopDesc", "allowDesktopMultiDisplay",
        "allowDesktopMultiDisplayDesc", "allowTablet", "allowTabletDesc", "enableScreenShare",
        "enableScreenShareDesc", "enableWebcam", "enableWebcamDesc", "evidencePolicy",
        "tabletNoEvidenceHint", "tabletScreenShareUnsupported", "tabletWebcamOnlyHint",
        "webcamOnlyDesktopDesc", "webcamOnlyTabletDesc",
    ]
]
SET = {
    "settings.anticheat.requireWebcam": {
        "zh-TW": "要求 Webcam",
        "en": "Require webcam",
        "ja": "Webカメラを必須にする",
        "ko": "웹캠 필수",
    },
    "settings.anticheat.requireWebcamDesc": {
        "zh-TW": "考生除了分享螢幕，也需開啟 Webcam。",
        "en": "Students must turn on their webcam in addition to sharing their screen.",
        "ja": "受験者は画面共有に加えて Webカメラもオンにする必要があります。",
        "ko": "응시자는 화면 공유와 함께 웹캠도 켜야 합니다.",
    },
    "settings.enableExamModeDesc": {
        "zh-TW": "考生須使用可分享螢幕的電腦作答，並固定偵測全螢幕、多螢幕與滑鼠離開。",
        "en": "Students must use a computer that can share its screen; fullscreen, multiple displays and the pointer leaving the page are always monitored.",
        "ja": "受験者は画面共有ができるパソコンで受験し、全画面・複数ディスプレイ・ポインターの離脱を常に検出します。",
        "ko": "응시자는 화면 공유가 가능한 컴퓨터로 응시해야 하며, 전체 화면·다중 모니터·포인터 이탈을 항상 감지합니다.",
    },
    "settings.confirmEnableExamMode": {
        "zh-TW": "啟用後考生須使用可分享螢幕的電腦作答，確定啟用？",
        "en": "Students will need a computer that can share its screen. Turn this on?",
        "ja": "受験者は画面共有ができるパソコンが必要になります。有効にしますか？",
        "ko": "응시자는 화면 공유가 가능한 컴퓨터가 필요합니다. 켜시겠습니까?",
    },
}

for lang in ["en", "ja", "ko", "zh-TW"]:
    path = Path(f"frontend/src/i18n/locales/{lang}/contest.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    for dotted in REMOVE:
        *parents, leaf = dotted.split(".")
        node = data
        for key in parents:
            node = node[key]
        del node[leaf]
    for dotted, values in SET.items():
        *parents, leaf = dotted.split(".")
        node = data
        for key in parents:
            node = node.setdefault(key, {})
        node[leaf] = values[lang]
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
EOF
python3 scripts/i18n/i18n_check.py
```

Expected: `All i18n checks completed.`

- [ ] **Step 6: 測試通過**

Run: `FT src/features/contest/components/admin src/features/contest/screens/admin`
Expected: 全部 PASS。

Run: `TC`
Expected: 無錯誤。

Run: `bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all`
Expected: `0 blockers`。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/contest/components/admin/settings frontend/src/features/contest/screens/admin/panels/AdminContestSettingsScreen.tsx frontend/src/features/contest/components/admin/examEditor/hooks/useExamAutoSave.ts frontend/src/i18n/locales
git commit -F - <<'EOF'
feat(frontend): settle strict exam settings on two switches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: 前端資料層移除 `anticheatDevicePolicy` 與 `admins`

**Files:**
- Modify: `frontend/src/core/entities/contest.entity.ts`（`ContestDetail`、`ContestIntegrityRun`、`ContestAnticheatConfig`、`ContestUpdateRequest` 與第 337-409 行的裝置型別）
- Modify: `frontend/src/core/ports/contest.repository.ts`
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts:105-134,144,181`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts:30,95-97,149-155,458-531`
- Modify: `frontend/src/infrastructure/mappers/contestAnticheat.mapper.ts`
- Modify: `frontend/src/shared/mocks/contest.mock.ts:20-49`
- Modify: 三個含 `devicePolicy: {} as never` 的測試檔（見 Task 6 Step 5）
- Test: `frontend/src/infrastructure/mappers/contest.mapper.test.ts`

**Interfaces:**
- Consumes: Task 7、9 已不再讀取 `anticheatDevicePolicy` / `devicePolicy`。
- Produces: 前端不再有 `ContestAnticheatDevicePolicy`、`DEFAULT_DEVICE_POLICY`、`AnticheatDevicePolicyDto`、`mapAnticheatDevicePolicyDto`、`ContestDetail.admins`；`ContestAnticheatConfig = { webcamRequired: boolean; integrityRun?: ContestIntegrityRun }`。

- [ ] **Step 1: 寫 mapper 測試**

在 `contest.mapper.test.ts` 的 `describe("anti-cheat config mapping")` 內加：

```ts
    it("no longer maps device policies or contest co-admins", () => {
      const config = mapContestAnticheatConfigDto({
        webcam_required: false,
        integrity_run: {
          id: "run-1",
          session_state: "active",
          health: "healthy",
          participant_id: "7",
          policy_snapshot: { webcam_required: false },
          registry_snapshot: { version: "registry-1", definitions: {} },
        },
      });
      const detail = mapContestDetailDto({
        id: "contest-1",
        name: "Exam",
        admins: [{ id: 1, username: "legacy" }],
        permissions: {},
        problems: [],
      } as any);

      expect(config).not.toHaveProperty("devicePolicy");
      expect(config.integrityRun).not.toHaveProperty("devicePolicy");
      expect(detail).not.toHaveProperty("admins");
      expect(detail).not.toHaveProperty("anticheatDevicePolicy");
    });
```

- [ ] **Step 2: 確認失敗**

Run: `FT src/infrastructure/mappers/contest.mapper.test.ts`
Expected: FAIL（`devicePolicy`、`admins`、`anticheatDevicePolicy` 仍存在）。

- [ ] **Step 3: 移除型別與 DTO**

`contest.entity.ts`：
- 刪除 `ContestDetail` 的 `anticheatDevicePolicy?: ContestAnticheatDevicePolicy;`，以及 `// Multi-admin support` 與 `admins?: Array<{ id: string; username: string }>;`。
- 刪除 `AnticheatDeviceKind`、`AnticheatSourceKind`、`AnticheatDetectorKind`、`ContestAnticheatSourcePolicy`、`ContestAnticheatDetectorPolicy`、`ContestAnticheatDevicePolicyItem`、`ContestAnticheatDevicePolicy`、`DEFAULT_DEVICE_POLICY`（Task 6 前的第 337-409 行）。
- 刪除 `ContestIntegrityRun` 與 `ContestAnticheatConfig` 的 `devicePolicy: ContestAnticheatDevicePolicy;`，以及 `ContestUpdateRequest` 的 `anticheatDevicePolicy?: ContestAnticheatDevicePolicy;`。

`core/ports/contest.repository.ts`：刪除 `ContestAnticheatDevicePolicy,` import 與 `anticheatDevicePolicy?: ContestAnticheatDevicePolicy;`。

`contest.dto.ts`：刪除 `AnticheatDevicePolicyDto`（第 105-134 行）、`anticheat_device_policy?: AnticheatDevicePolicyDto;`、`admins?: Array<{ id?: number | string; username?: string }>;`。

- [ ] **Step 4: 移除 mapper 分支與 fixture 欄位**

`contest.mapper.ts`：刪除第 30 行 `import { mapAnticheatDevicePolicyDto } ...`；刪除 `anticheatDevicePolicy: mapAnticheatDevicePolicyDto(dto.anticheat_device_policy),`；刪除 `// Multi-admin support` 與 `admins: ...`；`mapContestUpdateRequestToDto` 刪除 `const anticheatDevicePolicy = ...` 整段（第 458-526 行）與 `anticheat_device_policy: anticheatDevicePolicy,`。

`contestAnticheat.mapper.ts`：import 改為

```ts
import type {
  ContestAnticheatConfig,
  ContestIntegrityRun,
  IntegrityRegistrySnapshot,
} from "@/core/entities/contest.entity";
```

刪除 `AnticheatDevicePolicyDto` import 與整個 `mapAnticheatDevicePolicyDto`；刪除 `mapIntegrityRun` 與 `mapContestAnticheatConfigDto` 回傳物件中的 `devicePolicy: ...`。

`shared/mocks/contest.mock.ts`：刪除 `anticheatDevicePolicy: { ... },`（第 20-49 行）。

```bash
sed -i '' 's/devicePolicy: {} as never, //' \
  frontend/src/features/contest/anticheat/integrity/residentIntegritySession.test.ts \
  frontend/src/features/contest/contexts/IntegrityUploadProvider.test.tsx \
  frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.test.tsx
```

- [ ] **Step 5: 測試與檢查**

Run: `grep -rnE "anticheatDevicePolicy|devicePolicy|DEFAULT_DEVICE_POLICY|AnticheatDevicePolicyDto|anticheat_device_policy|device_policy" frontend/src --include='*.ts' --include='*.tsx'`
Expected: 只剩 `contest.mapper.test.ts` 中 `not.toHaveProperty(...)` 的斷言字串。

Run: `TC`
Expected: 無錯誤。

Run: `FT src`
Expected: 全部 PASS。

Run: `node .codex/skills/qjudge-quality-gates-owner/scripts/lint-repository-exports.js && node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src`
Expected: 兩者 passed。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/core/entities/contest.entity.ts frontend/src/core/ports/contest.repository.ts frontend/src/infrastructure/api/dto/contest.dto.ts frontend/src/infrastructure/mappers/contest.mapper.ts frontend/src/infrastructure/mappers/contestAnticheat.mapper.ts frontend/src/infrastructure/mappers/contest.mapper.test.ts frontend/src/shared/mocks/contest.mock.ts frontend/src/features/contest/anticheat/integrity/residentIntegritySession.test.ts frontend/src/features/contest/contexts/IntegrityUploadProvider.test.tsx frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.test.tsx
git commit -F - <<'EOF'
refactor(frontend): drop the device policy and co-admin fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: 建立競賽縮成兩步

**Files:**
- Rewrite: `frontend/src/features/classroom/components/CreateContestModal.tsx`
- Create: `frontend/src/features/classroom/components/CreateContestModal.test.tsx`
- Modify: `frontend/src/i18n/locales/{en,ja,ko,zh-TW}/contest.json`

**Interfaces:**
- Consumes: `createClassroomContest(classroomId, data)`（`infrastructure/api/repositories/classroom.repository.ts:142`）。
- Produces: 建立請求只帶 `name`、`description`、`contest_type`、`cheat_detection_enabled`、`results_published`。

- [ ] **Step 1: 寫測試**

`CreateContestModal.test.tsx`：

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateContestModal from "./CreateContestModal";

const mocks = vi.hoisted(() => ({ createClassroomContest: vi.fn() }));

vi.mock("@/infrastructure/api/repositories/classroom.repository", () => ({
  createClassroomContest: mocks.createClassroomContest,
}));

const renderModal = () => {
  const onCreated = vi.fn();
  render(
    <CreateContestModal open onClose={vi.fn()} onCreated={onCreated} classroomId="room-1" />,
  );
  return { onCreated };
};

const goToBasicStep = (type: "coding" | "exam", name: string) => {
  fireEvent.click(screen.getByTestId(`create-contest-type-${type}`));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.change(screen.getByTestId("create-contest-name"), { target: { value: name } });
};

describe("CreateContestModal", () => {
  beforeEach(() => {
    mocks.createClassroomContest.mockReset();
    mocks.createClassroomContest.mockResolvedValue({ contestId: "contest-9" });
  });

  it("creates a contest in two steps with strict mode off by default", async () => {
    const { onCreated } = renderModal();

    goToBasicStep("exam", "Week 1 練習");
    expect(screen.getByRole("switch")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "button.create" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("contest-9"));
    expect(mocks.createClassroomContest).toHaveBeenCalledWith("room-1", {
      name: "Week 1 練習",
      description: "",
      contest_type: "paper_exam",
      cheat_detection_enabled: false,
      results_published: false,
    });
  });

  it("sends strict mode when the teacher turns it on", async () => {
    renderModal();

    goToBasicStep("coding", "期中考");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "button.create" }));

    await waitFor(() =>
      expect(mocks.createClassroomContest).toHaveBeenCalledWith(
        "room-1",
        expect.objectContaining({ contest_type: "coding", cheat_detection_enabled: true }),
      ),
    );
  });

  it("leaves rejoin and QR attendance to the settings dialog", () => {
    renderModal();

    goToBasicStep("coding", "練習");

    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByText("允許重新加入")).not.toBeInTheDocument();
    expect(screen.queryByText("QR 簽到簽退")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 確認失敗**

Run: `FT src/features/classroom/components/CreateContestModal.test.tsx`
Expected: FAIL（第二步沒有開關、送出的是「下一步」而非建立）。

- [ ] **Step 3: 改寫 `CreateContestModal.tsx`（整檔）**

```tsx
import React, { useState } from "react";
import {
  Modal,
  TextInput,
  InlineNotification,
  Toggle,
} from "@carbon/react";
import { Code, Education } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { createClassroomContest } from "@/infrastructure/api/repositories/classroom.repository";
import styles from "./CreateContestModal.module.scss";

interface CreateContestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contestId?: string) => void;
  classroomId: string;
}

type ContestCreationType = "coding_test" | "exam";
type CreateContestStep = "select_type" | "basic";

const CreateContestModal: React.FC<CreateContestModalProps> = ({
  open,
  onClose,
  onCreated,
  classroomId,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const [name, setName] = useState("");
  const [examModeEnabled, setExamModeEnabled] = useState(false);
  const [creationType, setCreationType] = useState<ContestCreationType | null>(null);
  const [step, setStep] = useState<CreateContestStep>("select_type");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setExamModeEnabled(false);
    setCreationType(null);
    setStep("select_type");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!creationType) return;
    if (!name.trim()) {
      setError(t("createModal.validation.nameRequired", "請輸入競賽名稱"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Rejoin and QR attendance stay in the settings dialog.
      const createdContest = await createClassroomContest(classroomId, {
        name,
        description: "",
        contest_type: creationType === "exam" ? "paper_exam" : "coding",
        cheat_detection_enabled: examModeEnabled,
        results_published: false,
      });
      onCreated(createdContest.contestId);
      handleClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t("error.createFailed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      data-testid="create-contest-modal"
      onRequestClose={handleClose}
      modalLabel={step === "select_type" ? "1 / 2" : "2 / 2"}
      modalHeading={
        step === "select_type"
          ? t("createModal.chooseTypeTitle", "建立競賽")
          : t("createModal.configureBasic", "設定基本資訊")
      }
      primaryButtonText={
        step === "basic" ? tc("button.create") : tc("button.next", "下一步")
      }
      secondaryButtonText={
        step === "select_type" ? tc("button.cancel") : tc("button.back", "返回")
      }
      onRequestSubmit={() => {
        if (step === "select_type") {
          if (creationType) {
            setStep("basic");
            setError("");
          }
          return;
        }
        void handleSubmit();
      }}
      onSecondarySubmit={() => {
        if (step === "basic") {
          setStep("select_type");
          setError("");
          return;
        }
        handleClose();
      }}
      primaryButtonDisabled={step === "select_type" ? !creationType : loading}
      size="sm"
      hasScrollingContent
      selectorPrimaryFocus={step === "basic" ? "#contest-name" : undefined}
    >
      <>
        {error && (
          <InlineNotification
            kind="error"
            title={tc("message.error")}
            subtitle={error}
            style={{ marginBottom: "1rem" }}
            lowContrast
            hideCloseButton
          />
        )}

        {step === "select_type" && (
          <div className={styles.stepStack}>
            <p className={styles.helperText}>
              {t(
                "createModal.stepIntro",
                "請先選擇競賽類型。",
              )}
            </p>

            <div className={styles.typeSelector}>
              <button
                type="button"
                data-testid="create-contest-type-coding"
                onClick={() => setCreationType("coding_test")}
                className={`${styles.typeOption} ${
                  creationType === "coding_test" ? styles.typeOptionActive : ""
                }`}
                aria-pressed={creationType === "coding_test"}
                aria-label={t("createModal.typeCoding")}
              >
                <Code size={20} />
                <span className={styles.typeTitle}>{t("createModal.typeCoding")}</span>
                <span className={styles.typeSubtitle}>{t("createModal.typeCodingDesc")}</span>
              </button>

              <button
                type="button"
                data-testid="create-contest-type-exam"
                onClick={() => setCreationType("exam")}
                className={`${styles.typeOption} ${
                  creationType === "exam" ? styles.typeOptionActive : ""
                }`}
                aria-pressed={creationType === "exam"}
                aria-label={t("createModal.typeExam")}
              >
                <Education size={20} />
                <span className={styles.typeTitle}>{t("createModal.typeExam")}</span>
                <span className={styles.typeSubtitle}>{t("createModal.typeExamDesc")}</span>
              </button>
            </div>
          </div>
        )}

        {step === "basic" && creationType && (
          <div className={styles.stepStack}>
            <div className={styles.sectionLabel}>
              {t("createModal.configureBasic", "設定基本資訊")}
            </div>
            <p className={styles.helperText}>
              {t(
                "createModal.basicIntro",
                "競賽會先建立為草稿，發布時再設定正式時段。",
              )}
            </p>

            <TextInput
              id="contest-name"
              data-testid="create-contest-name"
              labelText={t("createModal.contestName", "競賽名稱")}
              placeholder={t("createModal.contestNamePlaceholder", "例如：114-2 期中評量")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={styles.nameInput}
            />

            <div className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <div className={styles.questionCopy}>
                  <div className={styles.questionTitle} id="contest-exam-mode-label">
                    {t("createModal.examModeTitle", "啟用考試模式")}
                  </div>
                  <div className={styles.questionHint}>
                    {t("createModal.examModeHint", "啟用後將套用考前檢查、監考來源與異常事件記錄。")}
                  </div>
                </div>
                <Toggle
                  id="contest-exam-mode"
                  className={styles.questionToggle}
                  aria-labelledby="contest-exam-mode-label"
                  labelText=""
                  hideLabel
                  toggled={examModeEnabled}
                  onToggle={(checked: boolean) => setExamModeEnabled(checked)}
                  labelA=""
                  labelB=""
                />
              </div>
            </div>
          </div>
        )}
      </>
    </Modal>
  );
};

export default CreateContestModal;
```

- [ ] **Step 4: i18n**

Run: `grep -rnE "createModal\.(advancedIntro|advancedSettings|rejoinTitle|rejoinHint|attendanceTitle|attendanceHint)" frontend/src --include='*.ts' --include='*.tsx'`
Expected: 沒有結果。

```bash
python3 - <<'EOF'
import json
from pathlib import Path

REMOVE = [
    "createModal." + key
    for key in [
        "advancedIntro", "advancedSettings", "rejoinTitle",
        "rejoinHint", "attendanceTitle", "attendanceHint",
    ]
]

for lang in ["en", "ja", "ko", "zh-TW"]:
    path = Path(f"frontend/src/i18n/locales/{lang}/contest.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    for dotted in REMOVE:
        *parents, leaf = dotted.split(".")
        node = data
        for key in parents:
            node = node[key]
        del node[leaf]
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
EOF
python3 scripts/i18n/i18n_check.py
```

Expected: `All i18n checks completed.`

- [ ] **Step 5: 測試通過**

Run: `FT src/features/classroom`
Expected: 全部 PASS。

Run: `TC && bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all`
Expected: 無錯誤；`0 blockers`。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/classroom/components/CreateContestModal.tsx frontend/src/features/classroom/components/CreateContestModal.test.tsx frontend/src/i18n/locales
git commit -F - <<'EOF'
feat(classroom): create contests in two steps with strict mode off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 12: 收尾、完整驗證與 dev 手動確認

**Files:**
- Modify: `frontend/tests/e2e/resident-integrity.e2e.spec.ts:107-117`
- Modify: `backend/schema.yml`（重新產生）

- [ ] **Step 1: E2E spec 改用 `webcam_required`**

刪除第 107 行 `const detectors = { ... };`，並把 PATCH 的 `data` 改為：

```ts
      data: {
        status: "published", start_time: new Date(startsAt).toISOString(), end_time: new Date(endsAt).toISOString(),
        cheat_detection_enabled: true,
        webcam_required: false,
      },
```

此 spec 不在 CI 的 E2E 群組內，這裡只讓它與 API 一致；偵測項目固定後它是否仍能在 fresh-install stack 通過，僅在使用者要求時驗證。

- [ ] **Step 2: 重新產生 OpenAPI schema**

```bash
docker compose -p online_judge exec -T -e DATABASE_URL=postgresql://test:test@qjudge-testdb:5432/test_oj backend python manage.py spectacular --file schema.yml
git diff --stat backend/schema.yml
grep -c "anticheat_device_policy\|add_admin\|remove_admin" backend/schema.yml
```

Expected: `grep -c` 為 `0`；`webcam_required` 出現在 contest schema。若 `git diff` 含與本次無關的大量變動，停下來把 diff 摘要回報給使用者，由使用者決定是否一併提交。

- [ ] **Step 3: 完整自動測試與品質檢查**

```bash
BT --ignore=apps/judge/ --ignore=apps/submissions/tests/test_performance.py
FT src
TC
MT
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-repository-exports.js
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh --all
python3 scripts/i18n/i18n_check.py
docker compose -p online_judge exec -T frontend npm run lint
```

Expected: 後端、前端、MCP 全部通過（數量相對基準的增減只來自本計畫新增或刪除的測試）；各 gate passed；lint 無 error。

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/e2e/resident-integrity.e2e.spec.ts backend/schema.yml
git commit -F - <<'EOF'
chore: sync the E2E fixture and API schema with webcam_required

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: 詢問使用者是否套用 dev migration（必須等回覆）**

向使用者說明並取得明確同意後才繼續：dev 資料庫將套用 `contests.0006`、`0007`，所有 contest 的 `webcam_required` 從 `False` 開始，`anticheat_device_policy` 欄位與 contest co-admin 關聯表會被刪除；之後切回尚未包含這兩個 migration 的分支時，dev 網站讀 contest 會出錯，直到本分支合併或以 `migrate contests 0005` 退回（退回不會還原被刪的資料）。

同意後執行：

```bash
docker compose -p online_judge exec -T backend python manage.py migrate contests
```

Expected: `Applying contests.0006_contest_webcam_required... OK`、`Applying contests.0007_remove_contest_admins... OK`。

- [ ] **Step 6: dev 手動確認（Claude Browser，`http://localhost:5173`）**

以 `backend/apps/*/management/commands/seed_e2e_data.py` 內的 teacher、student 測試帳號登入（依 system prompt 的本機測試規則輸入）。逐項確認並截圖：

1. teacher 在 classroom 按「建立競賽」：兩步流程，第二步只有名稱與一個「啟用考試模式」開關且預設關閉；建立後設定視窗的「防作弊監控設定」只剩兩個開關，嚴格模式關閉時「要求 Webcam」為停用。
2. 練習 contest：嚴格模式關閉，開始與結束時間設到學期末並發布、加入一題；student 進入、寫題並提交成功，作答頁沒有監考提示。
3. 嚴格考試（不要求 webcam）：在 student 分頁以 `javascript_tool` 安裝與 `resident-integrity.e2e.spec.ts:18-50` 相同的合成 `getDisplayMedia`，完成考前檢查並進入作答；teacher 的監考面板看得到該學生。
4. 不支援螢幕分享：在考前檢查頁執行 `Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", { configurable: true, value: undefined })` 後重新進入考前檢查（SPA 內導覽），第二步應顯示「嚴格考試模式需使用電腦瀏覽器（必須能分享螢幕）。請改用電腦重新進入。」且不能開始作答。

任何一項不符合預期：停下來回報截圖與 console 錯誤，不要自行放寬檢查。

- [ ] **Step 7: 清理**

```bash
docker stop qjudge-testdb
git status --short
```

Expected: `qjudge-testdb` 停止（`--rm` 會自動刪除）；`git status` 只剩使用者原有的未追蹤檔案。
