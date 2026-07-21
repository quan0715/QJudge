"""Single-owner Worker runtime for durable ingest, replay, scheduling, and stop."""

from __future__ import annotations

import asyncio
import hashlib
import json
import threading
import time
from collections.abc import Awaitable
from pathlib import Path
from typing import Callable, Literal
from uuid import UUID

from integrity_service.core.commands import (
    EngineContext,
    IntegrityCommand,
    SubmissionState,
    make_command,
)
from integrity_service.core.connectivity import ConnectivityMonitor
from integrity_service.core.incidents import IncidentEngine
from integrity_service.core.records import AdmittedEventRecord, snapshot_event_record
from integrity_service.core.registry import Registry
from integrity_service.core.scheduler import DeadlineScheduler
from integrity_service.core.schemas import BatchAck, EventBatch, EventRecord
from integrity_service.core.sequencer import AcceptResult, SessionSequencer
from integrity_service.core.timeline import (
    BatchReceiptEntry,
    DecisionTimeline,
    ReceiptPlan,
    SubmissionEntry,
    TimelineBaseline,
)
from integrity_service.journal.archive import (
    ArchiveManager,
    ArchiveResult,
    SegmentedJournal,
)
from integrity_service.journal.command_outbox import (
    CommandOutbox,
    DurableLogCorruption,
    TimelineJournal,
)
from integrity_service.worker.backend_client import BackendUnavailable
from integrity_service.worker.settings import WorkerBootstrap


class RunMismatch(ValueError):
    """A batch belongs to another isolated Worker run."""


class WorkerNotAccepting(RuntimeError):
    """The Worker has begun its archival stop sequence."""


class ArchiveNotConfigured(RuntimeError):
    """The scoped Backend does not support presigned archive upload."""


MAX_WARNING_COMMANDS_PER_RECEIPT = 32


class WorkerRuntime:
    """Serialize all live calls through one DecisionTimeline and one durable lock."""

    def __init__(
        self,
        *,
        bootstrap: WorkerBootstrap,
        data_root: Path,
        backend: object,
        clock_ms: Callable[[], int] | None = None,
        scheduler_wait: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self.bootstrap = bootstrap
        self.run_id = bootstrap.run_id
        self.backend = backend
        self._policy_snapshot = json.loads(self._canonical(bootstrap.policy_snapshot))
        self._registry_snapshot = json.loads(
            self._canonical(bootstrap.registry_snapshot)
        )
        self._clock_ms = clock_ms or (lambda: time.time_ns() // 1_000_000)
        self._scheduler_wait = scheduler_wait or self._wait_one_second
        self._lock = threading.RLock()
        self._accepting = True
        self._healthy = True
        self._state = "RUNNING"
        self._warning_codes: set[str] = set()
        self._scheduler_task: asyncio.Task[None] | None = None
        self._final_cursors: dict[str, int] = {}

        run_root = data_root / str(self.run_id)
        run_root.mkdir(parents=True, exist_ok=True)
        archive_policy = bootstrap.archive_policy
        self.journal = SegmentedJournal(
            run_root / "journal",
            started_at_ms=bootstrap.server_ms,
            rotate_after_ms=self._policy_int(
                archive_policy, "rotate_after_ms", 60_000, minimum=1
            ),
            max_segment_bytes=self._policy_int(
                archive_policy, "max_segment_bytes", 8 * 1024 * 1024, minimum=1
            ),
            capacity_warning_bytes=self._policy_int(
                archive_policy, "capacity_warning_bytes", 0, minimum=0
            ),
        )
        self.timeline_journal = TimelineJournal(run_root / "timeline")
        self.outbox = CommandOutbox(run_root / "outbox")

        baseline = self._load_or_create_baseline(bootstrap)
        self.registry = Registry(self._registry_snapshot)
        self.sequencer = SessionSequencer()
        self.submissions = SubmissionState()
        context = EngineContext(self.run_id)
        self.incidents = IncidentEngine(self.registry, context, self.submissions)
        self.connectivity = ConnectivityMonitor(
            self._policy_snapshot,
            self.registry,
            context,
            self.submissions,
        )
        self.scheduler = DeadlineScheduler(
            bootstrap.scheduled_end_ms,
            context,
            self.submissions,
        )
        self.timeline = DecisionTimeline(
            baseline=baseline,
            incidents=self.incidents,
            connectivity=self.connectivity,
            scheduler=self.scheduler,
            submissions=self.submissions,
        )
        self._timeline_seq = 0
        self._clock_server_ms = baseline.server_ms
        self._replay_timeline()

        digest = lambda value: hashlib.sha256(self._canonical(value)).hexdigest()
        self.archiver = ArchiveManager(
            root=run_root / "archive",
            run_id=self.run_id,
            generation=bootstrap.generation,
            journal=self.journal,
            outbox=self.outbox,
            backend=backend,
            snapshot_digests={
                "policy": digest(self._policy_snapshot),
                "registry": digest(self._registry_snapshot),
            },
            frozen_snapshots={
                "policy": self._policy_snapshot,
                "registry": self._registry_snapshot,
            },
        )

    @property
    def accepting(self) -> bool:
        return self._accepting

    @property
    def healthy(self) -> bool:
        return self._healthy and self.journal.healthy and self.archiver.healthy

    @property
    def state(self) -> str:
        return self._state

    @property
    def warning_codes(self) -> frozenset[str]:
        return (
            frozenset(self._warning_codes)
            | self.journal.warning_codes
            | self.archiver.warning_codes
        )

    def ingest(self, batch: EventBatch, received_at_ms: int) -> BatchAck:
        with self._lock:
            if not self.healthy:
                raise OSError("Worker is unhealthy and requires recovery")
            if not self._accepting:
                raise WorkerNotAccepting("Worker is not accepting batches")
            if batch.run_id != self.run_id:
                raise RunMismatch("batch run does not match Worker run")
            self._drain_pending()
            try:
                self.journal.append_batch_once(batch)
                accepted = self.sequencer.accept(batch)
                delayed_event_ids = self._delayed_event_ids(
                    accepted.new_records, received_at_ms
                )
                entry = BatchReceiptEntry(
                    timeline_seq=self._timeline_seq + 1,
                    server_ms=received_at_ms,
                    batch_id=batch.batch_id,
                    participant_id=batch.participant_id,
                    device_id=batch.device_id,
                )
                self.timeline_journal.append_receipt(
                    entry, accepted.new_records, delayed_event_ids
                )
                plan = self.timeline.plan_receipt(records=accepted.new_records)
                commands = self._warning_commands(
                    batch, plan, received_at_server_ms=entry.server_ms
                )
                commands += self._registry_warning_command(batch, entry.server_ms)
                commands += self.timeline.apply(
                    entry,
                    records=accepted.new_records,
                    delayed_event_ids=delayed_event_ids,
                )
                self._timeline_seq = entry.timeline_seq
                self._clock_server_ms = entry.server_ms
                self._remember_cursor(batch, accepted)
                if batch.registry_version != self.registry.version:
                    self._warning_codes.add("registry_version_mismatch")
                self.outbox.append(commands)
            except OSError:
                self._healthy = False
                raise
            self._drain_pending()
            try:
                self.archiver.rotate_due(received_at_ms)
            except OSError:
                self._healthy = False
                raise
            return BatchAck(
                acked_through_seq=accepted.acked_through_seq,
                pending_commands=[],
                release_evidence_before_ms=0,
            )

    def record_submission(
        self,
        *,
        participant_id: int,
        source: Literal["manual", "backend"],
        server_ms: int,
    ) -> None:
        with self._lock:
            if not self.healthy:
                raise OSError("Worker is unhealthy and requires recovery")
            self._drain_pending()
            try:
                entry = SubmissionEntry(
                    timeline_seq=self._timeline_seq + 1,
                    server_ms=server_ms,
                    participant_id=participant_id,
                    source=source,
                )
                self.timeline_journal.append_submission(entry)
                commands = self.timeline.apply(entry)
                self._timeline_seq = entry.timeline_seq
                self._clock_server_ms = entry.server_ms
                self.outbox.append(commands)
            except OSError:
                self._healthy = False
                raise
            self._drain_pending()

    def tick(self, now_ms: int | None = None) -> None:
        with self._lock:
            if self._state != "RUNNING":
                return
            target = self._clock_ms() if now_ms is None else now_ms
            self._drain_pending()
            try:
                self.timeline_journal.append_advance(target)
                commands = self.timeline.advance_to(target)
                self._clock_server_ms = target
                self.outbox.append(commands)
                self._drain_pending()
                self.archiver.rotate_due(target)
            except OSError:
                self._healthy = False
                raise
            try:
                self.archiver.upload_all_sealed()
            except Exception as error:
                from integrity_service.journal.archive import ArchiveUploadFailed

                if not isinstance(error, ArchiveUploadFailed):
                    raise

    def begin_stop(self) -> None:
        with self._lock:
            self._accepting = False
            if self._state == "RUNNING":
                self._state = "STOPPING"

    def stop(self) -> ArchiveResult:
        self.begin_stop()
        with self._lock:
            self._drain_pending()
            self.journal.rotate_if_due(self._clock_ms(), force=True)
            self.archiver.upload_all_sealed()
            manifest = self.archiver.build_manifest(
                final_cursors=self._final_cursors
            )
            result = self.archiver.upload_and_publish_manifest(manifest)
            self._state = "ARCHIVED"
            return result

    async def start_scheduler(self) -> None:
        if self._scheduler_task is not None and not self._scheduler_task.done():
            return
        try:
            with self._lock:
                self._drain_pending()
        except BackendUnavailable:
            pass
        self._scheduler_task = asyncio.create_task(
            self._scheduler_loop(), name=f"integrity-scheduler-{self.run_id}"
        )

    async def stop_scheduler(self) -> None:
        task = self._scheduler_task
        self._scheduler_task = None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _scheduler_loop(self) -> None:
        while self._state == "RUNNING":
            await self._scheduler_wait()
            try:
                self.tick()
            except Exception:
                # Disk failures are reflected by health. Backend/storage failures remain in
                # their durable queues and are retried on the next single-owner tick.
                continue

    @staticmethod
    async def _wait_one_second() -> None:
        await asyncio.sleep(1)

    def close(self) -> None:
        with self._lock:
            self.journal.close()
            self.timeline_journal.close()
            self.outbox.close()
            self.archiver.close()

    def _load_or_create_baseline(
        self, bootstrap: WorkerBootstrap
    ) -> TimelineBaseline:
        records = self.timeline_journal.records
        if records:
            raw = records[0]
            if raw.get("kind") != "baseline":
                raise DurableLogCorruption("timeline must begin with a baseline")
            baseline = TimelineBaseline(
                timeline_seq=int(raw["timeline_seq"]),
                server_ms=int(raw["server_ms"]),
                active_participant_ids=tuple(raw["active_participant_ids"]),
                submitted_participant_ids=tuple(raw["submitted_participant_ids"]),
            )
            if (
                baseline.active_participant_ids
                != bootstrap.active_participant_ids
                or baseline.submitted_participant_ids
                != bootstrap.submitted_participant_ids
            ):
                raise DurableLogCorruption("frozen bootstrap conflicts with baseline")
            return baseline
        baseline = TimelineBaseline(
            timeline_seq=0,
            server_ms=bootstrap.server_ms,
            active_participant_ids=bootstrap.active_participant_ids,
            submitted_participant_ids=bootstrap.submitted_participant_ids,
        )
        self.timeline_journal.ensure_baseline(baseline)
        return baseline

    def _replay_timeline(self) -> None:
        batches = {batch.batch_id: batch for batch in self.journal.recovered_batches}
        for durable in self.timeline_journal.records[1:]:
            kind = durable.get("kind")
            if kind == "batch_receipt":
                batch_id = UUID(str(durable["batch_id"]))
                try:
                    batch = batches[batch_id]
                except KeyError as error:
                    raise DurableLogCorruption(
                        "timeline receipt references a missing raw batch"
                    ) from error
                accepted = self.sequencer.accept(batch)
                projected = [record.to_json() for record in accepted.new_records]
                if durable.get("records") != projected:
                    raise DurableLogCorruption(
                        "durable receipt admission differs from sequencer replay"
                    )
                delayed = frozenset(
                    UUID(str(value)) for value in durable.get("delayed_event_ids", [])
                )
                entry = BatchReceiptEntry(
                    timeline_seq=int(durable["timeline_seq"]),
                    server_ms=int(durable["server_ms"]),
                    batch_id=batch_id,
                    participant_id=int(durable["participant_id"]),
                    device_id=str(durable["device_id"]),
                )
                plan = self.timeline.plan_receipt(records=accepted.new_records)
                commands = self._warning_commands(
                    batch, plan, received_at_server_ms=entry.server_ms
                )
                commands += self._registry_warning_command(batch, entry.server_ms)
                commands += self.timeline.apply(
                    entry,
                    records=accepted.new_records,
                    delayed_event_ids=delayed,
                )
                self._remember_cursor(batch, accepted)
                self._timeline_seq = entry.timeline_seq
                self._clock_server_ms = entry.server_ms
                self.outbox.append(commands)
            elif kind == "submission":
                entry = SubmissionEntry(
                    timeline_seq=int(durable["timeline_seq"]),
                    server_ms=int(durable["server_ms"]),
                    participant_id=int(durable["participant_id"]),
                    source=str(durable["source"]),  # type: ignore[arg-type]
                )
                self.outbox.append(self.timeline.apply(entry))
                self._timeline_seq = entry.timeline_seq
                self._clock_server_ms = entry.server_ms
            elif kind == "advance":
                server_ms = int(durable["server_ms"])
                self.outbox.append(self.timeline.advance_to(server_ms))
                self._clock_server_ms = server_ms
            else:
                raise DurableLogCorruption("unknown timeline record")

    def _warning_commands(
        self,
        batch: EventBatch,
        plan: ReceiptPlan,
        *,
        received_at_server_ms: int,
    ) -> tuple[IntegrityCommand, ...]:
        commands: list[IntegrityCommand] = []
        context = EngineContext(self.run_id)
        for skipped in plan.skipped_records[:MAX_WARNING_COMMANDS_PER_RECEIPT]:
            code = skipped.code
            self._warning_codes.add(code)
            commands.append(
                make_command(
                    context=context,
                    kind="update_run_checkpoint",
                    participant_id=batch.participant_id,
                    device_id=batch.device_id,
                    incident_id=None,
                    event_id=skipped.record.event_id,
                    phase=f"warning:{code}",
                    event_type=code,
                    action="audit",
                    client_occurred_at_ms=skipped.record.client_occurred_at_ms,
                    received_at_server_ms=received_at_server_ms,
                    metadata={
                        "code": code,
                        "skipped_event_type": skipped.record.event_type,
                    },
                )
            )
        return tuple(commands)

    def _registry_warning_command(
        self, batch: EventBatch, received_at_server_ms: int
    ) -> tuple[IntegrityCommand, ...]:
        if batch.registry_version == self.registry.version:
            return ()
        self._warning_codes.add("registry_version_mismatch")
        return (
            make_command(
                context=EngineContext(self.run_id),
                kind="update_run_checkpoint",
                participant_id=batch.participant_id,
                device_id=batch.device_id,
                incident_id=None,
                event_id=batch.batch_id,
                phase="warning:registry_version_mismatch",
                event_type="registry_version_mismatch",
                action="audit",
                client_occurred_at_ms=0,
                received_at_server_ms=received_at_server_ms,
                metadata={
                    "code": "registry_version_mismatch",
                    "received_registry_version": batch.registry_version,
                    "expected_registry_version": self.registry.version,
                },
            ),
        )

    def _drain_pending(self) -> None:
        self.outbox.deliver_pending(self.backend)  # type: ignore[arg-type]

    def _remember_cursor(self, batch: EventBatch, accepted: AcceptResult) -> None:
        key = f"{batch.participant_id}/{batch.device_id}"
        self._final_cursors[key] = accepted.acked_through_seq

    def _delayed_event_ids(
        self,
        records: tuple[AdmittedEventRecord, ...],
        received_at_server_ms: int,
    ) -> frozenset[UUID]:
        threshold = self._policy_snapshot.get(
            "delayed_delivery_after_ms"
        )
        if threshold is None:
            return frozenset()
        if type(threshold) is not int or threshold < 0:
            raise ValueError("delayed_delivery_after_ms policy is invalid")
        return frozenset(
            record.event_id
            for record in records
            if received_at_server_ms - record.client_recorded_at_ms > threshold
        )

    @staticmethod
    def _canonical(value: object) -> bytes:
        return json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        ).encode("utf-8")

    @staticmethod
    def _policy_int(
        policy: dict[str, object], key: str, default: int, *, minimum: int
    ) -> int:
        value = policy.get(key, default)
        if type(value) is not int or value < minimum:
            raise ValueError(f"archive policy {key} is invalid")
        return value
