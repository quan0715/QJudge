# AI Service Independence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 AI session、message、run、event、artifact、checkpoint、usage 與 Agent orchestration 完整移入 AI Service，讓 Django 只保留既有 `/api/v1/ai/*` 的 BFF compatibility adapter。

**Architecture:** AI Service 內建立純 domain、SQLAlchemy／Alembic persistence、FastAPI canonical API 與獨立 Celery Worker。Django 以短效 `aud=ai-service` JWT 呼叫 AI Service，只轉換 HTTP contract 與原樣代理 SSE；QJudge 操作仍由 AI Worker 使用交換後的 `aud=qjudge-mcp` token 連線 MCP。切換完成後，Django AI app 不再有 models、Celery tasks、Agent stream parser 或 artifact storage。

**Tech Stack:** Python 3.11、FastAPI、Pydantic 2、SQLAlchemy 2 async、Alembic、PostgreSQL 15、Celery 5、Redis 7、PyJWT／Ed25519、MCP Streamable HTTP、LangGraph Postgres checkpointer、boto3、Django REST Framework、React 19／TypeScript 5.9／Vitest 4、Docker Compose、GitHub Actions。

## Global Constraints

- Django 暫時是 BFF／Gateway；本計畫不建立獨立 API Gateway，也不讓 frontend 直接呼叫 AI Service。
- AI Service 是 AI domain 唯一 owner；Django 不得讀寫 `qjudge_ai`，AI Service 不得讀寫 `online_judge`。
- 全域 domain UUID 只能有 `session_id`、`run_id`、`artifact_id` 三種。
- Message primary key 固定為 `(session_id, ordinal)`；Stream Event primary key 固定為 `(run_id, sequence)`。
- `session_id` 直接作為 LangGraph `thread_id`；`run_id` 直接作為 Celery task ID。不得新增 `external_run_id`、持久化 `thread_id` 或 `celery_task_id`。
- Owner 只保存在 Session 的 `owner_issuer`、`owner_subject`；其他 AI tables 不重複 owner，也不建立 Django user foreign key、AI User table 或 `tenant_id`。
- Usage 直接保存在 Run；不得建立 Execution Log、Usage Ledger 或 MCP Credential database table。
- MCP credential 使用 Redis short-lived lease；lease key 由 `issuer + subject + mcp_server_id` 經 HMAC 推導，scope 不得進入 key。
- start、resume、approve、answer 都必須先通過 MCP credential readiness；失敗時不得呼叫 LLM。
- MCP 故障不得阻斷 session/history、run history、artifact download、model list 與 health APIs。
- Django SSE proxy 只能轉送 bytes，不得解析、重編 sequence 或改寫 Agent event payload。
- 一個 Session 同時最多一個 `running`／`awaiting_approval`／`awaiting_user_answer` Run；後續 Run 保持 `queued`。
- 每個 event 的 insert、`run.last_sequence`、run transition 與 message projection 必須在同一個 AI DB transaction。
- Celery delivery 視為 at-least-once；Worker 必須 atomic claim，start run 必須支援 `(session_id, Idempotency-Key)` 去重。
- 不遷移 beta AI data；cutover 時直接 drop Django AI tables。
- 本計畫不實作 domain data retention、TTL、auto cleanup、壓縮或容量 quota。Credential lease TTL 只限制 token 暴露時間。
- frontend full-page／embed Copilot 的 API 路徑與使用者行為保持不變。
- 每個 task 只 stage 自己 Files 區塊列出的檔案；不得帶入 `ai-service/.deepagents/` 的本地內容。

## Delivery Gates

1. **Gate A — Domain and persistence:** Tasks 1–4。AI DB schema、repositories 與原子 event projection 可獨立測試。
2. **Gate B — Identity and external ports:** Tasks 5–7。OAuth audience、MCP lease/preflight 與 artifact ownership 可獨立測試。
3. **Gate C — Authoritative runtime:** Tasks 8–11。DeepAgent 使用 authoritative IDs，AI Worker 與 canonical API 完成。
4. **Gate D — Dogfood cutover:** Tasks 12–14。Django BFF 與 frontend 使用新 service，Compose 啟動獨立 DB／Worker。
5. **Gate E — Legacy retirement and release gates:** Tasks 15–17。收斂 AI Service 內部入口、移除 Django runtime、補 CI／E2E／observability，執行全套驗證。

## Target File Map

```text
ai-service/
├── api/
│   ├── dependencies.py
│   ├── errors.py
│   ├── schemas.py
│   └── routers/{sessions,runs,artifacts,system}.py
├── application/
│   ├── artifacts.py
│   ├── credential_service.py
│   ├── event_reducer.py
│   ├── run_service.py
│   ├── session_service.py
│   └── usage_service.py
├── domain/
│   ├── errors.py
│   ├── models.py
│   ├── ports.py
│   └── run_state.py
├── infrastructure/
│   ├── agent/deepagent_adapter.py
│   ├── artifacts/s3_artifact_store.py
│   ├── database/{base,models,repositories,uow}.py
│   ├── checkpoints/langgraph_store.py
│   ├── mcp/{credential_lease,preflight,token_exchange}.py
│   ├── oauth/jwt_verifier.py
│   └── queue/celery_dispatcher.py
├── migrations/versions/0001_ai_domain.py
├── worker/{celery_app,runtime,scheduler,tasks}.py
└── tests/{unit,integration,contract,support}/

backend/apps/ai/
├── services/ai_service_client.py
├── tests/{test_bff_contract,test_bff_sse,test_boundary}.py
├── urls.py
└── views.py

backend/apps/oauth/
├── resource_tokens.py
├── tests/test_resource_tokens.py
├── urls.py
└── views.py
```

Legacy `ai-service/services/*` Agent helpers may remain during Tasks 1–14 while callers are migrated. Task 15 moves the remaining reusable modules under `infrastructure/*`, deletes the old streaming router／DTO／runner entrypoint, and installs a boundary gate; the final tree must not retain a second orchestration path.

---

### Task 1: Define the minimal AI domain and identifier policy

**Files:**
- Create: `ai-service/domain/__init__.py`
- Create: `ai-service/domain/errors.py`
- Create: `ai-service/domain/models.py`
- Create: `ai-service/domain/run_state.py`
- Create: `ai-service/domain/ports.py`
- Create: `ai-service/tests/unit/test_domain_models.py`
- Create: `ai-service/tests/unit/test_run_state.py`

**Interfaces:**
- Produces: `Principal(issuer: str, subject: str)`, `Session`, `MessageKey`, `Message`, `Run`, `StreamEvent`, `Artifact`, `Usage`, `RunStatus`, `RunKind`.
- Produces: `transition_run(run: Run, target: RunStatus) -> Run` and `ACTIVE_EXECUTION_STATUSES`.
- Produces repository／queue／clock Protocols used from Task 3 onward.

- [ ] **Step 1: Write identifier and transition tests**

```python
from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from domain.errors import InvalidRunTransition
from domain.models import MessageKey, Principal, Run, RunKind, RunStatus, Session
from domain.run_state import transition_run


def test_message_public_id_is_scoped_to_session() -> None:
    session_id = uuid4()
    key = MessageKey(session_id=session_id, ordinal=7)
    assert key.public_id == f"{session_id}:7"


def test_session_owner_has_no_internal_user_id() -> None:
    session = Session(
        id=uuid4(),
        owner=Principal(issuer="https://qjudge.test", subject="user-42"),
        title="New chat",
        context={},
    )
    assert set(session.owner.__dataclass_fields__) == {"issuer", "subject"}
    assert isinstance(session.id, UUID)


def test_paused_run_can_resume_to_running() -> None:
    run = Run(
        id=uuid4(),
        session_id=uuid4(),
        status=RunStatus.AWAITING_USER_ANSWER,
        kind=RunKind.CHAT,
        model_id="openai-nano",
    )
    assert transition_run(run, RunStatus.RUNNING) == replace(
        run, status=RunStatus.RUNNING
    )


def test_completed_run_cannot_return_to_running() -> None:
    run = Run(
        id=uuid4(),
        session_id=uuid4(),
        status=RunStatus.COMPLETED,
        kind=RunKind.CHAT,
        model_id="openai-nano",
    )
    with pytest.raises(InvalidRunTransition):
        transition_run(run, RunStatus.RUNNING)
```

- [ ] **Step 2: Run the tests and verify the missing domain fails**

Run: `cd ai-service && python -m pytest tests/unit/test_domain_models.py tests/unit/test_run_state.py -v`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'domain'`.

- [ ] **Step 3: Implement immutable domain types and explicit transitions**

```python
# ai-service/domain/models.py
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any
from uuid import UUID


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    AWAITING_USER_ANSWER = "awaiting_user_answer"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RunKind(StrEnum):
    CHAT = "chat"
    RESUME = "resume"


@dataclass(frozen=True, slots=True)
class Principal:
    issuer: str
    subject: str


@dataclass(frozen=True, slots=True)
class MessageKey:
    session_id: UUID
    ordinal: int

    @property
    def public_id(self) -> str:
        return f"{self.session_id}:{self.ordinal}"


@dataclass(frozen=True, slots=True)
class Session:
    id: UUID
    owner: Principal
    title: str
    context: dict[str, Any]


@dataclass(frozen=True, slots=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cost_cents: int = 0
    credits: int = 0


@dataclass(frozen=True, slots=True)
class Run:
    id: UUID
    session_id: UUID
    status: RunStatus
    kind: RunKind
    model_id: str
    last_sequence: int = 0
    cancel_requested: bool = False
    error_code: str | None = None
    error_message: str | None = None
    pause_payload: dict[str, Any] = field(default_factory=dict)
    usage: Usage = field(default_factory=Usage)
```

Implement `Message`, `StreamEvent`, and `Artifact` in the same file with only the fields named in the spec. Implement `transition_run` with an explicit adjacency map; terminal statuses have an empty target set. Define Protocols in `domain/ports.py` with the exact async signatures introduced in Tasks 3, 5, and 7 rather than importing SQLAlchemy, Redis, Celery, boto3, FastAPI, or MCP types.

- [ ] **Step 4: Run the domain tests**

Run: `cd ai-service && python -m pytest tests/unit/test_domain_models.py tests/unit/test_run_state.py -v`

Expected: PASS with four tests and no external service access.

- [ ] **Step 5: Commit**

```bash
git add ai-service/domain ai-service/tests/unit/test_domain_models.py ai-service/tests/unit/test_run_state.py
git commit -m "feat(ai): define autonomous domain model"
```

### Task 2: Create the independent AI database schema

**Files:**
- Modify: `ai-service/pyproject.toml`
- Modify: `ai-service/requirements.txt`
- Modify: `ai-service/config.py`
- Create: `ai-service/alembic.ini`
- Create: `ai-service/migrations/env.py`
- Create: `ai-service/migrations/script.py.mako`
- Create: `ai-service/migrations/versions/0001_ai_domain.py`
- Create: `ai-service/infrastructure/__init__.py`
- Create: `ai-service/infrastructure/database/__init__.py`
- Create: `ai-service/infrastructure/database/base.py`
- Create: `ai-service/infrastructure/database/models.py`
- Create: `ai-service/tests/integration/conftest.py`
- Create: `ai-service/tests/integration/test_schema.py`

**Interfaces:**
- Consumes: Task 1 `RunStatus`, `RunKind` values.
- Produces: `create_async_engine_from_settings() -> AsyncEngine`, `async_session_factory() -> async_sessionmaker[AsyncSession]`.
- Produces SQLAlchemy rows: `SessionRow`, `MessageRow`, `RunRow`, `RunEventRow`, `ArtifactRow`.

- [ ] **Step 1: Add database dependencies and settings**

Add the same runtime dependencies to both dependency manifests:

```toml
"sqlalchemy[asyncio]>=2.0,<3.0",
"alembic>=1.13,<2.0",
"psycopg[binary,pool]>=3.1,<4.0",
```

Add settings with no fallback to Django's database:

```python
ai_database_url: str = Field(
    default="",
    validation_alias=AliasChoices("AI_DATABASE_URL"),
)
ai_database_schema: str = "ai"
ai_checkpoint_schema: str = "ai_checkpoint"
```

- [ ] **Step 2: Write schema tests against a real PostgreSQL database**

```python
from sqlalchemy import inspect, text


async def test_ai_schema_has_only_three_uuid_primary_keys(db_engine) -> None:
    async with db_engine.connect() as connection:
        tables = await connection.run_sync(
            lambda sync: inspect(sync).get_table_names(schema="ai")
        )
        assert set(tables) == {
            "sessions", "messages", "runs", "run_events", "artifacts"
        }

        def pk_columns(sync, table: str) -> list[str]:
            return inspect(sync).get_pk_constraint(table, schema="ai")["constrained_columns"]

        assert await connection.run_sync(lambda sync: pk_columns(sync, "sessions")) == ["session_id"]
        assert await connection.run_sync(lambda sync: pk_columns(sync, "runs")) == ["run_id"]
        assert await connection.run_sync(lambda sync: pk_columns(sync, "artifacts")) == ["artifact_id"]
        assert await connection.run_sync(lambda sync: pk_columns(sync, "messages")) == ["session_id", "ordinal"]
        assert await connection.run_sync(lambda sync: pk_columns(sync, "run_events")) == ["run_id", "sequence"]


async def test_removed_identity_columns_do_not_exist(db_engine) -> None:
    forbidden = {
        "external_run_id", "thread_id", "celery_task_id", "tenant_id",
        "user_id", "user_message_id", "assistant_message_id", "object_key",
    }
    async with db_engine.connect() as connection:
        columns = await connection.run_sync(
            lambda sync: {
                column["name"]
                for table in ("sessions", "messages", "runs", "run_events", "artifacts")
                for column in inspect(sync).get_columns(table, schema="ai")
            }
        )
    assert forbidden.isdisjoint(columns)
```

`tests/integration/conftest.py` must read `AI_TEST_DATABASE_URL`, run `alembic upgrade head` once, and truncate the five `ai` tables between tests. It must fail with a clear message when the variable is absent; it must not silently switch to SQLite.

- [ ] **Step 3: Run the schema test and verify it fails before the migration exists**

Run:

```bash
cd ai-service
AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test \
python -m pytest tests/integration/test_schema.py -v
```

Expected: FAIL because Alembic cannot find revision `0001_ai_domain` or the `ai` schema is absent.

- [ ] **Step 4: Implement the SQLAlchemy metadata and Alembic revision**

The revision must create exactly these domain tables:

```text
ai.sessions
  session_id uuid PK
  owner_issuer varchar(255) NOT NULL
  owner_subject varchar(255) NOT NULL
  title varchar(100) NOT NULL
  context jsonb NOT NULL DEFAULT '{}'
  next_message_ordinal integer NOT NULL DEFAULT 1
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
  INDEX(owner_issuer, owner_subject, updated_at DESC)

ai.runs
  run_id uuid PK
  session_id uuid NOT NULL FK sessions ON DELETE CASCADE
  status varchar(32) NOT NULL
  kind varchar(20) NOT NULL
  model_id varchar(50) NOT NULL
  idempotency_key varchar(255) NOT NULL
  error_code varchar(64) NULL
  error_message text NULL
  pause_payload jsonb NOT NULL DEFAULT '{}'
  cancel_requested boolean NOT NULL DEFAULT false
  last_sequence integer NOT NULL DEFAULT 0
  input_tokens bigint NOT NULL DEFAULT 0
  output_tokens bigint NOT NULL DEFAULT 0
  cost_cents bigint NOT NULL DEFAULT 0
  credits bigint NOT NULL DEFAULT 0
  usage_accounted boolean NOT NULL DEFAULT false
  started_at/heartbeat_at/completed_at/created_at/updated_at timestamptz
  UNIQUE(session_id, idempotency_key)
  partial UNIQUE(session_id) WHERE status IN
    ('running', 'awaiting_approval', 'awaiting_user_answer')

ai.messages
  session_id uuid FK sessions ON DELETE CASCADE
  ordinal integer
  run_id uuid NULL FK runs ON DELETE SET NULL
  role varchar(20) NOT NULL
  content text NOT NULL DEFAULT ''
  metadata jsonb NOT NULL DEFAULT '{}'
  created_at timestamptz NOT NULL
  PRIMARY KEY(session_id, ordinal)

ai.run_events
  run_id uuid FK runs ON DELETE CASCADE
  sequence integer
  event_type varchar(64) NOT NULL
  payload jsonb NOT NULL
  created_at timestamptz NOT NULL
  PRIMARY KEY(run_id, sequence)

ai.artifacts
  artifact_id uuid PK
  session_id uuid FK sessions ON DELETE CASCADE
  produced_by_run_id uuid NULL FK runs ON DELETE SET NULL
  step varchar(64) NOT NULL
  filename varchar(255) NOT NULL
  content_type varchar(100) NOT NULL
  size_bytes bigint NOT NULL DEFAULT 0
  checksum varchar(64) NOT NULL DEFAULT ''
  metadata jsonb NOT NULL DEFAULT '{}'
  created_at/updated_at timestamptz NOT NULL
  UNIQUE(session_id, step, filename)
```

Use naming conventions in `Base.metadata` so Alembic produces deterministic constraint names. `downgrade()` must drop only the `ai` schema objects; it must not touch LangGraph's `ai_checkpoint` schema.

- [ ] **Step 5: Apply the migration and rerun the schema tests**

Run:

```bash
cd ai-service
AI_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test \
python -m alembic upgrade head
AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test \
python -m pytest tests/integration/test_schema.py -v
```

Expected: PASS; the test reports five domain tables and no forbidden columns.

- [ ] **Step 6: Commit**

```bash
git add ai-service/pyproject.toml ai-service/requirements.txt ai-service/config.py \
  ai-service/alembic.ini ai-service/migrations ai-service/infrastructure/database \
  ai-service/tests/integration
git commit -m "feat(ai): add independent persistence schema"
```

### Task 3: Implement owner-scoped repositories and Unit of Work

**Files:**
- Modify: `ai-service/domain/ports.py`
- Create: `ai-service/infrastructure/database/repositories.py`
- Create: `ai-service/infrastructure/database/uow.py`
- Create: `ai-service/application/session_service.py`
- Create: `ai-service/application/usage_service.py`
- Create: `ai-service/tests/integration/test_session_repository.py`
- Create: `ai-service/tests/unit/test_session_service.py`

**Interfaces:**
- Consumes: Task 1 domain types and Task 2 rows/session factory.
- Produces: `SqlAlchemyUnitOfWork`, `SessionService`, `UsageService`.
- Produces exact methods:
  - `create_session(principal: Principal, context: dict[str, Any]) -> Session`
  - `list_sessions(principal: Principal) -> list[Session]`
  - `get_session(principal: Principal, session_id: UUID) -> Session`
  - `rename_session(principal: Principal, session_id: UUID, title: str) -> Session`
  - `clear_session(principal: Principal, session_id: UUID) -> Session`
  - `delete_session(principal: Principal, session_id: UUID) -> None`
  - `get_usage(principal: Principal) -> Usage`

- [ ] **Step 1: Write ownership and usage aggregation tests**

```python
async def test_get_session_never_returns_another_subject(
    session_service, principal_a, principal_b
) -> None:
    created = await session_service.create_session(principal_a, {})
    with pytest.raises(SessionNotFound):
        await session_service.get_session(principal_b, created.id)


async def test_usage_is_aggregated_from_owned_runs(
    uow_factory, usage_service, principal_a, principal_b, run_factory
) -> None:
    await run_factory(principal_a, input_tokens=10, output_tokens=4, credits=2)
    await run_factory(principal_b, input_tokens=99, output_tokens=99, credits=99)
    usage = await usage_service.get_usage(principal_a)
    assert usage == Usage(input_tokens=10, output_tokens=4, credits=2)
```

- [ ] **Step 2: Verify the tests fail before repositories exist**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/integration/test_session_repository.py tests/unit/test_session_service.py -v`

Expected: FAIL with missing `SqlAlchemyUnitOfWork`／`SessionService` imports.

- [ ] **Step 3: Implement a transaction-scoped Unit of Work**

```python
class SqlAlchemyUnitOfWork:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self.session: AsyncSession | None = None

    async def __aenter__(self) -> "SqlAlchemyUnitOfWork":
        self.session = self._session_factory()
        await self.session.begin()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        assert self.session is not None
        if exc_type is None:
            await self.session.commit()
        else:
            await self.session.rollback()
        await self.session.close()
```

All repository queries must include `SessionRow.owner_issuer == principal.issuer` and `SessionRow.owner_subject == principal.subject`. Child ownership queries must join through Session instead of accepting an owner column. `clear_session` deletes Message rows and resets `next_message_ordinal=1`; checkpoint deletion is invoked by the application port added in Task 8, not by the repository.

- [ ] **Step 4: Run repository and service tests**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/integration/test_session_repository.py tests/unit/test_session_service.py -v`

Expected: PASS, including cross-owner 404 semantics and usage isolation.

- [ ] **Step 5: Commit**

```bash
git add ai-service/domain/ports.py ai-service/infrastructure/database/repositories.py \
  ai-service/infrastructure/database/uow.py ai-service/application/session_service.py \
  ai-service/application/usage_service.py ai-service/tests/integration/test_session_repository.py \
  ai-service/tests/unit/test_session_service.py
git commit -m "feat(ai): add owner-scoped repositories"
```

### Task 4: Make event persistence and message projection atomic

**Files:**
- Create: `ai-service/application/event_reducer.py`
- Create: `ai-service/tests/unit/test_event_reducer.py`
- Create: `ai-service/tests/integration/test_atomic_event_persistence.py`
- Modify: `ai-service/infrastructure/database/repositories.py`

**Interfaces:**
- Produces pure `reduce_run_event(run: Run, assistant: Message | None, event: dict[str, Any]) -> EventProjection`.
- Produces: `RunRepository.append_event(run_id: UUID, event: dict[str, Any]) -> StreamEvent`.
- Guarantees: event insert, sequence increment, status transition, usage fields and assistant projection share one transaction.

- [ ] **Step 1: Write pure projector tests for every state-bearing event**

```python
@pytest.mark.parametrize(
    ("event", "expected_status"),
    [
        ({"type": "awaiting_approval", "action_requests": []}, "awaiting_approval"),
        ({"type": "awaiting_user_answer", "question": "Name?"}, "awaiting_user_answer"),
        ({"type": "run_completed"}, "completed"),
        ({"type": "run_failed", "error_code": "AGENT_ERROR", "message": "failed"}, "failed"),
        ({"type": "run_cancelled"}, "cancelled"),
    ],
)
def test_reduce_event_applies_status(event, expected_status, run, assistant) -> None:
    projection = reduce_run_event(run, assistant, event)
    assert projection.run.status == expected_status


def test_message_delta_appends_to_assistant(run, assistant) -> None:
    projection = reduce_run_event(
        run,
        replace(assistant, content="Hel"),
        {"type": "agent_message_delta", "content": "lo"},
    )
    assert projection.assistant is not None
    assert projection.assistant.content == "Hello"
```

Also cover `thinking_delta`, tool start/finish, todo update, verification report, next-turn options and `usage_report`. Store UI projection fields in `MessageRow.metadata`; store usage numbers directly on `RunRow`.

- [ ] **Step 2: Write the rollback regression test**

```python
async def test_projection_failure_rolls_back_event_and_sequence(
    run_repository, seeded_run, monkeypatch
) -> None:
    def fail_projection(*args, **kwargs) -> None:
        raise RuntimeError("projection failed")

    monkeypatch.setattr(
        "infrastructure.database.repositories.reduce_run_event",
        fail_projection,
    )
    with pytest.raises(RuntimeError, match="projection failed"):
        await run_repository.append_event(
            seeded_run.id,
            {"type": "agent_message_delta", "content": "lost"},
        )

    refreshed = await run_repository.get(seeded_run.id)
    events = await run_repository.list_events(seeded_run.id, after=0)
    assert refreshed.last_sequence == 0
    assert events == []
```

- [ ] **Step 3: Verify both suites fail before implementation**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/unit/test_event_reducer.py tests/integration/test_atomic_event_persistence.py -v`

Expected: FAIL because `reduce_run_event` and `append_event` do not exist.

- [ ] **Step 4: Implement locked sequence allocation and projection**

```python
async def append_event(self, run_id: UUID, event: dict[str, Any]) -> StreamEvent:
    run = await self._session.scalar(
        select(RunRow).where(RunRow.run_id == run_id).with_for_update()
    )
    if run is None:
        raise RunNotFound(str(run_id))
    sequence = run.last_sequence + 1
    assistant = await self._latest_assistant_message(run_id)
    mapped_assistant = None if assistant is None else map_message(assistant)
    projection = reduce_run_event(map_run(run), mapped_assistant, event)
    apply_run_projection(run, assistant, projection)
    payload = {**event, "seq": sequence, "run_status": projection.run.status}
    row = RunEventRow(
        run_id=run_id,
        sequence=sequence,
        event_type=str(event["type"]),
        payload=payload,
    )
    self._session.add(row)
    run.last_sequence = sequence
    await self._session.flush()
    return map_event(row)
```

Do not call `commit()` inside `append_event`; the caller's Unit of Work owns commit/rollback. Ignore non-cancel late events after a cancelled run. Reject a second terminal transition with `InvalidRunTransition` rather than silently rewriting the terminal state.

- [ ] **Step 5: Run projector, rollback and concurrent sequence tests**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/unit/test_event_reducer.py tests/integration/test_atomic_event_persistence.py -v`

Expected: PASS; a concurrency case inserting two events produces sequences `[1, 2]` without duplicates.

- [ ] **Step 6: Commit**

```bash
git add ai-service/application/event_reducer.py \
  ai-service/infrastructure/database/repositories.py \
  ai-service/tests/unit/test_event_reducer.py \
  ai-service/tests/integration/test_atomic_event_persistence.py
git commit -m "feat(ai): persist run events atomically"
```

### Task 5: Issue audience-scoped OAuth resource tokens

**Files:**
- Modify: `backend/config/settings/base.py`
- Modify: `backend/requirements/base.txt`
- Create: `backend/apps/oauth/resource_tokens.py`
- Modify: `backend/apps/oauth/views.py`
- Modify: `backend/apps/oauth/urls.py`
- Create: `backend/apps/oauth/authentication.py`
- Create: `backend/apps/oauth/tests/test_resource_tokens.py`
- Create: `backend/apps/oauth/tests/test_resource_token_authentication.py`
- Create: `scripts/bootstrap_ai_oauth_keys.py`
- Modify: `ai-service/pyproject.toml`
- Modify: `ai-service/requirements.txt`
- Create: `ai-service/infrastructure/oauth/__init__.py`
- Create: `ai-service/infrastructure/oauth/jwt_verifier.py`
- Create: `ai-service/tests/unit/test_jwt_verifier.py`
- Modify: `mcp-server/config.py`
- Modify: `mcp-server/pyproject.toml`
- Modify: `mcp-server/uv.lock`
- Modify: `mcp-server/server.py`
- Modify: `mcp-server/tests/test_server.py`

**Interfaces:**
- Produces Django `issue_resource_token(user, audience: str, scopes: frozenset[str], lifetime_seconds: int = 300) -> str`.
- Produces `GET /.well-known/jwks.json`, `POST /api/oauth/resource-token/`, and `POST /api/oauth/token-exchange/`.
- Produces AI `JwtVerifier.verify(token: str, audience: str, required_scopes: frozenset[str]) -> Principal`.
- Produces Backend／MCP local verification for `aud=qjudge-mcp`; opaque MCP OAuth tokens keep the current introspection fallback.

- [ ] **Step 1: Write Django issuer tests**

```python
@override_settings(
    OAUTH_ISSUER_URL="https://issuer.test",
    AI_OAUTH_SIGNING_PRIVATE_KEY_FILE=TEST_PRIVATE_KEY_FILE,
)
def test_teacher_receives_ai_audience_token(api_client, teacher) -> None:
    api_client.force_authenticate(teacher)
    response = api_client.post(
        "/api/oauth/resource-token/",
        {"audience": "ai-service", "scope": "ai:chat"},
        format="json",
    )
    assert response.status_code == 200
    claims = decode_test_token(response.data["access_token"])
    assert claims["aud"] == "ai-service"
    assert claims["scope"] == "ai:chat"
    assert claims["sub"] == str(teacher.pk)


def test_student_cannot_receive_ai_chat_scope(api_client, student) -> None:
    api_client.force_authenticate(student)
    response = api_client.post(
        "/api/oauth/resource-token/",
        {"audience": "ai-service", "scope": "ai:chat"},
        format="json",
    )
    assert response.status_code == 403


def test_ai_token_exchanges_to_distinct_mcp_audience(api_client, teacher) -> None:
    ai_token = issue_resource_token(
        teacher, "ai-service", frozenset({"ai:chat"})
    )
    response = api_client.post(
        "/api/oauth/token-exchange/",
        {"audience": "qjudge-mcp", "scope": "mcp"},
        HTTP_AUTHORIZATION=f"Bearer {ai_token}",
    )
    claims = decode_test_token(response.data["access_token"])
    assert claims["aud"] == "qjudge-mcp"
    assert claims["scope"] == "mcp"


def test_mcp_resource_token_authenticates_as_original_user(
    api_client, teacher
) -> None:
    token = issue_resource_token(
        teacher, "qjudge-mcp", frozenset({"mcp"})
    )
    response = api_client.get(
        "/api/v1/users/me",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )
    assert response.status_code == 200
    assert response.data["id"] == str(teacher.pk)
```

Add one flow test that obtains an existing opaque access token through Authorization Code + PKCE, uses that bearer token to call `/api/oauth/resource-token/`, and receives `aud=ai-service`. This is the standalone Web App bridge until the issuer emits resource-indicator tokens directly; browser code must never receive `aud=qjudge-mcp`.

- [ ] **Step 2: Write AI verifier tests for issuer, audience, expiry and scope**

```python
@pytest.mark.parametrize(
    ("claims_override", "error_code"),
    [
        ({"iss": "https://wrong.test"}, "AI_AUTH_INVALID"),
        ({"aud": "qjudge-mcp"}, "AI_AUTH_INVALID"),
        ({"scope": "mcp"}, "AI_SCOPE_DENIED"),
        ({"exp": 1}, "AI_AUTH_INVALID"),
    ],
)
def test_verifier_rejects_invalid_claims(jwt_factory, verifier, claims_override, error_code) -> None:
    token = jwt_factory(**claims_override)
    with pytest.raises(AuthError) as raised:
        verifier.verify(token, "ai-service", frozenset({"ai:chat"}))
    assert raised.value.code == error_code
```

- [ ] **Step 3: Run both suites and verify red**

Run:

```bash
cd backend && python -m pytest apps/oauth/tests/test_resource_tokens.py \
  apps/oauth/tests/test_resource_token_authentication.py -v
cd ../ai-service && python -m pytest tests/unit/test_jwt_verifier.py -v
cd ../mcp-server && uv run pytest tests/test_server.py -v
```

Expected: all three commands FAIL on the missing issuer, resource authentication, AI verifier, or MCP JWT verifier behavior.

- [ ] **Step 4: Implement Ed25519 JWT issuance and JWKS**

Add `PyJWT[crypto]>=2.9,<3.0` to the Backend and AI Service manifests, add the same dependency to `mcp-server/pyproject.toml`, and run `cd mcp-server && uv lock`. `scripts/bootstrap_ai_oauth_keys.py` idempotently creates one Ed25519 private/public key pair, writes the private file with mode `0600`, and never prints key material. Use the private key file for issuance; never add a signing key to environment variables. Claims are exactly:

```python
payload = {
    "iss": settings.OAUTH_ISSUER_URL,
    "sub": str(user.pk),
    "aud": audience,
    "scope": " ".join(sorted(scopes)),
    "iat": now,
    "nbf": now,
    "exp": now + lifetime_seconds,
    "jti": str(uuid.uuid4()),
}
```

The JWKS response exposes one OKP/Ed25519 public key with stable `kid`. `resource-token` accepts only `audience=ai-service`, `scope=ai:chat`, and `IsTeacherOrAdmin`. `token-exchange` accepts only a valid `aud=ai-service` token and emits `aud=qjudge-mcp`, `scope=mcp`, preserving `iss` and `sub`. Add `ai:chat` to `OAUTH2_PROVIDER.SCOPES` and Spectacular OAuth scopes.

- [ ] **Step 5: Implement local verification in AI Service**

```python
class JwtVerifier:
    def __init__(self, issuer: str, jwks_client: PyJWKClient) -> None:
        self._issuer = issuer.rstrip("/")
        self._jwks_client = jwks_client

    def verify(self, token: str, audience: str, required_scopes: frozenset[str]) -> Principal:
        signing_key = self._jwks_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["EdDSA"],
            issuer=self._issuer,
            audience=audience,
            options={"require": ["iss", "sub", "aud", "scope", "iat", "exp"]},
        )
        scopes = frozenset(str(claims["scope"]).split())
        if not required_scopes.issubset(scopes):
            raise AuthError("AI_SCOPE_DENIED", "Required scope is missing")
        return Principal(issuer=str(claims["iss"]), subject=str(claims["sub"]))
```

Translate malformed／expired／wrong-audience JWT failures to `AI_AUTH_INVALID`; never log the token.

Add `ResourceTokenAuthentication` before the existing opaque OAuth authentication class in DRF. It accepts only locally signed `aud=qjudge-mcp`, `scope=mcp` tokens, loads the Django user from `sub`, and leaves resource-level permission checks to the target view. Tokens with a non-JWT shape return `None` so existing MCP OAuth tokens continue through the opaque-token authentication class.

Replace MCP's remote-only verifier with `QJudgeTokenVerifier`: verify signed `aud=qjudge-mcp` JWTs locally from JWKS, and retain `DjangoTokenVerifier` only as fallback for existing opaque clients. The token is still forwarded to Django domain APIs, where `ResourceTokenAuthentication` resolves the original user and normal permission classes run.

- [ ] **Step 6: Run issuer and verifier tests**

Run:

```bash
cd backend && python -m pytest apps/oauth/tests/test_resource_tokens.py \
  apps/oauth/tests/test_resource_token_authentication.py apps/oauth/tests/test_metadata.py -v
cd ../ai-service && python -m pytest tests/unit/test_jwt_verifier.py -v
cd ../mcp-server && uv run pytest tests/test_server.py -v
```

Expected: PASS; OAuth metadata includes `ai:chat`, MCP JWTs resolve to the original Django user, wrong audience／scope is rejected, and opaque MCP clients retain the fallback path.

- [ ] **Step 7: Commit**

```bash
git add backend/config/settings/base.py backend/requirements/base.txt \
  backend/apps/oauth scripts/bootstrap_ai_oauth_keys.py \
  ai-service/pyproject.toml ai-service/requirements.txt \
  ai-service/infrastructure/oauth ai-service/tests/unit/test_jwt_verifier.py \
  mcp-server/config.py mcp-server/pyproject.toml mcp-server/uv.lock \
  mcp-server/server.py \
  mcp-server/tests/test_server.py
git commit -m "feat(auth): issue audience-scoped AI tokens"
```

### Task 6: Add Redis credential lease and mandatory MCP preflight

**Files:**
- Modify: `ai-service/pyproject.toml`
- Modify: `ai-service/requirements.txt`
- Modify: `ai-service/config.py`
- Modify: `ai-service/domain/ports.py`
- Create: `ai-service/application/credential_service.py`
- Create: `ai-service/infrastructure/mcp/__init__.py`
- Create: `ai-service/infrastructure/mcp/credential_lease.py`
- Create: `ai-service/infrastructure/mcp/token_exchange.py`
- Create: `ai-service/infrastructure/mcp/preflight.py`
- Modify: `ai-service/services/mcp_tool_provider.py`
- Create: `ai-service/tests/unit/test_credential_service.py`
- Create: `ai-service/tests/integration/test_credential_lease.py`
- Modify: `ai-service/tests/test_mcp_tool_provider.py`

**Interfaces:**
- Produces: `CredentialLeaseKey(value: str)`, `CredentialLease(subject_token: str, mcp_token: str, expires_at: datetime, scopes: frozenset[str])`.
- Produces: `RedisCredentialLeaseStore.get/put/delete`.
- Produces: `McpTokenExchangeClient.exchange(subject_token: str) -> ExchangedToken`.
- Produces: `McpPreflight.check(mcp_token: str) -> None`.
- Produces: `CredentialService.ensure_ready(principal: Principal, subject_token: str) -> CredentialLeaseKey`.

- [ ] **Step 1: Write deterministic-key and exchange tests**

```python
async def test_scope_does_not_create_another_lease_key(service, principal) -> None:
    first = await service.ensure_ready(principal, "ai-token-1")
    second = await service.ensure_ready(principal, "ai-token-2")
    assert first == second


async def test_expired_lease_is_exchanged_and_preflighted(
    service, exchange, preflight, principal
) -> None:
    key = await service.ensure_ready(principal, "fresh-ai-token")
    assert exchange.subject_tokens == ["fresh-ai-token"]
    assert preflight.tokens == ["mcp-token-from-exchange"]
    assert key.value.startswith("mcp:")


async def test_preflight_failure_does_not_return_a_lease(
    service, lease_store, preflight, principal
) -> None:
    preflight.error = McpUnavailable("connection refused")
    with pytest.raises(McpUnavailable):
        await service.ensure_ready(principal, "ai-token")
    assert await lease_store.list_keys() == []
```

- [ ] **Step 2: Verify tests fail before the lease service exists**

Run: `cd ai-service && python -m pytest tests/unit/test_credential_service.py tests/integration/test_credential_lease.py -v`

Expected: FAIL with missing `CredentialService`／`RedisCredentialLeaseStore`.

- [ ] **Step 3: Implement the bounded encrypted lease**

Add `redis[hiredis]>=5.0,<6.0` and `cryptography>=43,<46` to both AI Service dependency manifests.

Add settings:

```python
ai_redis_url: str = "redis://localhost:6379/2"
credential_lease_secret: str = Field(default="", min_length=32)
mcp_server_id: str = "qjudge"
mcp_token_exchange_url: str = "http://backend:8000/api/oauth/token-exchange/"
```

Derive one HMAC key and one Fernet key from `credential_lease_secret` using HKDF-SHA256 with distinct `info` values. Compute the Redis key as:

```python
identity = f"{principal.issuer}\0{principal.subject}\0{mcp_server_id}".encode()
digest = hmac.new(hmac_key, identity, hashlib.sha256).hexdigest()
redis_key = f"mcp:lease:{digest}"
```

The encrypted JSON value contains the current request's subject token, exchanged MCP token, `expires_at`, and granted scopes. Redis expiry is `max(1, floor(expires_at-now))`; do not create a database row or random credential ID.

- [ ] **Step 4: Make MCP preflight perform initialize and list_tools**

Add `MCPToolProvider.probe()` which enters the same Streamable HTTP connection, calls initialize, calls every page of `list_tools`, then closes without constructing LangChain tools. Map token exchange failures to `MCP_AUTH_FAILED`, connection/timeouts to `MCP_UNAVAILABLE`, initialize failures to `MCP_PROTOCOL_ERROR`, and malformed tools to `MCP_TOOL_DISCOVERY_FAILED`.

- [ ] **Step 5: Run lease, preflight and existing MCP provider tests**

Run: `cd ai-service && python -m pytest tests/unit/test_credential_service.py tests/integration/test_credential_lease.py tests/test_mcp_tool_provider.py -v`

Expected: PASS; Redis integration confirms the stored value is encrypted and expires no later than the MCP token.

- [ ] **Step 6: Commit**

```bash
git add ai-service/pyproject.toml ai-service/requirements.txt ai-service/config.py \
  ai-service/domain/ports.py \
  ai-service/application/credential_service.py ai-service/infrastructure/mcp \
  ai-service/services/mcp_tool_provider.py ai-service/tests/unit/test_credential_service.py \
  ai-service/tests/integration/test_credential_lease.py \
  ai-service/tests/test_mcp_tool_provider.py
git commit -m "feat(ai): require MCP credential readiness"
```

### Task 7: Move artifact ownership and tools into AI Service

**Files:**
- Modify: `ai-service/pyproject.toml`
- Modify: `ai-service/requirements.txt`
- Modify: `ai-service/config.py`
- Create: `ai-service/application/artifacts.py`
- Create: `ai-service/infrastructure/artifacts/__init__.py`
- Create: `ai-service/infrastructure/artifacts/s3_artifact_store.py`
- Modify: `ai-service/services/artifact_tools.py`
- Create: `ai-service/tests/unit/test_artifact_service.py`
- Create: `ai-service/tests/integration/test_artifact_repository.py`
- Modify: `ai-service/tests/test_artifact_tools.py`

**Interfaces:**
- Produces: `ArtifactService.put/list/get_content/get_download_url`.
- Produces: `S3ArtifactStore.put/get/presign`.
- Changes: `build_artifact_tools(session_id, run_id, artifact_service)`; removes `backend_base_url`, `internal_token`, and `shared_client`.

- [ ] **Step 1: Write deterministic storage-key and ownership tests**

```python
async def test_put_derives_object_key_from_only_session_and_artifact_id(
    artifact_service, principal, session
) -> None:
    artifact = await artifact_service.put(
        principal=principal,
        session_id=session.id,
        produced_by_run_id=None,
        step="rubric",
        filename="rubric.json",
        content=b"{}",
        content_type="application/json",
        metadata={},
    )
    assert artifact_service.store.keys == [
        f"ai-artifacts/{session.id}/{artifact.id}"
    ]


async def test_other_owner_cannot_download_artifact(
    artifact_service, principal_b, owned_artifact
) -> None:
    with pytest.raises(ArtifactNotFound):
        await artifact_service.get_content(principal_b, owned_artifact.id)
```

- [ ] **Step 2: Verify artifact tests fail before local ownership exists**

Run: `cd ai-service && python -m pytest tests/unit/test_artifact_service.py tests/integration/test_artifact_repository.py -v`

Expected: FAIL because `ArtifactService` and the AI artifact repository are absent.

- [ ] **Step 3: Implement metadata upsert and S3 adapter**

Add `boto3>=1.34,<2.0` to both manifests and move the existing endpoint／region／access-key／bucket settings from Django naming into AI Service settings. `put` locks or upserts on `(session_id, step, filename)` so repeated Agent writes preserve `artifact_id`; it computes SHA-256 and derives the object key without storing it in PostgreSQL. Validate `produced_by_run_id` belongs to the same session when present.

- [ ] **Step 4: Replace artifact HTTP callbacks with direct application calls**

```python
def build_artifact_tools(
    *,
    session_id: UUID | None,
    run_id: UUID | None,
    artifact_service: ArtifactService,
) -> list[BaseTool]:
    async def artifact_write(
        step: str | None = None,
        filename: str = "",
        content: str = "",
        content_type: str = "text/plain; charset=utf-8",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if session_id is None:
            return {"is_error": True, "detail": "session_id unavailable"}
        artifact = await artifact_service.put_for_run(
            session_id=session_id,
            run_id=run_id,
            step=step or "default",
            filename=filename,
            content=content.encode(),
            content_type=content_type,
            metadata=metadata or {},
        )
        return artifact.to_tool_payload()
```

Port all existing CSV／PDF helper behavior without changing tool names or returned payloads. Delete `_ARTIFACT_INTERNAL_PATH`, `_headers`, and every `httpx` call from `artifact_tools.py`.

- [ ] **Step 5: Run artifact service and complete existing tool suite**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/unit/test_artifact_service.py tests/integration/test_artifact_repository.py tests/test_artifact_tools.py -v`

Expected: PASS; an assertion scans `artifact_tools.py` and finds neither `httpx` nor `/api/v1/ai/_internal/artifacts`.

- [ ] **Step 6: Commit**

```bash
git add ai-service/pyproject.toml ai-service/requirements.txt ai-service/config.py \
  ai-service/application/artifacts.py ai-service/infrastructure/artifacts \
  ai-service/services/artifact_tools.py ai-service/tests/unit/test_artifact_service.py \
  ai-service/tests/integration/test_artifact_repository.py \
  ai-service/tests/test_artifact_tools.py
git commit -m "feat(ai): own artifact persistence"
```

### Task 8: Make the DeepAgent adapter consume authoritative IDs and local ports

**Files:**
- Create: `ai-service/infrastructure/agent/__init__.py`
- Create: `ai-service/infrastructure/agent/deepagent_adapter.py`
- Create: `ai-service/infrastructure/checkpoints/__init__.py`
- Create: `ai-service/infrastructure/checkpoints/langgraph_store.py`
- Modify: `ai-service/services/deepagent_runner.py`
- Modify: `ai-service/services/model_factory.py`
- Modify: `ai-service/tests/test_deepagent_runner_streaming.py`
- Create: `ai-service/tests/unit/test_deepagent_adapter.py`
- Create: `ai-service/tests/integration/test_checkpoint_identity.py`

**Interfaces:**
- Consumes: Task 6 MCP lease／provider and Task 7 artifact service.
- Produces: `DeepAgentAdapter.execute(command: AgentCommand) -> AsyncIterator[dict[str, Any]]`.
- Produces: `AgentCommand(run_id, session_id, operation, prompt, model_id, mcp_token, approval, answer)`.
- Produces: `LangGraphCheckpointStore.setup/delete_session/repair_cancelled_run`.
- Guarantees: `session_id == configurable.thread_id` and caller-provided `run_id` is the only run ID emitted.

- [ ] **Step 1: Add regression tests that forbid generated run and thread IDs**

```python
async def test_adapter_uses_domain_ids_for_run_and_checkpoint(
    adapter, fake_runner, fake_checkpoint_store
) -> None:
    command = AgentCommand(
        run_id=UUID("11111111-1111-4111-8111-111111111111"),
        session_id=UUID("22222222-2222-4222-8222-222222222222"),
        operation=AgentOperation.START,
        prompt="hello",
        model_id="deepseek-v4",
        mcp_token="mcp-token",
        approval=None,
        answer=None,
    )
    events = [event async for event in adapter.execute(command)]
    assert fake_runner.configurable == {
        "thread_id": str(command.session_id),
        "run_id": str(command.run_id),
    }
    assert {event["run_id"] for event in events} == {str(command.run_id)}
    assert fake_checkpoint_store.thread_ids == [str(command.session_id)]


def test_runner_source_does_not_generate_domain_ids() -> None:
    source = Path("services/deepagent_runner.py").read_text()
    assert "uuid.uuid4" not in source
    assert "uuid4(" not in source
```

- [ ] **Step 2: Verify the new adapter tests fail**

Run: `cd ai-service && python -m pytest tests/unit/test_deepagent_adapter.py tests/integration/test_checkpoint_identity.py -v`

Expected: FAIL because `AgentCommand`, `DeepAgentAdapter`, and `LangGraphCheckpointStore` do not exist.

- [ ] **Step 3: Move orchestration behind an application-facing adapter**

```python
@dataclass(frozen=True, slots=True)
class AgentCommand:
    run_id: UUID
    session_id: UUID
    operation: AgentOperation
    prompt: str | None
    model_id: str
    mcp_token: str
    approval: dict[str, Any] | None
    answer: str | None


class DeepAgentAdapter:
    async def execute(self, command: AgentCommand) -> AsyncIterator[dict[str, Any]]:
        async with self._mcp_provider.connect(command.mcp_token) as mcp_tools:
            tools = [
                *mcp_tools,
                *build_artifact_tools(
                    session_id=command.session_id,
                    run_id=command.run_id,
                    artifact_service=self._artifact_service,
                ),
            ]
            async for raw in self._runner.execute(
                command=command,
                tools=tools,
                configurable={
                    "thread_id": str(command.session_id),
                    "run_id": str(command.run_id),
                },
            ):
                yield {**adapt_agent_event(raw), "run_id": str(command.run_id)}
```

Keep event names and payloads compatible with the frontend reducer. Remove `backend_base_url`, `AI_SERVICE_INTERNAL_TOKEN`, arbitrary thread ID creation, and run ID creation from the runner. `resume`, `approve`, and `answer` must operate on the same `session_id` checkpoint and `run_id`; they must not create a second domain run.

- [ ] **Step 4: Put LangGraph checkpoint setup behind the AI database adapter**

`LangGraphCheckpointStore` must connect with `AI_DATABASE_URL`, set `search_path` to `ai_checkpoint`, call the supported Postgres checkpointer setup API, and accept only `session_id` as its public thread identifier. `delete_session` is called by `SessionService.clear_session`／`delete_session`; `repair_cancelled_run` clears pending interrupt state without inventing a replacement thread.

- [ ] **Step 5: Run all Agent, HITL, event and checkpoint tests**

Run:

```bash
cd ai-service
AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test \
python -m pytest \
  tests/unit/test_deepagent_adapter.py \
  tests/integration/test_checkpoint_identity.py \
  tests/test_deepagent_runner_streaming.py \
  tests/test_event_adapter.py \
  tests/test_hitl_middleware.py \
  tests/test_interrupt_state_adapter.py \
  tests/test_checkpoint_recovery_manager.py -v
```

Expected: PASS; repository search finds no generated domain identifier in the Agent runtime.

- [ ] **Step 6: Commit**

```bash
git add ai-service/infrastructure/agent ai-service/infrastructure/checkpoints \
  ai-service/services/deepagent_runner.py ai-service/services/model_factory.py \
  ai-service/tests/test_deepagent_runner_streaming.py \
  ai-service/tests/unit/test_deepagent_adapter.py \
  ai-service/tests/integration/test_checkpoint_identity.py
git commit -m "refactor(ai): make agent runtime use authoritative ids"
```

### Task 9: Implement idempotent run commands and same-session serialization

**Files:**
- Modify: `ai-service/domain/ports.py`
- Create: `ai-service/application/run_service.py`
- Create: `ai-service/infrastructure/queue/__init__.py`
- Create: `ai-service/infrastructure/queue/celery_dispatcher.py`
- Modify: `ai-service/infrastructure/database/repositories.py`
- Create: `ai-service/tests/unit/test_run_service.py`
- Create: `ai-service/tests/integration/test_run_queueing.py`

**Interfaces:**
- Produces: `RunService.start/get/cancel/approve/answer`.
- Produces: `RunDispatcher.dispatch(run_id: UUID, credential_lease_key: str | None, trace_context: TraceContext) -> None`; `None` is valid only for paused cancel-repair.
- Guarantees: command acceptance checks MCP readiness before state mutation; dispatch happens only after database commit.

- [ ] **Step 1: Write idempotency, queueing and paused-state safety tests**

```python
async def test_duplicate_idempotency_key_returns_the_same_run(
    run_service, principal, session, credential_service
) -> None:
    first = await run_service.start(
        principal, session.id, "hello", "deepseek-v4", "same-key", "ai-token"
    )
    second = await run_service.start(
        principal, session.id, "hello", "deepseek-v4", "same-key", "ai-token"
    )
    assert second.id == first.id
    assert run_service.dispatcher.run_ids == [first.id]


async def test_second_run_stays_queued_while_session_has_a_blocker(
    run_service, principal, session
) -> None:
    first = await run_service.start(
        principal, session.id, "one", "deepseek-v4", "key-1", "token"
    )
    await run_service.mark_running(first.id)
    second = await run_service.start(
        principal, session.id, "two", "deepseek-v4", "key-2", "token"
    )
    assert second.status is RunStatus.QUEUED
    assert run_service.dispatcher.run_ids == [first.id]


async def test_failed_answer_preflight_leaves_paused_run_unchanged(
    run_service, paused_run, credential_service
) -> None:
    credential_service.error = McpUnavailable("offline")
    with pytest.raises(McpUnavailable):
        await run_service.answer(paused_run.owner, paused_run.id, "yes", "token")
    assert (await run_service.get(paused_run.owner, paused_run.id)).status is RunStatus.AWAITING_USER_ANSWER
```

- [ ] **Step 2: Run the command tests and verify red**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/unit/test_run_service.py tests/integration/test_run_queueing.py -v`

Expected: FAIL because `RunService` and the dispatcher port are missing.

- [ ] **Step 3: Implement start inside a session lock**

```python
async def start(
    self,
    principal: Principal,
    session_id: UUID,
    prompt: str,
    model_id: str,
    idempotency_key: str,
    subject_token: str,
) -> Run:
    lease_key = await self._credentials.ensure_ready(principal, subject_token)
    dispatch_after_commit = False
    async with self._uow_factory() as uow:
        session = await uow.sessions.get_for_update(principal, session_id)
        existing = await uow.runs.get_by_idempotency_key(session.id, idempotency_key)
        if existing is not None:
            return existing
        run = await uow.runs.create_queued(session.id, model_id, idempotency_key)
        await uow.messages.append_pair(session, run.id, prompt)
        dispatch_after_commit = not await uow.runs.has_blocking_run(
            session.id, excluding=run.id
        )
    if dispatch_after_commit:
        await self._dispatcher.dispatch(run.id, lease_key.value, current_trace())
    return run
```

`append_pair` increments `SessionRow.next_message_ordinal` under the same lock and creates one user and one empty assistant Message. The Run row must not store their ordinals. Treat the database unique constraint as the final idempotency arbiter; on an `IntegrityError`, reload and return the existing run.

- [ ] **Step 4: Implement cancel, approval and answer command semantics**

- `cancel` sets `cancel_requested=true`; queued runs transition directly to `cancelled`, running runs stop cooperatively, and paused runs dispatch the same `run_id` once with cancel-repair mode and no credential lease so Worker can repair the checkpoint and append `run_cancelled` without MCP or LLM.
- `approve` accepts only `awaiting_approval`; `answer` accepts only `awaiting_user_answer`.
- Both call `CredentialService.ensure_ready` before changing the paused state, store the approval／answer command in `pause_payload`, set `kind=resume`, then transition to `queued` and dispatch the same `run_id`.
- `get` and event/history reads require owner joins but never call MCP readiness.
- Terminal completion asks the dispatcher for the oldest queued run in the same session after the terminal transaction commits.

- [ ] **Step 5: Run run-service and concurrency tests**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/unit/test_run_service.py tests/integration/test_run_queueing.py -v`

Expected: PASS; concurrent starts produce one blocker, duplicate keys produce one Run, and failed preflight does not advance HITL state.

- [ ] **Step 6: Commit**

```bash
git add ai-service/domain/ports.py ai-service/application/run_service.py \
  ai-service/infrastructure/queue ai-service/infrastructure/database/repositories.py \
  ai-service/tests/unit/test_run_service.py ai-service/tests/integration/test_run_queueing.py
git commit -m "feat(ai): add idempotent run command service"
```

### Task 10: Run the authoritative workflow in the AI Worker

**Files:**
- Modify: `ai-service/pyproject.toml`
- Modify: `ai-service/requirements.txt`
- Modify: `ai-service/config.py`
- Create: `ai-service/worker/__init__.py`
- Create: `ai-service/worker/celery_app.py`
- Create: `ai-service/worker/runtime.py`
- Create: `ai-service/worker/tasks.py`
- Create: `ai-service/worker/scheduler.py`
- Create: `ai-service/tests/unit/test_worker_runtime.py`
- Create: `ai-service/tests/integration/test_worker_delivery.py`
- Create: `ai-service/tests/integration/test_stale_recovery.py`

**Interfaces:**
- Produces: Celery task `ai.execute_run` with `task_id=str(run_id)`.
- Produces: `WorkerRuntime.execute(run_id, credential_lease_key: str | None, trace_context)`.
- Produces: periodic `recover_stale_runs` and `dispatch_unblocked_sessions` tasks.

- [ ] **Step 1: Write at-least-once, credential retry and recovery tests**

```python
async def test_duplicate_delivery_calls_agent_once(runtime, seeded_run, agent) -> None:
    await asyncio.gather(
        runtime.execute(seeded_run.id, "lease-key", TRACE),
        runtime.execute(seeded_run.id, "lease-key", TRACE),
    )
    assert agent.run_ids == [seeded_run.id]


async def test_mcp_401_forces_one_exchange_before_agent(runtime, lease, exchange, agent) -> None:
    lease.mcp_token = "expired"
    runtime.mcp.fail_tokens = {"expired"}
    await runtime.execute(runtime.run_id, lease.key, TRACE)
    assert exchange.calls == 1
    assert agent.mcp_tokens == ["replacement-token"]


async def test_unrecoverable_mcp_failure_never_calls_model(runtime, agent) -> None:
    runtime.mcp.error = McpUnavailable("offline")
    await runtime.execute(runtime.run_id, "lease-key", TRACE)
    assert agent.calls == []
    assert (await runtime.get_run()).error_code == "MCP_UNAVAILABLE"
```

Add integration cases for cooperative cancel plus checkpoint repair, worker crash leaving a stale `running` row, terminal dispatch of the next queued run, and usage accounting remaining unchanged on duplicate delivery.

- [ ] **Step 2: Verify Worker suites fail before the Worker exists**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/unit/test_worker_runtime.py tests/integration/test_worker_delivery.py tests/integration/test_stale_recovery.py -v`

Expected: FAIL with missing `worker.runtime` and `worker.scheduler` imports.

- [ ] **Step 3: Configure an AI-only Celery application**

Add Celery and Redis dependencies. Configure a dedicated queue and key namespace:

```python
celery_app = Celery("qjudge_ai")
celery_app.conf.update(
    broker_url=settings.ai_redis_url,
    result_backend=None,
    task_default_queue=settings.ai_queue_name,
    task_routes={"ai.*": {"queue": settings.ai_queue_name}},
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_transport_options={"global_keyprefix": settings.ai_queue_key_prefix},
    beat_schedule={
        "recover-stale-ai-runs": {
            "task": "ai.recover_stale_runs",
            "schedule": settings.stale_run_scan_seconds,
        },
        "dispatch-unblocked-ai-sessions": {
            "task": "ai.dispatch_unblocked_sessions",
            "schedule": settings.queue_reconcile_seconds,
        },
    },
)
```

Add `AI_CREDIT_SCALE_PER_CREDIT` to AI Service settings and apply it once when `usage_report` is projected onto Run. Do not import Django settings or register `backend.apps.ai.tasks`.

- [ ] **Step 4: Implement atomic claim and event consumption**

```python
async def execute(
    self,
    run_id: UUID,
    lease_key: str | None,
    trace: TraceContext,
) -> None:
    claim = await self._runs.claim_for_execution(run_id)
    if claim is None:
        return
    if claim.mode is ClaimMode.CANCEL_REPAIR:
        await self._checkpoints.repair_cancelled_run(claim.run.session_id)
        await self._runs.append_event(run_id, {"type": "run_cancelled"})
        await self._runs.dispatch_next_after_terminal(run_id)
        return
    try:
        if lease_key is None:
            raise McpAuthFailed("credential lease is missing")
        token = await self._credentials.worker_token(
            lease_key, retry_exchange_once=True
        )
        async for event in self._agent.execute(
            self._commands.for_run(claim.run, mcp_token=token)
        ):
            if await self._runs.cancel_requested(run_id):
                await self._checkpoints.repair_cancelled_run(claim.run.session_id)
                await self._runs.append_event(run_id, {"type": "run_cancelled"})
                return
            await self._runs.append_event(run_id, event)
    except McpError as error:
        await self._runs.append_event(run_id, error.to_failed_event())
    except Exception as error:
        await self._runs.append_event(
            run_id,
            {"type": "run_failed", "error_code": "AGENT_ERROR", "message": safe_message(error)},
        )
    finally:
        await self._runs.dispatch_next_after_terminal(run_id)
```

The synchronous Celery task calls `asyncio.run(runtime.execute(run_id, lease_key, trace_context))`; the runtime itself remains async and testable. `claim_for_execution` locks Session and Run. It returns normal execution only for `queued`, returns cancel-repair mode for a paused run with `cancel_requested=true`, and returns `None` for running, terminal, already-claimed, or non-cancelled paused delivery. It is the only code path that changes `queued` to `running`.

Normal execution starts an async heartbeat loop that updates `Run.heartbeat_at` every `AI_RUN_HEARTBEAT_SECONDS`, independent of Agent event arrival, and stops it in `finally`. This prevents a long model/tool call with no stream delta from being misclassified as a crashed Worker.

- [ ] **Step 5: Implement stale-run and lost-dispatch reconciliation**

The scheduler marks a `running` run failed only when its heartbeat is older than `AI_STALE_RUN_SECONDS`, then repairs the session checkpoint and dispatches the next queued run. It also dispatches the oldest queued run for sessions with no blocking run. This is operational recovery, not data cleanup: it must not delete sessions, events, messages, artifacts, or terminal runs.

- [ ] **Step 6: Run Worker suites and existing Agent tests**

Run:

```bash
cd ai-service
AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test \
python -m pytest tests/unit/test_worker_runtime.py \
  tests/integration/test_worker_delivery.py tests/integration/test_stale_recovery.py \
  tests/test_deepagent_runner_streaming.py tests/test_usage_accumulator.py -v
```

Expected: PASS; duplicate delivery executes the model once, usage is counted once, and no Django HTTP callback participates in run execution.

- [ ] **Step 7: Commit**

```bash
git add ai-service/pyproject.toml ai-service/requirements.txt ai-service/config.py \
  ai-service/worker ai-service/tests/unit/test_worker_runtime.py \
  ai-service/tests/integration/test_worker_delivery.py \
  ai-service/tests/integration/test_stale_recovery.py
git commit -m "feat(ai): run workflows in autonomous worker"
```

### Task 11: Expose the canonical FastAPI REST and persisted SSE API

**Files:**
- Modify: `ai-service/main.py`
- Create: `ai-service/api/__init__.py`
- Create: `ai-service/api/dependencies.py`
- Create: `ai-service/api/errors.py`
- Create: `ai-service/api/schemas.py`
- Create: `ai-service/api/routers/__init__.py`
- Create: `ai-service/api/routers/sessions.py`
- Create: `ai-service/api/routers/runs.py`
- Create: `ai-service/api/routers/artifacts.py`
- Create: `ai-service/api/routers/system.py`
- Create: `ai-service/tests/contract/test_openapi.py`
- Create: `ai-service/tests/contract/test_sse_contract.py`
- Create: `ai-service/tests/contract/snapshots/openapi.json`
- Create: `ai-service/scripts/export_openapi.py`
- Create: `ai-service/tests/integration/test_api_lifecycle.py`
- Modify: `ai-service/tests/test_api.py`

**Interfaces:**
- Produces all canonical `/v1` and `/health` routes in the design.
- Adds AI-owned compatibility-support routes `POST /v1/sessions/{session_id}/clear`, `GET /v1/runs?status=active`, `GET /v1/usage`, `GET /v1/artifacts/{artifact_id}/content`, and `GET /v1/artifacts/{artifact_id}/download`.
- Produces `ErrorEnvelope(code, message, retryable, request_id)` and stable OpenAPI snapshot.

- [ ] **Step 1: Write API lifecycle and MCP-failure availability tests**

```python
async def test_start_replay_and_complete(api_client, auth_header, fake_worker) -> None:
    session = await api_client.post("/v1/sessions", headers=auth_header, json={"context": {}})
    run = await api_client.post(
        f"/v1/sessions/{session.json()['session_id']}/runs",
        headers={**auth_header, "Idempotency-Key": "browser-message-1"},
        json={"message": "hello", "model_id": "deepseek-v4"},
    )
    await fake_worker.complete(UUID(run.json()["run_id"]), text="Hello")
    response = await api_client.get(
        f"/v1/runs/{run.json()['run_id']}/events?after=0",
        headers=auth_header,
    )
    assert "event: agent_message_delta" in response.text
    assert "event: run_completed" in response.text


async def test_mcp_failure_does_not_break_persistence_routes(
    api_client, auth_header, mcp_preflight
) -> None:
    mcp_preflight.error = McpUnavailable("offline")
    assert (await api_client.get("/v1/sessions", headers=auth_header)).status_code == 200
    assert (await api_client.get("/v1/models", headers=auth_header)).status_code == 200
    failed = await api_client.post(
        "/v1/sessions/11111111-1111-4111-8111-111111111111/runs",
        headers={**auth_header, "Idempotency-Key": "mcp-down"},
        json={"message": "hello", "model_id": "deepseek-v4"},
    )
    assert failed.status_code == 503
    assert failed.json()["error"]["code"] == "MCP_UNAVAILABLE"
```

- [ ] **Step 2: Write SSE ordering and reconnect contract tests**

Assert exact SSE frames: `id` equals event sequence, `event` equals stored `event_type`, `data` is the stored JSON payload, `after=2` starts at sequence 3, heartbeat is a comment frame, and terminal／paused events close the stream. Assert the stream never renumbers or projects a second event representation.

- [ ] **Step 3: Run API tests and verify red**

Run: `cd ai-service && AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test python -m pytest tests/integration/test_api_lifecycle.py tests/contract/test_sse_contract.py tests/contract/test_openapi.py -v`

Expected: FAIL because the canonical routers and error mapping are absent.

- [ ] **Step 4: Implement authenticated routers and consistent errors**

```python
def current_principal(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> Principal:
    return verifier.verify(
        credentials.credentials,
        audience="ai-service",
        required_scopes=frozenset({"ai:chat"}),
    )


@router.post("/sessions/{session_id}/runs", status_code=202)
async def start_run(
    session_id: UUID,
    body: StartRunRequest,
    principal: Principal = Depends(current_principal),
    token: str = Depends(current_bearer_token),
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1),
) -> RunResponse:
    return RunResponse.from_domain(
        await run_service.start(
            principal, session_id, body.message, body.model_id,
            idempotency_key, token,
        )
    )
```

Apply owner checks to every session, run, event, and artifact route. Map domain errors to the design's HTTP status and error code. Echo or create `X-Request-ID`; accept and preserve `traceparent`. List responses may use `{count,next,previous,results}` so the Django adapter does not need to synthesize pagination.

Rewrite `tests/test_api.py` as canonical route／validation／safe-error smoke coverage using dependency overrides for auth, repositories and dispatcher. Remove all `X-AI-Internal-Token`, `/api/chat/*`, request-process fake runner and arbitrary `thread_id` assertions.

- [ ] **Step 5: Implement persisted event replay and tail**

```python
async def persisted_events(run_id: UUID, after: int) -> AsyncIterator[bytes]:
    cursor = after
    while True:
        batch = await event_reader.list_after(run_id, cursor)
        for event in batch:
            cursor = event.sequence
            yield encode_sse(event)
            if event.closes_stream:
                return
        state = await run_reader.get(run_id)
        if state.is_closed_for_stream and not batch:
            return
        yield b": heartbeat\n\n"
        await asyncio.sleep(settings.sse_poll_seconds)
```

Set `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. Do not retry command POSTs in the API process.

- [ ] **Step 6: Add liveness, readiness, model and usage endpoints**

`/health/live` returns process health only. `/health/ready` checks AI DB, Redis queue connection and required settings, but not transient MCP connectivity. `/v1/models` uses the existing model registry. `/v1/usage` aggregates owned Run usage and exposes the legacy credit summary fields needed by the BFF.

- [ ] **Step 7: Snapshot and verify OpenAPI**

Run:

```bash
cd ai-service
python scripts/export_openapi.py --output tests/contract/snapshots/openapi.json
git diff -- tests/contract/snapshots/openapi.json
AI_TEST_DATABASE_URL=postgresql://qjudge_ai:qjudge_ai@localhost:5432/qjudge_ai_test \
python -m pytest tests/integration/test_api_lifecycle.py tests/contract/test_sse_contract.py tests/contract/test_openapi.py -v
```

Expected: the generated snapshot diff contains only intentionally approved API changes; the contract test independently regenerates the schema in memory and compares it byte-for-byte, and all suites PASS.

- [ ] **Step 8: Commit**

```bash
git add ai-service/main.py ai-service/api ai-service/scripts/export_openapi.py \
  ai-service/tests/contract \
  ai-service/tests/integration/test_api_lifecycle.py ai-service/tests/test_api.py
git commit -m "feat(ai): expose canonical API and persisted streams"
```

### Task 12: Replace Django AI ownership with a compatibility BFF client

**Files:**
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/ai/services/ai_service_client.py`
- Modify: `backend/apps/ai/views.py`
- Modify: `backend/apps/ai/artifact_views.py`
- Modify: `backend/apps/ai/serializers.py`
- Modify: `backend/apps/ai/urls.py`
- Create: `backend/apps/ai/tests/test_bff_contract.py`
- Create: `backend/apps/ai/tests/test_bff_sse.py`
- Create: `backend/apps/ai/tests/test_bff_permissions.py`

**Interfaces:**
- Produces: `AIServiceClient.request(method, path, user, request, json_body) -> httpx.Response`.
- Produces: `AIServiceClient.stream(path, user, request, query) -> Iterator[bytes]`.
- Preserves existing `/api/v1/ai/*` paths, response envelopes, permission behavior and SSE bytes.
- Consumes Task 5 token issuer and Task 11 canonical endpoints.

- [ ] **Step 1: Write consumer-contract tests using `httpx.MockTransport`**

```python
def test_create_run_maps_path_token_and_idempotency(
    api_client, teacher, ai_transport
) -> None:
    api_client.force_authenticate(teacher)
    ai_transport.respond_json(202, {"run_id": RUN_ID, "status": "queued"})
    response = api_client.post(
        f"/api/v1/ai/sessions/{SESSION_ID}/runs/",
        {"content": "hello", "model": "deepseek-v4"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="message-1",
    )
    upstream = ai_transport.requests[0]
    assert upstream.url.path == f"/v1/sessions/{SESSION_ID}/runs"
    assert upstream.headers["authorization"].startswith("Bearer ")
    assert upstream.headers["idempotency-key"] == "message-1"
    assert response.status_code == 202


def test_stream_proxy_returns_exact_upstream_bytes(
    api_client, teacher, ai_transport
) -> None:
    payload = b'id: 7\nevent: agent_message_delta\ndata: {"content":"hi"}\n\n'
    ai_transport.respond_stream(200, [payload[:17], payload[17:]])
    api_client.force_authenticate(teacher)
    response = api_client.get(
        f"/api/v1/ai/runs/{RUN_ID}/events/?after=6"
    )
    assert b"".join(response.streaming_content) == payload
```

- [ ] **Step 2: Run BFF tests and verify they fail against model-backed views**

Run: `cd backend && python -m pytest apps/ai/tests/test_bff_contract.py apps/ai/tests/test_bff_sse.py apps/ai/tests/test_bff_permissions.py -v`

Expected: FAIL because `AIServiceClient` and proxy views do not exist.

- [ ] **Step 3: Implement a narrow upstream client**

```python
class AIServiceClient:
    def headers_for(self, user, request) -> dict[str, str]:
        token = issue_resource_token(
            user,
            audience="ai-service",
            scopes=frozenset({"ai:chat"}),
            lifetime_seconds=settings.AI_ACCESS_TOKEN_SECONDS,
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Request-ID": request.request_id,
        }
        if traceparent := request.headers.get("traceparent"):
            headers["traceparent"] = traceparent
        return headers
```

Use one bounded timeout policy for JSON calls and no automatic retry for POST／stream calls. Convert upstream transport failures into the existing DRF error envelope with `AI_SERVICE_UNAVAILABLE`; preserve upstream `error.code`, `retryable`, and request ID when present. Never log access tokens or request bodies.

- [ ] **Step 4: Convert every legacy endpoint to path／envelope mapping only**

Map session list/create/detail/rename/clear/delete, active run list, run start/get/events/cancel/approval/answer, model list, credit summary, artifact list/upload/content/download. For `/sessions/credit/`, combine AI Service's read-only consumed usage with the entitlement already owned by Django's subscription/product domain; this is BFF response composition, not a second AI ledger. Add a contract test proving the consumed credit value comes from `/v1/usage` and no `UserAICredit` query occurs. Keep the current teacher/admin permission class in Django. Do not import Django AI models, call Celery, parse event JSON, aggregate message content, or access object storage.

- [ ] **Step 5: Verify raw streaming behavior and permission short-circuit**

Run: `cd backend && python -m pytest apps/ai/tests/test_bff_contract.py apps/ai/tests/test_bff_sse.py apps/ai/tests/test_bff_permissions.py -v`

Expected: PASS; unauthorized roles never create an upstream request, and streaming content is byte-for-byte equal across arbitrary chunk boundaries.

- [ ] **Step 6: Commit**

```bash
git add backend/config/settings/base.py backend/apps/ai/services/ai_service_client.py \
  backend/apps/ai/views.py backend/apps/ai/artifact_views.py \
  backend/apps/ai/serializers.py backend/apps/ai/urls.py \
  backend/apps/ai/tests/test_bff_contract.py backend/apps/ai/tests/test_bff_sse.py \
  backend/apps/ai/tests/test_bff_permissions.py
git commit -m "refactor(ai): proxy Django chat API to AI service"
```

### Task 13: Keep the Copilot transport compatible with AI-owned identifiers

**Files:**
- Modify: `frontend/src/core/copilot/copilot.types.ts`
- Modify: `frontend/src/core/types/chatbot.types.ts`
- Modify: `frontend/src/core/ports/chatbot.repository.ts`
- Modify: `frontend/src/infrastructure/api/repositories/chatbot.repository.ts`
- Modify: `frontend/src/infrastructure/api/repositories/chatbot.repository.test.ts`
- Modify: `frontend/src/infrastructure/api/repositories/artifact.repository.ts`
- Create: `frontend/src/infrastructure/api/repositories/artifact.repository.test.ts`
- Modify: `frontend/src/infrastructure/copilot/chatbotCopilotMapper.ts`
- Modify: `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts`
- Modify: `frontend/src/infrastructure/copilot/qJudgeCopilotTransport.test.ts`
- Modify: `frontend/src/shared/copilot/testing/copilotTransportContract.ts`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.tsx`
- Modify: `frontend/src/shared/copilot/react/CopilotProvider.test.tsx`

**Interfaces:**
- Consumes unchanged Django `/api/v1/ai/*` URLs.
- Changes repository DTO identity to `string | number | undefined`; public `ChatMessage.id` remains a string with canonical form `${sessionId}:${ordinal}`.
- Keeps public Copilot hooks, shells, full-page chat and embed chat behavior unchanged.
- Removes `thread_id`, `threadId`, and `deepagent_thread_id` from frontend contracts because `session_id` is authoritative.
- Produces one stable idempotency key per optimistic user message and reuses it across auth refresh／explicit retry.

- [ ] **Step 1: Add fixture-based transport tests for new response shapes**

```typescript
it("maps aggregate-scoped message ordinals to stable UI ids", async () => {
  server.use(
    http.get("*/api/v1/ai/sessions/:sessionId/", () =>
      HttpResponse.json({
        id: SESSION_ID,
        title: "Chat",
        messages: [
          { session_id: SESSION_ID, ordinal: 3, role: "assistant", content: "Hi" },
        ],
      }),
    ),
  );

  const session = await repository.getSession(SESSION_ID);
  expect(session.messages[0]?.id).toBe(`${SESSION_ID}:3`);
});


it("reconnects with the last persisted sequence", async () => {
  await repository.subscribeRunEvents(RUN_ID, 9, abort.signal, onEvent);
  expect(capturedUrl.searchParams.get("after")).toBe("9");
});


it("reuses the optimistic message id as the run idempotency key", async () => {
  vi.mocked(transport.startRun).mockRejectedValueOnce(new Error("offline"));
  await result.current.send({ text: "hello" });
  const firstInput = vi.mocked(transport.startRun).mock.calls[0]?.[0];
  expect(firstInput?.idempotencyKey).toBeTruthy();
  await result.current.retry();
  const secondInput = vi.mocked(transport.startRun).mock.calls[1]?.[0];
  expect(secondInput?.idempotencyKey).toBe(firstInput?.idempotencyKey);
});
```

Add contract cases for queued／running／paused／terminal run states, error envelopes, artifact response conversion and SSE event ordering.

- [ ] **Step 2: Run the focused transport suite and verify red**

Run: `cd frontend && npx vitest run src/infrastructure/api/repositories/chatbot.repository.test.ts src/infrastructure/api/repositories/artifact.repository.test.ts src/infrastructure/copilot/qJudgeCopilotTransport.test.ts`

Expected: FAIL on ordinal-only message fixtures or missing stable string IDs.

- [ ] **Step 3: Implement boundary-only normalization**

```typescript
const toMessageId = (message: BackendMessage): string | number => {
  if (message.id !== undefined) return message.id;
  return `${message.session_id}:${message.ordinal}`;
};
```

Return `String(toMessageId(message))` when constructing `ChatMessage`. Change optional `ChatRun.userMessageId`／`assistantMessageId` to `string | number`, and remove the mapper's numeric coercion. Delete the `run_started.thread_id` fallback and resolve the session only from the requested session／Run response. Do not introduce frontend `externalRunId`, `threadId`, `celeryTaskId`, or a second session identifier. Preserve immediate delta rendering, refresh skeleton timing, deferred session creation on first send, and both shells' existing behavior.

Add optional `idempotencyKey?: string` to `CopilotStartRunInput` and `SendMessageOptions` so existing public transport callers remain source-compatible. `CopilotProvider` always passes the optimistic user message ID through `createQJudgeCopilotTransport`; the QJudge transport generates one UUID only when a lower-level caller omitted it. Send the resulting value as the `Idempotency-Key` header in `chatbot.repository.startRun`. The HTTP client's one auth-refresh replay reuses the same `RequestInit`, so it also reuses the same header.

- [ ] **Step 4: Run Copilot dogfood gates**

Run:

```bash
cd frontend
npm run typecheck:copilot
npm run check:copilot-boundary
npm run check:copilot-dogfood
npm run test:copilot
```

Expected: all commands PASS; full-page and embed transports still depend only on the public Copilot boundary and repository ports.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/copilot/copilot.types.ts \
  frontend/src/core/types/chatbot.types.ts frontend/src/core/ports/chatbot.repository.ts \
  frontend/src/infrastructure/api/repositories/chatbot.repository.ts \
  frontend/src/infrastructure/api/repositories/chatbot.repository.test.ts \
  frontend/src/infrastructure/api/repositories/artifact.repository.ts \
  frontend/src/infrastructure/api/repositories/artifact.repository.test.ts \
  frontend/src/infrastructure/copilot/chatbotCopilotMapper.ts \
  frontend/src/infrastructure/copilot/qJudgeCopilotTransport.ts \
  frontend/src/infrastructure/copilot/qJudgeCopilotTransport.test.ts \
  frontend/src/shared/copilot/testing/copilotTransportContract.ts \
  frontend/src/shared/copilot/react/CopilotProvider.tsx \
  frontend/src/shared/copilot/react/CopilotProvider.test.tsx
git commit -m "test(copilot): dogfood AI service compatibility contract"
```

### Task 14: Deploy an independent AI database, API, Worker and scheduler

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `docker-compose.test.yml`
- Modify: `ai-service/Dockerfile`
- Create: `scripts/db/bootstrap-ai-database.sh`
- Modify: `scripts/deploy-prod.sh`
- Create: `ai-service/tests/contract/test_compose_boundaries.py`
- Create: `ai-service/tests/integration/test_database_credentials.py`

**Interfaces:**
- Produces PostgreSQL database／role `qjudge_ai`, one-shot `ai-migrate`, `ai-service`, `ai-worker`, and `ai-scheduler` services.
- Produces separate `AI_DATABASE_URL`, `AI_REDIS_URL`, `AI_QUEUE_NAME`, and credential-lease namespace.
- Guarantees Django credentials cannot connect to `qjudge_ai` and AI credentials cannot connect to `online_judge`.

- [ ] **Step 1: Write static Compose boundary assertions**

```python
def test_ai_processes_share_only_ai_credentials(compose_config) -> None:
    services = compose_config["services"]
    for name in ("ai-service", "ai-worker", "ai-scheduler"):
        environment = services[name]["environment"]
        keys = set(environment) if isinstance(environment, dict) else {
            item.split("=", 1)[0] for item in environment
        }
        assert "AI_DATABASE_URL" in keys
        assert "DATABASE_URL" not in keys
    for name in ("backend", "celery", "celery-high", "celery-beat"):
        environment = services[name].get("environment", {})
        keys = set(environment) if isinstance(environment, dict) else {
            item.split("=", 1)[0] for item in environment
        }
        assert "AI_DATABASE_URL" not in keys


def test_ai_worker_uses_dedicated_queue(compose_config) -> None:
    command = " ".join(compose_config["services"]["ai-worker"]["command"])
    assert "--queues=qjudge-ai" in command
    assert "backend.apps.ai.tasks" not in command


def test_runtime_waits_for_one_shot_ai_migration(compose_config) -> None:
    services = compose_config["services"]
    assert "alembic upgrade head" in " ".join(services["ai-migrate"]["command"])
    for name in ("ai-service", "ai-worker", "ai-scheduler"):
        assert services[name]["depends_on"]["ai-migrate"]["condition"] == "service_completed_successfully"
```

- [ ] **Step 2: Run the Compose contract and verify red**

Run: `cd ai-service && python -m pytest tests/contract/test_compose_boundaries.py -v`

Expected: FAIL because AI Worker／scheduler and independent database credentials are absent.

- [ ] **Step 3: Add idempotent database bootstrap for new and existing volumes**

`bootstrap-ai-database.sh` must run as `POSTGRES_ADMIN_USER`, while Django uses non-superuser `DB_USER` and AI processes use non-superuser `AI_DB_USER`. It uses `psql` conditional blocks to create both application roles and the `qjudge_ai` database only when absent. For an existing `online_judge` volume, transfer ownership of its application schemas, tables and sequences to `DB_USER` before revoking the former shared credential. Revoke public `CONNECT` on both application databases, grant each application role only its own database, and assert all three role names are distinct. It receives secrets through environment variables and must not print them. Replace the missing `scripts/init_db.sql` reference rather than keeping two bootstrap mechanisms. `scripts/deploy-prod.sh` must reject a superuser application credential or equal Django／AI usernames before deployment.

- [ ] **Step 4: Add API, Worker and scheduler services**

Use the same image but separate commands:

```yaml
ai-migrate:
  command: ["sh", "-c", "python -m alembic upgrade head && python -m infrastructure.checkpoints.langgraph_store setup"]
ai-service:
  command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
ai-worker:
  command: ["celery", "-A", "worker.celery_app:celery_app", "worker", "--queues=qjudge-ai", "--loglevel=INFO"]
ai-scheduler:
  command: ["celery", "-A", "worker.celery_app:celery_app", "beat", "--loglevel=INFO"]
```

All four AI processes receive only AI DB credentials. API／Worker／scheduler depend on successful `ai-migrate`; they never race migrations on startup. Backend receives `AI_SERVICE_URL` but no AI DB credential, and mounts the resource-token signing private key read-only; AI Service and MCP obtain only the public JWKS. `scripts/deploy-prod.sh` runs the idempotent OAuth key bootstrap before rendering Compose. Keep AI queue and credential lease prefixes distinct from Django Celery. In test Compose add PostgreSQL, Redis, fake OAuth／MCP／model adapters, AI API and AI Worker so integration tests do not call external models.

- [ ] **Step 5: Validate rendered configurations and live readiness**

Run:

```bash
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.dev.yml config --quiet
docker compose -f docker-compose.test.yml config --quiet
docker compose -f docker-compose.test.yml up -d postgres-test redis-test ai-db-bootstrap ai-migrate ai-service ai-worker
docker compose -f docker-compose.test.yml exec -T ai-service python -m alembic current
docker compose -f docker-compose.test.yml exec -T \
  -e AI_TO_DJANGO_TEST_URL=postgresql+psycopg://qjudge_ai:qjudge_ai@postgres-test:5432/test_oj_e2e \
  -e DJANGO_TO_AI_TEST_URL=postgresql+psycopg://qjudge_web:qjudge_web@postgres-test:5432/qjudge_ai_test \
  ai-service \
  python -m pytest tests/integration/test_database_credentials.py -v
curl --fail http://localhost:8001/health/ready
docker compose -f docker-compose.test.yml down --volumes
```

Expected: every config is valid, Alembic reports head, readiness returns 200, the AI role cannot connect to `online_judge`, the Django role cannot connect to `qjudge_ai`, and test teardown removes only the disposable test volumes.

- [ ] **Step 6: Commit**

```bash
git add .env.example docker-compose.yml docker-compose.dev.yml docker-compose.test.yml \
  ai-service/Dockerfile scripts/db/bootstrap-ai-database.sh scripts/deploy-prod.sh \
  ai-service/tests/contract/test_compose_boundaries.py \
  ai-service/tests/integration/test_database_credentials.py
git commit -m "feat(ai): deploy independent API worker and database"
```

### Task 15: Remove the second AI Service runtime surface

**Files:**
- Move: `ai-service/services/artifact_tools.py` → `ai-service/infrastructure/artifacts/tools.py`
- Move: `ai-service/services/mcp_tool_provider.py` → `ai-service/infrastructure/mcp/provider.py`
- Move: `ai-service/services/adapters/interrupt_state_adapter.py` → `ai-service/infrastructure/agent/interrupt_state_adapter.py`
- Move: `ai-service/services/policies/approval_policy.py` → `ai-service/infrastructure/agent/approval_policy.py`
- Move: `ai-service/services/runtime/checkpoint_recovery_manager.py` → `ai-service/infrastructure/agent/checkpoint_recovery_manager.py`
- Move: `ai-service/services/runtime/recursion_failure_handler.py` → `ai-service/infrastructure/agent/recursion_failure_handler.py`
- Move: `ai-service/services/runtime/usage_accumulator.py` → `ai-service/infrastructure/agent/usage_accumulator.py`
- Move: `ai-service/services/ask_user_tool.py` → `ai-service/infrastructure/agent/ask_user_tool.py`
- Move: `ai-service/services/event_adapter.py` → `ai-service/infrastructure/agent/event_adapter.py`
- Move: `ai-service/services/hitl_middleware.py` → `ai-service/infrastructure/agent/hitl_middleware.py`
- Move: `ai-service/services/model_factory.py` → `ai-service/infrastructure/agent/model_factory.py`
- Move: `ai-service/services/next_turn_tool.py` → `ai-service/infrastructure/agent/next_turn_tool.py`
- Move: `ai-service/services/tpm_gate.py` → `ai-service/infrastructure/agent/tpm_gate.py`
- Delete: `ai-service/services/deepagent_runner.py`
- Delete: `ai-service/services/__init__.py`
- Delete: `ai-service/services/adapters/__init__.py`
- Delete: `ai-service/services/policies/__init__.py`
- Delete: `ai-service/services/runtime/__init__.py`
- Delete: `ai-service/routers/chat.py`
- Delete: `ai-service/routers/__init__.py`
- Delete: `ai-service/models/schemas.py`
- Delete: `ai-service/models/__init__.py`
- Delete: `ai-service/tests/test_auth_chain.py`
- Modify: `ai-service/infrastructure/agent/deepagent_adapter.py`
- Modify: `ai-service/infrastructure/artifacts/tools.py`
- Modify: `ai-service/infrastructure/mcp/provider.py`
- Modify: `ai-service/tests/test_artifact_tools.py`
- Modify: `ai-service/tests/test_checkpoint_recovery_manager.py`
- Move: `ai-service/tests/test_deepagent_runner_config.py` → `ai-service/tests/test_deepagent_adapter_config.py`
- Move: `ai-service/tests/test_deepagent_runner_streaming.py` → `ai-service/tests/test_deepagent_adapter_streaming.py`
- Modify: `ai-service/tests/test_event_adapter.py`
- Modify: `ai-service/tests/test_hitl_middleware.py`
- Modify: `ai-service/tests/test_interrupt_state_adapter.py`
- Modify: `ai-service/tests/test_mcp_tool_provider.py`
- Modify: `ai-service/tests/test_model_factory.py`
- Modify: `ai-service/tests/test_recursion_failure_handler.py`
- Modify: `ai-service/tests/test_tpm_gate.py`
- Modify: `ai-service/tests/test_usage_accumulator.py`
- Create: `ai-service/tests/contract/test_internal_boundaries.py`

**Interfaces:**
- Keeps exactly one HTTP surface: `ai-service/api/*` mounted by `main.py`.
- Keeps exactly one orchestration adapter: `infrastructure.agent.deepagent_adapter.DeepAgentAdapter` called by Worker.
- Removes old `/api/chat/stream`, `/api/chat/resume`, `/api/chat/answer`, raw SSE generation and legacy request DTOs.
- Enforces `api / worker → application → domain` and `infrastructure → domain ports` without compatibility imports.

- [ ] **Step 1: Write the source-boundary regression test**

```python
def test_legacy_runtime_packages_are_absent() -> None:
    root = Path(__file__).resolve().parents[2]
    forbidden = [
        *list((root / "services").rglob("*.py")),
        root / "routers" / "chat.py",
        root / "models" / "schemas.py",
    ]
    assert [str(path.relative_to(root)) for path in forbidden if path.exists()] == []


def test_main_mounts_only_canonical_routers() -> None:
    source = Path("main.py").read_text()
    assert "routers.chat" not in source
    assert 'prefix="/api/chat"' not in source
    for module in ("sessions", "runs", "artifacts", "system"):
        assert f"api.routers.{module}" in source


def test_domain_and_application_do_not_import_io_frameworks() -> None:
    forbidden = ("fastapi", "sqlalchemy", "celery", "redis", "boto3", "mcp")
    violations = scan_python_imports(
        roots=[Path("domain"), Path("application")],
        forbidden_top_level=forbidden,
    )
    assert violations == []
```

- [ ] **Step 2: Verify the boundary test fails on the current compatibility tree**

Run: `cd ai-service && python -m pytest tests/contract/test_internal_boundaries.py -v`

Expected: FAIL and report `services`, `routers/chat.py`, and `models/schemas.py`.

- [ ] **Step 3: Move reusable adapters without compatibility shims**

Use `git mv` for the listed reusable modules, flatten the single-file `adapters`／`policies`／`runtime` directories into `infrastructure/agent`, and update imports in production and tests. `DeepAgentAdapter` imports artifact tools from `infrastructure.artifacts.tools` and MCP transport from `infrastructure.mcp.provider`. Do not leave re-export modules under `services`; they would preserve the forbidden second ownership path.

- [ ] **Step 4: Delete the old request-time streaming API**

Delete `routers/chat.py`, `models/schemas.py`, and `services/deepagent_runner.py` after their tests point at `DeepAgentAdapter` and canonical Pydantic schemas. Confirm `main.py` creates dependencies once per process and mounts only Task 11 routers. The API process must never call the model runner; only `worker/runtime.py` may invoke `DeepAgentAdapter.execute`.

- [ ] **Step 5: Run all moved-module and boundary suites**

Run:

```bash
cd ai-service
python -m pytest tests/contract/test_internal_boundaries.py \
  tests/test_artifact_tools.py tests/test_checkpoint_recovery_manager.py \
  tests/test_deepagent_adapter_config.py tests/test_deepagent_adapter_streaming.py \
  tests/test_event_adapter.py tests/test_hitl_middleware.py \
  tests/test_interrupt_state_adapter.py tests/test_mcp_tool_provider.py \
  tests/test_model_factory.py tests/test_recursion_failure_handler.py \
  tests/test_tpm_gate.py tests/test_usage_accumulator.py -v
! rg -n "/api/chat/(stream|resume|answer)|from services|import services" \
  main.py api application domain infrastructure worker
```

Expected: PASS; no compatibility import or request-process Agent execution path remains.

- [ ] **Step 6: Commit**

```bash
git add -A ai-service/services ai-service/routers ai-service/models \
  ai-service/infrastructure ai-service/tests
git commit -m "refactor(ai): remove legacy runtime surface"
```

### Task 16: Drop legacy Django AI tables and enforce single ownership

**Files:**
- Create: `backend/apps/ai/migrations/0019_drop_ai_domain_models.py`
- Modify: `backend/apps/ai/models.py`
- Modify: `backend/apps/ai/apps.py`
- Delete: `backend/apps/ai/admin.py`
- Delete: `backend/apps/ai/tasks.py`
- Delete: `backend/apps/ai/signals.py`
- Delete: `backend/apps/ai/credits.py`
- Delete: `backend/apps/ai/middleware.py`
- Delete: `backend/apps/ai/services/run_runtime.py`
- Delete: `backend/apps/ai/services/stream_proxy.py`
- Delete: `backend/apps/ai/services/stream_response.py`
- Delete: `backend/apps/ai/services/artifact_storage.py`
- Delete: `backend/apps/ai/tests/test_artifact_cleanup.py`
- Delete: `backend/apps/ai/tests/test_artifacts_api.py`
- Delete: `backend/apps/ai/tests/test_credit_endpoint.py`
- Delete: `backend/apps/ai/tests/test_credits.py`
- Delete: `backend/apps/ai/tests/test_durable_runs.py`
- Delete: `backend/apps/ai/tests/test_message_persistence.py`
- Delete: `backend/apps/ai/tests/test_pricing_alignment.py`
- Delete: `backend/apps/ai/tests/test_session_access_control.py`
- Delete: `backend/apps/ai/tests/test_session_creation.py`
- Delete: `backend/apps/ai/tests/test_session_management.py`
- Delete: `backend/apps/ai/tests/test_stream_proxy.py`
- Create: `backend/apps/ai/tests/test_boundary.py`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/settings/prod.py`
- Modify: `backend/config/settings/test.py`
- Modify: `backend/apps/ai/tests/test_model_contract.py`

**Interfaces:**
- Keeps `backend.apps.ai` installed only for historical migrations, URLs, permissions and BFF adapter.
- Removes Django models, tasks, beat schedule, stale recovery, credit accounting, artifact storage and internal-token ownership.
- Guarantees migration works from both revision `0018` and a fresh database.

- [ ] **Step 1: Write the ownership boundary test before deleting runtime code**

```python
def test_django_ai_app_is_only_a_bff() -> None:
    root = Path(__file__).resolve().parents[1]
    forbidden_paths = {
        "tasks.py", "admin.py", "signals.py", "credits.py", "middleware.py",
        "services/run_runtime.py", "services/stream_proxy.py",
        "services/stream_response.py", "services/artifact_storage.py",
    }
    assert all(not (root / path).exists() for path in forbidden_paths)

    source = "\n".join(
        path.read_text()
        for path in (root / "views.py", root / "artifact_views.py", root / "serializers.py")
    )
    for symbol in (
        "AISession", "AIMessage", "AIChatRun", "AIStreamEvent",
        "AIExecutionLog", "UserAICredit", "AIArtifact", "shared_task",
        "AsyncResult", "AI_SERVICE_INTERNAL_TOKEN",
    ):
        assert symbol not in source
```

- [ ] **Step 2: Run the boundary test and verify it identifies the legacy runtime**

Run: `cd backend && python -m pytest apps/ai/tests/test_boundary.py -v`

Expected: FAIL listing existing Django model／task／stream ownership.

- [ ] **Step 3: Generate and inspect the final Django schema migration**

The migration depends on `0018_cleanup_legacy_model_ids` and deletes models in dependency order:

```python
operations = [
    migrations.DeleteModel(name="AIStreamEvent"),
    migrations.DeleteModel(name="AIArtifact"),
    migrations.DeleteModel(name="AIChatRun"),
    migrations.DeleteModel(name="AIExecutionLog"),
    migrations.DeleteModel(name="AIMessage"),
    migrations.DeleteModel(name="UserAICredit"),
    migrations.DeleteModel(name="AISession"),
]
```

Keep migrations `0001`–`0018`; new installations must still build historical state before `0019` removes it. Do not create a data-copy operation.

- [ ] **Step 4: Remove active legacy ownership and schedules**

Leave `models.py` with a module docstring explaining that AI data is owned by AI Service. Remove the `AppConfig.ready()` signals import, Django Beat entries for AI stale-run recovery, AI artifact cleanup and any Django Celery route for AI execution. Delete `AI_SERVICE_INTERNAL_TOKEN`, `AI_CREDIT_SCALE_PER_CREDIT`, and Django-owned artifact storage settings once no remaining caller uses them. Keep permissions, URLs, proxy serializers, BFF client and BFF tests.

- [ ] **Step 5: Verify migration from old state and from empty state**

Run:

```bash
cd backend
python manage.py migrate ai 0018
python manage.py migrate ai 0019
python manage.py migrate ai zero
python manage.py migrate ai 0019
python manage.py makemigrations --check --dry-run
python -m pytest apps/ai/tests/test_boundary.py apps/ai/tests/test_bff_contract.py \
  apps/ai/tests/test_bff_sse.py apps/ai/tests/test_bff_permissions.py \
  apps/ai/tests/test_model_contract.py -v
```

Expected: both migration paths succeed, `makemigrations` reports no changes, and only BFF／contract tests remain active.

- [ ] **Step 6: Run a repository-wide legacy ownership scan**

Run:

```bash
! rg -n "AIChatRun|AIStreamEvent|AIExecutionLog|UserAICredit|AIArtifact|run_ai_chat|recover_stale_ai|AI_SERVICE_INTERNAL_TOKEN" \
  backend --glob '!apps/ai/migrations/**' --glob '!apps/ai/tests/test_boundary.py'
! rg -n "_internal/artifacts|backend_base_url|DJANGO_DATABASE_URL|online_judge" ai-service \
  --glob '!tests/**'
```

Expected: both commands exit successfully because no forbidden active ownership remains.

- [ ] **Step 7: Commit**

```bash
git add -A backend/apps/ai backend/config/settings/base.py \
  backend/config/settings/prod.py backend/config/settings/test.py
git commit -m "refactor(ai): retire Django AI runtime ownership"
```

### Task 17: Add release gates, observability and end-to-end cutover verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/e2e-manual.yml`
- Modify: `ai-service/pyproject.toml`
- Modify: `ai-service/requirements.txt`
- Create: `ai-service/observability.py`
- Modify: `ai-service/main.py`
- Modify: `ai-service/worker/runtime.py`
- Modify: `ai-service/infrastructure/mcp/preflight.py`
- Modify: `backend/apps/ai/services/ai_service_client.py`
- Create: `ai-service/tests/unit/test_observability.py`
- Create: `ai-service/tests/contract/test_architecture_boundary.py`
- Create: `frontend/tests/e2e/chat-ai-service-independence.e2e.spec.ts`
- Create: `docs/architecture/ai-service.md`
- Create: `docs/runbooks/ai-service-cutover.md`
- Modify: `README.md`

**Interfaces:**
- Produces AI unit／integration／contract CI jobs and full-stack chat E2E.
- Produces structured logs, propagated correlation context and named metrics from the design.
- Produces cutover／rollback runbook without a data migration or zero-downtime promise.

- [ ] **Step 1: Write observability and architecture gate tests**

```python
def test_sensitive_fields_are_redacted(structured_logger, caplog) -> None:
    structured_logger.info(
        "run accepted",
        access_token="secret-token",
        prompt="private prompt",
        request_id="req-1",
        run_id="11111111-1111-4111-8111-111111111111",
    )
    rendered = caplog.text
    assert "secret-token" not in rendered
    assert "private prompt" not in rendered
    assert "req-1" in rendered


def test_runtime_layers_follow_dependency_direction() -> None:
    violations = scan_imports(
        root=Path.cwd(),
        rules={
            "domain": {"fastapi", "sqlalchemy", "celery", "redis", "boto3", "mcp"},
            "application": {"fastapi", "sqlalchemy", "celery", "boto3"},
        },
    )
    assert violations == []
```

The boundary test also fails on a Django AI model/task/runtime reference, a frontend direct AI Service URL, an AI Service Django database reference, more than the three allowed global UUID field names, or a main runtime import of test adapters.

- [ ] **Step 2: Verify new gates fail before instrumentation and CI wiring**

Run: `cd ai-service && python -m pytest tests/unit/test_observability.py tests/contract/test_architecture_boundary.py -v`

Expected: FAIL because the observability module and boundary scanner are absent.

- [ ] **Step 3: Add correlation context and service metrics**

Add `prometheus-client>=0.21,<1.0` to both AI Service dependency manifests.

Propagate `X-Request-ID` and `traceparent` from Django to AI API, serialize them into Celery task headers, restore them in Worker context, and forward them to MCP. Structured JSON logs include service, version, environment, request ID, trace ID, session ID, run ID, safe issuer／subject hash, MCP server ID and error code. Redact tokens, prompts and artifact content.

Expose or register these metric names with bounded labels:

```text
ai_runs{status}
ai_worker_pickup_seconds
ai_run_duration_seconds{terminal_status}
ai_mcp_failures_total{code}
ai_sse_subscribers
ai_sse_reconnects_total
ai_stale_runs_total
ai_token_usage_total{model,direction}
ai_gateway_upstream_seconds{method,status_class}
ai_gateway_upstream_failures_total{code}
```

Add DB／Redis pool saturation from their supported client instrumentation; never use `session_id`, `run_id`, subject, prompt, or filename as metric labels.

- [ ] **Step 4: Add AI Service CI and contract snapshot checks**

The AI job starts PostgreSQL and Redis services, creates `qjudge_ai_test`, runs `alembic upgrade head`, then runs:

```bash
cd ai-service
python -m ruff check .
python -m pytest -v
```

Add separate Django BFF, frontend Copilot transport, MCP schema and Compose boundary steps. OpenAPI snapshot changes must appear in the diff and pass the breaking-change checker; CI must not regenerate and silently accept the snapshot.

- [ ] **Step 5: Add the full-stack browser smoke suite**

`chat-ai-service-independence.e2e.spec.ts` uses only local fake model responses and covers:

1. first message creates the session and streams deltas before completion;
2. refresh shows skeleton until session and active run hydration finish;
3. event reconnect resumes from the last sequence without duplicated text;
4. ask-user and approval can remain paused, then resume the same `run_id`;
5. MCP failure shows retryable run-operation failure while session history remains readable;
6. cross-user session access is rejected;
7. full-page and embed shells both use the Django BFF route;
8. no page-level double scrollbar or width overflow is introduced.

- [ ] **Step 6: Write the architecture and beta cutover runbook**

`docs/architecture/ai-service.md` records ownership, the three global UUIDs, API／Worker separation, OAuth audiences, MCP requirement, and why Django remains the temporary BFF. `docs/runbooks/ai-service-cutover.md` gives executable steps in this order:

1. back up old beta AI tables only if debugging history is desired;
2. bootstrap AI database／credential;
3. run AI Alembic and checkpoint setup;
4. start AI API／Worker／scheduler and check readiness;
5. pause AI command traffic;
6. apply Django migration `0019` and switch BFF settings;
7. run contract and browser smoke suites;
8. resume AI command traffic;
9. rollback application images and restore the optional beta dump only if the team explicitly chooses to recover beta data.

State explicitly that the cutover allows downtime and implements no retention, TTL, auto-cleanup or import pipeline.

- [ ] **Step 7: Run the full release gate**

Run:

```bash
cp .env.example .env
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.dev.yml config --quiet
docker compose -f docker-compose.test.yml config --quiet
docker compose -f docker-compose.test.yml up -d --build
trap 'docker compose -f docker-compose.test.yml down --volumes' EXIT
docker compose -f docker-compose.test.yml exec -T ai-service \
  sh -c 'python -m ruff check . && python -m pytest -v'
docker compose -f docker-compose.test.yml exec -T backend-test \
  sh -c 'python manage.py makemigrations --check --dry-run && python -m pytest -v'
docker compose -f docker-compose.test.yml exec -T frontend-test \
  sh -c 'npm run lint && npm run build && npm run typecheck:copilot && npm run check:copilot-boundary && npm run check:copilot-dogfood && npm run test:copilot'
cd mcp-server && uv run pytest -v && cd ..
cd frontend && npx playwright test -c playwright.config.e2e.ts \
  tests/e2e/chat-ai-service-independence.e2e.spec.ts && cd ..
docker compose -f docker-compose.test.yml down --volumes
trap - EXIT
```

Expected: every command exits 0. The E2E trace demonstrates one authoritative AI Worker execution, byte-preserving Django SSE proxying, immediate frontend deltas, stable refresh hydration and same-run HITL resume.

- [ ] **Step 8: Inspect final ownership and schema invariants**

Run:

```bash
rg -n "session_id|run_id|artifact_id" ai-service/domain ai-service/api
! rg -n "external_run_id|celery_task_id|thread_id\s*=|tenant_id|UsageLedger|ExecutionLog|Credential.*Row" \
  ai-service/domain ai-service/application ai-service/infrastructure/database ai-service/api
! rg -n "AIChatRun|AIStreamEvent|AIExecutionLog|UserAICredit|AIArtifact|shared_task" \
  backend/apps/ai --glob '!migrations/**' --glob '!tests/test_boundary.py'
! rg -n "httpx|requests|/api/chat/stream|/api/chat/resume|/api/chat/answer" \
  backend/apps/ai --glob '!services/ai_service_client.py' --glob '!tests/**'
```

Expected: only the three authoritative IDs are public, prohibited duplicate identifiers／tables are absent, Django has no active AI runtime, and its only upstream HTTP client is the BFF adapter.

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/e2e-manual.yml \
  ai-service/pyproject.toml ai-service/requirements.txt ai-service/observability.py \
  ai-service/main.py ai-service/worker/runtime.py \
  ai-service/infrastructure/mcp/preflight.py \
  ai-service/tests/unit/test_observability.py \
  ai-service/tests/contract/test_architecture_boundary.py \
  backend/apps/ai/services/ai_service_client.py \
  frontend/tests/e2e/chat-ai-service-independence.e2e.spec.ts \
  docs/architecture/ai-service.md docs/runbooks/ai-service-cutover.md README.md
git commit -m "chore(ai): enforce independent service release gates"
```
