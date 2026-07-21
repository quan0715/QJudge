# Exam Integrity Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace distributed browser/Celery anti-cheat arbitration with one manually managed Integrity Worker per exam, durable browser outbox delivery, incident-only screen/webcam evidence, and scoped Backend business commands.

**Architecture:** The existing Backend remains the only public authenticated gateway and PostgreSQL writer. It proxies five-second batches to a private per-exam Worker, which ACKs only after appending to its run volume, evaluates a frozen registry/policy snapshot, and archives compressed segments to object storage. A dedicated Controller is the only service with Docker control; Frontend detectors emit sequenced signals into IndexedDB and keep rolling media chunks in OPFS.

**Tech Stack:** Django 4.2, Django REST Framework, PostgreSQL 15, Redis 7, FastAPI, Pydantic 2, httpx, Docker SDK for Python, boto3/S3-compatible object storage, React 19, TypeScript 5.9, IndexedDB, OPFS, MediaRecorder, Vitest, pytest, Docker Compose, Locust.

**Approved Design:** `docs/superpowers/specs/2026-07-21-exam-integrity-worker-design.md`

## Global Constraints

- Preserve every unrelated user change in the dirty worktree; stage only files named by the current task.
- Use direct cutover. Do not add a contest feature flag, shadow mode, or dual anti-cheat owner.
- Support 200 students per exam and one event batch every 5 seconds.
- The Browser deletes no sequenced record until `acked_through_seq` covers it.
- The Backend returns no ACK until the Worker has flushed the batch to its run-scoped journal.
- Do not create `ExamIntegrityEventBatch`, `ExamIntegrityClientSession`, or `ExamIntegrityCommand` tables.
- Add only `ExamIntegrityRun` and `ExamEvidenceChunk` tables; retain `ExamEvent` as the normalized incident/event store.
- The Worker must never import Django or connect to PostgreSQL.
- Redis may cache live state but must not be the only source for ACKed raw data, registry/policy snapshots, normalized events, archive manifests, or evidence metadata.
- Run lifecycle is `STOPPED -> STARTING -> RUNNING -> STOPPING -> STOPPED -> DESTROYED`.
- Health is only `healthy` or `unhealthy`; non-fatal conditions are warning codes.
- Scheduled exam end triggers auto-submit but never auto-stops the Worker.
- First version has no auto-submit fallback.
- Screen/webcam recording is enabled only by the frozen contest policy.
- Never upload full-exam media. Upload only retained incident windows, defaulting to 10 seconds before and 10 seconds after the anchor.
- Media bytes go directly from Browser to object storage using presigned URLs.
- Use source-level sampling only. Frontend must not perform semantic dedupe, incident grouping, priority arbitration, or authoritative grace/action decisions.
- Late events are audit/evidence-only and must not roll participant/submission state backward.
- New normal event plugins must not change outbox, transport, journal, Controller, lifecycle, archive, or Internal API core.
- Follow QJudge frontend import direction: `features -> shared/core/infrastructure`, `infrastructure -> core`, `core -> core`.
- Use the QJudge Compose wrapper for backend/frontend service commands.
- End every task with focused tests and a small commit.

## Locked File Structure

| Area | Files and responsibility |
| --- | --- |
| Backend models | `backend/apps/contests/models/integrity.py` owns the two new models; `monitoring.py` keeps normalized events/legacy frames |
| Backend registry | `backend/apps/contests/integrity/registry.py` is the canonical registry source serialized into Run snapshots |
| Backend services | `services/integrity_runs.py` lifecycle; `integrity_tokens.py` opaque tokens; `integrity_commands.py` business commands; `integrity_evidence.py` evidence projection |
| Backend infrastructure | `infrastructure/integrity_controller_client.py` and `integrity_worker_client.py` own external HTTP/signing I/O |
| Backend API | `integrity_serializers.py`, `views/integrity_runs.py`, `views/integrity_internal.py`; `views/exam_integrity.py` owns student batch/chunk actions |
| New service core | `integrity-service/integrity_service/core` contains only schemas, registry interpretation, sequence, incident, connectivity, and scheduling logic |
| Worker adapters | `integrity_service/journal` owns filesystem journal/archive; `integrity_service/worker` owns FastAPI, Backend client, and composition |
| Controller adapters | `integrity_service/controller` owns FastAPI and Docker SDK calls |
| Frontend core | `frontend/src/core/entities/examIntegrity.entity.ts` and `core/ports/examIntegrity.port.ts` define stable contracts |
| Frontend infrastructure | `infrastructure/browser/integrity` owns IndexedDB/OPFS/MediaRecorder; `infrastructure/api/repositories/examIntegrity.repository.ts` owns HTTP |
| Frontend feature | `features/contest/anticheat/integrity` owns runtime composition/hooks; existing detector hooks only emit signals |
| Admin UI | `IntegrityRunControlCard.tsx` is embedded in the existing `AdminProctoringPanel` |

---

### Task 1: Add the PostgreSQL Integrity Schema

**Files:**
- Create: `backend/apps/contests/models/integrity.py`
- Modify: `backend/apps/contests/models/monitoring.py`
- Modify: `backend/apps/contests/models/__init__.py`
- Modify: `backend/apps/contests/admin.py`
- Create: `backend/apps/contests/migrations/0090_exam_integrity_models.py`
- Create: `backend/apps/contests/tests/models/test_exam_integrity_models.py`

**Interfaces:**
- Consumes: Existing `Contest`, `ContestParticipant`, `ExamEvent`, user model, and object-storage metadata conventions.
- Produces: `ExamIntegrityRun`, `ExamEvidenceChunk`, and nullable normalized-event integrity fields used by all later tasks.

- [ ] **Step 1: Write the failing model contract tests**

```python
from django.db import models

from apps.contests.models import ExamEvent, ExamEvidenceChunk, ExamIntegrityRun


def test_integrity_run_state_contract():
    assert set(ExamIntegrityRun.ComputeState.values) == {
        "stopped", "starting", "running", "stopping", "destroyed",
    }
    assert set(ExamIntegrityRun.Health.values) == {"healthy", "unhealthy"}
    assert set(ExamIntegrityRun.DataState.values) == {"open", "archived", "purged"}
    assert ExamIntegrityRun._meta.get_field("policy_snapshot").get_internal_type() == "JSONField"
    assert ExamIntegrityRun._meta.get_field("registry_snapshot").get_internal_type() == "JSONField"
    assert ExamIntegrityRun._meta.get_field("metrics").get_internal_type() == "JSONField"
    assert any(
        constraint.name == "uniq_live_integrity_run_per_contest"
        for constraint in ExamIntegrityRun._meta.constraints
    )


def test_integrity_schema_adds_only_two_new_tables():
    assert ExamIntegrityRun._meta.db_table == "exam_integrity_runs"
    assert ExamEvidenceChunk._meta.db_table == "exam_evidence_chunks"
    assert ExamEvent._meta.get_field("integrity_run").remote_field.model is ExamIntegrityRun
    assert ExamEvent._meta.get_field("integrity_command_id").unique is True
    assert not ExamEvent._meta.get_field("event_type").choices


def test_evidence_chunk_is_video_chunk_not_legacy_frame():
    field_names = {field.name for field in ExamEvidenceChunk._meta.get_fields()}
    assert {
        "source", "recording_session_id", "chunk_seq", "start_at_ms",
        "end_at_ms", "sha256", "previous_sha256", "object_key", "status",
    }.issubset(field_names)
    assert isinstance(
        ExamEvidenceChunk._meta.get_field("metadata"),
        models.JSONField,
    )
```

- [ ] **Step 2: Run the model tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/models/test_exam_integrity_models.py
```

Expected: collection fails because `ExamIntegrityRun` and `ExamEvidenceChunk` do not exist.

- [ ] **Step 3: Implement the two models**

Use these exact public fields and enums; timestamps use Django `DateTimeField` and IDs use `UUIDField`:

```python
# backend/apps/contests/models/integrity.py
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class ExamIntegrityRun(models.Model):
    class ComputeState(models.TextChoices):
        STOPPED = "stopped", "Stopped"
        STARTING = "starting", "Starting"
        RUNNING = "running", "Running"
        STOPPING = "stopping", "Stopping"
        DESTROYED = "destroyed", "Destroyed"

    class Health(models.TextChoices):
        HEALTHY = "healthy", "Healthy"
        UNHEALTHY = "unhealthy", "Unhealthy"

    class DataState(models.TextChoices):
        OPEN = "open", "Open"
        ARCHIVED = "archived", "Archived"
        PURGED = "purged", "Purged"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contest = models.ForeignKey(
        "contests.Contest", on_delete=models.CASCADE, related_name="integrity_runs",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_exam_integrity_runs",
    )
    compute_state = models.CharField(
        max_length=16, choices=ComputeState.choices, default=ComputeState.STOPPED,
    )
    health = models.CharField(
        max_length=16, choices=Health.choices, default=Health.HEALTHY,
    )
    data_state = models.CharField(
        max_length=16, choices=DataState.choices, default=DataState.OPEN,
    )
    warnings = models.JSONField(default=list, blank=True)
    metrics = models.JSONField(default=dict, blank=True)
    last_error = models.TextField(blank=True, default="")
    last_correlation_id = models.CharField(max_length=128, blank=True, default="")
    policy_snapshot = models.JSONField(default=dict)
    registry_snapshot = models.JSONField(default=dict)
    registry_version = models.CharField(max_length=64)
    worker_image = models.CharField(max_length=255)
    worker_image_digest = models.CharField(max_length=255, blank=True, default="")
    worker_version = models.CharField(max_length=64, blank=True, default="")
    container_id = models.CharField(max_length=128, blank=True, default="")
    container_name = models.CharField(max_length=128, blank=True, default="")
    worker_url = models.URLField(max_length=512, blank=True, default="")
    token_digest = models.CharField(max_length=64, blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    token_revoked_at = models.DateTimeField(null=True, blank=True)
    archive_generation = models.PositiveIntegerField(default=0)
    archive_manifest_key = models.TextField(blank=True, default="")
    archive_manifest_sha256 = models.CharField(max_length=64, blank=True, default="")
    received_counts = models.JSONField(default=dict, blank=True)
    processed_counts = models.JSONField(default=dict, blank=True)
    archived_counts = models.JSONField(default=dict, blank=True)
    last_worker_heartbeat_at = models.DateTimeField(null=True, blank=True)
    scheduled_start_at = models.DateTimeField(null=True, blank=True)
    scheduled_end_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    destroyed_at = models.DateTimeField(null=True, blank=True)
    purged_at = models.DateTimeField(null=True, blank=True)
    retention_until = models.DateTimeField(null=True, blank=True)
    stopped_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    destroyed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    purged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exam_integrity_runs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["contest", "compute_state"]),
            models.Index(fields=["data_state", "updated_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["contest"],
                condition=~Q(compute_state="destroyed"),
                name="uniq_live_integrity_run_per_contest",
            ),
        ]


class ExamEvidenceChunk(models.Model):
    class Source(models.TextChoices):
        SCREEN = "screen_share", "Screen share"
        WEBCAM = "webcam", "Webcam"

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        UPLOADED = "uploaded", "Uploaded"
        VERIFIED = "verified", "Verified"
        FAILED = "failed", "Failed"
        UNAVAILABLE = "unavailable", "Unavailable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    integrity_run = models.ForeignKey(
        ExamIntegrityRun, on_delete=models.CASCADE, related_name="evidence_chunks",
    )
    contest = models.ForeignKey("contests.Contest", on_delete=models.CASCADE)
    participant = models.ForeignKey(
        "contests.ContestParticipant",
        on_delete=models.CASCADE,
        related_name="integrity_evidence_chunks",
    )
    exam_event = models.ForeignKey(
        "contests.ExamEvent", on_delete=models.CASCADE, related_name="evidence_chunks",
    )
    incident_id = models.UUIDField()
    source = models.CharField(max_length=20, choices=Source.choices)
    recording_session_id = models.UUIDField()
    chunk_seq = models.PositiveIntegerField()
    is_init_chunk = models.BooleanField(default=False)
    start_at_ms = models.BigIntegerField()
    end_at_ms = models.BigIntegerField()
    object_key = models.TextField()
    content_type = models.CharField(max_length=96)
    codec = models.CharField(max_length=96, blank=True, default="")
    byte_size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    previous_sha256 = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.REQUESTED,
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "exam_evidence_chunks"
        constraints = [
            models.UniqueConstraint(
                fields=["integrity_run", "participant", "source",
                        "recording_session_id", "chunk_seq"],
                name="uniq_integrity_evidence_chunk",
            ),
        ]
        indexes = [
            models.Index(fields=["integrity_run", "incident_id"]),
            models.Index(fields=["participant", "status"]),
        ]
```

- [ ] **Step 4: Extend `ExamEvent` without replacing historical data**

Add nullable fields:

```python
integrity_run = models.ForeignKey(
    "contests.ExamIntegrityRun",
    null=True,
    blank=True,
    on_delete=models.SET_NULL,
    related_name="normalized_events",
)
integrity_command_id = models.UUIDField(null=True, blank=True, unique=True)
incident_id = models.UUIDField(null=True, blank=True, db_index=True)
event_definition_version = models.CharField(max_length=64, blank=True, default="")
event_schema_version = models.PositiveIntegerField(default=1)
client_occurred_at_ms = models.BigIntegerField(null=True, blank=True)
server_received_at = models.DateTimeField(null=True, blank=True)
worker_processed_at = models.DateTimeField(null=True, blank=True)
delayed_delivery = models.BooleanField(default=False)
```

Remove `choices=EVENT_TYPE_CHOICES` from `event_type` but keep the historical constant temporarily for display/migration compatibility. Export the two new models from `models/__init__.py` and register them in Django admin.

- [ ] **Step 5: Add and verify migration `0090`**

Create migration operations matching the two `CreateModel` definitions and `ExamEvent` fields. Alter `event_type` to `models.CharField(max_length=64)` with no choices.

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  python manage.py makemigrations --check --dry-run
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/models/test_exam_integrity_models.py
```

Expected: no pending migrations; model tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/contests/models backend/apps/contests/admin.py \
  backend/apps/contests/migrations/0090_exam_integrity_models.py \
  backend/apps/contests/tests/models/test_exam_integrity_models.py
git commit -m "feat(contests): add exam integrity persistence"
```

---

### Task 2: Establish the Canonical Registry and Frozen Policy Contract

**Files:**
- Create: `backend/apps/contests/integrity/__init__.py`
- Create: `backend/apps/contests/integrity/registry.py`
- Create: `backend/apps/contests/tests/integrity/test_registry.py`
- Modify: `backend/apps/contests/services/anticheat_config.py`
- Modify: `backend/apps/contests/tests/test_anticheat_config_api.py`

**Interfaces:**
- Consumes: Current event constants, `violationRoutes.ts` semantics, and normalized contest device policy.
- Produces: `build_registry_snapshot() -> dict` and `build_integrity_policy_snapshot(contest) -> dict` used by Backend, Worker bootstrap, and Frontend config.

- [ ] **Step 1: Write registry completeness and immutability tests**

```python
from apps.contests.integrity.registry import (
    ACTIVE_SIGNAL_IDS,
    REGISTRY_VERSION,
    build_registry_snapshot,
)


def test_registry_has_every_active_signal_once():
    snapshot = build_registry_snapshot()
    signal_ids = [
        signal
        for definition in snapshot["definitions"].values()
        for signal in definition["signals"].values()
        if signal
    ]
    assert set(signal_ids) == ACTIVE_SIGNAL_IDS
    assert len(signal_ids) == len(set(signal_ids))
    assert snapshot["version"] == REGISTRY_VERSION


def test_registry_definitions_are_data_not_core_switches():
    snapshot = build_registry_snapshot()
    fullscreen = snapshot["definitions"]["fullscreen_integrity"]
    assert fullscreen["signals"] == {
        "triggered": "exit_fullscreen_triggered",
        "escalated": "exit_fullscreen",
        "restored": "fullscreen_restored",
    }
    assert fullscreen["emission"] == "edge"
    assert fullscreen["evidence"]["before_ms"] == 10_000
    assert fullscreen["evidence"]["after_ms"] == 10_000
```

- [ ] **Step 2: Run registry tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_registry.py
```

Expected: import fails because the registry module does not exist.

- [ ] **Step 3: Implement the registry serializer**

Use an immutable dataclass and serialize only JSON values:

```python
# backend/apps/contests/integrity/registry.py
from dataclasses import asdict, dataclass
from types import MappingProxyType
from typing import Literal

REGISTRY_VERSION = "2026-07-21.1"

Emission = Literal["every", "edge", "sample", "state_snapshot"]


@dataclass(frozen=True)
class EventDefinition:
    id: str
    schema_version: int
    signals: dict[str, str]
    emission: Emission
    incident_family: str
    priority: int
    grace_ms: int
    evidence: dict
    action: str
    metadata_schema: dict


def _definition(
    definition_id: str,
    *,
    triggered: str,
    escalated: str = "",
    restored: str = "",
    emission: Emission,
    family: str,
    priority: int,
    grace_ms: int = 0,
    sources: tuple[str, ...] = (),
    action: str = "record_event",
) -> EventDefinition:
    return EventDefinition(
        id=definition_id,
        schema_version=1,
        signals={
            "triggered": triggered,
            "escalated": escalated,
            "restored": restored,
        },
        emission=emission,
        incident_family=family,
        priority=priority,
        grace_ms=grace_ms,
        evidence={
            "mode": "incident_window" if sources else "none",
            "sources": list(sources),
            "before_ms": 10_000 if sources else 0,
            "after_ms": 10_000 if sources else 0,
            "max_segment_ms": 60_000,
        },
        action=action,
        metadata_schema={
            "type": "object",
            "additionalProperties": True,
        },
    )
```

Define these canonical families and signals explicitly:

```python
_DEFINITIONS = {
    "state_snapshot": _definition(
        "state_snapshot", triggered="state_snapshot",
        emission="state_snapshot", family="connectivity", priority=3,
    ),
    "connectivity": _definition(
        "connectivity",
        triggered="connectivity_suspect",
        escalated="heartbeat_timeout",
        restored="connectivity_restored",
        emission="state_snapshot", family="connectivity", priority=1,
        grace_ms=45_000, action="pause",
    ),
    "fullscreen_integrity": _definition(
        "fullscreen_integrity",
        triggered="exit_fullscreen_triggered",
        escalated="exit_fullscreen",
        restored="fullscreen_restored",
        emission="edge", family="fullscreen", priority=1,
        grace_ms=30_000, sources=("screen_share",),
        action="pause",
    ),
    "mouse_leave": _definition(
        "mouse_leave",
        triggered="mouse_leave_triggered",
        escalated="mouse_leave",
        restored="mouse_leave_restored",
        emission="edge", family="pointer_boundary", priority=1,
        grace_ms=20_000, sources=("screen_share",),
    ),
    "multi_display": _definition(
        "multi_display",
        triggered="multi_display_triggered",
        escalated="multiple_displays",
        restored="multi_display_restored",
        emission="edge", family="display_topology", priority=1,
        grace_ms=30_000, sources=("screen_share",),
        action="pause",
    ),
    "screen_share": _definition(
        "screen_share",
        triggered="screen_share_interrupted",
        escalated="screen_share_stopped",
        restored="screen_share_restored",
        emission="edge", family="screen_capture", priority=0,
        grace_ms=30_000, sources=("screen_share",),
        action="pause",
    ),
    "webcam": _definition(
        "webcam",
        triggered="webcam_interrupted",
        escalated="webcam_stopped",
        restored="webcam_restored",
        emission="edge", family="webcam_capture", priority=1,
        grace_ms=30_000, sources=("webcam",),
        action="pause",
    ),
    "viewport": _definition(
        "viewport",
        triggered="viewport_interrupted",
        escalated="viewport_stopped",
        restored="viewport_restored",
        emission="edge", family="viewport_integrity", priority=1,
        grace_ms=30_000, sources=("screen_share",),
        action="pause",
    ),
    "clipboard": _definition(
        "clipboard", triggered="clipboard_action",
        emission="every", family="clipboard", priority=2,
        sources=("screen_share",),
    ),
    "listener_integrity": _definition(
        "listener_integrity", triggered="listener_tampered",
        emission="edge", family="listener_integrity", priority=0,
        sources=("screen_share", "webcam"), action="pause",
    ),
    "display_api": _definition(
        "display_api", triggered="display_api_degraded",
        emission="sample", family="display_api", priority=2,
    ),
    "evidence_buffer": _definition(
        "evidence_buffer", triggered="evidence_buffer_degraded",
        emission="edge", family="evidence_buffer", priority=2,
    ),
    "evidence_source": _definition(
        "evidence_source", triggered="evidence_source_degraded",
        emission="edge", family="evidence_source", priority=2,
    ),
    "clock_integrity": _definition(
        "clock_integrity", triggered="clock_integrity_degraded",
        emission="edge", family="clock_integrity", priority=2,
    ),
    "exam_entered": _definition(
        "exam_entered", triggered="exam_entered",
        emission="every", family="exam_lifecycle", priority=3,
    ),
    "exam_submit_initiated": _definition(
        "exam_submit_initiated", triggered="exam_submit_initiated",
        emission="every", family="exam_lifecycle", priority=3,
    ),
    "concurrent_login": _definition(
        "concurrent_login", triggered="concurrent_login_detected",
        emission="edge", family="device_session", priority=0,
        sources=("screen_share", "webcam"), action="pause",
    ),
    "other_devices_logged_out": _definition(
        "other_devices_logged_out", triggered="other_devices_logged_out",
        emission="every", family="device_session", priority=3,
    ),
    "end_exam_device_mismatch": _definition(
        "end_exam_device_mismatch", triggered="end_exam_device_mismatch",
        emission="edge", family="device_session", priority=1,
        sources=("screen_share", "webcam"),
    ),
}

DEFINITIONS = MappingProxyType(_DEFINITIONS)
ACTIVE_SIGNAL_IDS = frozenset(
    signal
    for definition in DEFINITIONS.values()
    for signal in definition.signals.values()
    if signal
)


def build_registry_snapshot() -> dict:
    return {
        "version": REGISTRY_VERSION,
        "definitions": {
            key: asdict(definition)
            for key, definition in DEFINITIONS.items()
        },
    }
```

Historical event IDs remain readable in `ExamEvent` and UI fallback labels, but only `ACTIVE_SIGNAL_IDS` may be emitted by the new browser runtime.

- [ ] **Step 4: Add the frozen policy builder and config contract**

Add:

```python
def build_integrity_policy_snapshot(contest) -> dict:
    config = build_contest_anticheat_config(contest)
    return {
        "version": 1,
        "batch_interval_ms": 5_000,
        "suspect_after_ms": 15_000,
        "disconnected_after_ms": 60_000,
        "evidence": {
            "chunk_ms": 5_000,
            "minimum_local_buffer_ms": 60_000,
            "local_cap_ms": 300_000,
            "local_cap_bytes_per_source": 100_000_000,
            "screen": {
                "width": 1280, "height": 720, "fps": 5, "bitrate": 800_000,
            },
            "webcam": {
                "width": 640, "height": 480, "fps": 10, "bitrate": 350_000,
            },
        },
        "effective": config["effective"],
        "device_policy": config["device_policy"],
    }
```

Extend anti-cheat config response to version 2 with `event_registry` and, when a non-destroyed Run exists, `integrity_run` containing `id`, `compute_state`, `health`, `participant_id` for the authenticated student, and the frozen snapshots. The Browser continues using its existing active device ID. Do not re-fetch mutable Contest policy on visibility change once `integrity_run.id` is present.

- [ ] **Step 5: Run registry/config tests**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_registry.py \
  apps/contests/tests/test_anticheat_config_api.py
```

Expected: all tests pass and snapshots are JSON serializable.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/contests/integrity \
  backend/apps/contests/services/anticheat_config.py \
  backend/apps/contests/tests/integrity \
  backend/apps/contests/tests/test_anticheat_config_api.py
git commit -m "feat(contests): define canonical integrity registry"
```

---

### Task 3: Implement Backend Run Lifecycle and Scoped Credentials

**Files:**
- Create: `backend/apps/contests/services/integrity_tokens.py`
- Create: `backend/apps/contests/services/integrity_runs.py`
- Create: `backend/apps/contests/infrastructure/__init__.py`
- Create: `backend/apps/contests/infrastructure/integrity_controller_client.py`
- Create: `backend/apps/contests/integrity_serializers.py`
- Create: `backend/apps/contests/views/integrity_runs.py`
- Modify: `backend/apps/contests/urls.py`
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/contests/tests/integrity/test_run_lifecycle.py`

**Interfaces:**
- Consumes: `ExamIntegrityRun`, frozen policy/registry builders, contest-manager permission, Controller HTTP contract.
- Produces: `create_run`, `start_run`, `stop_run`, `destroy_run`, `purge_run` and nested manager APIs.

- [ ] **Step 1: Write lifecycle state-machine tests**

```python
from unittest.mock import Mock

import pytest

from apps.contests.models import ExamIntegrityRun
from apps.contests.services.integrity_runs import (
    InvalidRunTransition,
    start_run,
    stop_run,
)


@pytest.mark.django_db
def test_start_freezes_policy_and_registry(contest, owner, monkeypatch):
    controller = Mock()
    controller.start.return_value = {
        "container_id": "container-1",
        "container_name": "integrity-run-1",
        "worker_url": "http://integrity-run-1:8020",
        "image_digest": "sha256:abc",
    }
    run = ExamIntegrityRun.objects.create(
        contest=contest,
        created_by=owner,
        registry_version="",
        worker_image="oj-integrity-worker:latest",
    )
    started = start_run(run.id, controller=controller)
    assert started.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert started.policy_snapshot["batch_interval_ms"] == 5_000
    assert started.registry_snapshot["definitions"]
    assert len(started.token_digest) == 64
    assert controller.start.call_count == 1


@pytest.mark.django_db
def test_stop_requires_verified_archive(integrity_run, controller):
    integrity_run.compute_state = "running"
    integrity_run.save(update_fields=["compute_state"])
    controller.request_stop.return_value = {
        "archived": False,
        "manifest_key": "",
        "manifest_sha256": "",
    }
    with pytest.raises(InvalidRunTransition):
        stop_run(integrity_run.id, controller=controller)
    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == "stopping"
```

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_run_lifecycle.py
```

Expected: imports fail because lifecycle services do not exist.

- [ ] **Step 3: Implement high-entropy opaque token helpers**

```python
# backend/apps/contests/services/integrity_tokens.py
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone


@dataclass(frozen=True)
class IssuedRunToken:
    plaintext: str
    digest: str
    expires_at: object


def issue_run_token(scheduled_end_at) -> IssuedRunToken:
    plaintext = secrets.token_urlsafe(48)
    expires_at = (scheduled_end_at or timezone.now()) + timedelta(hours=6)
    return IssuedRunToken(
        plaintext=plaintext,
        digest=hashlib.sha256(plaintext.encode("utf-8")).hexdigest(),
        expires_at=expires_at,
    )


def verify_run_token(run, plaintext: str) -> bool:
    if not plaintext or run.token_revoked_at or not run.token_digest:
        return False
    if run.token_expires_at and run.token_expires_at <= timezone.now():
        return False
    actual = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual, run.token_digest)
```

- [ ] **Step 4: Implement the Controller client port**

```python
# backend/apps/contests/infrastructure/integrity_controller_client.py
from dataclasses import dataclass
from pathlib import Path

import httpx
from django.conf import settings


class ControllerError(RuntimeError):
    pass


@dataclass
class IntegrityControllerClient:
    base_url: str
    token_file: str
    timeout_seconds: float = 10.0

    def _post(self, path: str, payload: dict) -> dict:
        token = Path(self.token_file).read_text(encoding="utf-8").strip()
        response = httpx.post(
            self.base_url.rstrip("/") + path,
            json=payload,
            headers={"Authorization": "Bearer " + token},
            timeout=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise ControllerError(
                "controller request failed status=" + str(response.status_code)
            )
        return response.json()

    def start(self, run_id, *, token: str, image: str) -> dict:
        return self._post(
            "/v1/runs/" + str(run_id) + "/start",
            {"run_token": token, "worker_image": image},
        )

    def stop_container(self, run_id) -> dict:
        return self._post("/v1/runs/" + str(run_id) + "/stop", {})

    def destroy(self, run_id) -> dict:
        return self._post("/v1/runs/" + str(run_id) + "/destroy", {})

    def purge_data(self, run_id) -> dict:
        return self._post("/v1/runs/" + str(run_id) + "/purge-data", {})
```

Add settings:

```python
INTEGRITY_CONTROLLER_URL = os.getenv(
    "INTEGRITY_CONTROLLER_URL", "http://integrity-controller:8010"
)
INTEGRITY_CONTROLLER_TOKEN_FILE = os.getenv(
    "INTEGRITY_CONTROLLER_TOKEN_FILE",
    "/run-secrets/controller-token",
)
INTEGRITY_WORKER_IMAGE = os.getenv(
    "INTEGRITY_WORKER_IMAGE", "oj-integrity-worker:latest"
)
INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = os.getenv(
    "INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE",
    "/run-secrets/integrity-worker-signing-key",
)
```

- [ ] **Step 5: Implement lifecycle services with row locks**

```python
class InvalidRunTransition(RuntimeError):
    pass


def start_run(run_id, *, controller=None):
    controller = controller or build_controller_client()
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().select_related("contest").get(pk=run_id)
        if run.compute_state != run.ComputeState.STOPPED:
            raise InvalidRunTransition("start requires stopped")
        if run.data_state != run.DataState.OPEN or run.started_at is not None:
            raise InvalidRunTransition(
                "an archived or previously started run cannot be restarted; "
                "destroy it and create a new run"
            )
        token = issue_run_token(run.contest.end_time)
        run.compute_state = run.ComputeState.STARTING
        run.data_state = run.DataState.OPEN
        run.policy_snapshot = build_integrity_policy_snapshot(run.contest)
        run.registry_snapshot = build_registry_snapshot()
        run.registry_version = run.registry_snapshot["version"]
        run.token_digest = token.digest
        run.token_expires_at = token.expires_at
        run.token_revoked_at = None
        run.last_error = ""
        run.save()

    try:
        result = controller.start(
            run.id,
            token=token.plaintext,
            image=run.worker_image,
        )
    except Exception as exc:
        ExamIntegrityRun.objects.filter(pk=run.id).update(
            compute_state=ExamIntegrityRun.ComputeState.STOPPED,
            health=ExamIntegrityRun.Health.UNHEALTHY,
            last_error=str(exc),
        )
        raise

    ExamIntegrityRun.objects.filter(pk=run.id).update(
        compute_state=ExamIntegrityRun.ComputeState.RUNNING,
        health=ExamIntegrityRun.Health.HEALTHY,
        container_id=result["container_id"],
        container_name=result["container_name"],
        worker_url=result["worker_url"],
        worker_image_digest=result["image_digest"],
        started_at=timezone.now(),
    )
    return ExamIntegrityRun.objects.get(pk=run.id)
```

Implement lifecycle functions with an explicit `actor`. Stop locks RUNNING, marks STOPPING, calls signed Worker control stop through the Worker client from Task 8, requires `archived=true` and manifest values, calls Controller `stop_container`, revokes the token, records `stopped_by`, then marks STOPPED/ARCHIVED. If archive fails, leave STOPPING and preserve token/container for retry. Destroy is allowed only from STOPPED+ARCHIVED; it removes container and secret volume, records `destroyed_by`, and does not remove the data volume. Purge is allowed only from DESTROYED+ARCHIVED; call `purge_integrity_data` from Task 10 for object storage, call Controller `purge_data` for the retained named volume, record `purged_by`, and only then set PURGED.

- [ ] **Step 6: Add manager ViewSet and routes**

Register `IntegrityRunViewSet` as nested `integrity-runs`. It supports `list`, `retrieve`, `create`, and detail actions `start`, `stop`, `destroy`, `purge`. Every method must call `can_manage_contest` and return HTTP 409 for `InvalidRunTransition`. Translate the partial unique-constraint violation into HTTP 409 `live_integrity_run_exists` so one contest never has two non-destroyed Workers.

The create serializer accepts no policy snapshot from the client:

```python
class IntegrityRunCreateSerializer(serializers.Serializer):
    worker_image = serializers.CharField(required=False, max_length=255)

    def create(self, validated_data):
        contest = self.context["contest"]
        return ExamIntegrityRun.objects.create(
            contest=contest,
            created_by=self.context["request"].user,
            worker_image=validated_data.get(
                "worker_image", settings.INTEGRITY_WORKER_IMAGE,
            ),
            registry_version=REGISTRY_VERSION,
            scheduled_start_at=contest.start_time,
            scheduled_end_at=contest.end_time,
        )
```

- [ ] **Step 7: Run lifecycle/API tests**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_run_lifecycle.py
```

Expected: state transitions, manager permission, idempotent Controller calls, and guards pass.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/contests/services/integrity_tokens.py \
  backend/apps/contests/services/integrity_runs.py \
  backend/apps/contests/infrastructure \
  backend/apps/contests/integrity_serializers.py \
  backend/apps/contests/views/integrity_runs.py \
  backend/apps/contests/urls.py backend/config/settings/base.py \
  backend/apps/contests/tests/integrity/test_run_lifecycle.py
git commit -m "feat(contests): add integrity run lifecycle"
```

---

### Task 4: Create the Integrity Service Contracts, Journal, and Sequencer

**Files:**
- Create: `integrity-service/pyproject.toml`
- Create: `integrity-service/integrity_service/__init__.py`
- Create: `integrity-service/integrity_service/core/__init__.py`
- Create: `integrity-service/integrity_service/core/schemas.py`
- Create: `integrity-service/integrity_service/core/sequencer.py`
- Create: `integrity-service/integrity_service/journal/__init__.py`
- Create: `integrity-service/integrity_service/journal/writer.py`
- Create: `integrity-service/integrity_service/journal/recovery.py`
- Create: `integrity-service/tests/test_schemas.py`
- Create: `integrity-service/tests/test_sequencer.py`
- Create: `integrity-service/tests/test_journal.py`

**Interfaces:**
- Consumes: Approved event/batch/ACK schema.
- Produces: Pydantic `EventRecord`, `EventBatch`, `BatchAck`, `SessionSequencer.accept`, and durable idempotent `JournalWriter.append_batch_once`.

- [ ] **Step 1: Add package metadata and test dependencies**

```toml
[project]
name = "qjudge-integrity-service"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "pydantic>=2.6,<3.0",
]

[project.optional-dependencies]
worker = [
  "fastapi>=0.109,<1.0",
  "uvicorn[standard]>=0.27,<1.0",
  "httpx>=0.26,<1.0",
  "jsonschema>=4.21,<5.0",
  "cryptography>=42,<46",
]
controller = [
  "fastapi>=0.109,<1.0",
  "uvicorn[standard]>=0.27,<1.0",
  "httpx>=0.26,<1.0",
  "docker>=7,<8",
]
test = [
  "pytest>=8,<9",
  "pytest-asyncio>=0.23,<1.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[tool.ruff]
target-version = "py311"
line-length = 100
```

- [ ] **Step 2: Write schema, sequence, and crash-recovery tests**

```python
def test_batch_rejects_non_contiguous_records():
    with pytest.raises(ValidationError):
        EventBatch(
            schema_version=1,
            batch_id=uuid4(),
            run_id=uuid4(),
            participant_id=101,
            device_id="device-a",
            registry_version="2026-07-21.1",
            first_seq=3,
            last_seq=5,
            records=[record(seq=3), record(seq=5)],
            client_build="frontend-test",
        )


def test_sequencer_only_acks_contiguous_records():
    sequencer = SessionSequencer()
    assert sequencer.accept(batch(3, 4)).acked_through_seq == 0
    assert sequencer.accept(batch(1, 2)).acked_through_seq == 4
    duplicate = sequencer.accept(batch(1, 2))
    assert duplicate.duplicate is True
    assert duplicate.acked_through_seq == 4


def test_recovery_truncates_partial_trailing_record(tmp_path):
    writer = JournalWriter(tmp_path)
    writer.append_batch_once(batch(1, 2))
    with writer.active_path.open("ab") as stream:
        stream.write(b"00000100 deadbeef partial")
    recovered = recover_journal(writer.active_path)
    assert [item.batch.first_seq for item in recovered.records] == [1]
    assert recovered.truncated is True


def test_same_batch_retry_is_not_appended_twice(tmp_path):
    writer = JournalWriter(tmp_path)
    original = batch(1, 2)
    assert writer.append_batch_once(original) is True
    assert writer.append_batch_once(original) is False
    assert recover_journal(writer.active_path).batch_count == 1
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
cd integrity-service
python -m pytest tests/test_schemas.py tests/test_sequencer.py tests/test_journal.py
```

Expected: imports fail because service modules do not exist.

- [ ] **Step 4: Implement exact Pydantic contracts**

```python
class EventRecord(BaseModel):
    event_id: UUID
    seq: int = Field(ge=1)
    kind: Literal["event", "state_snapshot"]
    event_type: str = Field(min_length=1, max_length=64)
    event_schema_version: int = Field(ge=1)
    client_occurred_at_ms: int = Field(ge=0)
    client_recorded_at_ms: int = Field(ge=0)
    monotonic_ms: float = Field(ge=0)
    payload: dict = Field(default_factory=dict)
    evidence_descriptors: list[dict] = Field(default_factory=list)


class EventBatch(BaseModel):
    schema_version: Literal[1]
    batch_id: UUID
    run_id: UUID
    participant_id: int = Field(ge=1)
    device_id: str = Field(min_length=1, max_length=128)
    registry_version: str = Field(min_length=1, max_length=64)
    first_seq: int = Field(ge=1)
    last_seq: int = Field(ge=1)
    records: list[EventRecord] = Field(min_length=1, max_length=200)
    client_build: str = Field(max_length=64)

    @model_validator(mode="after")
    def validate_range(self):
        expected = list(range(self.first_seq, self.last_seq + 1))
        actual = [record.seq for record in self.records]
        if actual != expected:
            raise ValueError("records must exactly cover first_seq..last_seq")
        return self


class EvidenceRetainCommand(BaseModel):
    command_id: UUID
    incident_id: UUID
    event_id: str
    sources: list[Literal["screen_share", "webcam"]]
    start_at_ms: int
    end_at_ms: int


class BatchAck(BaseModel):
    acked_through_seq: int = Field(ge=0)
    pending_commands: list[EvidenceRetainCommand] = Field(default_factory=list)
    release_evidence_before_ms: int = Field(ge=0)
```

- [ ] **Step 5: Implement session sequence semantics**

```python
@dataclass(frozen=True)
class AcceptResult:
    acked_through_seq: int
    duplicate: bool
    new_records: tuple[EventRecord, ...]


class SessionSequencer:
    def __init__(self) -> None:
        self._acked: dict[tuple[int, str], int] = defaultdict(int)
        self._records: dict[tuple[int, str], dict[int, UUID]] = defaultdict(dict)

    def accept(self, batch: EventBatch) -> AcceptResult:
        session_key = (batch.participant_id, batch.device_id)
        seen = self._records[session_key]
        new_records = []
        duplicate = True
        for record in batch.records:
            prior_id = seen.get(record.seq)
            if prior_id is not None and prior_id != record.event_id:
                raise SequenceConflict(
                    "same device sequence was reused with a different event_id"
                )
            if prior_id is None:
                seen[record.seq] = record.event_id
                new_records.append(record)
                duplicate = False
        cursor = self._acked[session_key]
        while cursor + 1 in seen:
            cursor += 1
        self._acked[session_key] = cursor
        return AcceptResult(cursor, duplicate, tuple(new_records))
```

Add `restore(participant_id, device_id, seq, event_id)` so startup recovery rebuilds the same state without invoking decisions.

- [ ] **Step 6: Implement the length-prefixed hash-checked journal**

Encode each batch as canonical UTF-8 JSON:

```python
def encode_record(batch: EventBatch) -> bytes:
    payload = json.dumps(
        batch.model_dump(mode="json", by_alias=True, exclude_none=True),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest().encode("ascii")
    return f"{len(payload):08x} ".encode("ascii") + digest + b" " + payload + b"\n"


class JournalWriter:
    def __init__(self, root: Path) -> None:
        root.mkdir(parents=True, exist_ok=True)
        self.active_path = root / "active.journal"
        self._fd = os.open(
            self.active_path,
            os.O_APPEND | os.O_CREAT | os.O_WRONLY,
            0o600,
        )
        self._lock = threading.Lock()

    def append_batch_once(self, batch: EventBatch) -> bool:
        encoded = encode_record(batch)
        with self._lock:
            prior_digest = self._batch_digests.get(batch.batch_id)
            digest = hashlib.sha256(encoded).digest()
            if prior_digest is not None:
                if prior_digest != digest:
                    raise BatchIdentityConflict(str(batch.batch_id))
                return False
            remaining = memoryview(encoded)
            while remaining:
                written = os.write(self._fd, remaining)
                if written <= 0:
                    raise OSError("journal write made no progress")
                remaining = remaining[written:]
            os.fsync(self._fd)
            self._batch_digests[batch.batch_id] = digest
            return True
```

Initialize `_batch_digests` from recovery. Recovery must read the eight-character hex length, 64-character digest, payload, and newline. On incomplete header/payload or hash mismatch only at EOF, truncate to the last valid byte. A hash mismatch before EOF raises `JournalCorruption` and leaves the file untouched.

- [ ] **Step 7: Run service tests**

Run:

```bash
cd integrity-service
python -m pytest tests/test_schemas.py tests/test_sequencer.py tests/test_journal.py
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add integrity-service
git commit -m "feat(integrity): add journal and sequence contracts"
```

---

### Task 5: Build the Registry-Driven Incident, Connectivity, and Deadline Engine

**Files:**
- Create: `integrity-service/integrity_service/core/registry.py`
- Create: `integrity-service/integrity_service/core/incidents.py`
- Create: `integrity-service/integrity_service/core/connectivity.py`
- Create: `integrity-service/integrity_service/core/scheduler.py`
- Create: `integrity-service/integrity_service/core/commands.py`
- Create: `integrity-service/tests/test_registry.py`
- Create: `integrity-service/tests/test_incidents.py`
- Create: `integrity-service/tests/test_connectivity.py`
- Create: `integrity-service/tests/test_scheduler.py`

**Interfaces:**
- Consumes: Frozen registry/policy snapshots and sequenced `EventRecord` objects.
- Produces: deterministic `IntegrityCommand` values and `tick(now_server_ms)` behavior with no Backend/filesystem imports.

- [ ] **Step 1: Write behavior-first engine tests**

```python
def test_trigger_restore_inside_grace_closes_without_pause(registry):
    engine = IncidentEngine(registry)
    opened = engine.ingest(signal("exit_fullscreen_triggered", server_ms=1_000))
    assert opened.commands[0].kind == "record_event"
    restored = engine.ingest(signal("fullscreen_restored", server_ms=20_000))
    assert {command.action for command in restored.commands} == {"audit"}
    assert engine.tick(40_000).commands == ()


def test_trigger_escalates_after_registry_grace(registry):
    engine = IncidentEngine(registry)
    engine.ingest(signal("exit_fullscreen_triggered", server_ms=1_000))
    result = engine.tick(31_001)
    command = result.commands[0]
    assert command.kind == "record_event"
    assert command.event_type == "exit_fullscreen"
    assert command.action == "pause"


def test_late_signal_is_audit_only(registry):
    engine = IncidentEngine(registry)
    result = engine.ingest(
        signal(
            "exit_fullscreen_triggered",
            server_ms=100_000,
            client_occurred_at_ms=1_000,
            delayed_delivery=True,
        )
    )
    assert all(command.action == "audit" for command in result.commands)


def test_connectivity_uses_server_receipt_time(policy):
    monitor = ConnectivityMonitor(policy)
    monitor.observe(participant_id=101, device_id="device-1", server_ms=1_000)
    assert monitor.tick(15_999) == ()
    assert monitor.tick(16_001)[0].event_type == "connectivity_suspect"
    assert monitor.tick(61_001)[0].event_type == "heartbeat_timeout"
```

- [ ] **Step 2: Run engine tests and verify RED**

Run:

```bash
cd integrity-service
python -m pytest tests/test_registry.py tests/test_incidents.py \
  tests/test_connectivity.py tests/test_scheduler.py
```

Expected: imports fail because core engine modules do not exist.

- [ ] **Step 3: Implement registry parsing with JSON Schema validation**

```python
@dataclass(frozen=True)
class ParsedDefinition:
    id: str
    schema_version: int
    triggered: str
    escalated: str
    restored: str
    emission: str
    incident_family: str
    priority: int
    grace_ms: int
    evidence_sources: tuple[str, ...]
    evidence_before_ms: int
    evidence_after_ms: int
    action: str
    metadata_schema: dict


class Registry:
    def __init__(self, snapshot: dict):
        self.version = str(snapshot["version"])
        self.by_signal: dict[str, tuple[ParsedDefinition, str]] = {}
        for definition_id, raw in snapshot["definitions"].items():
            parsed = parse_definition(definition_id, raw)
            for phase, signal_id in raw["signals"].items():
                if not signal_id:
                    continue
                if signal_id in self.by_signal:
                    raise ValueError("duplicate registry signal " + signal_id)
                self.by_signal[signal_id] = (parsed, phase)

    def resolve(self, event_type: str) -> tuple[ParsedDefinition, str]:
        try:
            return self.by_signal[event_type]
        except KeyError as exc:
            raise UnknownSignal(event_type) from exc

    def validate_payload(self, event_type: str, payload: dict) -> None:
        definition, _ = self.resolve(event_type)
        jsonschema.validate(payload, definition.metadata_schema)
```

- [ ] **Step 4: Implement incident state and deterministic commands**

Use immutable commands:

```python
@dataclass(frozen=True)
class IntegrityCommand:
    command_id: UUID
    kind: Literal[
        "record_event",
        "auto_submit",
        "update_run_checkpoint",
        "create_archive_upload",
        "publish_archive_manifest",
    ]
    participant_id: int
    device_id: str
    incident_id: UUID | None
    event_type: str
    action: Literal["audit", "record", "pause", "lock", "submit"]
    client_occurred_at_ms: int
    received_at_server_ms: int
    delayed_delivery: bool
    evidence: dict
    metadata: dict
```

Derive `command_id` deterministically with UUIDv5 from `run_id + participant_id + device_id + event_id + phase`. Keep open incidents keyed by `participant_id + incident_family`. Trigger opens once, restore closes, and `tick` escalates only after the registry deadline. A delayed record always emits `action="audit"` and never opens an actionable deadline. Submitted participants are supplied through `mark_submitted(participant_id)` and all later commands become audit-only.

- [ ] **Step 5: Implement connectivity and scheduled end**

`ConnectivityMonitor` stores last server receipt per device and emits one suspect/one timeout transition until a new batch restores it. `DeadlineScheduler` emits a deterministic `auto_submit` command for every active participant at scheduled end but exposes no Stop action.

```python
class DeadlineScheduler:
    def __init__(self, scheduled_end_ms: int):
        self.scheduled_end_ms = scheduled_end_ms
        self._submitted: set[int] = set()

    def tick(self, now_ms: int, active_participant_ids: set[int]) -> tuple[IntegrityCommand, ...]:
        if now_ms < self.scheduled_end_ms:
            return ()
        commands = []
        for participant_id in sorted(active_participant_ids - self._submitted):
            commands.append(auto_submit_command(participant_id, self.scheduled_end_ms))
            self._submitted.add(participant_id)
        return tuple(commands)
```

- [ ] **Step 6: Run deterministic engine tests**

Run:

```bash
cd integrity-service
python -m pytest tests/test_registry.py tests/test_incidents.py \
  tests/test_connectivity.py tests/test_scheduler.py
```

Expected: all tests pass; replaying the same inputs returns identical command IDs and values.

- [ ] **Step 7: Commit**

```bash
git add integrity-service/integrity_service/core integrity-service/tests
git commit -m "feat(integrity): add registry decision engine"
```

---

### Task 6: Compose the Worker API, Backend Client, and Archive Pipeline

**Files:**
- Create: `integrity-service/integrity_service/worker/__init__.py`
- Create: `integrity-service/integrity_service/worker/settings.py`
- Create: `integrity-service/integrity_service/worker/auth.py`
- Create: `integrity-service/integrity_service/worker/backend_client.py`
- Create: `integrity-service/integrity_service/worker/runtime.py`
- Create: `integrity-service/integrity_service/worker/app.py`
- Create: `integrity-service/integrity_service/journal/command_outbox.py`
- Create: `integrity-service/integrity_service/journal/archive.py`
- Create: `integrity-service/Dockerfile.worker`
- Create: `integrity-service/tests/test_worker_api.py`
- Create: `integrity-service/tests/test_archive.py`

**Interfaces:**
- Consumes: Task 4 journal/sequencer, Task 5 engine, Backend bootstrap/commands contract.
- Produces: private Worker `POST /v1/runs/{run_id}/batches`, `POST /v1/runs/{run_id}/control/stop`, `GET /health`, archive manifest.

- [ ] **Step 1: Write API ACK and stop/archive tests**

```python
def test_batch_ack_happens_after_journal_append(client, runtime, batch_payload):
    runtime.journal.append_batch_once = Mock(return_value=True)
    response = client.post(
        "/v1/runs/" + str(runtime.run_id) + "/batches",
        json=batch_payload,
        headers=signed_headers(batch_payload),
    )
    assert response.status_code == 200
    runtime.journal.append_batch_once.assert_called_once()
    assert response.json()["acked_through_seq"] == 1


def test_journal_failure_returns_no_ack(client, runtime, batch_payload):
    runtime.journal.append_batch_once.side_effect = OSError("disk full")
    response = client.post(
        "/v1/runs/" + str(runtime.run_id) + "/batches",
        json=batch_payload,
        headers=signed_headers(batch_payload),
    )
    assert response.status_code == 507
    assert "acked_through_seq" not in response.json()


def test_stop_seals_uploads_and_verifies_manifest(client, runtime):
    response = client.post(
        "/v1/runs/" + str(runtime.run_id) + "/control/stop",
        headers=signed_headers({}),
    )
    assert response.status_code == 200
    assert response.json()["archived"] is True
    assert len(response.json()["manifest_sha256"]) == 64


def test_command_delivery_failure_survives_retry(client, runtime, batch_payload):
    runtime.backend.send_commands.side_effect = [
        BackendUnavailable(),
        successful_command_response(),
    ]
    first = client.post(
        "/v1/runs/" + str(runtime.run_id) + "/batches",
        json=batch_payload,
        headers=signed_headers(batch_payload),
    )
    second = client.post(
        "/v1/runs/" + str(runtime.run_id) + "/batches",
        json=batch_payload,
        headers=signed_headers(batch_payload),
    )
    assert first.status_code == 503
    assert second.status_code == 200
    assert runtime.backend.send_commands.call_args_list[0].args[0] == (
        runtime.backend.send_commands.call_args_list[1].args[0]
    )


def test_unknown_signal_is_journaled_and_warned(client, runtime, unknown_batch_payload):
    response = client.post(
        "/v1/runs/" + str(runtime.run_id) + "/batches",
        json=unknown_batch_payload,
        headers=signed_headers(unknown_batch_payload),
    )
    assert response.status_code == 200
    assert runtime.journal.contains_event_type("future_detector_signal")
    assert "unknown_event_type" in runtime.warning_codes
```

- [ ] **Step 2: Run Worker tests and verify RED**

Run:

```bash
cd integrity-service
python -m pytest tests/test_worker_api.py tests/test_archive.py
```

Expected: imports fail because Worker modules do not exist.

- [ ] **Step 3: Implement asymmetric Backend-to-Worker verification**

Backend signs the exact request bytes with Ed25519. Worker receives only the public key:

```python
def verify_backend_request(
    public_key: Ed25519PublicKey,
    *,
    body: bytes,
    timestamp: str,
    run_id: UUID,
    signature_b64: str,
    now_seconds: int,
) -> None:
    timestamp_seconds = int(timestamp)
    if abs(now_seconds - timestamp_seconds) > 30:
        raise HTTPException(status_code=401, detail="stale signature")
    message = (
        str(run_id).encode("ascii")
        + b"\n"
        + timestamp.encode("ascii")
        + b"\n"
        + body
    )
    signature = base64.b64decode(signature_b64, validate=True)
    public_key.verify(signature, message)
```

Headers are `X-QJudge-Run-Id`, `X-QJudge-Timestamp`, and `X-QJudge-Signature`. Reject mismatched path/header Run IDs.

- [ ] **Step 4: Implement bootstrap and scoped command client**

On startup read `/run-secrets/token`, call:

```text
GET /api/v1/internal/integrity/runs/{run_id}/bootstrap/
Authorization: Bearer {per-run-token}
```

Parse run/contest IDs, active participant IDs/statuses, scheduled times, frozen policy/registry, Backend signing public key, and archive bucket policy. Post command batches to:

```text
POST /api/v1/internal/integrity/runs/{run_id}/commands/
Authorization: Bearer {per-run-token}
```

`BackendClient.send_commands(commands)` retries only connection errors/502/503/504 with the same deterministic command IDs and never invents a new ID.

- [ ] **Step 5: Implement the durable command outbox**

Store derived commands and delivery checkpoints on `/run-data`, not PostgreSQL. Before any command delivery, append the canonical command batch and fsync it. After a successful Internal API response, append and fsync a delivered checkpoint. On startup:

1. recover and truncate only partial trailing records;
2. rebuild the sequencer from raw batches;
3. replay raw records after the last processing checkpoint with the frozen snapshots;
4. enqueue any deterministic commands missing from the command outbox;
5. resend every command without a delivered checkpoint.

If a command was applied but the delivered checkpoint was lost, Backend `integrity_command_id` idempotency makes the resend safe. This closes the crash window between raw journal append, decision processing, and Backend command delivery without adding a SQL command table.

- [ ] **Step 6: Implement Worker runtime ordering**

The batch handler order is fixed:

```python
def ingest(self, batch: EventBatch, received_at_ms: int) -> BatchAck:
    if batch.run_id != self.run_id:
        raise RunMismatch()
    self.journal.append_batch_once(batch)
    accepted = self.sequencer.accept(batch)
    commands = []
    for record in accepted.new_records:
        try:
            signal = to_signal(record, received_at_ms=received_at_ms)
            commands.extend(self.engine.ingest(signal).commands)
        except UnknownSignal:
            commands.append(self.unknown_signal_warning(record))
    commands.extend(self.engine.tick(received_at_ms).commands)
    self.command_outbox.append(commands)
    self.command_outbox.deliver_pending(self.backend)
    self.journal.append_processing_checkpoint(batch.batch_id)
    return BatchAck(
        acked_through_seq=accepted.acked_through_seq,
        pending_commands=[],
        release_evidence_before_ms=0,
    )
```

Registry version mismatch or an unknown event never prevents the raw append. Add a bounded warning command, skip unsupported records, and continue processing known records. If Backend command delivery fails after journal append, return 503 without ACK. A client retry first drains the durable command outbox, is deduped by the journal/sequencer, and returns the same contiguous cursor.

- [ ] **Step 7: Run the centralized scheduler loop**

Start exactly one async loop per Worker. Every second it:

- ticks incident grace deadlines and connectivity thresholds using server receipt time;
- ticks scheduled-end auto-submit for the active participant set learned from bootstrap and subsequent batches;
- appends deterministic results to the command outbox and drains it;
- rotates time-based archive segments and publishes health/checkpoint metrics.

The loop must run when no Browser batches arrive. Add a fake-clock test that advances through scheduled end with zero new batches, verifies one `auto_submit` per active participant, and verifies the Worker remains accepting/running until manual Stop. Cancellation on Stop waits for in-flight command delivery before sealing.

- [ ] **Step 8: Implement sealed segment archive**

Rotate active journal at 60 seconds or 8 MiB, whichever arrives first. Gzip sealed records, calculate SHA-256 and previous-segment hash, request a presigned archive URL with `create_archive_upload` command, upload, then mark the local segment archived. Manifest includes segment ranges, hashes, final per-device cursors, snapshots/digests, counts, generation, and previous manifest hash.

An object-storage failure leaves the sealed local segment intact, adds a warning code, and does not change health from healthy while the journal still has safe capacity. Retry from the centralized loop. Crossing a configured capacity warning threshold adds `journal_capacity_low`; an actual append failure sets unhealthy and returns no ACK. A Stop with any unverified segment remains STOPPING and returns an archive failure without invoking Controller stop.

Stop does:

```python
async def stop(self) -> StopResult:
    self.accepting = False
    await self.wait_for_inflight()
    self.journal.seal_active()
    await self.archiver.upload_all_sealed()
    manifest = self.archiver.build_manifest()
    await self.archiver.upload_and_publish_manifest(manifest)
    return StopResult(
        archived=True,
        manifest_key=manifest.object_key,
        manifest_sha256=manifest.sha256,
    )
```

- [ ] **Step 9: Add non-root Worker image**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
COPY integrity_service ./integrity_service
RUN pip install --no-cache-dir ".[worker]" && \
    useradd --uid 10001 --create-home --shell /usr/sbin/nologin integrity
USER 10001
EXPOSE 8020
CMD ["uvicorn", "integrity_service.worker.app:app", "--host", "0.0.0.0", "--port", "8020"]
```

The Controller supplies read-only root filesystem, tmpfs `/tmp`, read-only `/run-secrets`, and writable `/run-data`.

- [ ] **Step 10: Run Worker/archive tests**

Run:

```bash
cd integrity-service
python -m pytest tests/test_worker_api.py tests/test_archive.py
```

Expected: ACK ordering, signature failure, durable command retry, unknown-signal preservation, idle scheduled-end auto-submit, archive manifest, and stop tests pass.

- [ ] **Step 11: Commit**

```bash
git add integrity-service/integrity_service/worker \
  integrity-service/integrity_service/journal \
  integrity-service/Dockerfile.worker integrity-service/tests
git commit -m "feat(integrity): add worker ingest and archive"
```

---

### Task 7: Implement the Dedicated Docker Controller

**Files:**
- Create: `integrity-service/integrity_service/controller/__init__.py`
- Create: `integrity-service/integrity_service/controller/settings.py`
- Create: `integrity-service/integrity_service/controller/schemas.py`
- Create: `integrity-service/integrity_service/controller/docker_runtime.py`
- Create: `integrity-service/integrity_service/controller/app.py`
- Create: `integrity-service/Dockerfile.controller`
- Create: `integrity-service/tests/test_controller_api.py`
- Create: `integrity-service/tests/test_docker_runtime.py`

**Interfaces:**
- Consumes: Backend lifecycle calls and an allowlisted Worker image.
- Produces: idempotent `start`, `stop`, `destroy`, `purge-data`, and `status` with no business-state access.

- [ ] **Step 1: Write Docker-policy tests**

```python
def test_start_creates_isolated_non_privileged_worker(runtime, docker_client):
    result = runtime.start(
        run_id=UUID("11111111-1111-1111-1111-111111111111"),
        run_token="secret",
        worker_image="oj-integrity-worker:latest",
    )
    kwargs = docker_client.containers.create.call_args.kwargs
    assert kwargs["privileged"] is False
    assert kwargs["read_only"] is True
    assert kwargs["user"] == "10001:10001"
    assert kwargs["mem_limit"] == "512m"
    assert kwargs["nano_cpus"] == 500_000_000
    assert kwargs["network"] == "qjudge-test-network"
    assert kwargs["restart_policy"] == {"Name": "unless-stopped"}
    assert result.worker_url.endswith(":8020")


def test_start_rejects_non_allowlisted_image(runtime):
    with pytest.raises(ImageNotAllowed):
        runtime.start(uuid4(), "secret", "attacker/image:latest")


def test_destroy_keeps_data_volume(runtime, docker_client):
    runtime.destroy(RUN_ID)
    docker_client.volumes.get("qjudge-integrity-data-" + str(RUN_ID)).remove.assert_not_called()
    docker_client.volumes.get("qjudge-integrity-secret-" + str(RUN_ID)).remove.assert_called_once()


def test_purge_data_requires_absent_container_and_removes_only_run_volume(
    runtime, docker_client,
):
    runtime.purge_data(RUN_ID)
    docker_client.volumes.get(
        "qjudge-integrity-data-" + str(RUN_ID),
    ).remove.assert_called_once()
```

- [ ] **Step 2: Run Controller tests and verify RED**

Run:

```bash
cd integrity-service
python -m pytest tests/test_controller_api.py tests/test_docker_runtime.py
```

Expected: imports fail because Controller modules do not exist.

- [ ] **Step 3: Implement Controller authentication and schemas**

Every endpoint reads `INTEGRITY_CONTROLLER_INTERNAL_TOKEN_FILE` and requires constant-time comparison of the request Bearer credential with those file bytes. `StartRunRequest` accepts only `run_token` and `worker_image`; no arbitrary environment, mounts, command, capabilities, network, or Docker arguments are accepted.

- [ ] **Step 4: Implement secret-volume population and container creation**

Create data and secret volumes with labels `qjudge.integrity.run_id` and `qjudge.integrity.kind`. Create the stopped Worker container with fixed settings, write `token` into the mounted secret volume using Docker `put_archive` with UID/GID 10001 and mode 0400, then start it.

```python
container = self.client.containers.create(
    image=image,
    name=container_name(run_id),
    environment={
        "INTEGRITY_RUN_ID": str(run_id),
        "BACKEND_INTERNAL_URL": self.settings.backend_internal_url,
        "RUN_TOKEN_FILE": "/run-secrets/token",
        "RUN_DATA_DIR": "/run-data",
    },
    volumes={
        data_volume.name: {"bind": "/run-data", "mode": "rw"},
        secret_volume.name: {"bind": "/run-secrets", "mode": "ro"},
    },
    network=self.settings.worker_network,
    user="10001:10001",
    read_only=True,
    tmpfs={"/tmp": "rw,noexec,nosuid,size=64m"},
    cap_drop=["ALL"],
    security_opt=["no-new-privileges"],
    privileged=False,
    mem_limit="512m",
    nano_cpus=500_000_000,
    pids_limit=128,
    restart_policy={"Name": "unless-stopped"},
    labels={
        "qjudge.integrity.run_id": str(run_id),
        "qjudge.integrity.role": "worker",
    },
)
```

Idempotent Start returns the existing matching container. If a same-name container has a different run label/image, return conflict rather than replacing it.

- [ ] **Step 5: Implement Stop/Destroy/Purge-data**

`stop` calls Docker stop with 30-second timeout only after Backend has already received a verified Worker archive result. `destroy` requires the container to be stopped, removes the container and per-run secret volume, and leaves the data volume. It returns `data_volume_retained=true`. `purge-data` rejects any existing Run container and removes only the exactly named, correctly labelled Run data volume. It never accepts a caller-supplied volume name.

- [ ] **Step 6: Add Controller image**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
COPY integrity_service ./integrity_service
RUN pip install --no-cache-dir ".[controller]" && \
    useradd --uid 10002 --create-home --shell /usr/sbin/nologin controller
USER 10002
EXPOSE 8010
CMD ["uvicorn", "integrity_service.controller.app:app", "--host", "0.0.0.0", "--port", "8010"]
```

The image runs non-root; the deployment group/permission for Docker socket must explicitly grant UID 10002 access. Do not use `privileged: true`.

- [ ] **Step 7: Run Controller tests**

Run:

```bash
cd integrity-service
python -m pytest tests/test_controller_api.py tests/test_docker_runtime.py
```

Expected: auth, allowlist, exact Docker options, idempotency, volume retention, and conflict tests pass.

- [ ] **Step 8: Commit**

```bash
git add integrity-service/integrity_service/controller \
  integrity-service/Dockerfile.controller integrity-service/tests
git commit -m "feat(integrity): add docker lifecycle controller"
```

---

### Task 8: Add the Signed Backend-to-Worker Batch Gateway

**Files:**
- Create: `backend/apps/contests/infrastructure/__init__.py`
- Create: `backend/apps/contests/infrastructure/integrity_worker_client.py`
- Create: `backend/apps/contests/integrity_serializers.py`
- Create: `backend/apps/contests/views/exam_integrity.py`
- Modify: `backend/apps/contests/views/exam_lifecycle.py`
- Modify: `backend/config/settings/base.py`
- Create: `backend/apps/contests/tests/integrity/test_batch_gateway.py`

**Interfaces:**
- Consumes: Authenticated student, active `ExamIntegrityRun`, `EventBatch` wire contract, and Backend Ed25519 private key.
- Produces: `POST /api/v1/contests/{contest_pk}/exam/integrity/batches/`, initially returning the Worker's durable `BatchAck`; Task 10 enriches the public ACK with repeatable evidence projections.

- [ ] **Step 1: Write failing gateway tests**

```python
@pytest.mark.django_db
def test_batch_gateway_signs_exact_body_and_returns_worker_ack(
    api_client, running_integrity_run, participant, worker_server,
):
    api_client.force_authenticate(participant.user)
    worker_server.expect_signed_post(
        f"/v1/runs/{running_integrity_run.id}/batches",
        response={
            "acked_through_seq": 42,
            "pending_commands": [],
            "release_evidence_before_ms": 1_785_000_000_000,
        },
    )

    response = api_client.post(
        f"/api/v1/contests/{running_integrity_run.contest_id}/exam/integrity/batches/",
        make_batch(run_id=running_integrity_run.id, first_seq=40, last_seq=42),
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["acked_through_seq"] == 42
    assert worker_server.verified_signature is True


@pytest.mark.django_db
def test_batch_gateway_never_acks_when_worker_is_unavailable(
    api_client, running_integrity_run, participant, worker_server,
):
    api_client.force_authenticate(participant.user)
    worker_server.disconnect()

    response = api_client.post(
        f"/api/v1/contests/{running_integrity_run.contest_id}/exam/integrity/batches/",
        make_batch(run_id=running_integrity_run.id, first_seq=1, last_seq=3),
        format="json",
    )

    assert response.status_code == 503
    assert "acked_through_seq" not in response.json()
    assert ExamEvent.objects.count() == 0


@pytest.mark.django_db
def test_batch_gateway_rejects_user_run_or_device_mismatch(
    api_client, running_integrity_run, another_participant,
):
    api_client.force_authenticate(another_participant.user)
    response = api_client.post(
        f"/api/v1/contests/{running_integrity_run.contest_id}/exam/integrity/batches/",
        make_batch(
            run_id=running_integrity_run.id,
            participant_id=another_participant.id + 1,
            device_id="borrowed-device",
        ),
        format="json",
    )
    assert response.status_code == 403
```

- [ ] **Step 2: Run gateway tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_batch_gateway.py
```

Expected: imports or route lookup fail because the gateway does not exist.

- [ ] **Step 3: Implement exact-body Ed25519 signing**

Add these settings:

```python
INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = env(
    "INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE",
    default="/run-secrets/integrity-worker-signing-key",
)
INTEGRITY_WORKER_CONNECT_TIMEOUT_SECONDS = env.float(
    "INTEGRITY_WORKER_CONNECT_TIMEOUT_SECONDS", default=1.0,
)
INTEGRITY_WORKER_READ_TIMEOUT_SECONDS = env.float(
    "INTEGRITY_WORKER_READ_TIMEOUT_SECONDS", default=5.0,
)
```

Install `cryptography` in the Backend dependency manifest and implement:

```python
class IntegrityWorkerClient:
    def post_batch(self, run: ExamIntegrityRun, body: bytes) -> WorkerBatchAck:
        timestamp = str(int(time.time()))
        message = (
            str(run.id).encode("ascii") + b"\n"
            + timestamp.encode("ascii") + b"\n"
            + body
        )
        signature = base64.b64encode(self.private_key.sign(message)).decode("ascii")
        response = self.http.post(
            f"{run.worker_url}/v1/runs/{run.id}/batches",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-QJudge-Run-Id": str(run.id),
                "X-QJudge-Timestamp": timestamp,
                "X-QJudge-Signature": signature,
            },
        )
        response.raise_for_status()
        return WorkerBatchAck.model_validate(response.json())
```

Do not retry POST inside the Backend client. Browser retry preserves `batch_id` and the Worker owns idempotency. Map timeout, connect failure, and Worker 502/503/504 to Backend 503 without an ACK body; propagate valid Worker 409/422 responses.

- [ ] **Step 4: Validate the public batch contract**

`ExamIntegrityBatchSerializer` validates:

- `schema_version == 1`.
- `run_id` equals the current non-destroyed Run.
- `participant_id` equals the authenticated participant.
- `device_id` equals the participant's current active device.
- `records` contains 1–200 items, is ordered by strictly increasing `seq`, and `first_seq`/`last_seq` match it.
- Every record has `event_id`, `event_type`, `client_occurred_at_ms`, `client_recorded_at_ms`, and object `payload`.
- `event_type` is a bounded 1–64 character identifier and its payload is JSON with a serialized size at most 32 KiB. Do not reject syntactically valid unknown IDs at the gateway: the Worker must first journal them, emit an `unknown_event_type` warning, and continue processing known records in the batch.
- Total encoded request body is at most 1 MiB.

Serialize validated data once with compact, sorted JSON and pass those exact bytes to `IntegrityWorkerClient`. Do not create `ExamEvent`, touch Redis heartbeat keys, dedupe signals, or change participant state in this view.

- [ ] **Step 5: Compose the action into `ExamViewSet`**

Create `ExamIntegrityMixin.integrity_batches` with the decorator below. Its body loads the contest/participant/current Run, validates `ExamIntegrityBatchSerializer`, serializes canonical bytes once, calls `IntegrityWorkerClient.post_batch`, and maps the client result/error exactly as specified in Steps 3–4.

```python
@action(
    detail=False,
    methods=["post"],
    url_path="integrity/batches",
    permission_classes=[permissions.IsAuthenticated],
    throttle_classes=[ExamEventsThrottle],
)
def integrity_batches(self, request, contest_pk=None):
    return self._proxy_integrity_batch(request, contest_pk)
```

Add `ExamIntegrityMixin` to `ExamViewSet` before `viewsets.GenericViewSet` in `exam_lifecycle.py`. Existing GET `exam/events` remains available to managers; student POST callers will be removed in Task 13.

- [ ] **Step 6: Run gateway and permission tests**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_batch_gateway.py \
  apps/contests/tests/exam/test_exam_permissions.py
```

Expected: signed pass-through, size/identity guards, and unavailable Worker behavior pass.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/contests/infrastructure \
  backend/apps/contests/integrity_serializers.py \
  backend/apps/contests/views/exam_integrity.py \
  backend/apps/contests/views/exam_lifecycle.py \
  backend/apps/contests/tests/integrity/test_batch_gateway.py \
  backend/config/settings/base.py backend/requirements
git commit -m "feat(contests): proxy integrity batches to worker"
```

---

### Task 9: Add the Scoped Backend Internal Command Adapter

**Files:**
- Create: `backend/apps/contests/services/integrity_commands.py`
- Create: `backend/apps/contests/views/integrity_internal.py`
- Create: `backend/apps/contests/integrity_internal_urls.py`
- Modify: `backend/config/urls.py`
- Modify: `backend/apps/contests/views/exam_events.py`
- Modify: `backend/apps/contests/services/exam_submission.py`
- Create: `backend/apps/contests/tests/integrity/test_internal_commands.py`
- Modify: `backend/apps/contests/tests/test_exam_anticheat.py`

**Interfaces:**
- Consumes: Per-run opaque Bearer token and deterministic Worker commands.
- Produces: Idempotent PostgreSQL business effects through `record_event`, `auto_submit`, `update_run_checkpoint`, `create_archive_upload`, and `publish_archive_manifest`.

- [ ] **Step 1: Write failing authentication/idempotency tests**

```python
@pytest.mark.django_db
def test_record_event_command_is_idempotent(
    internal_client, running_integrity_run, participant,
):
    command = {
        "command_id": "55555555-5555-5555-5555-555555555555",
        "kind": "record_event",
        "payload": {
            "participant_id": participant.id,
            "event_type": "exit_fullscreen",
            "incident_id": "66666666-6666-6666-6666-666666666666",
            "client_occurred_at_ms": 1_785_000_000_000,
            "worker_processed_at_ms": 1_785_000_001_000,
            "delayed_delivery": False,
            "metadata": {"module": "screen_share"},
        },
    }
    first = internal_client.post_commands(running_integrity_run, [command])
    second = internal_client.post_commands(running_integrity_run, [command])
    assert first.status_code == second.status_code == 200
    assert ExamEvent.objects.filter(
        integrity_command_id=command["command_id"],
    ).count() == 1


@pytest.mark.django_db
def test_late_event_is_audit_only(internal_client, running_integrity_run, submitted_participant):
    response = internal_client.post_commands(
        running_integrity_run,
        [late_record_event_command(participant=submitted_participant)],
    )
    submitted_participant.refresh_from_db()
    assert response.status_code == 200
    assert submitted_participant.exam_status == ExamStatus.SUBMITTED
    assert ExamEvent.objects.get().delayed_delivery is True


@pytest.mark.django_db
def test_auto_submit_uses_existing_finalizer_once(
    internal_client, running_integrity_run, participant, mocker,
):
    finalizer = mocker.patch(
        "apps.contests.services.integrity_commands.finalize_submission",
    )
    command = auto_submit_command(participant)
    internal_client.post_commands(running_integrity_run, [command])
    internal_client.post_commands(running_integrity_run, [command])
    finalizer.assert_called_once()
```

Also test missing, expired, revoked, wrong-run, and malformed tokens return 401/403 without revealing whether the Run exists.

- [ ] **Step 2: Run command tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_internal_commands.py
```

Expected: internal route and service imports fail.

- [ ] **Step 3: Authenticate the scoped opaque token**

Read Bearer bytes, hash with SHA-256, and compare to `run.token_digest` using `hmac.compare_digest`. Require `compute_state` in `starting/running/stopping`, an unexpired token, and no `token_revoked_at`. The URL Run ID is the only scope; command payloads may reference only that Run's contest and participants.

Register:

```python
path(
    "api/v1/internal/integrity/runs/<uuid:run_id>/bootstrap/",
    IntegrityBootstrapView.as_view(),
    name="integrity-bootstrap",
),
path(
    "api/v1/internal/integrity/runs/<uuid:run_id>/commands/",
    IntegrityCommandsView.as_view(),
    name="integrity-commands",
),
```

Bootstrap returns the frozen snapshots, scheduled times, contest ID, archive configuration, and the Backend Ed25519 public key. It never returns token digest or mutable contest anti-cheat policy.

- [ ] **Step 4: Extract reusable event business logic**

Move event creation and participant action code from `ExamEventsMixin` into:

```python
@dataclass(frozen=True)
class RecordIntegrityEvent:
    command_id: UUID
    run_id: UUID
    participant_id: int
    event_type: str
    incident_id: UUID | None
    client_occurred_at_ms: int
    server_received_at: datetime
    worker_processed_at: datetime
    delayed_delivery: bool
    metadata: dict[str, object]


@transaction.atomic
def record_integrity_event(command: RecordIntegrityEvent) -> ExamEvent:
    existing = ExamEvent.objects.filter(
        integrity_command_id=command.command_id,
    ).first()
    if existing:
        return existing
    return _create_event_and_apply_action(command)
```

Implement the private `_create_event_and_apply_action` in the same service. It loads the Run and participant with `select_for_update()`, validates the command against the frozen definition, creates `ExamEvent`, applies the requested registry action, and returns the event. If `delayed_delivery` is true or the participant is already submitted, create the `ExamEvent` but skip state transitions. Preserve existing activity logging and the existing `finalize_submission` function.

Keep the manager GET action in `ExamEventsMixin`. During direct cutover, make legacy student POST return HTTP 410 with `{"code": "integrity_batch_required"}` so old clients do not create a second authority.

- [ ] **Step 5: Implement command batch semantics**

Accept 1–100 commands. Process each command in its own transaction and return:

```json
{
  "results": [
    {
      "command_id": "55555555-5555-5555-5555-555555555555",
      "status": "applied",
      "result": {}
    }
  ]
}
```

An existing idempotency key returns `status="already_applied"`. A deterministic validation failure returns `status="rejected"` and a machine-readable code; a transient database/object-storage error aborts the HTTP request with 503 so the Worker retries the unchanged command batch.

Command behavior:

- `record_event`: create `ExamEvent` and apply registry-defined state action.
- `auto_submit`: call `finalize_submission` only when not already submitted; scheduled end does not stop the Run.
- `update_run_checkpoint`: update heartbeat, counts, health, warnings, Worker version, and archive generation monotonically.
- `create_archive_upload`: return a presigned URL/object key under the Run prefix without persisting a command row.
- `publish_archive_manifest`: verify generation is newer and store manifest key/hash/counts; when Stop is in progress set `data_state=ARCHIVED`.

Use deterministic object keys so replaying `create_archive_upload` returns the same target.

- [ ] **Step 6: Run internal and legacy behavior tests**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_internal_commands.py \
  apps/contests/tests/test_exam_anticheat.py
```

Expected: scoped auth, idempotency, late-event monotonicity, finalizer reuse, and legacy POST cutover tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/contests/services/integrity_commands.py \
  backend/apps/contests/views/integrity_internal.py \
  backend/apps/contests/integrity_internal_urls.py \
  backend/apps/contests/views/exam_events.py \
  backend/apps/contests/services/exam_submission.py \
  backend/apps/contests/tests/integrity \
  backend/apps/contests/tests/test_exam_anticheat.py \
  backend/config/urls.py
git commit -m "feat(contests): add scoped integrity commands"
```

---

### Task 10: Implement Incident Evidence Chunk Projection and Direct Upload

**Files:**
- Create: `backend/apps/contests/services/integrity_evidence.py`
- Modify: `backend/apps/contests/integrity_serializers.py`
- Modify: `backend/apps/contests/views/exam_integrity.py`
- Modify: `backend/apps/contests/views/exam_evidence.py`
- Modify: `backend/apps/contests/services/anticheat_storage.py`
- Create: `backend/apps/contests/tests/integrity/test_evidence_chunks.py`
- Modify: `backend/apps/contests/tests/integrity/test_batch_gateway.py`

**Interfaces:**
- Consumes: Incident window metadata on normalized `ExamEvent` and Browser chunk descriptors.
- Produces: Presigned direct uploads, verified `ExamEvidenceChunk` rows, retain/release commands, and manager evidence status.

- [ ] **Step 1: Write failing evidence tests**

```python
@pytest.mark.django_db
def test_manifest_returns_only_chunks_overlapping_incident_window(
    api_client, incident_event, participant,
):
    api_client.force_authenticate(participant.user)
    response = api_client.post(
        f"/api/v1/contests/{incident_event.contest_id}/exam/integrity/evidence/manifest/",
        {
            "run_id": str(incident_event.integrity_run_id),
            "incident_id": str(incident_event.incident_id),
            "chunks": [
                descriptor(seq=1, start=970_000, end=975_000),
                descriptor(seq=2, start=995_000, end=1_000_000),
                descriptor(seq=3, start=1_015_000, end=1_020_000),
                descriptor(seq=4, start=1_030_000, end=1_035_000),
            ],
        },
        format="json",
    )
    assert response.status_code == 200
    assert [item["chunk_seq"] for item in response.json()["uploads"]] == [2, 3]


@pytest.mark.django_db
def test_complete_verifies_object_checksum_without_proxying_media(
    api_client, requested_evidence_chunk, participant, object_store,
):
    api_client.force_authenticate(participant.user)
    object_store.head_object.return_value = {
        "ContentLength": requested_evidence_chunk.byte_size,
        "ChecksumSHA256": base64.b64encode(
            bytes.fromhex(requested_evidence_chunk.sha256),
        ).decode("ascii"),
    }
    response = api_client.post(
        evidence_complete_url(requested_evidence_chunk),
        {"chunk_id": str(requested_evidence_chunk.id)},
        format="json",
    )
    assert response.status_code == 200
    object_store.get_object.assert_not_called()
    requested_evidence_chunk.refresh_from_db()
    assert requested_evidence_chunk.status == "verified"
```

Also test disabled sources, another participant's incident, chunk-chain mismatch, overlapping incident reuse, unavailable local chunk, and 60-second segmentation.

- [ ] **Step 2: Run evidence tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_evidence_chunks.py
```

Expected: manifest/complete actions do not exist.

- [ ] **Step 3: Project retain windows from normalized events**

Implement the immutable `EvidenceRetainWindow` value:

```python
@dataclass(frozen=True)
class EvidenceRetainWindow:
    incident_id: UUID
    event_id: int
    sources: tuple[str, ...]
    start_at_ms: int
    end_at_ms: int
    max_segment_ms: int
```

Add `evidence_retain_windows(run, participant, after_ms) -> list[EvidenceRetainWindow]`. Derive windows from `ExamEvent.metadata` plus the frozen registry, not a command table. Merge overlapping windows by participant/source, but preserve incident IDs in the response. Split merged windows longer than 60 seconds into adjacent segments.

Add `build_evidence_delivery(run, participant, now_ms)`. It returns every incomplete retain command on every call and computes `release_before_ms` as the earlier of `now_ms - minimum_local_buffer_ms` and the earliest unresolved window start. Task 10 updates `ExamIntegrityMixin` to replace the Worker's empty `pending_commands`/zero watermark with this projection after the durable Worker ACK. A lost public response is therefore rebuilt on the next batch without an SQL command row.

- [ ] **Step 4: Add manifest and completion actions**

Add authenticated student actions:

```text
POST /api/v1/contests/{contest_pk}/exam/integrity/evidence/manifest/
POST /api/v1/contests/{contest_pk}/exam/integrity/evidence/complete/
POST /api/v1/contests/{contest_pk}/exam/integrity/evidence/unavailable/
```

Manifest input includes source, recording session, sequence, init-chunk flag, times, size, codec/content type, SHA-256, previous SHA-256, and local descriptor ID. Validate source against the frozen policy. Upsert the unique physical chunk identity and presign PUT with `ChecksumSHA256` under:

```text
integrity/{contest_id}/{run_id}/{participant_id}/{incident_id}/{source}/{recording_session_id}/{chunk_seq}.webm
```

Completion calls S3-compatible `head_object(ChecksumMode="ENABLED")` and verifies object length plus checksum. Never download or proxy media. An unavailable report marks the projected chunk `unavailable` with a bounded reason and keeps the incident status partial/unavailable for manager review.

When overlapping incidents select the same physical chunk, do not create another table or upload another object. Reuse the unique `ExamEvidenceChunk` row and merge stable `incident_ids`/`event_ids` arrays into its `metadata`; its primary `incident_id`/`exam_event` remain the first association. Evidence status queries must match either the primary columns or these metadata arrays.

Implement `purge_integrity_data(run)` using only object keys recorded by the verified archive manifest and `ExamEvidenceChunk` rows for that exact Run. Delete those objects in bounded batches, verify no recorded object remains, then delete the Run's `ExamEvidenceChunk` rows in one database transaction. Keep `ExamIntegrityRun` and normalized `ExamEvent` audit rows; clear the manifest location only when lifecycle service commits `data_state=PURGED`. Never construct a recursive delete target from a caller-supplied prefix.

- [ ] **Step 5: Extend manager evidence response without removing frames**

Keep existing `ExamEvidenceFrame` WebP/attendance endpoints. Extend manager event/evidence serialization with:

```json
{
  "evidence_status": "pending",
  "evidence_sources": {
    "screen_share": {"status": "complete", "chunks": 4},
    "webcam": {"status": "partial", "chunks": 2}
  }
}
```

Overall status is `pending`, `complete`, `partial`, or `unavailable`. No full-exam video list endpoint is added.

- [ ] **Step 6: Run evidence and existing frame tests**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/integrity/test_evidence_chunks.py \
  apps/contests/tests/test_exam_anticheat.py
```

Expected: direct upload/checksum, window projection, source policy, and legacy frame behavior pass.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/contests/services/integrity_evidence.py \
  backend/apps/contests/services/anticheat_storage.py \
  backend/apps/contests/integrity_serializers.py \
  backend/apps/contests/views/exam_integrity.py \
  backend/apps/contests/views/exam_evidence.py \
  backend/apps/contests/tests/integrity/test_evidence_chunks.py \
  backend/apps/contests/tests/integrity/test_batch_gateway.py
git commit -m "feat(contests): add incident evidence chunks"
```

---

### Task 11: Wire the Controller and Worker Images into Every Compose Environment

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `docker-compose.test.yml`
- Modify: `.env.example`
- Modify: `backend/config/settings/base.py`
- Create: `integrity-service/.dockerignore`
- Create: `integrity-service/tests/test_compose_contract.py`

**Interfaces:**
- Consumes: Built Controller/Worker images, Docker socket, Backend internal network, object storage, and signing secrets.
- Produces: One always-on Controller, a locally available Worker image, and no Backend Docker access.

- [ ] **Step 1: Write the failing Compose contract test**

```python
@pytest.mark.parametrize(
    "compose_file",
    ["docker-compose.yml", "docker-compose.dev.yml", "docker-compose.test.yml"],
)
def test_integrity_compose_contract(repo_root, compose_file):
    config = compose_config(repo_root / compose_file)
    services = config["services"]
    controller = services["integrity-controller"]

    assert "/var/run/docker.sock:/var/run/docker.sock" in controller["volumes"]
    assert all(
        "/var/run/docker.sock" not in volume
        for volume in services["backend"].get("volumes", [])
    )
    assert "integrity-worker-image" in services
    assert controller["privileged"] is False
    assert "ALL" in controller["cap_drop"]
```

- [ ] **Step 2: Run the Compose test and verify RED**

Run:

```bash
cd integrity-service
python -m pytest tests/test_compose_contract.py
```

Expected: `integrity-controller` and `integrity-worker-image` are absent.

- [ ] **Step 3: Add the static Controller and image-build service**

Add to main Compose:

```yaml
integrity-controller:
  build:
    context: ./integrity-service
    dockerfile: Dockerfile.controller
  environment:
    INTEGRITY_CONTROLLER_INTERNAL_TOKEN_FILE: /run-secrets/controller-token
    INTEGRITY_WORKER_IMAGE_ALLOWLIST: ${INTEGRITY_WORKER_IMAGE:-oj-integrity-worker:local}
    INTEGRITY_WORKER_NETWORK: ${INTEGRITY_WORKER_NETWORK:-online_judge_default}
    BACKEND_INTERNAL_URL: http://backend:8000
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - ./secrets/integrity:/run-secrets:ro
  group_add:
    - "${DOCKER_GID:?Set DOCKER_GID to the host Docker socket group}"
  read_only: true
  tmpfs:
    - /tmp:rw,noexec,nosuid,size=64m
  cap_drop:
    - ALL
  security_opt:
    - no-new-privileges:true
  privileged: false
  restart: unless-stopped

integrity-worker-image:
  image: ${INTEGRITY_WORKER_IMAGE:-oj-integrity-worker:local}
  build:
    context: ./integrity-service
    dockerfile: Dockerfile.worker
  command: ["python", "-c", "print('integrity worker image ready')"]
  restart: "no"
  profiles: ["build"]
```

Apply equivalent network/image settings to dev and test. Tests may mount generated temporary keys, but production/development signing and Controller tokens must be secret files, not Compose environment values.

- [ ] **Step 4: Move Docker ownership away from Backend**

Remove `/var/run/docker.sock` and Docker group configuration from Backend services in all three Compose files. Do not remove it from code-judging worker services. Point Backend at `http://integrity-controller:8010` and mount only the Ed25519 private key plus Controller token as read-only files.

Add documented variables:

```dotenv
INTEGRITY_CONTROLLER_URL=http://integrity-controller:8010
INTEGRITY_CONTROLLER_TOKEN_FILE=/run-secrets/controller-token
INTEGRITY_WORKER_IMAGE=oj-integrity-worker:local
INTEGRITY_WORKER_NETWORK=online_judge_default
INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE=/run-secrets/integrity-worker-signing-key
DOCKER_GID=999
```

`DOCKER_GID` is an example only; operators must set it to the group ID owning the host Docker socket. Do not make the Controller root or privileged to bypass a mismatched socket group.

- [ ] **Step 5: Validate all Compose variants**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh main config >/tmp/qjudge-main-compose.yml
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config >/tmp/qjudge-dev-compose.yml
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test config >/tmp/qjudge-test-compose.yml
cd integrity-service
python -m pytest tests/test_compose_contract.py
```

Expected: all Compose configs render; only Controller and code-judging workers retain Docker access.

- [ ] **Step 6: Build both images and smoke-check Controller health**

Run:

```bash
docker compose --profile build build integrity-controller integrity-worker-image
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d integrity-controller
curl --fail http://localhost:8010/health
```

Expected: both images build and Controller returns `{"status":"ok"}`. If the dev port is intentionally not published, run the curl from the Backend container instead.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml docker-compose.test.yml \
  .env.example backend/config/settings/base.py \
  integrity-service/.dockerignore integrity-service/tests/test_compose_contract.py
git commit -m "chore(integrity): wire controller and worker images"
```

---

### Task 12: Build the Browser IndexedDB Outbox and Five-Second Transport

**Files:**
- Create: `frontend/src/core/entities/examIntegrity.entity.ts`
- Create: `frontend/src/core/ports/examIntegrity.port.ts`
- Modify: `frontend/src/core/ports/index.ts`
- Create: `frontend/src/infrastructure/browser/integrity/IndexedDbIntegrityOutbox.ts`
- Create: `frontend/src/infrastructure/browser/integrity/IndexedDbIntegrityOutbox.test.ts`
- Create: `frontend/src/infrastructure/api/repositories/examIntegrity.repository.ts`
- Create: `frontend/src/infrastructure/api/repositories/examIntegrity.repository.test.ts`
- Modify: `frontend/src/infrastructure/api/repositories/index.ts`
- Create: `frontend/src/features/contest/anticheat/integrity/IntegrityTransport.ts`
- Create: `frontend/src/features/contest/anticheat/integrity/IntegrityTransport.test.ts`

**Interfaces:**
- Consumes: Frozen Run/config contract, generic detector signals, authenticated HTTP client, IndexedDB, and browser online state.
- Produces: Durable monotonic records, stable retried batches, five-second state snapshots, ACK deletion, pending evidence commands, and release watermark callbacks.

- [ ] **Step 1: Define the core contracts in a failing type/runtime test**

```typescript
import type {
  ExamIntegrityBatch,
  ExamIntegrityRecord,
  ExamIntegrityStateSnapshot,
} from "@/core/entities/examIntegrity.entity";
import type { ExamIntegrityOutbox } from "@/core/ports/examIntegrity.port";

const snapshot: ExamIntegrityStateSnapshot = {
  pageVisible: true,
  online: false,
  fullscreen: true,
  screenCapture: "active",
  webcamCapture: "disabled",
  activeSourceDescriptors: [],
};

const record: ExamIntegrityRecord = {
  eventId: "11111111-1111-1111-1111-111111111111",
  seq: 8,
  kind: "state_snapshot",
  eventType: "state_snapshot",
  eventSchemaVersion: 1,
  clientOccurredAtMs: 1_785_000_000_000,
  clientRecordedAtMs: 1_785_000_000_010,
  monotonicMs: 82_100,
  payload: snapshot,
  evidenceDescriptors: [],
};

const batch: ExamIntegrityBatch = {
  schemaVersion: 1,
  batchId: "22222222-2222-2222-2222-222222222222",
  runId: "33333333-3333-3333-3333-333333333333",
  participantId: 44,
  deviceId: "device-a",
  registryVersion: "2026-07-21.1",
  firstSeq: 8,
  lastSeq: 8,
  records: [record],
  clientBuild: "frontend-test",
};

export const outboxContract = (
  outbox: ExamIntegrityOutbox,
): Promise<void> => outbox.ackThrough(batch.runId, batch.deviceId, batch.lastSeq);
```

The core entity file contains only serializable types and no DOM, React, Axios, or IndexedDB imports.

- [ ] **Step 2: Write failing durable outbox tests**

```typescript
it("allocates sequence and persists before returning", async () => {
  const outbox = await openTestOutbox();
  const first = await outbox.append(baseSignal("exam_entered", 1_000));
  const second = await outbox.append(baseSignal("clipboard_action", 1_001));

  expect([first.seq, second.seq]).toEqual([1, 2]);
  await outbox.close();

  const reopened = await openTestOutbox();
  expect((await reopened.listPending()).map((item) => item.seq)).toEqual([1, 2]);
});

it("reuses one batch id until ack and deletes only covered records", async () => {
  const outbox = await seededOutbox(5);
  const firstClaim = await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 });
  const retryClaim = await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 });
  expect(retryClaim?.batchId).toBe(firstClaim?.batchId);
  expect(retryClaim?.records.map((item) => item.seq)).toEqual([1, 2, 3]);

  await outbox.ackThrough(RUN_ID, DEVICE_ID, 2);
  expect((await outbox.listPending()).map((item) => item.seq)).toEqual([3, 4, 5]);
});

it("keeps offline records with original occurrence timestamps", async () => {
  const outbox = await openTestOutbox();
  await outbox.append(baseSignal("mouse_leave_triggered", 1_000));
  await advanceClockBy(65_000);
  const record = (await outbox.listPending())[0];
  expect(record.clientOccurredAtMs).toBe(1_000);
  expect(record.clientRecordedAtMs).toBeGreaterThanOrEqual(1_000);
});
```

- [ ] **Step 3: Run outbox/repository tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run \
  src/infrastructure/browser/integrity/IndexedDbIntegrityOutbox.test.ts \
  src/infrastructure/api/repositories/examIntegrity.repository.test.ts \
  src/features/contest/anticheat/integrity/IntegrityTransport.test.ts
```

Expected: modules do not exist.

- [ ] **Step 4: Implement the outbox transaction model**

`ExamIntegrityOutbox` exposes:

```typescript
export interface AppendIntegritySignal {
  eventType: string;
  clientOccurredAtMs: number;
  payload: Record<string, unknown>;
}

export interface ExamIntegrityOutbox {
  append(signal: AppendIntegritySignal): Promise<ExamIntegrityRecord>;
  claimBatch(limit: { maxRecords: number; maxBytes: number }): Promise<ClaimedIntegrityBatch | null>;
  ackThrough(runId: string, deviceId: string, seq: number): Promise<void>;
  failBatch(batchId: string, failure: BatchFailure): Promise<void>;
  listPending(): Promise<ExamIntegrityRecord[]>;
  close(): Promise<void>;
}
```

Use database name `qjudge-exam-integrity-v1` and stores:

- `records` keyed by `[runId, deviceId, seq]`, with indexes on `batchId` and `acked`.
- `meta` keyed by `[runId, deviceId]`, containing `nextSeq`, `ackedThroughSeq`, and `inflightBatchId`.
- `evidenceDescriptors` is reserved for Task 14 and upgraded in the same database versioning function.

`append` allocates `seq` and inserts the record in one read-write transaction. `claimBatch` reuses the current inflight set; otherwise it takes the oldest contiguous prefix bounded by 200 records and 1 MiB, assigns one UUID batch ID, and commits before returning. `ackThrough` rejects a cursor beyond the claimed last sequence and removes only covered records.

For an unrecoverable 400/409/422 response, `failBatch` marks the inflight records `blocked` with the response code and stops tight retry; it never silently deletes them. A 401/403 stops the runtime and invokes the existing reauthentication/session path. Connection errors, 408, 429, and 5xx responses clear only the sending lease, retain the stable batch ID, and retry with capped jittered backoff.

- [ ] **Step 5: Implement the HTTP repository**

`ExamIntegrityRepository` exposes:

```typescript
export interface ExamIntegrityRepository {
  sendBatch(contestId: string, batch: ExamIntegrityBatch): Promise<ExamIntegrityBatchAck>;
  requestEvidenceUploads(
    contestId: string,
    request: EvidenceManifestRequest,
  ): Promise<EvidenceManifestResponse>;
  completeEvidenceUpload(contestId: string, chunkId: string): Promise<void>;
  reportEvidenceUnavailable(
    contestId: string,
    report: EvidenceUnavailableReport,
  ): Promise<void>;
}
```

Map camelCase core entities to the exact snake_case API payload. `sendBatch` performs one request only; retry scheduling belongs to `IntegrityTransport`.

- [ ] **Step 6: Implement the five-second transport**

`IntegrityTransport.start()` immediately appends one `state_snapshot` and schedules a tick every 5,000 ms. Every tick:

1. appends one new sequenced `state_snapshot` from an injected `SnapshotProvider`;
2. claims at most one batch;
3. skips HTTP while `navigator.onLine` is false;
4. sends the claimed batch;
5. on success applies `ackedThroughSeq`, passes every `pendingCommand` to an evidence-command callback, and applies `releaseEvidenceBeforeMs`;
6. on transient failure retains the batch and uses capped jittered backoff before the next eligible tick.

An `online` event requests an immediate transport tick, but it does not send a special direct event or bypass the outbox. A `pagehide` handler may request a tick but must not use `sendBeacon` because the Backend/Worker durable ACK cannot be observed.

Tests use fake timers to prove:

- exactly one snapshot is recorded per tick;
- ordinary detector records are neither merged nor reordered;
- 65 seconds offline then online sends all records with original timestamps;
- a lost ACK retries the same `batchId` and the same records;
- no record is deleted on Backend 503;
- ACK 42 deletes only `seq <= 42`;
- starting twice does not create two timers.

- [ ] **Step 7: Run focused Frontend tests**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run \
  src/infrastructure/browser/integrity/IndexedDbIntegrityOutbox.test.ts \
  src/infrastructure/api/repositories/examIntegrity.repository.test.ts \
  src/features/contest/anticheat/integrity/IntegrityTransport.test.ts
```

Expected: persistence, stable retry, offline replay, timestamp, and timer tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/core/entities/examIntegrity.entity.ts \
  frontend/src/core/ports \
  frontend/src/infrastructure/browser/integrity/IndexedDbIntegrityOutbox.ts \
  frontend/src/infrastructure/browser/integrity/IndexedDbIntegrityOutbox.test.ts \
  frontend/src/infrastructure/api/repositories \
  frontend/src/features/contest/anticheat/integrity/IntegrityTransport.ts \
  frontend/src/features/contest/anticheat/integrity/IntegrityTransport.test.ts
git commit -m "feat(frontend): add durable integrity outbox"
```

---

### Task 13: Convert Existing Detectors into Generic Signal Producers

**Files:**
- Create: `frontend/src/features/contest/anticheat/integrity/IntegrityRuntimeContext.tsx`
- Create: `frontend/src/features/contest/anticheat/integrity/useIntegrityRuntime.ts`
- Create: `frontend/src/features/contest/anticheat/integrity/IntegrityRuntime.test.tsx`
- Modify: `frontend/src/features/contest/components/ExamModeWrapper.tsx`
- Modify: `frontend/src/features/contest/hooks/useExamMonitoring.ts`
- Modify: `frontend/src/features/contest/hooks/useFullscreenMonitoring.ts`
- Modify: `frontend/src/features/contest/hooks/useMouseLeaveMonitoring.ts`
- Modify: `frontend/src/features/contest/hooks/useMultiDisplayMonitoring.ts`
- Modify: `frontend/src/features/contest/hooks/useScreenShareMonitoring.ts`
- Modify: `frontend/src/features/contest/hooks/useViewportMonitoring.ts`
- Modify: `frontend/src/features/contest/hooks/useWebcamMonitoring.ts`
- Modify: `frontend/src/features/contest/hooks/useExamState.ts`
- Modify: `frontend/src/features/contest/hooks/useContestExamActions.ts`
- Modify: `frontend/src/features/contest/screens/paperExam/usePaperExamFlow.ts`
- Modify: `frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.tsx`
- Modify: `frontend/src/infrastructure/api/repositories/exam.repository.ts`
- Modify: `frontend/src/infrastructure/api/http.client.ts`
- Delete: `frontend/src/features/contest/hooks/useExamHeartbeat.ts`
- Delete: `frontend/src/features/contest/hooks/useForceSubmitArbiter.ts`
- Delete: `frontend/src/features/contest/hooks/useForceSubmitArbiter.test.ts`
- Delete: `frontend/src/features/contest/hooks/useViolationPipeline.ts`
- Delete: `frontend/src/features/contest/hooks/useViolationPipeline.test.ts`
- Modify: detector test files adjacent to every modified detector

**Interfaces:**
- Consumes: Frozen registry snapshot, current detector observations, `ExamIntegrityOutbox`, and `IntegrityTransport`.
- Produces: One runtime owner and detector plugins that only emit timestamped generic signals.

- [ ] **Step 1: Write failing runtime-boundary tests**

```typescript
it("persists detector signal before resolving emit", async () => {
  const outbox = createOutboxMock();
  const runtime = createIntegrityRuntime({ outbox, transport, registry });
  await runtime.emit({
    eventType: "exit_fullscreen_triggered",
    clientOccurredAtMs: 1_000,
    payload: { fullscreen: false },
  });
  expect(outbox.append).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: "exit_fullscreen_triggered",
      clientOccurredAtMs: 1_000,
    }),
  );
  expect(repository.sendBatch).not.toHaveBeenCalled();
});

it("does not add timers, dedupe, priority, grace, or actions in detector runtime", async () => {
  const runtime = createIntegrityRuntime({ outbox, transport, registry });
  await runtime.emit(signal("mouse_leave_triggered", 1_000));
  await runtime.emit(signal("mouse_leave_triggered", 1_001));
  expect(outbox.append).toHaveBeenCalledTimes(2);
  expect(requestForceSubmit).not.toHaveBeenCalled();
  expect(pauseExam).not.toHaveBeenCalled();
});

it("accepts a registry-only event without changing transport core", async () => {
  const extendedRegistry = withDefinition(registry, {
    id: "head_pose",
    signals: { triggered: "head_pose_changed", escalated: "", restored: "" },
    emission: "sample",
  });
  const runtime = createIntegrityRuntime({ outbox, transport, registry: extendedRegistry });
  await runtime.emit(signal("head_pose_changed", 2_000));
  expect(outbox.append).toHaveBeenCalledWith(
    expect.objectContaining({ eventType: "head_pose_changed" }),
  );
});
```

- [ ] **Step 2: Run runtime and detector tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run \
  src/features/contest/anticheat/integrity/IntegrityRuntime.test.tsx \
  src/features/contest/hooks/useFullscreenMonitoring.test.ts \
  src/features/contest/hooks/useScreenShareMonitoring.test.ts \
  src/features/contest/hooks/useWebcamMonitoring.test.ts
```

Expected: runtime module is absent and existing tests still expect direct APIs/arbitration.

- [ ] **Step 3: Add one runtime owner to `ExamModeWrapper`**

Build the runtime only when all are true:

- exam monitoring is active;
- config version 2 contains a non-destroyed Run;
- Run `computeState` is `running`;
- registry/policy snapshots are present;
- authenticated participant/device identity is available.

Provide:

```typescript
export interface IntegritySignalEmitter {
  emit(signal: {
    eventType: string;
    clientOccurredAtMs: number;
    payload: Record<string, unknown>;
  }): Promise<void>;
}
```

`ExamModeWrapper` starts/stops exactly one `IntegrityTransport`, supplies state snapshot values, and provides the emitter through `IntegrityRuntimeContext`. It does not poll risk or decide actions.

- [ ] **Step 4: Simplify every detector**

For each detector:

- preserve browser listener/sensor setup and source-level sampling;
- emit triggered/restored observations at the time the browser callback fires;
- include raw bounded metadata needed by the registry schema;
- remove direct `recordExamEvent`/`recordExamEventWithForcedCapture` calls;
- remove local escalation/grace timers, incident grouping, priority/cooldown, pause/lock/force-submit decisions;
- remove forced-capture calls.

The Worker interprets triggered/escalated/restored semantics from the frozen registry. If a local UI warning is needed, it reflects current sensor state only and is never the authoritative participant status.

Lifecycle signals `exam_entered` and `exam_submit_initiated` also use `emit`. User-initiated submit continues through the existing submission API; only automatic submission authority moves to the Worker.

- [ ] **Step 5: Remove duplicate authorities**

Delete `useExamHeartbeat`; the five-second `state_snapshot` is the liveness record. Delete `useViolationPipeline` and `useForceSubmitArbiter`; remove their props/types from detector hooks and `ExamModeWrapper`. Replace event callers of `recordExamEventWithForcedCapture` with the runtime emitter, but retain the underlying forced-capture module until Task 14 removes the screenshot capture-hook registrations. After all direct event callers move, remove `recordExamEvent` and its retry constants from `exam.repository.ts` and remove the `/exam/events/` retry exception in `http.client.ts`. Keep manager `getExamEvents`.

Do not delete `ExamEvidenceFrame` attendance flows or the capture streams themselves. Task 14 replaces only event-triggered screenshot ring buffers with rolling MediaRecorder chunks.

- [ ] **Step 6: Add a direct-call boundary test**

Add to `IntegrityRuntime.test.tsx`:

```typescript
it("contains no legacy direct event transport imports", async () => {
  const sourceFiles = await contestIntegritySourceFiles();
  for (const source of sourceFiles) {
    expect(source.text).not.toMatch(/\brecordExamEvent(?:WithForcedCapture)?\b/);
    expect(source.text).not.toMatch(/\buseForceSubmitArbiter\b/);
    expect(source.text).not.toMatch(/\buseViolationPipeline\b/);
  }
});
```

Scope `contestIntegritySourceFiles()` to `ExamModeWrapper`, contest monitoring hooks, and paper-exam answering flow; manager event listing may continue importing `getExamEvents`.

- [ ] **Step 7: Run all affected detector tests and build**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run \
  src/features/contest/anticheat/integrity \
  src/features/contest/hooks/useExamMonitoring.test.ts \
  src/features/contest/hooks/useFullscreenMonitoring.test.ts \
  src/features/contest/hooks/useMouseLeaveMonitoring.test.ts \
  src/features/contest/hooks/useMultiDisplayMonitoring.test.ts \
  src/features/contest/hooks/useScreenShareMonitoring.test.ts \
  src/features/contest/hooks/useViewportMonitoring.test.ts \
  src/features/contest/hooks/useWebcamMonitoring.test.ts
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
```

Expected: detectors emit without direct HTTP/force-submit, and production build passes.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/contest/anticheat \
  frontend/src/features/contest/components/ExamModeWrapper.tsx \
  frontend/src/features/contest/hooks \
  frontend/src/features/contest/screens/paperExam \
  frontend/src/infrastructure/api/repositories/exam.repository.ts \
  frontend/src/infrastructure/api/http.client.ts
git commit -m "refactor(frontend): make detectors emit integrity signals"
```

---

### Task 14: Add OPFS MediaRecorder Buffers and Incident-Only Upload

**Files:**
- Create: `frontend/src/infrastructure/browser/integrity/OpfsEvidenceStore.ts`
- Create: `frontend/src/infrastructure/browser/integrity/OpfsEvidenceStore.test.ts`
- Create: `frontend/src/infrastructure/browser/integrity/MediaRecorderChunker.ts`
- Create: `frontend/src/infrastructure/browser/integrity/MediaRecorderChunker.test.ts`
- Create: `frontend/src/features/contest/anticheat/integrity/EvidenceCoordinator.ts`
- Create: `frontend/src/features/contest/anticheat/integrity/EvidenceCoordinator.test.ts`
- Modify: `frontend/src/features/contest/anticheat/integrity/IntegrityTransport.ts`
- Modify: `frontend/src/features/contest/anticheat/integrity/IntegrityRuntimeContext.tsx`
- Modify: `frontend/src/features/contest/components/ExamModeWrapper.tsx`
- Modify: `frontend/src/features/contest/contexts/ExamCaptureContext.tsx`
- Modify: `frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.tsx`
- Modify: `frontend/src/features/contest/screens/paperExam/hooks/useAnticheatScreenCapture.ts`
- Modify: `frontend/src/features/contest/screens/paperExam/hooks/useAnticheatWebcamCapture.ts`
- Delete: `frontend/src/features/contest/anticheat/forcedCapture.ts`
- Delete: `frontend/src/features/contest/anticheat/forcedCapture.test.ts`
- Delete: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/evidenceRingBuffer.ts`
- Delete: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/evidenceRingBuffer.test.ts`
- Delete: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/useEventEvidenceCapture.ts`
- Delete: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/useEventEvidenceCapture.test.ts`
- Delete: `frontend/src/features/contest/screens/paperExam/hooks/anticheat/useAnticheatUploader.ts`

**Interfaces:**
- Consumes: Policy-enabled screen/webcam `MediaStream` objects, OPFS, IndexedDB descriptors, projected `retain_evidence` commands, and Backend presigned upload APIs.
- Produces: Separate five-second hash-chained local media chunks and uploads only chunks intersecting incident windows.

- [ ] **Step 1: Write failing store/chunker tests**

```typescript
it("writes media bytes to OPFS before committing its descriptor", async () => {
  const store = createEvidenceStore({ opfs, indexedDb });
  const descriptor = await store.putChunk(makeChunk({ seq: 1, bytes: WEBM_INIT }));
  expect(opfs.writeOrder).toEqual(["write", "flush", "close"]);
  expect(indexedDb.descriptorWrites[0].sha256).toBe(await sha256Hex(WEBM_INIT));
  expect(descriptor.localAvailability).toBe("available");
});

it("keeps screen and webcam sessions separate with a shared epoch", async () => {
  const screen = createChunker({ source: "screen_share", epochId: EPOCH_ID });
  const webcam = createChunker({ source: "webcam", epochId: EPOCH_ID });
  expect(screen.recordingSessionId).not.toBe(webcam.recordingSessionId);
  expect(screen.epochId).toBe(webcam.epochId);
});

it("forms a hash chain and marks codec initialization", async () => {
  const descriptors = await recordThreeChunks();
  expect(descriptors[0].isInitChunk).toBe(true);
  expect(descriptors[0].previousSha256).toBe("");
  expect(descriptors[1].previousSha256).toBe(descriptors[0].sha256);
  expect(descriptors[2].previousSha256).toBe(descriptors[1].sha256);
});
```

- [ ] **Step 2: Write failing evidence-coordinator tests**

```typescript
it("uploads only chunks intersecting the requested incident window", async () => {
  const coordinator = createCoordinatorWithChunks([
    chunk(1, 970_000, 975_000),
    chunk(2, 995_000, 1_000_000),
    chunk(3, 1_015_000, 1_020_000),
    chunk(4, 1_030_000, 1_035_000),
  ]);
  await coordinator.retain({
    commandId: "retain-1",
    incidentId: INCIDENT_ID,
    sources: ["screen_share"],
    startAtMs: 990_000,
    endAtMs: 1_020_000,
  });
  expect(repository.uploadedChunkSeqs).toEqual([2, 3]);
});

it("does not delete protected chunks until verified and released", async () => {
  const coordinator = createCoordinatorWithProtectedChunk();
  await coordinator.releaseBefore(2_000_000);
  expect(evidenceStore.deletedIds).toEqual([]);
  repository.markVerified();
  await coordinator.releaseBefore(2_000_000);
  expect(evidenceStore.deletedIds).toEqual([PROTECTED_CHUNK_ID]);
});

it("records unavailable evidence when policy source is interrupted", async () => {
  const coordinator = createCoordinatorWithMissingSource("webcam");
  await coordinator.retain(webcamRetainCommand());
  expect(repository.reportEvidenceUnavailable).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ source: "webcam", reason: "source_unavailable" }),
  );
});
```

- [ ] **Step 3: Run media tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run \
  src/infrastructure/browser/integrity/OpfsEvidenceStore.test.ts \
  src/infrastructure/browser/integrity/MediaRecorderChunker.test.ts \
  src/features/contest/anticheat/integrity/EvidenceCoordinator.test.ts
```

Expected: media store/chunker/coordinator modules are absent.

- [ ] **Step 4: Implement OPFS bytes plus IndexedDB descriptors**

Store bytes at:

```text
exam-integrity/{runId}/{deviceId}/{source}/{recordingSessionId}/{chunkSeq}.webm
```

Descriptor fields match Backend `ExamEvidenceChunk` plus `epochId`, actual width/height/FPS/bitrate, `localAvailability`, `retainCount`, `uploadStatus`, `verifiedAtMs`, `batchAcked`, and `createdAtMs`. Use Web Crypto SHA-256 over the Blob and link `previousSha256`.

Write OPFS and flush before committing the descriptor. On startup, reconcile orphan files/descriptors: delete an unreferenced partial file, mark a missing descriptor file unavailable, and resume requested uploads using the same hash/object identity.

The next `state_snapshot` after a chunk closes copies every not-yet-reported descriptor summary into `ExamIntegrityRecord.evidenceDescriptors`; it never copies Blob bytes. Persist the relationship between descriptor IDs and outbox sequence. When that sequence is ACKed, mark those descriptors `batchAcked=true`. Lost-ACK retries therefore carry identical descriptor summaries and do not duplicate local files.

- [ ] **Step 5: Implement policy-driven MediaRecorder sessions**

Start only sources enabled by the frozen policy:

- screen target: 1280×720, 5 FPS, 800,000 bits/sec;
- webcam target: 640×480, 10 FPS, 350,000 bits/sec;
- standalone segment duration: 5,000 ms;
- codec: first supported result from `MediaRecorder.isTypeSupported`, then record the actual MIME.

Use separate recorders/sessions with a shared epoch ID. Stop and recreate each source's MediaRecorder every five seconds so every stored Blob is a standalone decodable segment with its own container initialization data; chain those segments with a source-wide monotonically increasing `chunkSeq` and `previousSha256`. Start the next recorder immediately on the same live stream and record the measured gap in descriptor metadata. Emit `evidence_source_degraded` through the generic emitter on permission denial, stream end, encoder/restart failure, or unsupported recorder.

The five-minute/100 MB per-source safety cap and minimum 60-second rolling window are enforced by deleting only release-eligible unprotected chunks. If the cap cannot be recovered without deleting protected or unacknowledged data, keep protected data, stop admitting new chunks for that source, and emit `evidence_buffer_degraded` with measured bytes/duration; never silently delete requested evidence.

- [ ] **Step 6: Implement retain/upload/release coordination**

For each projected retain command:

1. select descriptors whose `[startAtMs, endAtMs]` intersects the requested window;
2. include the required initialization chunk for the recording session;
3. increment retain protection before asynchronous work;
4. request bound upload intents from Backend;
5. PUT Blob bytes directly to each presigned URL with required content/checksum headers;
6. call completion and wait for verified status;
7. mark the descriptor verified and complete the command;
8. report missing/evicted/source-disabled chunks as unavailable.

Merge overlapping local retain work and reuse one verified chunk across incidents while still sending each incident/chunk association in the manifest request.

Deletion requires all four conditions: earlier than release watermark, no pending retain, upload verified if ever retained, and the descriptor's snapshot batch ACKed. `IntegrityTransport` forwards `pendingCommands` and `releaseEvidenceBeforeMs` to `EvidenceCoordinator` after ACK.

- [ ] **Step 7: Replace screenshot event buffers without breaking attendance**

Modify `useAnticheatScreenCapture` and `useAnticheatWebcamCapture` to expose live streams to the MediaRecorder runtime and remove `useEventEvidenceCapture`/forced-capture registration. Remove `forceCaptureNow` from `ExamCaptureContext` and `ExamModeWrapper`; keep only capture lifecycle controls and a flush that waits for already requested evidence uploads. Delete `forcedCapture.ts` and the screenshot event ring buffer files.

Delete `useAnticheatUploader` because its only caller is the removed event screenshot buffer. Keep Backend `ExamEvidenceFrame` and its independent precheck/attendance WebP APIs. Add a source scan test proving the answering runtime no longer uploads periodic full-exam frames or calls legacy forced capture for monitoring events.

- [ ] **Step 8: Run media, capture, and production-build checks**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run \
  src/infrastructure/browser/integrity \
  src/features/contest/anticheat/integrity \
  src/features/contest/screens/paperExam/hooks/useAnticheatScreenCapture.test.ts \
  src/features/contest/screens/paperExam/hooks/useAnticheatWebcamCapture.test.ts
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
```

Expected: selective direct upload, recovery, policy gating, source isolation, retention guard, and build checks pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/infrastructure/browser/integrity \
  frontend/src/features/contest/anticheat/integrity \
  frontend/src/features/contest/anticheat/forcedCapture.ts \
  frontend/src/features/contest/anticheat/forcedCapture.test.ts \
  frontend/src/features/contest/components/ExamModeWrapper.tsx \
  frontend/src/features/contest/contexts/ExamCaptureContext.tsx \
  frontend/src/features/contest/screens/paperExam/PaperExamAnsweringScreen.tsx \
  frontend/src/features/contest/screens/paperExam/hooks
git commit -m "feat(frontend): retain incident-only media evidence"
```

---

### Task 15: Add Integrity Run Controls to the Existing Proctoring Panel

**Files:**
- Modify: `frontend/src/core/entities/examIntegrity.entity.ts`
- Modify: `frontend/src/infrastructure/api/repositories/examIntegrity.repository.ts`
- Create: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.tsx`
- Create: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.module.scss`
- Create: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.test.tsx`
- Create: `frontend/src/features/contest/components/admin/IntegrityRunControlCard.stories.tsx`
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminProctoringPanel.tsx`
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminProctoringPanel.module.scss`
- Modify: `frontend/src/i18n/locales/en/contest.json`
- Modify: `frontend/src/i18n/locales/zh-TW/contest.json`
- Modify: `frontend/src/i18n/locales/ja/contest.json`
- Modify: `frontend/src/i18n/locales/ko/contest.json`

**Interfaces:**
- Consumes: Nested manager Run APIs from Task 3 and existing contest manager authorization.
- Produces: Manual Create/Start/Stop/Destroy/Purge controls, concise status/health/data visibility, and audit-triggering manager actions.

- [ ] **Step 1: Write failing component behavior tests**

```tsx
it("shows the three independent state dimensions", async () => {
  renderCard({
    run: makeRun({
      computeState: "running",
      health: "unhealthy",
      dataState: "open",
      warnings: ["archive_lag"],
    }),
  });
  expect(screen.getByText("執行中")).toBeVisible();
  expect(screen.getByText("異常")).toBeVisible();
  expect(screen.getByText("資料開放中")).toBeVisible();
  expect(screen.getByText("封存延遲")).toBeVisible();
});

it("starts only after explicit confirmation and refreshes the run", async () => {
  const repository = createRepositoryMock();
  renderCard({ run: stoppedRun(), repository });
  await userEvent.click(screen.getByRole("button", { name: "啟動 Integrity Worker" }));
  expect(repository.startRun).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "確認啟動" }));
  expect(repository.startRun).toHaveBeenCalledWith(CONTEST_ID, RUN_ID);
  expect(repository.getRun).toHaveBeenCalled();
});

it("does not offer destroy until stop archived the run", () => {
  renderCard({ run: makeRun({ computeState: "stopping", dataState: "open" }) });
  expect(screen.getByRole("button", { name: "銷毀運算資源" })).toBeDisabled();
  expect(screen.getByText("需先完成停止與封存")).toBeVisible();
});

it("requires typed contest name before purge", async () => {
  renderCard({ run: destroyedArchivedRun(), contestName: "期中考" });
  await userEvent.click(screen.getByRole("button", { name: "清除保留資料" }));
  await userEvent.type(screen.getByLabelText("輸入考試名稱以確認"), "期中考");
  expect(screen.getByRole("button", { name: "永久清除" })).toBeEnabled();
});
```

- [ ] **Step 2: Run UI tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run \
  src/features/contest/components/admin/IntegrityRunControlCard.test.tsx
```

Expected: component and repository methods do not exist.

- [ ] **Step 3: Add manager repository methods**

Extend `ExamIntegrityRepository`:

```typescript
listRuns(contestId: string): Promise<ExamIntegrityRun[]>;
getRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
createRun(contestId: string): Promise<ExamIntegrityRun>;
startRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
stopRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
destroyRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
purgeRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
```

Map the complete Run response, including compute/health/data states, policy/registry/Worker versions, scheduled/start/stop times, heartbeat, batch rate, participant counts, journal bytes/oldest age, archive lag, incident/evidence counts, warnings, last error, and guard reasons.

- [ ] **Step 4: Build a Carbon-first control card**

Use Carbon `Tile`, `Tag`, `Button`, `Modal`, `DefinitionTooltip`, and `SkeletonText`. Use `useToast` for action success/failure. Do not override `.cds--*`/`.bx--*` classes, use `!important`, or hard-code theme colors.

Display:

- lifecycle, health, and data-state Tags as separate values;
- Start recommendation showing whether current time is before/inside/after the T-60 preparation window;
- last Worker heartbeat and participant last-seen counts;
- batch rate, unarchived bytes, oldest raw record age, and archive lag;
- normalized incident count and evidence status counts;
- Worker image digest, Worker version, and registry/policy versions;
- warning codes translated to human text, last error, and correlation ID when present.

Actions:

- no Run: `建立 Run`;
- STOPPED: `啟動 Integrity Worker`;
- RUNNING: `停止並封存`;
- STOPPED+ARCHIVED: `銷毀運算資源`, explicitly stating retained data is not deleted;
- DESTROYED+ARCHIVED: `清除保留資料` behind a danger Modal and typed contest name.

Disable invalid transitions using Backend `guardReasons` and still handle HTTP 409 after a stale UI race.

- [ ] **Step 5: Embed it without introducing a second scroll owner**

Insert `IntegrityRunControlCard` near the top of `AdminProctoringPanel`. Let the existing panel own vertical scrolling; the card must not set viewport height or `overflow-y: auto`. Use Carbon spacing/grid tokens in the module stylesheet.

Poll the active Run every five seconds only while the proctoring panel is visible. Stop polling on unmount/hidden page and refresh immediately after each lifecycle action. Polling is manager observability only and does not become exam/event authority.

- [ ] **Step 6: Add Storybook operational states**

Create stories for:

- no Run;
- stopped/preparation window;
- running/healthy;
- running with warnings;
- stopping/archive lag;
- stopped/archived;
- destroyed/data retained;
- action loading/error.

Use `satisfies Meta<typeof IntegrityRunControlCard>` and local mock repository functions; stories must not call Backend.

- [ ] **Step 7: Run UI, i18n, style, and build checks**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run \
  src/features/contest/components/admin/IntegrityRunControlCard.test.tsx
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run check:i18n
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
```

Expected: control guards, translated states, Carbon style gate, and build pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/core/entities/examIntegrity.entity.ts \
  frontend/src/infrastructure/api/repositories/examIntegrity.repository.ts \
  frontend/src/features/contest/components/admin/IntegrityRunControlCard.tsx \
  frontend/src/features/contest/components/admin/IntegrityRunControlCard.module.scss \
  frontend/src/features/contest/components/admin/IntegrityRunControlCard.test.tsx \
  frontend/src/features/contest/components/admin/IntegrityRunControlCard.stories.tsx \
  frontend/src/features/contest/screens/admin/panels \
  frontend/src/i18n/locales/en/contest.json \
  frontend/src/i18n/locales/zh-TW/contest.json \
  frontend/src/i18n/locales/ja/contest.json \
  frontend/src/i18n/locales/ko/contest.json
git commit -m "feat(frontend): add integrity run controls"
```

---

### Task 16: Perform the Direct Cutover, Capacity Test, and Final Verification

**Files:**
- Modify: `backend/apps/contests/tasks.py`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/apps/contests/tests/tasks/test_tasks.py`
- Delete: `backend/apps/contests/tests/tasks/test_heartbeat.py`
- Modify: `backend/apps/contests/tests/test_exam_anticheat.py`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `docker-compose.test.yml`
- Modify: `loadtests/anticheat_exam/locustfile.py`
- Modify: `loadtests/anticheat_exam/README.md`
- Create: `integrity-service/tests/test_replay.py`
- Modify: `backend/schema.yml`
- Modify: `docs/anticheat-architecture.md`
- Modify: `docs/loadtest.md`
- Create: `docs/operations/exam-integrity-runbook.md`

**Interfaces:**
- Consumes: All completed tasks and an environment with no active examinations.
- Produces: One authoritative Worker path, retired duplicate jobs, 200-client evidence, replay proof, generated API schema, and an operator runbook.

- [ ] **Step 1: Add failing cutover assertions**

Add Backend tests:

```python
def test_contest_periodic_tasks_are_retired():
    from django.conf import settings
    retired = {
        "apps.contests.tasks.check_contest_end",
        "apps.contests.tasks.check_force_submit_locked",
        "apps.contests.tasks.check_heartbeat_timeout",
    }
    configured = {
        item["task"] for item in settings.CELERY_BEAT_SCHEDULE.values()
    }
    assert configured.isdisjoint(retired)
    assert "sweep-stale-ai-runs-every-60-seconds" in settings.CELERY_BEAT_SCHEDULE


def test_legacy_contest_task_symbols_are_gone():
    import apps.contests.tasks as tasks
    assert not hasattr(tasks, "check_contest_end")
    assert not hasattr(tasks, "auto_submit_participants")
    assert not hasattr(tasks, "check_force_submit_locked")
    assert not hasattr(tasks, "force_submit_locked_participant")
    assert not hasattr(tasks, "check_heartbeat_timeout")
```

Add `test_replay.py`:

```python
def test_archived_journal_replays_deterministically(tmp_path):
    first = replay_archive(FIXTURE_ARCHIVE, output_dir=tmp_path / "first")
    second = replay_archive(FIXTURE_ARCHIVE, output_dir=tmp_path / "second")
    assert first.normalized_commands == second.normalized_commands
    assert first.final_cursors == second.final_cursors
    assert first.manifest_sha256 == second.manifest_sha256
```

- [ ] **Step 2: Run cutover tests and verify RED**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests/tests/tasks/test_tasks.py
cd integrity-service
python -m pytest tests/test_replay.py
```

Expected: retired task symbols/Beat entries remain and replay fixture support is incomplete.

- [ ] **Step 3: Remove the five duplicate contest tasks**

Delete from `tasks.py`:

- `check_contest_end`;
- `auto_submit_participants`;
- `check_force_submit_locked`;
- `force_submit_locked_participant`;
- `check_heartbeat_timeout`;
- helper constants/imports/functions used only by those tasks.

Delete the three Beat schedule entries:

- `check-contest-end-every-minute`;
- `check-force-submit-locked-every-30-seconds`;
- `check-heartbeat-timeout-every-30-seconds`.

Keep `sweep-stale-ai-runs-every-60-seconds` and keep the `celery-beat` service. Delete heartbeat-task tests and rewrite task tests to assert the absence of duplicate authority plus the continued AI sweep schedule.

- [ ] **Step 4: Isolate the high-priority Celery queue**

Change `celery-high` command from:

```text
celery -A config worker -l info -Q high_priority,default --concurrency=2
```

to:

```text
celery -A config worker -l info -Q high_priority --concurrency=2
```

Apply the same intent in dev/test overrides. Keep the default Celery worker, Beat, code judge image/workers, AI service, and their required Docker access.

- [ ] **Step 5: Update the 200-client Locust scenario**

Replace direct `/exam/events/` heartbeat/event calls with a per-user monotonic sequence and:

```text
POST /api/v1/contests/{contest_id}/exam/integrity/batches/
```

Every simulated user sends one batch per five seconds containing a state snapshot and any queued raw signals. Preserve one `batch_id` for retry until the returned `acked_through_seq` covers its records. Add scenarios:

- normal 200-user steady state;
- 65-second offline accumulation then reconnect;
- duplicate/lost ACK retry;
- incident retain manifest with screen and webcam descriptor metadata but small fixture media;
- Stop/archive after ingest.

Run:

```bash
locust -f loadtests/anticheat_exam/locustfile.py \
  --headless -u 200 -r 40 -t 15m \
  --host http://localhost:8000 \
  --csv /tmp/qjudge-integrity-200
```

Pass criteria:

- sustained approximately 40 batch requests/second;
- batch ACK p95 below 500 ms;
- zero ACKed sequence loss after Worker restart/replay validation;
- no PostgreSQL batch/session/command rows;
- reconnect drains all offline records without timestamp mutation;
- object storage contains compressed journal segments, not one object per five-second batch;
- only incident-selected media objects are uploaded.

- [ ] **Step 6: Verify Stop, Destroy, and Purge operational guards**

Use one disposable Run and record the exact IDs in the test log:

1. Create and Start at least one minute before the test contest begins.
2. Ingest records and trigger one evidence incident.
3. Allow scheduled end to auto-submit participants; verify the Worker remains RUNNING.
4. Stop; verify STOPPING persists until segment and manifest verification completes, then STOPPED+ARCHIVED.
5. Destroy; verify container/secret volume are removed and run data volume/archive remain.
6. Purge only after explicit operator action; verify archive objects and retained volume are removed and `data_state=PURGED`.

Do not run Purge against a non-disposable Run.

- [ ] **Step 7: Generate schema and update architecture/operations docs**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  python manage.py spectacular --file schema.yml
```

Copy the generated schema to the tracked `backend/schema.yml` when the test container writes to a mounted source path. Document:

- lifecycle and the difference between Stop, Destroy, and Purge;
- Start at T-60 recommendation and manual ownership;
- Worker unavailable/no-ACK recovery;
- journal/archive inspection and deterministic replay;
- warning/health interpretation;
- evidence partial/unavailable handling;
- signing/controller/per-run token rotation;
- disk/object-store capacity alerts;
- why Backend/Worker raw batch PostgreSQL tables do not exist;
- retired Celery jobs and services that must remain.

- [ ] **Step 8: Run the full Backend and service suites**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  python manage.py makemigrations --check --dry-run
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend-test \
  pytest -q apps/contests
cd integrity-service
python -m pytest
```

Expected: no pending migration and all contest/Integrity tests pass.

- [ ] **Step 9: Run Frontend tests, build, and QJudge gates**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm test -- --run src/features/contest src/infrastructure/browser/integrity \
  src/infrastructure/api/repositories/examIntegrity.repository.test.ts
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-naming.js --root frontend/src
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js \
  --root frontend/src --policy compat
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh
```

Expected: tests/build pass and all three QJudge gates report no new violation.

- [ ] **Step 10: Validate Compose and repository cleanliness**

Run:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh main config >/tmp/qjudge-main-compose.yml
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config >/tmp/qjudge-dev-compose.yml
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test config >/tmp/qjudge-test-compose.yml
git diff --check
git status --short
```

Expected: every Compose variant renders, no whitespace errors exist, and only intended implementation files are modified.

- [ ] **Step 11: Commit the cutover**

```bash
git add backend/apps/contests/tasks.py backend/config/settings/base.py \
  backend/apps/contests/tests/tasks backend/apps/contests/tests/test_exam_anticheat.py \
  backend/schema.yml \
  docker-compose.yml docker-compose.dev.yml docker-compose.test.yml \
  loadtests/anticheat_exam \
  integrity-service/tests/test_replay.py \
  docs/anticheat-architecture.md docs/loadtest.md \
  docs/operations/exam-integrity-runbook.md
git commit -m "feat(integrity): cut over exam monitoring authority"
```

---

## Implementation Review Checkpoints

Because this change crosses more than 20 files, preserve the task-level commits above and review it in four coherent checkpoints:

1. Tasks 1–3: PostgreSQL contract, canonical registry, lifecycle, and scoped credentials.
2. Tasks 4–11: journal/Worker/Controller, Backend gateway/commands/evidence, and Compose boundary.
3. Tasks 12–15: browser outbox, generic detectors, incident media, and administrator controls.
4. Task 16: authority cutover, capacity/replay evidence, schema, and operations documentation.

Do not merge a later checkpoint before its dependency checkpoint passes. Each checkpoint targets `dev` under the QJudge branch policy; the final cutover checkpoint must include the full verification output and explain the intentional cross-cutting size.
