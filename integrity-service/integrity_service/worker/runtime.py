"""Single-owner Worker runtime for durable ingest, replay, scheduling, and stop."""

from __future__ import annotations

import asyncio
import hashlib
import json
import threading
import time
from collections.abc import Awaitable
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from uuid import UUID

from integrity_service.core.commands import (
    EngineContext,
    IntegrityCommand,
    make_command,
    json_projection,
)
from integrity_service.core.connectivity import ConnectivityMonitor
from integrity_service.core.incidents import IncidentEngine
from integrity_service.core.records import AdmittedEventRecord, snapshot_event_record
from integrity_service.core.registry import Registry, UnknownSignal
from integrity_service.core.scheduler import DeadlineScheduler
from integrity_service.core.schemas import BatchAck, EventBatch, EventRecord
from integrity_service.core.sequencer import AcceptResult, SessionSequencer
from integrity_service.core.timeline import (
    BatchReceiptEntry,
    DecisionTimeline,
    ReceiptPlan,
    TimelineBaseline,
)
from integrity_service.journal.archive import (
    ArchiveFatalFailure,
    ArchiveManager,
    ArchiveResult,
    ArchiveRetryableFailure,
    SegmentedJournal,
)
from integrity_service.journal.command_outbox import (
    CommandDeliveryProtocolError,
    CommandOutbox,
    DurableLogCorruption,
    TimelineJournal,
)
from integrity_service.journal.durability import ensure_durable_directory
from integrity_service.worker.backend_client import (
    BackendProtocolError,
    BackendUnavailable,
)
from integrity_service.worker.settings import WorkerBootstrap
from integrity_service.worker.receipts import ReceiptStore


class RunMismatch(ValueError):
    """A batch belongs to another isolated Worker run."""


class WorkerNotAccepting(RuntimeError):
    """The Worker has begun its archival stop sequence."""


class ArchiveNotConfigured(RuntimeError):
    """The scoped Backend does not support presigned archive upload."""


class SchedulerFailed(RuntimeError):
    """The only scheduler owner terminated and the process must be replaced."""


@dataclass(frozen=True, slots=True)
class WorkerHealth:
    healthy: bool
    state: str
    accepting: bool
    warning_codes: tuple[str, ...]
    last_scheduler_error: str | None
    service_gap_count: int = 0
    last_service_gap_ended_ms: int | None = None
    suppressed_connectivity_commands: int = 0
    gap_affected_participant_count: int = 0


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
        resident_mode: bool = False,
    ) -> None:
        self.bootstrap = bootstrap
        self.run_id = bootstrap.run_id
        self.backend = backend
        self.resident_mode = resident_mode
        self.receipts: ReceiptStore | None = None
        # Rebuilt in durable receipt order. No wall-clock progress authority.
        self._evidence_fences: dict[tuple[int, str, UUID], int] = {}
        self._pending_evidence_fences: list[tuple[tuple[int, str, UUID], int, int]] = []
        self._event_receipts: dict[tuple[int, str, UUID], tuple[UUID, UUID | None]] = {}
        self._late_evidence_events: dict[tuple[int, str, UUID], int] = {}
        self._policy_snapshot = json_projection(bootstrap.policy_snapshot)
        self._registry_snapshot = json_projection(bootstrap.registry_snapshot)
        assert isinstance(self._policy_snapshot, dict)
        assert isinstance(self._registry_snapshot, dict)
        self._clock_ms = clock_ms or (lambda: time.time_ns() // 1_000_000)
        self._scheduler_wait = scheduler_wait or self._wait_one_second
        self._lock = threading.RLock()
        self._accepting = True
        self._healthy = True
        self._state = "RUNNING"
        self._warning_codes: set[str] = set()
        self._scheduler_task: asyncio.Task[None] | None = None
        self._last_scheduler_error: str | None = None
        self._final_cursors: dict[str, int] = {}
        self._reported_gap_generation = 0
        self._closed = False

        delayed = self._policy_snapshot.get("delayed_delivery_after_ms")
        if delayed is not None and (type(delayed) is not int or delayed < 0):
            raise ValueError("delayed_delivery_after_ms policy is invalid")
        self._delayed_delivery_after_ms: int | None = delayed
        batch_interval_ms = self._policy_int(
            self._policy_snapshot,
            "batch_interval_ms",
            0,
            minimum=0,
        )

        archive_policy = json_projection(bootstrap.archive_policy)
        assert isinstance(archive_policy, dict)
        rotate_after_ms = self._policy_int(
            archive_policy, "rotate_after_ms", 60_000, minimum=1
        )
        max_segment_bytes = self._policy_int(
            archive_policy, "max_segment_bytes", 8 * 1024 * 1024, minimum=1
        )
        capacity_warning_bytes = self._policy_int(
            archive_policy, "capacity_warning_bytes", 0, minimum=0
        )
        capacity_reserve_bytes = self._policy_int(
            archive_policy,
            "capacity_reserve_bytes",
            0,
            minimum=0,
        )

        run_root = data_root / str(self.run_id)
        ensure_durable_directory(run_root)
        if not resident_mode and (run_root / "receipts" / "receipts.log").exists():
            raise ValueError("resident data requires resident_mode=True")
        ownership = ExitStack()
        try:
            self.journal = SegmentedJournal(
                run_root / "journal",
                started_at_ms=bootstrap.server_ms,
                rotate_after_ms=rotate_after_ms,
                max_segment_bytes=max_segment_bytes,
                capacity_warning_bytes=capacity_warning_bytes,
                capacity_root=run_root,
                capacity_reserve_bytes=capacity_reserve_bytes,
            )
            ownership.callback(self.journal.close)
            self.timeline_journal = TimelineJournal(run_root / "timeline")
            ownership.callback(self.timeline_journal.close)
            self.outbox = CommandOutbox(run_root / "outbox")
            ownership.callback(self.outbox.close)

            baseline = self._load_or_create_baseline(bootstrap)
            self.registry = Registry(self._registry_snapshot)
            self.sequencer = SessionSequencer()
            context = EngineContext(self.run_id)
            self.incidents = IncidentEngine(
                self.registry,
                context,
                delivery_tolerance_ms=batch_interval_ms,
            )
            self.connectivity = ConnectivityMonitor(
                self._policy_snapshot,
                self.registry,
                context,
            )
            self.scheduler = DeadlineScheduler(
                bootstrap.scheduled_end_ms,
                context,
                authoritative_deadline=not resident_mode,
            )
            self.timeline = DecisionTimeline(
                baseline=baseline,
                incidents=self.incidents,
                connectivity=self.connectivity,
                scheduler=self.scheduler,
            )
            self._timeline_seq = 0
            self._clock_server_ms = baseline.server_ms
            if resident_mode:
                self.receipts = ReceiptStore(run_root / "receipts", self.journal, self.run_id)
                ownership.callback(self.receipts.close)
            self._replay_timeline()
            if self.receipts is not None and self.receipts.last_received_at_ms is not None:
                # Construction only: routine descriptor refreshes never enter
                # here. The authenticated fresh bootstrap bounds a conservative
                # continuity-uncertainty interval, not an exact crash timestamp.
                # Start at the last WAL receipt, so old buffered decisions are
                # not reclassified merely because processing resumed later.
                recovery_start = self.receipts.last_received_at_ms
                if bootstrap.server_ms > recovery_start:
                    self.record_service_gap(recovery_start, bootstrap.server_ms, "process_recovery")

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
                previous_manifest=bootstrap.previous_manifest,
            )
            ownership.callback(self.archiver.close)
            self.journal.check_capacity()
        except BaseException:
            ownership.close()
            raise
        ownership.pop_all()

    @property
    def accepting(self) -> bool:
        return self.health_snapshot().accepting

    @property
    def healthy(self) -> bool:
        return self.health_snapshot().healthy

    @property
    def state(self) -> str:
        return self.health_snapshot().state

    @property
    def warning_codes(self) -> frozenset[str]:
        return frozenset(self.health_snapshot().warning_codes)

    @property
    def last_scheduler_error(self) -> str | None:
        return self.health_snapshot().last_scheduler_error

    def health_snapshot(self) -> WorkerHealth:
        with self._lock:
            suppressed, affected = self.outbox.suppression_counts()
            warnings = (
                frozenset(self._warning_codes)
                | self.journal.warning_codes
                | self.archiver.warning_codes
            )
            return WorkerHealth(
                healthy=(
                    self._healthy
                    and self.journal.healthy
                    and self.archiver.healthy
                    and self._last_scheduler_error is None
                ),
                state=self._state,
                accepting=self._accepting,
                warning_codes=tuple(sorted(warnings)),
                last_scheduler_error=self._last_scheduler_error,
                service_gap_count=self.timeline.service_gap_count,
                last_service_gap_ended_ms=self.timeline.last_service_gap_ended_ms,
                suppressed_connectivity_commands=suppressed,
                gap_affected_participant_count=affected,
            )

    def accept_batch(self, batch: EventBatch, received_at_ms: int, *, late_unverified: bool = False, attempt_id: UUID | None = None) -> BatchAck:
        """Durable resident intake only; caller authenticates the batch's signed scope."""
        with self._lock:
            if self.receipts is None:
                raise ValueError("accept_batch requires resident_mode=True")
            if self._closed or not self.healthy:
                raise OSError("Worker requires recovery")
            if not self._accepting:
                raise WorkerNotAccepting("Worker is not accepting batches")
            if batch.run_id != self.run_id:
                raise RunMismatch("batch run does not match Worker run")
            if type(received_at_ms) is not int or received_at_ms < self._clock_server_ms:
                raise ValueError("receipt time cannot precede decision time")
            try:
                receipt = self.receipts.append_durable(batch, received_at_ms, late_unverified=late_unverified, attempt_id=attempt_id)
                # Bound individual archive allocations during live collection;
                # rotation is local durable I/O, never compression or upload.
                self.journal.rotate_if_due(received_at_ms)
            except (OSError, RuntimeError):
                self._mark_unhealthy("durable_write_failed")
                raise
            return BatchAck(
                acked_through_seq=receipt.contiguous_seq,
                pending_commands=[], release_evidence_before_ms=0,
            )

    def process_pending(self, limit: int) -> int:
        """Commit ordered resident decisions and outbox entries, without network I/O."""
        with self._lock:
            if self.receipts is None:
                raise ValueError("process_pending requires resident_mode=True")
            if type(limit) is not int or limit < 0:
                raise ValueError("limit must be a nonnegative integer")
            if self._closed or not self.healthy:
                raise OSError("Worker requires recovery")
            processed = 0
            try:
                for receipt in self.receipts.pending(limit):
                    batch = receipt.batch
                    accepted = self.sequencer.accept(batch)
                    entry = BatchReceiptEntry(
                        timeline_seq=receipt.ordinal, server_ms=receipt.received_at_ms,
                        batch_id=batch.batch_id, participant_id=batch.participant_id,
                        device_id=batch.device_id,
                    )
                    delayed = self._delayed_event_ids(accepted.new_records, entry.server_ms)
                    self.timeline_journal.append_receipt(entry, accepted.new_records, delayed)
                    self._apply_receipt(
                        batch=batch, accepted=accepted, entry=entry, delayed_event_ids=delayed,
                    )
                    self.receipts.mark_processed(receipt.ordinal)
                    processed += 1
            except BaseException:
                self._mark_unhealthy("durable_write_failed")
                raise
            return processed

    def record_service_gap(self, started_ms: int, ended_ms: int, reason: str, *, generation=None) -> None:
        if reason not in {"platform_unavailable", "process_recovery", "storage_unavailable"}:
            raise ValueError("invalid service gap reason")
        if type(started_ms) is not int or type(ended_ms) is not int or not 0 <= started_ms <= ended_ms:
            raise ValueError("invalid service gap interval")
        with self._lock:
            if generation is not None:
                if type(generation) is not int or generation < 1 or reason != "platform_unavailable":
                    raise ValueError("invalid trusted gap generation")
                if generation <= self._reported_gap_generation:
                    return
            if not self.resident_mode or self._closed:
                raise ValueError("service gaps require an open resident runtime")
            if not self._healthy:
                raise OSError("service gap recording requires recovery")
            # Append before affected decisions. This does not rewrite already
            # committed history or advance to a recovery wall clock.
            try:
                self.timeline.validate_service_gap(started_ms, ended_ms)
                self.timeline_journal.append_service_gap(started_ms=started_ms, ended_ms=ended_ms, reason=reason,
                    **({"generation": generation} if generation is not None else {}))
                self.timeline.record_service_gap(started_ms, ended_ms)
                if generation is not None:
                    self._reported_gap_generation = generation
            except BaseException:
                self._mark_unhealthy("service_gap_durability_failed")
                raise

    def ingest(self, batch: EventBatch, received_at_ms: int) -> BatchAck:
        if self.resident_mode:
            raise ValueError("resident intake uses accept_batch, not legacy ingest")
        with self._lock:
            if not self.healthy:
                raise OSError("Worker is unhealthy and requires recovery")
            if not self._accepting:
                raise WorkerNotAccepting("Worker is not accepting batches")
            if batch.run_id != self.run_id:
                raise RunMismatch("batch run does not match Worker run")
            raw_durable = False
            try:
                appended = self.journal.append_batch_once(batch)
                raw_durable = True
                if appended:
                    context = BatchReceiptEntry(
                        timeline_seq=self._timeline_seq + 1,
                        server_ms=received_at_ms,
                        batch_id=batch.batch_id,
                        participant_id=batch.participant_id,
                        device_id=batch.device_id,
                    )
                    self.timeline_journal.append_receipt_context(context)
                else:
                    self._drain_pending()
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
                self._apply_receipt(
                    batch=batch,
                    accepted=accepted,
                    entry=entry,
                    delayed_event_ids=delayed_event_ids,
                )
            except BackendUnavailable:
                raise
            except BaseException as error:
                if raw_durable or isinstance(error, OSError):
                    self._mark_unhealthy("durable_write_failed")
                raise
            self._drain_pending()
            try:
                self.archiver.rotate_due(received_at_ms)
                self.journal.check_capacity()
            except BaseException:
                self._mark_unhealthy("archive_durability_failed")
                raise
            return BatchAck(
                acked_through_seq=accepted.acked_through_seq,
                pending_commands=[],
                release_evidence_before_ms=0,
            )

    def tick(self, now_ms: int | None = None) -> None:
        # Legacy tick delivers commands and archives while holding the intake lock.
        # Resident maintenance needs its separate bounded delivery path; until then
        # disable this path even after process_pending has drained the receipt queue.
        if self.resident_mode:
            return
        with self._lock:
            if self._state != "RUNNING":
                return
            target = self._clock_ms() if now_ms is None else now_ms
            self._drain_pending()
            try:
                self.journal.check_capacity()
                self.timeline_journal.append_advance(target)
                commands = self.timeline.advance_to(target)
                self._clock_server_ms = target
                self.outbox.append(commands)
                self._drain_pending()
                self.archiver.rotate_due(target)
                self.journal.check_capacity()
            except BackendUnavailable:
                raise
            except BaseException:
                self._mark_unhealthy("durable_write_failed")
                raise
            try:
                self.archiver.upload_all_sealed()
            except ArchiveRetryableFailure:
                pass

    def begin_stop(self) -> None:
        with self._lock:
            self._accepting = False
            if self._state == "RUNNING":
                self._state = "STOPPING"

    def stop(self) -> ArchiveResult:
        if self.resident_mode:
            raise WorkerNotAccepting("resident finalization requires its own drain protocol")
        self.begin_stop()
        with self._lock:
            if self._last_scheduler_error is not None:
                raise SchedulerFailed("scheduler failed; process recovery required")
            if not self.healthy:
                raise OSError("Worker fatal state requires process recovery")
            try:
                self._drain_pending()
                self.journal.rotate_if_due(self._clock_ms(), force=True)
                self.archiver.upload_all_sealed()
                manifest = self.archiver.build_manifest(
                    final_cursors=self._final_cursors
                )
                result = self.archiver.upload_and_publish_manifest(manifest)
            except (BackendUnavailable, ArchiveRetryableFailure):
                raise
            except BaseException:
                self._mark_unhealthy("archive_durability_failed")
                raise
            self._state = "ARCHIVED"
            return result

    async def start_scheduler(self) -> None:
        if self.resident_mode:
            raise SchedulerFailed("resident maintenance requires a separate delivery scheduler")
        with self._lock:
            if self._last_scheduler_error is not None or not self.healthy:
                raise SchedulerFailed("scheduler failed; process recovery required")
            if self._state != "RUNNING":
                raise SchedulerFailed("scheduler is disabled for this runtime")
            if self._scheduler_task is not None and not self._scheduler_task.done():
                return
        try:
            with self._lock:
                self._drain_pending()
        except BackendUnavailable:
            pass
        except BaseException as error:
            self._record_scheduler_failure(self._scheduler_error_code(error))
            raise SchedulerFailed(
                "scheduler failed; process recovery required"
            ) from error
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
        except SchedulerFailed:
            raise
        except BaseException as error:
            self._record_scheduler_failure("scheduler_failed")
            raise SchedulerFailed(
                "scheduler failed; process recovery required"
            ) from error

    async def _scheduler_loop(self) -> None:
        while self._state == "RUNNING":
            try:
                await self._scheduler_wait()
            except asyncio.CancelledError:
                raise
            except BaseException as error:
                self._record_scheduler_failure("scheduler_wait_failed")
                raise SchedulerFailed(
                    "scheduler failed; process recovery required"
                ) from error
            try:
                self.tick()
            except asyncio.CancelledError:
                raise
            except (BackendUnavailable, ArchiveRetryableFailure):
                continue
            except BaseException as error:
                code = self._scheduler_error_code(error)
                self._record_scheduler_failure(code)
                raise SchedulerFailed(
                    "scheduler failed; process recovery required"
                ) from error

    @staticmethod
    async def _wait_one_second() -> None:
        await asyncio.sleep(1)

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            cleanup = ExitStack()
            cleanup.callback(self.journal.close)
            cleanup.callback(self.timeline_journal.close)
            cleanup.callback(self.outbox.close)
            cleanup.callback(self.archiver.close)
            if self.receipts is not None:
                cleanup.callback(self.receipts.close)
            cleanup.close()

    def _load_or_create_baseline(self, bootstrap: WorkerBootstrap) -> TimelineBaseline:
        records = self.timeline_journal.records
        if records:
            raw = records[0]
            if raw.get("kind") != "baseline":
                raise DurableLogCorruption("timeline must begin with a baseline")
            baseline = TimelineBaseline(
                timeline_seq=int(raw["timeline_seq"]),
                server_ms=int(raw["server_ms"]),
                active_participant_ids=tuple(raw["active_participant_ids"]),
            )
            return baseline
        baseline = TimelineBaseline(
            timeline_seq=0,
            server_ms=bootstrap.server_ms,
            active_participant_ids=bootstrap.active_participant_ids,
        )
        self.timeline_journal.ensure_baseline(baseline)
        return baseline

    def _replay_timeline(self) -> None:
        recovered_batches = self.journal.recovered_batches
        batches = {batch.batch_id: batch for batch in recovered_batches}
        contexts = {
            UUID(str(context["batch_id"])): context
            for context in self.timeline_journal.receipt_contexts
        }
        for batch_id in contexts:
            if batch_id not in batches:
                raise DurableLogCorruption(
                    "batch receipt context references a missing raw batch"
                )
        received_batch_ids: set[UUID] = set()
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
                if self.receipts is not None:
                    receipt = self.receipts.receipt_at(entry.timeline_seq)
                    if (
                        receipt.batch != batch or receipt.received_at_ms != entry.server_ms
                        or entry.participant_id != batch.participant_id
                        or entry.device_id != batch.device_id
                    ):
                        raise DurableLogCorruption("decision conflicts with resident receipt")
                if batch_id not in received_batch_ids:
                    context = contexts.get(batch_id)
                    if context is not None:
                        expected_context = entry.to_json()
                        expected_context["kind"] = "batch_receipt_context"
                        if context != expected_context:
                            raise DurableLogCorruption(
                                "batch receipt conflicts with durable context"
                            )
                    received_batch_ids.add(batch_id)
                self._apply_receipt(
                    batch=batch,
                    accepted=accepted,
                    entry=entry,
                    delayed_event_ids=delayed,
                )
            elif kind == "service_gap":
                reason = durable.get("reason")
                if (reason not in {"platform_unavailable", "process_recovery", "storage_unavailable"}
                        or set(durable) - {"generation"} != {"kind", "server_ms", "started_ms", "ended_ms", "reason", "classification"}
                        or durable.get("classification") != ("continuity_uncertainty" if reason == "process_recovery" else "observed_unavailability")):
                    raise DurableLogCorruption("invalid service gap record")
                self.timeline.record_service_gap(durable["started_ms"], durable["ended_ms"])
                if "generation" in durable:
                    generation = durable["generation"]
                    if type(generation) is not int or generation <= self._reported_gap_generation or reason != "platform_unavailable":
                        raise DurableLogCorruption("invalid trusted gap generation")
                    self._reported_gap_generation = generation
            elif kind == "advance":
                server_ms = int(durable["server_ms"])
                self.outbox.append(self.timeline.advance_to(server_ms))
                self._clock_server_ms = server_ms
            else:
                raise DurableLogCorruption("unknown timeline record")

        if self.receipts is not None:
            if self.receipts.processed_cursor > self._timeline_seq:
                raise DurableLogCorruption("processed cursor exceeds durable decisions")
            # Timeline is the decision intent. Replaying above repairs any missing
            # outbox write before committing a cursor interrupted by process loss.
            for ordinal in range(self.receipts.processed_cursor + 1, self._timeline_seq + 1):
                self.receipts.mark_processed(ordinal)
            pending = self.receipts.pending()
            if pending and pending[0].received_at_ms < self._clock_server_ms:
                raise DurableLogCorruption("decision clock passed pending resident receipt")
            return

        unmatched = [
            batch
            for batch in recovered_batches
            if batch.batch_id not in received_batch_ids
        ]
        if not unmatched:
            return
        if len(unmatched) != 1 or unmatched[0] is not recovered_batches[-1]:
            raise DurableLogCorruption(
                "raw batches without receipts are not a terminal recovery unit"
            )
        batch = unmatched[0]
        context = contexts.get(batch.batch_id)
        if context is None:
            raise DurableLogCorruption(
                "raw batch has no authoritative durable receipt context"
            )
        if not self.timeline_journal.receipt_contexts or context != (
            self.timeline_journal.receipt_contexts[-1]
        ):
            raise DurableLogCorruption(
                "unmatched raw batch receipt context is not terminal"
            )
        entry = BatchReceiptEntry(
            timeline_seq=int(context["timeline_seq"]),
            server_ms=int(context["server_ms"]),
            batch_id=UUID(str(context["batch_id"])),
            participant_id=int(context["participant_id"]),
            device_id=str(context["device_id"]),
        )
        if (
            entry.batch_id != batch.batch_id
            or entry.participant_id != batch.participant_id
            or entry.device_id != batch.device_id
            or entry.timeline_seq != self._timeline_seq + 1
            or entry.server_ms < self._clock_server_ms
        ):
            raise DurableLogCorruption(
                "unmatched raw batch receipt context conflicts with replay"
            )
        try:
            accepted = self.sequencer.accept(batch)
            delayed = self._delayed_event_ids(accepted.new_records, entry.server_ms)
            self.timeline_journal.append_receipt(entry, accepted.new_records, delayed)
            self._apply_receipt(
                batch=batch,
                accepted=accepted,
                entry=entry,
                delayed_event_ids=delayed,
            )
        except (DurableLogCorruption, OSError):
            raise
        except BaseException as error:
            raise DurableLogCorruption(
                "unmatched raw batch cannot be deterministically replayed"
            ) from error

    def _apply_receipt(
        self,
        *,
        batch: EventBatch,
        accepted: AcceptResult,
        entry: BatchReceiptEntry,
        delayed_event_ids: frozenset[UUID],
    ) -> None:
        receipt = self.receipts.receipt_at(entry.timeline_seq) if self.receipts is not None else None
        if receipt is not None and receipt.late_unverified:
            # Raw receipt remains durable, but never enters stateful detectors:
            # otherwise a later trusted batch could escalate its stale incident.
            self._remember_cursor(batch, accepted)
            self._timeline_seq = entry.timeline_seq
            self._clock_server_ms = entry.server_ms
            return
        if receipt is not None:
            floor = self._evidence_fences.get((batch.participant_id, batch.device_id, receipt.attempt_id), 0)
            for record in accepted.new_records:
                event_key = (batch.participant_id, batch.device_id, record.event_id)
                self._event_receipts[event_key] = (batch.batch_id, receipt.attempt_id)
                fence = record.payload.get("evidence_fence")
                if fence is not None and record.seq <= accepted.acked_through_seq:
                    floor = max(floor, fence["before_client_ms"])
                if record.kind == "event":
                    try:
                        definition, _ = self.registry.resolve(record.event_type)
                    except UnknownSignal:
                        continue
                    if definition.evidence_sources and max(0, record.client_occurred_at_ms - definition.evidence_before_ms) < floor:
                        self._late_evidence_events[event_key] = floor
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
        self._remember_cursor(batch, accepted)
        self._timeline_seq = entry.timeline_seq
        self._clock_server_ms = entry.server_ms
        if self.receipts is not None:
            from dataclasses import replace
            scoped_commands = []
            for command in commands:
                # Opted-in receipts correct provenance for future escalations;
                # pre-contract replay retains its already committed fingerprint.
                event_key = (command.participant_id, command.device_id, command.source_event_id)
                origin = self._event_receipts.get(event_key) if receipt.attempt_id is not None else None
                metadata = {**dict(command.metadata), "receipt_batch_id": str(origin[0] if origin else batch.batch_id)}
                if receipt.attempt_id is not None:
                    metadata.pop("evidence_gap", None)
                gap_floor = self._late_evidence_events.get(event_key)
                if gap_floor is not None:
                    metadata["evidence_gap"] = {"reason": "late_beyond_fence", "before_client_ms": gap_floor,
                        "version": "resident-evidence-fence-v1"}
                scoped_commands.append(replace(command, metadata=metadata))
            commands = tuple(scoped_commands)
        if self.resident_mode:
            admitted = []
            for command in commands:
                if self.timeline.service_gap_covers(command):
                    self.outbox.record_suppressed_command(command, reason="platform_gap")
                else:
                    admitted.append(command)
            commands = tuple(admitted)
        self.outbox.append(commands)

        if receipt is not None and receipt.attempt_id is not None:
            scope = (batch.participant_id, batch.device_id, receipt.attempt_id)
            for record in accepted.new_records:
                fence = record.payload.get("evidence_fence")
                if fence is not None:
                    self._pending_evidence_fences.append((scope, record.seq, fence["before_client_ms"]))
            pending = []
            for scope, through, before in self._pending_evidence_fences:
                if through <= self.sequencer.contiguous_cursor(self.run_id, scope[0], scope[1]):
                    self._evidence_fences[scope] = max(self._evidence_fences.get(scope, 0), before)
                else:
                    pending.append((scope, through, before))
            self._pending_evidence_fences = pending

    def student_progress(self, participant_id: int, device_id: str, attempt_id: UUID | None = None) -> dict:
        with self._lock:
            if self.receipts is None or self._closed or not self.healthy:
                raise OSError("resident progress unavailable")
            # Healthy + the runtime lock guarantees the decision sequencer has
            # committed mark_processed, including replay recovery, before reads.
            progress = {"received_seq": self.receipts.received_cursor(participant_id, device_id),
                "processed_seq": self.sequencer.contiguous_cursor(self.run_id, participant_id, device_id)}
            progress.update(participant_id=participant_id, device_id=device_id,
                commands_drained=not any(command.get("participant_id") == participant_id
                    and command.get("device_id") == device_id
                    and (attempt_id is None or self.receipts.command_attempt(command) == attempt_id)
                    for command in self.outbox.pending_commands))
            if attempt_id is not None:
                release = self._evidence_fences.get((participant_id, device_id, attempt_id), 0)
                anchors = [anchor for event_id, anchor in self.incidents.evidence_anchors(participant_id, device_id)
                    if (participant_id, device_id, event_id) not in self._late_evidence_events
                    and self._event_receipts.get((participant_id, device_id, event_id), (None, None))[1] == attempt_id]
                for command in self.outbox.pending_commands:
                    if (command.get("participant_id") != participant_id or command.get("device_id") != device_id
                            or self.receipts.command_attempt(command) != attempt_id):
                        continue
                    evidence = command.get("evidence", {})
                    if evidence.get("sources") and not command.get("metadata", {}).get("evidence_gap"):
                        anchors.append(max(0, command["client_occurred_at_ms"] - evidence.get("before_ms", 0)))
                progress.update(attempt_id=str(attempt_id), evidence_fence_version="resident-evidence-fence-v1",
                    release_evidence_before_ms=min([release, *anchors]))
            return progress

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
        try:
            self.outbox.deliver_pending(self.backend)  # type: ignore[arg-type]
        except (BackendProtocolError, CommandDeliveryProtocolError):
            self._mark_unhealthy("backend_protocol_error")
            raise
        except OSError:
            self._mark_unhealthy("durable_write_failed")
            raise

    def _remember_cursor(self, batch: EventBatch, accepted: AcceptResult) -> None:
        key = f"{batch.participant_id}/{batch.device_id}"
        self._final_cursors[key] = accepted.acked_through_seq

    def _delayed_event_ids(
        self,
        records: tuple[AdmittedEventRecord, ...],
        received_at_server_ms: int,
    ) -> frozenset[UUID]:
        threshold = self._policy_snapshot.get("delayed_delivery_after_ms")
        assert threshold == self._delayed_delivery_after_ms
        if threshold is None:
            return frozenset()
        assert type(threshold) is int
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

    def _mark_unhealthy(self, warning_code: str) -> None:
        with self._lock:
            self._healthy = False
            self._accepting = False
            if self._state == "RUNNING":
                self._state = "FAILED"
            self._warning_codes.add(warning_code)

    def _record_scheduler_failure(self, code: str) -> None:
        with self._lock:
            self._last_scheduler_error = code[:64]
            self._mark_unhealthy(code[:64])

    @staticmethod
    def _scheduler_error_code(error: BaseException) -> str:
        if isinstance(error, (BackendProtocolError, CommandDeliveryProtocolError)):
            return "backend_protocol_error"
        if isinstance(error, (OSError, DurableLogCorruption)):
            return "durable_write_failed"
        if isinstance(error, ArchiveFatalFailure):
            return "archive_durability_failed"
        if isinstance(error, SchedulerFailed):
            return "scheduler_failed"
        if "wait" in str(error).lower():
            return "scheduler_wait_failed"
        return "scheduler_failed"
