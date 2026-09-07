"""Resident intake authority: atomic batch/time receipts and decision commit cursor.

The receipt WAL precedes the raw archive journal projection. A restart can repair
that projection without inventing a receive time. Both must be fsynced before ACK.
The caller owns the per-Run lock and must retire the runtime after any I/O failure.
"""

from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from integrity_service.core.schemas import EventBatch
from integrity_service.core.sequencer import SessionSequencer
from integrity_service.journal.archive import SegmentedJournal
from integrity_service.journal.command_outbox import DurableJsonLog, DurableLogCorruption
from integrity_service.journal.writer import BatchIdentityConflict


@dataclass(frozen=True, slots=True)
class DurableReceipt:
    contiguous_seq: int


@dataclass(frozen=True, slots=True)
class PendingReceipt:
    ordinal: int
    received_at_ms: int
    batch: EventBatch
    late_unverified: bool = False


class ReceiptStore:
    def __init__(self, root: Path, journal: SegmentedJournal, run_id: UUID) -> None:
        self._journal = journal
        self._run_id = run_id
        self._log = DurableJsonLog(root / "receipts.log")
        self._receipts: list[PendingReceipt] = []
        self._by_batch: dict[UUID, PendingReceipt] = {}
        self._sequencer = SessionSequencer()
        self._unavailable = False
        self.processed_cursor = 0
        try:
            for record in self._log.records:
                if record.get("kind") == "received":
                    if set(record) not in ({"kind", "ordinal", "received_at_ms", "batch"}, {"kind", "ordinal", "received_at_ms", "batch", "late_unverified"}):
                        raise ValueError("malformed receipt")
                    batch = EventBatch.model_validate(record["batch"])
                    timestamp = record["received_at_ms"]
                    if (
                        type(record["ordinal"]) is not int
                        or record["ordinal"] != len(self._receipts) + 1
                        or type(timestamp) is not int
                        or timestamp < 0
                        or batch.run_id != run_id
                        or batch.batch_id in self._by_batch
                        or (self._receipts and timestamp < self._receipts[-1].received_at_ms)
                    ):
                        raise ValueError("invalid receipt order or identity")
                    late = record.get("late_unverified", False)
                    if type(late) is not bool:
                        raise ValueError("invalid receipt disposition")
                    receipt = PendingReceipt(record["ordinal"], timestamp, batch, late)
                    self._sequencer.accept(batch)
                    self._receipts.append(receipt)
                    self._by_batch[batch.batch_id] = receipt
                elif record.get("kind") == "processed":
                    cursor = record.get("ordinal")
                    if (
                        set(record) != {"kind", "ordinal"}
                        or type(cursor) is not int
                        or cursor != self.processed_cursor + 1
                        or cursor > len(self._receipts)
                    ):
                        raise ValueError("invalid processed cursor")
                    self.processed_cursor = cursor
                else:
                    raise ValueError("unknown receipt log record")
            # Existing raw records must be a prefix of the authoritative WAL.
            raw = journal.recovered_batches
            if len(raw) > len(self._receipts) or any(
                batch != self._receipts[index].batch for index, batch in enumerate(raw)
            ):
                raise ValueError("raw journal conflicts with receipt authority")
            for receipt in self._receipts[len(raw) :]:
                journal.append_batch_once(receipt.batch)
        except BaseException as error:
            self._log.close()
            if isinstance(error, ValueError):
                raise DurableLogCorruption("invalid resident receipt log") from error
            raise

    def pending(self, limit: int = 1) -> tuple[PendingReceipt, ...]:
        # Return snapshots so callers cannot mutate future decisions or duplicate identity.
        return tuple(
            PendingReceipt(r.ordinal, r.received_at_ms, r.batch.model_copy(deep=True), r.late_unverified)
            for r in self._receipts[self.processed_cursor : self.processed_cursor + limit]
        )

    def receipt_at(self, ordinal: int) -> PendingReceipt:
        if ordinal < 1 or ordinal > len(self._receipts):
            raise DurableLogCorruption("decision references missing receipt")
        receipt = self._receipts[ordinal - 1]
        return PendingReceipt(
            receipt.ordinal, receipt.received_at_ms, receipt.batch.model_copy(deep=True), receipt.late_unverified
        )

    def append_durable(self, batch: EventBatch, received_at_ms: int, *, late_unverified: bool = False) -> DurableReceipt:
        self._require_available()
        batch = EventBatch.model_validate(batch.model_dump(mode="json"))
        if batch.run_id != self._run_id:
            raise ValueError("receipt belongs to another run")
        prior = self._by_batch.get(batch.batch_id)
        if prior is not None and prior.batch != batch:
            raise BatchIdentityConflict(str(batch.batch_id))
        accepted = self._sequencer.accept(batch, commit=False)
        if prior is None:
            if (
                type(received_at_ms) is not int
                or received_at_ms < 0
                or (self._receipts and received_at_ms < self._receipts[-1].received_at_ms)
            ):
                raise ValueError("receipt time cannot move backwards")
            receipt = PendingReceipt(len(self._receipts) + 1, received_at_ms, batch, late_unverified)
            try:
                self._journal.check_capacity()
                self._log.append({
                    "kind": "received", "ordinal": receipt.ordinal,
                    "received_at_ms": received_at_ms,
                    "batch": batch.model_dump(mode="json"),
                    "late_unverified": late_unverified,
                })
                self._journal.append_batch_once(batch)
            except BaseException:
                self._unavailable = True
                raise
            self._receipts.append(receipt)
            self._by_batch[batch.batch_id] = receipt
            self._sequencer.accept(batch)
        return DurableReceipt(accepted.acked_through_seq)

    def received_cursor(self, participant_id: int, device_id: str) -> int:
        return self._sequencer.contiguous_cursor(self._run_id, participant_id, device_id)

    def mark_processed(self, ordinal: int) -> None:
        self._require_available()
        if ordinal <= self.processed_cursor:
            return
        if ordinal != self.processed_cursor + 1 or ordinal > len(self._receipts):
            raise DurableLogCorruption("processed cursor must be contiguous")
        try:
            self._log.append({"kind": "processed", "ordinal": ordinal})
        except BaseException:
            self._unavailable = True
            raise
        self.processed_cursor = ordinal

    def close(self) -> None:
        self._unavailable = True
        self._log.close()

    def _require_available(self) -> None:
        if self._unavailable:
            raise OSError("receipt store requires close and recovery")
