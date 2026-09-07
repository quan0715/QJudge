# Resident Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立常駐、多 Run 隔離的 Integrity 服務，讓監考故障不阻斷學生考試，並沿用修改結束時間的既有操作。

**Architecture:** 保留現有 WorkerRuntime 判定核心與 Run 級 journal，在其上加入受驗證的多 Run 管理及可靠收件／背景處理。後端負責 session、時程、截止及補傳授權；前端將採集與傳輸拆開，維運生命週期不交給教師。

**Tech Stack:** Django/PostgreSQL、Python 3.11+、FastAPI、現有 journal/command outbox、React/TypeScript、IndexedDB/OPFS、既有物件儲存、Docker Compose。

**Spec:** `docs/superpowers/specs/2026-09-07-resident-integrity-design.md`。實作者須先讀完整規格；本計畫所有新名稱都是預定建立的介面，不是目前已有功能。

## Global Constraints

- 以不影響學生考試為主。Integrity 故障本身不得阻止開考、作答、答案儲存或交卷，不因平台漏收資料自動處分學生。
- 採常駐監考服務，每場考試仍有獨立 Run、規則、紀錄與處理進度。
- 教師只設定考試及監考規則，不管理 Worker、容器、啟停、重啟或封存。
- 延長考試沿用現有「修改結束時間並儲存」，不新增延長按鈕或額外確認流程。
- 修改時間成功後，學生倒數、後端截止、監考時程、補傳期限與封存時程一起採用新版本。已交卷者不自動恢復作答。
- 首版一個常駐 Integrity 實例，使用持久化 volume；每個 Run 只能有一個寫入者。此版本不宣稱多副本容錯或零停機。
- 不新增 Kafka、Kubernetes 或另一套通用任務框架。沿用 Python/FastAPI、Django/PostgreSQL、React/TypeScript、既有物件儲存與 Compose。
- 外部 checkpoint 路徑、Run ID、事件 schema 盡量相容；擴充欄位使用明確協定版本，不能悄悄改變 legacy ACK 語意。
- 不碰現有準備頁與編輯器的無關修改；執行前依 Git/worktree skill 建立隔離分支。此計畫建立本身不提交、不部署。
- 執行測試使用 `.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test` 與測試容器；不得把主機 pytest/npm 當作預設。

---

## 工作分解與依賴

這是一個跨端契約改造，維持一份主計畫以避免 ACK、時程及補傳語意分歧。各 Task 為獨立 review 單位：`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10`。部署開關在 Task 10 前保持 legacy；中間任務可合入而不改正式考試路徑。

| Task | 可審查成果 | 規格案例 |
| --- | --- | --- |
| 1 | 可重現的 Integrity 測試容器 | 所有案例的基礎 |
| 2 | Run session 模型、版本與純 DB 準備 | A1、A4、A10 |
| 3 | durable receipt 與背景判定分離 | A3、A7、A8 |
| 4 | 多 Run 常駐服務、身分驗證、恢復 | A2、A3、A8 |
| 5 | 修改時間與到期競爭的後端權威 | A4、A5 |
| 6 | 交卷後限定補傳與固定服務 gateway | A1、A6 |
| 7 | 前端離線記錄、補傳與倒數同步 | A1、A4、A6、A9 |
| 8 | 背景收尾、取證保留與故障期間處理 | A5、A7、A8 |
| 9 | 教師非技術狀態與畫面驗收 | A9 |
| 10 | Compose、端到端故障驗收、切換手冊 | A1–A10 |

## Task 1: 建立可執行的測試基線

**Files:** Create `integrity-service/Dockerfile.test`; Modify `docker-compose.test.yml`; Test existing `integrity-service/tests/test_worker_api.py`, `test_journal.py`, `test_timeline.py`。

**Interfaces:** 產生 Compose service `integrity-unit-test`，工作目錄 `/app`，包含 worker/controller/test extras 與 tests，不需 production credentials 或 Docker socket。後续任務沿用此名稱。

- [ ] Step 1：記錄執行基準與工作區差異；讀架構、環境與 Git skills。確認目前 migration leaf，避免覆蓋其他任務新增 migration。
- [ ] Step 2：新增測試 Dockerfile，依既有 dependency ranges 安裝，不把 pytest 加入 production image。

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
COPY integrity_service ./integrity_service
RUN pip install --no-cache-dir ".[worker,controller,test]"
COPY tests ./tests
CMD ["python", "-m", "pytest", "-q"]
```

- [ ] Step 3：在 test Compose 加入以下 service；原始碼唯讀掛載讓後續測試反映當下變更。

```yaml
  integrity-unit-test:
    build:
      context: ./integrity-service
      dockerfile: Dockerfile.test
    working_dir: /app
    volumes:
      - ./integrity-service/integrity_service:/app/integrity_service:ro
      - ./integrity-service/tests:/app/tests:ro
    environment:
      PYTHONDONTWRITEBYTECODE: "1"
    command: ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider"]
```

- [ ] Step 4：建立 image 並跑既有基線；失敗先分類，不將既有不相關失敗算成本次新增。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test build integrity-unit-test
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps integrity-unit-test python -m pytest -q -p no:cacheprovider tests/test_worker_api.py tests/test_journal.py tests/test_timeline.py
```

- [ ] Step 5：僅提交本 Task 檔案，建議訊息 `test(integrity): add isolated worker test runner`。

## Task 2: Run session 與時程契約

**Files:** Modify `backend/apps/contests/models/contest.py`, `models/integrity.py`, `integrity_serializers.py`, `views/contest.py`, `views/exam_lifecycle.py`; Create `services/integrity_sessions.py`, `tests/integrity/test_resident_sessions.py`；新增 migration 使用 `makemigrations contests --name resident_integrity_sessions` 產生當前 leaf 後的編號（盤點時 leaf 是 0096）。

**Interfaces:**

```python
# backend/apps/contests/services/integrity_sessions.py
def ensure_resident_session(contest_id, *, actor_id=None) -> ExamIntegrityRun:
    # 只在資料庫內準備；不可呼叫 resident 或 Controller。
    with transaction.atomic():
        contest = Contest.objects.select_for_update().get(pk=contest_id)
        existing = ExamIntegrityRun.objects.filter(
            contest=contest, session_state__in=("prepared", "active", "draining")
        ).first()
        if existing is not None:
            return existing
        return ExamIntegrityRun.objects.create(
            contest=contest, created_by_id=actor_id,
            execution_backend="resident", session_state="prepared",
            schedule_revision=contest.schedule_revision,
            scheduled_start_at=contest.start_time,
            scheduled_end_at=contest.end_time,
            accept_until=contest.end_time + timedelta(seconds=300),
            policy_snapshot=build_integrity_policy_snapshot(contest),
            registry_snapshot=build_registry_snapshot(),
            registry_version=REGISTRY_VERSION,
        )
```

上述為核心 transaction 形狀；實作從 settings 取補傳秒數，沿用現有 builder 的實際 import。資格檢查在同一鎖內：需監考、有有效時間且是可開考考試；existing legacy 必須原樣保留，不能自動建立第二個 live Run。

- [ ] Step 1：在新測試檔建立 `owner`、`contest` fixtures，沿用 `test_run_lifecycle.py` 的 User/Contest 建立欄位；寫冪等與不連網測試。

```python
from unittest.mock import patch
from apps.contests.services.integrity_sessions import ensure_resident_session

def test_preparation_does_not_wait_for_worker(contest):
    with patch("httpx.Client.request", side_effect=AssertionError("network forbidden")):
        first = ensure_resident_session(contest.id, actor_id=contest.owner_id)
        second = ensure_resident_session(contest.id, actor_id=contest.owner_id)
    assert first.id == second.id
    assert first.execution_backend == "resident"
    assert first.policy_snapshot
    assert first.registry_snapshot
```

執行本 Task 前先用 wrapper 啟動隔離測試依賴；測試 DB 管理員只覆寫 pytest 程序，不更動應用權限。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d backend-test frontend-test
```

- [ ] Step 2：跑新測試確認失敗，再新增 fields：Contest `schedule_revision` default 1；Run `execution_backend` default legacy、`session_state`、`schedule_revision`、`accept_until`。資料 migration 映射 legacy 狀態，替換依 destroyed 的唯一約束，保留每場有效 Run 唯一性。
- [ ] Step 3：接發布／開考的純 DB 準備，失敗不能吞掉成監考正常；主考試交易可成功時將缺失交 reconciler 補足。不要從 GET endpoint 建立 Run。建立後 descriptor 固定政策，時間版本可更新。
- [ ] Step 4：測 legacy 保留、兩個並發準備只一 Run、立即開考、resident 完全斷線仍能開始考試。migration forward/backward 在空測試資料庫及 legacy fixture 都跑過。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T -e POSTGRES_DB=postgres -e POSTGRES_USER=qjudge_test_admin -e POSTGRES_PASSWORD=qjudge_test_admin_password backend-test pytest -q apps/contests/tests/integrity/test_resident_sessions.py apps/contests/tests/integrity/test_run_lifecycle.py
```

- [ ] Step 5：提交 `feat(integrity): separate run session from compute lifecycle`。

## Task 3: 可靠收件與判定分離

**Files:** Modify `integrity-service/integrity_service/worker/runtime.py`, `journal/writer.py`, `journal/command_outbox.py`, `core/sequencer.py`; Create `worker/receipts.py`, `tests/test_resident_receipts.py`。

**Interfaces:** `WorkerRuntime.accept_batch(batch: EventBatch, received_at_ms: int) -> BatchAck` 只可靠收件；`WorkerRuntime.process_pending(limit: int) -> int` 依序判定，回已處理批次數。保留 legacy `ingest()` 作為舊流程 adapter，直到 legacy 退役。

- [ ] Step 1：使用既有 `test_worker_api` 的 `bootstrap`、`batch_payload`、`FakeBackend` fixtures 寫真正斷線與重播測試，不 mock journal。

```python
from integrity_service.worker.runtime import WorkerRuntime
from integrity_service.core.schemas import EventBatch
from test_worker_api import bootstrap, batch_payload, FakeBackend, VALID_PUBLIC_KEY_B64, NOW_MS

def test_durable_receipt_survives_backend_outage_and_restart(tmp_path):
    backend = FakeBackend()
    backend.failures_remaining = 100
    value = EventBatch.model_validate(batch_payload())
    first = WorkerRuntime(bootstrap=bootstrap(VALID_PUBLIC_KEY_B64), data_root=tmp_path, backend=backend)
    try:
        assert first.accept_batch(value, NOW_MS).acked_through_seq == 1
        assert backend.command_batches == []
    finally:
        first.close()
    second = WorkerRuntime(bootstrap=bootstrap(VALID_PUBLIC_KEY_B64), data_root=tmp_path, backend=FakeBackend())
    try:
        assert second.accept_batch(value, NOW_MS + 1).acked_through_seq == 1
        assert second.process_pending(limit=10) == 1
        assert second.process_pending(limit=10) == 0
    finally:
        second.close()
```

- [ ] Step 2：跑 `tests/test_resident_receipts.py` 確認缺新介面失敗。
- [ ] Step 3：收件在每 Run 鎖內依序做 identity/sequence 驗證、journal append/fsync、receipt context 保存、連續 ACK 游標；ACK 以前需要重啟可恢復。另持久化 processed cursor，不能用 in-memory queue 當唯一工作來源。

```python
# resident 接收的契約順序；ReceiptStore 定義於 worker/receipts.py。
receipt = receipts.append_durable(batch, received_at_ms)
return BatchAck(
    acked_through_seq=receipt.contiguous_seq,
    pending_commands=[],
    release_evidence_before_ms=0,
)
```

`ReceiptStore.append_durable(batch, received_at_ms)` 回 `DurableReceipt(contiguous_seq: int)`；保存與既有 journal 的連結、首次接收時間及順序。重送內容不一致回 conflict；缺號不能跨越 ACK。背景處理重用 `DecisionTimeline` 與 `CommandOutbox`，同一 receipt 套用兩次仍冪等。
- [ ] Step 4：測 fsync 失敗不得 ACK、ACK 前後 crash、同 batch 不同內容、亂序缺號、命令 backend 離線。檢查 event replay 依原接收時間而非恢復時間。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps integrity-unit-test python -m pytest -q -p no:cacheprovider tests/test_resident_receipts.py tests/test_journal.py tests/test_sequencer.py tests/test_timeline.py
```

- [ ] Step 5：提交 `refactor(integrity): acknowledge durable receipts before processing`。

## Task 4: 多 Run 常駐管理與認證

**Files:** Create `integrity-service/integrity_service/resident/__init__.py`, `resident/app.py`, `resident/registry.py`, `resident/settings.py`, `resident/contracts.py`, `tests/test_resident_registry.py`, `tests/test_resident_api.py`; Modify `worker/backend_client.py`, `worker/auth.py`, `backend/apps/contests/views/integrity_internal.py`, `integrity_internal_urls.py`, `services/integrity_commands.py`。

**Interfaces:**

```python
# resident/contracts.py：欄位均為 wire 明確值，bootstrap 保留既有 WorkerBootstrap。
@dataclass(frozen=True)
class RunDescriptor:
    bootstrap: WorkerBootstrap
    schedule_revision: int
    scheduled_start_ms: int
    scheduled_end_ms: int
    accept_until_ms: int
    session_state: str

# resident/registry.py
# RunRegistry(root: Path, backend_factory: Callable[[UUID], object])
# ensure(descriptor: RunDescriptor) -> WorkerRuntime
# get(run_id: UUID) -> WorkerRuntime
# close() -> None：關閉程序資源，不代表考試封存。
```

- [ ] Step 1：寫兩 Run 及關閉資源測試；程式碼 fixture 沿用既有 bootstrap，避免重造規則。

```python
from dataclasses import replace
from uuid import uuid4
from integrity_service.resident.contracts import RunDescriptor
from integrity_service.resident.registry import RunRegistry
from test_worker_api import bootstrap, FakeBackend, VALID_PUBLIC_KEY_B64, NOW_MS

def test_runs_have_independent_runtime(tmp_path):
    registry = RunRegistry(root=tmp_path, backend_factory=lambda run_id: FakeBackend())
    base = bootstrap(VALID_PUBLIC_KEY_B64)
    first = RunDescriptor(base, 1, NOW_MS, NOW_MS + 10000, NOW_MS + 310000, "active")
    second = replace(first, bootstrap=replace(base, run_id=uuid4()))
    try:
        a = registry.ensure(first)
        b = registry.ensure(second)
        assert a is not b
        assert a.run_id != b.run_id
        assert registry.ensure(first) is a
    finally:
        registry.close()
```

- [ ] Step 2：確認測試失敗，實作 registry；同 Run single-flight 載入、驗證後才能 ensure、journal corruption 只污染該 Run。啟動時取得後端有效 descriptors 並逐場恢復，不以第一個錯誤使全服務不能啟動。
- [ ] Step 3：實作 `PUT /v1/runs/{run_id}`、batch route、liveness/readiness/per-run health。resident 獨立 app 入口，不改 legacy app。受驗證 descriptor 來自後端；新簽章綁 method/path/run/revision/body，失敗不載入磁碟或 bootstrap。resident callback 使用後端認證的服務憑證，並逐 Run 檢查 execution_backend、狀態與 payload scope。

```python
# FastAPI endpoint 的執行型態：slow archive/command pool 與 receipt pool 分開。
runtime = registry.get(run_id)
ack = await asyncio.get_running_loop().run_in_executor(
    receipt_executor, runtime.accept_batch, batch, received_at_ms
)
return ack.model_dump(mode="json")
```

執行器必須有 admission semaphore、每 Run 工作量上限及拒絕時的可重試回應；不能只有無限 threadpool queue。慢速命令交付不得持有收件鎖。程序關閉時保留 durable pending 資料。
- [ ] Step 4：測錯簽章、跨 Run body、重播控制版本、重複 ensure、A callback 阻塞但 B 可收件、A journal 壞但 B 可用。以測試 latch 控制阻塞，避免只靠脆弱毫秒計時。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps integrity-unit-test python -m pytest -q -p no:cacheprovider tests/test_resident_registry.py tests/test_resident_api.py tests/test_worker_api.py
```

- [ ] Step 5：提交 `feat(integrity): host isolated runs in resident service`。

## Task 5: 時間 PATCH、版本同步與後端截止

**Files:** Create `backend/apps/contests/services/exam_schedule.py`, `views/exam_runtime_state.py`, `management/commands/reconcile_integrity.py`, `tests/integrity/test_exam_schedule.py`; Modify `views/contest.py`, `views/exam_lifecycle.py`, `services/integrity_commands.py`, `urls.py`, `services/integrity_sessions.py`; Modify resident descriptor 更新及 resident runtime 的 deadline 設定。

**Interfaces:** `update_exam_schedule(contest_id, *, start_time, end_time, actor) -> Contest`；`finalize_due_exam(contest_id, *, now, expected_revision=None) -> int` 回本次交卷人數；`reconcile_integrity_once(now) -> dict[str, int]` 回同步／失敗／交卷計數。命令 `reconcile_integrity --once` 或常駐 `--interval 10`，跨進程用 DB 鎖防重複。

- [ ] Step 1：建立 fixtures owner/contest/student/participant（參照 Task 2 與現有 participant model），寫舊 revision 到期無效測試。

```python
from datetime import timedelta
from apps.contests.services.exam_schedule import update_exam_schedule, finalize_due_exam

def test_extension_invalidates_old_deadline(contest, participant):
    old_end = contest.end_time
    old_revision = contest.schedule_revision
    updated = update_exam_schedule(
        contest.id, start_time=contest.start_time,
        end_time=old_end + timedelta(minutes=20), actor=contest.owner,
    )
    assert updated.schedule_revision == old_revision + 1
    assert finalize_due_exam(contest.id, now=old_end, expected_revision=old_revision) == 0
    participant.refresh_from_db()
    assert participant.exam_status == "in_progress"
```

- [ ] Step 2：跑新測試確認失敗；所有時間修改入口通過同一 transaction。保留 serializer 既有權限及欄位驗證，不另加教師按鈕。儲存時只做 DB，reconciler 再同步 descriptor。

一般 Contest PATCH 的其他欄位仍由原 serializer 保存；缺少 start/end 的部分更新保留鎖內最新值，只有時間實際變動才遞增 revision，不能把整個設定儲存改成僅支援時間欄位。

```python
# finalize_due_exam 的必要 guard，位於 Contest row lock 內、任何交卷寫入前。
if expected_revision is not None and expected_revision != contest.schedule_revision:
    return 0
if contest.end_time is None or now < contest.end_time:
    return 0
```

同 revision 更新內容不同視為 conflict；舊版更新忽略。resident 關閉 authoritative DeadlineScheduler，改由後端掃描所有符合條件的學生（含從未送 checkpoint 者）。legacy scheduled_end 命令在真正執行前也檢查最新 Contest end time，過期命令回 terminal ignored outcome。
- [ ] Step 3：新增 runtime-state GET 回 `server_now/end_time/schedule_revision/exam_status/integrity_run`。以 actor 身分限制 participant scope；主動交卷仍走原接口，不能讓 timer 把自動截止偽裝成主動交卷。
- [ ] Step 4：用實際資料庫並發測兩種鎖順序；測 resident offline PATCH 成功、已交卷不恢復、重複寫同時間不遞增 revision、調整 start time、未送事件學生仍到期、舊 finalize 不封存新時程。縮短時間沿用既有權限／驗證並套用最新期限，不新增隱含自動補時。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T -e POSTGRES_DB=postgres -e POSTGRES_USER=qjudge_test_admin -e POSTGRES_PASSWORD=qjudge_test_admin_password backend-test pytest -q apps/contests/tests/integrity/test_exam_schedule.py apps/contests/tests/integrity/test_internal_commands.py
```

- [ ] Step 5：提交 `fix(exam): make saved schedule authoritative across deadline races`。

## Task 6: Resident gateway 與交卷後限定補傳

**Files:** Create `backend/apps/contests/services/integrity_upload_grants.py`, `tests/integrity/test_upload_grants.py`; Modify `models/integrity.py`, `models/__init__.py`, `services/exam_submission.py`, `views/exam_integrity.py`, `integrity_serializers.py`, `infrastructure/integrity_worker_client.py`, `views/exam_runtime_state.py`; 新增 migration 名稱 `integrity_upload_grants`。

**Interfaces:** 新 model `IntegrityUploadGrant`：run/participant/device/attempt/submitted_at/accept_until/revoked_at，唯一 attempt/device scope。`authorize_integrity_upload(*, run, participant, device_id, attempt_id, now) -> bool`。新增 `Run.execution_backend` 路由：legacy 用舊 worker_url，resident 用設定的固定 URL。

- [ ] Step 1：寫已交卷補傳授權測試；fixture grant 對應 participant/run，並建立另一裝置拒絕案例。

```python
from apps.contests.services.integrity_upload_grants import authorize_integrity_upload

def test_grant_cannot_cross_device(grant):
    args = dict(run=grant.run, participant=grant.participant,
                attempt_id=grant.attempt_id, now=grant.submitted_at)
    assert authorize_integrity_upload(device_id=grant.device_id, **args)
    assert not authorize_integrity_upload(device_id="different-device", **args)
```

- [ ] Step 2：在清除 active session 前記錄 scope；student request 每次仍需有效登入與 participant 身分。grant 不接受任意 client-issued scope；不得保留能繼續寫答案的 active session 作為替代。
- [ ] Step 3：修正 gateway active-only 判斷，使 submitted 僅可在 grant 限定下補傳。定義 late/unverified 標記、已知批次／序號／descriptor 約束與容量上限；unknown late data 不作追溯處分。空 observations 仍能取 pending evidence commands。服務不可用回可重試錯誤，避免在 Django request 內長時間多次重試。

active 考生仍必須通過原有 run/participant/device/session 驗證，不能僅因 exam_status 符合就放行。新增可選 final sequence marker 與 `upload_status=pending|complete|expired`：marker 只表示客户端宣告已停止採集，不是可信時間證明；complete 必須核對連續收件、判定進度及所有取證命令的終結狀態。已交卷者完成即可離場，不需等待整場 Run 封存。

```python
# observations gateway 只對 resident 使用補傳規則，legacy 保持原驗證。
allowed = participant.exam_status in ACTIVE_INTEGRITY_EXAM_STATUSES
if not allowed and run.execution_backend == "resident":
    allowed = authorize_integrity_upload(
        run=run, participant=participant, device_id=device_id,
        attempt_id=attempt_id, now=timezone.now(),
    )
if not allowed:
    raise PermissionDenied("Integrity upload scope expired or invalid.")
```

- [ ] Step 4：測 active session 已清除仍能補傳、過期／撤銷／跨 Run／跨裝置被拒、grant 不能改答案、resident unavailable 不影響正常交卷回應、legacy gateway regression。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T -e POSTGRES_DB=postgres -e POSTGRES_USER=qjudge_test_admin -e POSTGRES_PASSWORD=qjudge_test_admin_password backend-test pytest -q apps/contests/tests/integrity/test_upload_grants.py apps/contests/tests/integrity/test_batch_gateway.py apps/contests/tests/integrity/test_evidence_chunks.py
```

- [ ] Step 5：提交 `feat(integrity): authorize bounded post-submission uploads`。

## Task 7: 學生記錄、傳輸與時程同步

**Files:** Create `frontend/src/features/contest/hooks/useExamRuntimeState.ts`, `useExamRuntimeState.test.ts`, `frontend/src/features/contest/contexts/IntegrityUploadProvider.tsx`; Modify `contexts/ContestContext.tsx`, `hooks/useContestTimers.ts`, `hooks/useContestTimers.test.ts`, `components/ExamModeWrapper.tsx`, `anticheat/integrity/useIntegrityRuntime.ts`, `integrityTransport.ts`, `integrityTransport.test.ts`, `IntegrityRuntime.test.tsx`, `frontend/src/core/entities/examIntegrity.entity.ts`, `contest.entity.ts`, `frontend/src/infrastructure/api/repositories/examIntegrity.repository.ts`, `exam.repository.ts`。

**Interfaces:** `IntegrityTransportOptions.mode?: "capture" | "drain"` 預設 capture；drain 不新增 health snapshot，仍取 outbox/取證命令。`useExamRuntimeState(contestId?: string)` 回傳 `{state, refresh}`，state 對應 Task 5 wire response；repository 提供 `getRuntimeState(contestId, signal?)`。

- [ ] Step 1：在現有 transport describe 使用現有 `outbox/createTransport` 寫 drain 不採集測試。

```typescript
it("does not create a new health snapshot while draining", async () => {
  const transport = createTransport({ mode: "drain" });
  transport.start();
  await transport.whenIdle();
  expect(outbox.appendedRecords).toHaveLength(0);
  transport.stop();
});
```

- [ ] Step 2：確認失敗，將 snapshot append 分支限制於 capture；drain 仍送既有批次，outbox 空時用 evidence-only checkpoint 取待處理命令。停止所有新媒體採集與事件 emitter，但讓傳輸 owner 在交卷畫面存在到授權期限／完成條件。

`IntegrityUploadProvider` 在 contest context 所屬 route 範圍管理 transport/outbox；ExamModeWrapper 只控制 capture。capture→drain 沿用同一 outbox 與傳輸 owner，不因 effect cleanup 先關閉儲存。跨離整個 contest 頁面或關閉瀏覽器時，顯示剩餘待傳事實並保存可恢復的本機資料，不宣稱背景仍能執行。

```typescript
const mode = isIntegrityAttemptActive(examStatus)
  ? "capture"
  : uploadGrantValid ? "drain" : "off";
const enabled = mode !== "off" && hasRunIdentityAndSnapshots;
```

`uploadGrantValid` 由後端 runtime-state 與 server time 決定；`hasRunIdentityAndSnapshots` 使用現有 run/participant/registry 驗證，移除 computeState gate。寫入失敗不能只 DEV console；更新監考資料狀態但不鎖作答。
- [ ] Step 3：集中一個 runtime-state polling owner，5 秒與 visibility/online 恢復時刷新；abort 舊請求，舊 revision 不覆蓋新狀態。只更新時間與監考狀態，不重掛編輯器。timer 歸零僅 refresh，重設過期 refresh flag 的依賴包含 schedule revision/endTime。
- [ ] Step 4：測 worker unavailable 時 outbox 成長、恢復不重送處分、submitted drain 不新增 snapshot、離開答題頁仍可 drain、儲存失敗回報、時程延長保留答案／游標、舊 HTTP 回應不回退倒數。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- src/features/contest/anticheat/integrity/integrityTransport.test.ts src/features/contest/anticheat/integrity/IntegrityRuntime.test.tsx src/features/contest/hooks/useExamRuntimeState.test.ts src/features/contest/hooks/useContestTimers.test.ts
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run typecheck
```

- [ ] Step 5：提交 `feat(exam): decouple capture and upload from monitor availability`。

## Task 8: 收尾、故障區間與證據保留

**Files:** Create `integrity-service/integrity_service/resident/lifecycle.py`, `tests/test_resident_lifecycle.py`; Modify `resident/registry.py`, `resident/app.py`, `worker/runtime.py`, `core/timeline.py`, `core/connectivity.py`, `journal/command_outbox.py`, `backend/apps/contests/services/integrity_sessions.py`, `services/integrity_commands.py`, `frontend/src/features/contest/anticheat/integrity/evidenceCoordinator.test.ts`。

**Interfaces:** `RunRegistry.finalize(run_id: UUID, expected_revision: int) -> ArchiveResult` 需先向後端確認 drain 授權。`record_service_gap(run_id, started_ms, ended_ms, reason)` 持久化事故區間；reason 限定 platform_unavailable/process_recovery/storage_unavailable。這些記錄進 timeline，重播採相同處分抑制規則。

- [ ] Step 1：新增延長後舊收尾不能關閉 Run 的测试，Task 4 registry fixture 使用兩個版本的 descriptor。

```python
def test_old_finalize_cannot_close_extended_run(registry, descriptor):
    from dataclasses import replace
    import pytest
    from integrity_service.resident.lifecycle import StaleSchedule
    registry.ensure(descriptor)
    registry.ensure(replace(descriptor, schedule_revision=descriptor.schedule_revision + 1,
                            scheduled_end_ms=descriptor.scheduled_end_ms + 1200000,
                            accept_until_ms=descriptor.accept_until_ms + 1200000))
    with pytest.raises(StaleSchedule):
        registry.finalize(descriptor.bootstrap.run_id, descriptor.schedule_revision)
    assert registry.get(descriptor.bootstrap.run_id).accepting
```

- [ ] Step 2：收尾先取得後端最新 revision 與授權，停止新收件、完成已收件判定及命令，再封存該 Run。延長先提交時撤銷舊 drain；已封存不重寫。archive 外部 I/O 在獨立工作資源中，不持有其他 Run 或收件的全域鎖。
- [ ] Step 3：平台中斷與處理 lag 要與學生失聯分開。以服務可用性／接收連續性證據記錄 gap，不能只看 replay wall-clock 大幅跳躍就處分。release watermark 只在判定與證據需求確認後前進，超出可保存容量顯示缺口而非謊稱完整。

```python
# 背景處理產生的處分必須先套用可重播的平台事故範圍。
is_connectivity_effect = (
    command.kind == "record_event"
    and command.event_type in {"connectivity_suspect", "connectivity_timeout"}
    and command.action in {"record", "pause", "lock", "submit"}
)
if is_connectivity_effect and service_gap_covers(command):
    record_suppressed_command(command, reason="platform_gap")
else:
    outbox.append((command,))
```

`service_gap_covers(command)` 僅涵蓋失聯／監考服務事故衍生處分，不能用來抑制後端正常到期或所有真實事件；實作在同檔明確列出 connectivity event types。`record_suppressed_command` 保存 command ID/原因，不執行處分。
- [ ] Step 4：測判定落後 ACK 不刪證據、archive failure 可重試且不假完成、事故恢復不全班失聯處分、A finalize blocked 不影響 B、服務關閉只釋放資源不封存尚在考試的 Run。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps integrity-unit-test python -m pytest -q -p no:cacheprovider tests/test_resident_lifecycle.py tests/test_connectivity.py tests/test_archive.py tests/test_timeline.py
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- src/features/contest/anticheat/integrity/evidenceCoordinator.test.ts
```

- [ ] Step 5：提交 `feat(integrity): finalize sessions without interrupting other exams`。

## Task 9: 教師端狀態與前端可見驗收

**Files:** Modify `frontend/src/features/contest/components/admin/IntegrityRunControlCard.tsx`, `IntegrityRunControlCard.test.tsx`, `frontend/src/core/entities/examIntegrity.entity.ts`, `frontend/src/i18n/locales/zh-TW/contest.json`, `en/contest.json`, `ja/contest.json`, `ko/contest.json`；如需 stories，在相同 component 目錄建立 `IntegrityRunControlCard.stories.tsx`。

**Interfaces:** 後端 run presentation 增加 `receiving/processing/archiving/degraded/archived_with_gaps` 的產品狀態與 last update、受影響人數；compute health 不直接映射成「資料完整」。

- [ ] Step 1：在現有 component test fixture 上新增 degraded 狀態，断言不出現教師 restart 控制。使用既有 render/i18n fixture，保持測試符合實際翻譯文字。

```typescript
expect(screen.getByText("部分監考紀錄延遲")).toBeVisible();
expect(screen.queryByRole("button", { name: /重新啟動/ })).not.toBeInTheDocument();
```

- [ ] Step 2：保留現有卡片布局，替換技術操作為接收、延遲、收尾與缺口狀態；維運訊息不混進一般教師操作。必要提示說明已確認的影響，不保證未知的答案同步成功。
- [ ] Step 3：在 dev Storybook 渲染正常、延遲、封存失敗、資料缺口與窄螢幕；檢查文字溢出、螢幕閱讀器狀態更新、不要每次 polling 都 toast。
- [ ] Step 4：執行 unit/typecheck/i18n；實際畫面證據獨立記錄，不能以程式碼通過代替視覺驗收。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test -- src/features/contest/components/admin/IntegrityRunControlCard.test.tsx
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run check:i18n
```

- [ ] Step 5：提交 `feat(contest): show monitoring outcomes without worker controls`。

## Task 10: 部署、實際故障驗收與切換

**Files:** Create `integrity-service/Dockerfile.resident`, `docs/operations/resident-integrity-rollout.md`, `frontend/tests/e2e/resident-integrity.e2e.spec.ts`; Modify `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.test.yml`, `backend/config/settings/base.py`, `integrity-service/tests/test_compose_contract.py`。

**Interfaces:** resident 服務用 `integrity_service.resident.app:app`；`INTEGRITY_DEFAULT_EXECUTION_BACKEND` 只影響新 Run；`INTEGRITY_RESIDENT_URL` 固定內部 URL；reconciler 常駐使用 Task 5 命令。設定 service credential/signing key、persistent data root、pool limits、grace seconds，憑證不寫進 Git。

- [ ] Step 1：先擴充 Compose contract tests，要求 resident 無 Docker socket、持久 volume、單個 Uvicorn worker、有 healthcheck，並要求 legacy 服務切換前仍可共存。
- [ ] Step 2：resident Dockerfile 沿用 worker dependencies、非 root user；只更换 entrypoint。三環境配置使用對應 backend 名稱。設定 fail-fast 的 checkpoint timeout／request quota，不能自動新增 production ports 或外部資源。

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
COPY integrity_service ./integrity_service
RUN pip install --no-cache-dir ".[worker]" && useradd --uid 10001 --create-home --shell /usr/sbin/nologin integrity
USER 10001
EXPOSE 8020
CMD ["uvicorn", "integrity_service.resident.app:app", "--host", "0.0.0.0", "--port", "8020", "--workers", "1"]
```

- [ ] Step 3：新增 E2E 專用兩場 Contest 與測試帳號，依 A1–A10 操作真實瀏覽器；failure controls 僅使用測試環境的容器控制，不暴露 production debug route。紀錄答案 API 成功、真實 ACK/replay、並行另一場持續接收、延長倒數與交卷後補傳的證據。

```typescript
// 在 E2E fixture 已登入教師、學生且位於答題頁後，保留編輯器節點驗證不重掛。
const editorBefore = await studentPage.locator(".monaco-editor").elementHandle();
await teacherApi.patch(contestUrl, { data: { end_time: extendedEndTime } });
await expect(studentPage.getByTestId("exam-deadline")).toHaveAttribute("data-end-time", extendedEndTime);
expect(await editorBefore?.evaluate(node => node.isConnected)).toBe(true);
```

`studentPage/teacherApi/contestUrl/extendedEndTime` 在該 E2E 檔以既有 `tests/helpers` 登入／資料 helper 建立；若目前 countdown 無 selector，Task 7 同步加入穩定 `data-testid="exam-deadline"` 與 `data-end-time`，不改可見操作。紙筆考試也要測答案內容保存，不能只測 Monaco。
- [ ] Step 4：撰寫切換／回滾手冊並在 test 演練：先部署向後相容 schema 和 resident（新 Run 仍 legacy），測試驗收後才改新 Run default；legacy 活躍 Run 完成封存後退役 Controller。回滾只改新 Run default；已 resident Run 保持 resident 接收與收尾。不得 purge volume 作為回滾。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps integrity-unit-test python -m pytest -q -p no:cacheprovider
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run test:e2e -- tests/e2e/resident-integrity.e2e.spec.ts
```

驗證結果記錄測試場數／學生數／版本與故障窗口；不得沿用舊單場壓測聲稱多場容量。涉及真實部署的最後切換依使用者授權範圍執行，不能因計畫已建立就視為已授權。
- [ ] Step 5：提交 `feat(integrity): wire resident deployment and migration checks`。

## 執行前必讀與停止條件

- 讀 spec、此 plan、`qjudge-architecture-owner`、`qjudge-env-compose-owner`；涉及 UI 與 Git 時再讀對應 owner skill。
- 新增 migration 以執行當下 leaf 為準；任何與現有未提交修改重疊的改動在隔離 worktree 處理。
- 任一測試顯示錯 ACK、跨場資料、延長後舊截止仍生效、監考故障阻斷答案 API，均不得開啟 resident default。
- 本計畫中的 code blocks 是精確契約／關鍵演算法／最小回歸測試，不能當作已完成或已測試的實作。

## 計畫自我檢查

- [x] 使用者確認的常駐、多場隔離、不中斷作答與教師免維運均有對應 Task。
- [x] 時間修改沿用 PATCH；沒有新增延長按鈕；已交卷不恢復。
- [x] 截止競爭與收尾競爭都使用後端最新 revision。
- [x] active session 清除後的補傳身分有獨立工作項。
- [x] 收件 ACK、判定進度、證據 release、封存分開。
- [x] legacy 並存及回滾不搬移進行中 Run、不刪原始資料。
- [x] 測試容器包含 pytest；沒有假設 production Worker image 已有測試依賴。

尚未執行任何實作 Task 或驗收測試。後續可依本計畫逐 Task 執行與 review；若選擇代理分工，先取得使用者對該執行方式的選擇。
