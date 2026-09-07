from __future__ import annotations

import base64
import hashlib
import hmac
import json
from pathlib import Path
from dataclasses import dataclass
from datetime import datetime, timezone as datetime_timezone
from uuid import UUID

from cryptography.hazmat.primitives import serialization
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.contests.infrastructure.integrity_worker_client import (
    load_integrity_worker_private_key,
)
from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamIntegrityRun,
    ExamStatus,
)
from apps.contests.services.activity_log import log_contest_activity
from apps.contests.services.anticheat_storage import get_s3_client
from apps.contests.services.exam_submission import finalize_submission
from apps.contests.services.integrity_event_projection import registry_action_is_penalty


_ACTIONS = frozenset({"audit", "record", "pause", "lock", "submit"})
_REGISTRY_ACTIONS = {
    "audit": "audit",
    "record": "record",
    "record_event": "record",
    "pause": "pause",
    "lock": "lock",
    "submit": "submit",
}
_CONNECTIVITY_TRANSITIONS = frozenset(
    {
        "connectivity_suspect",
        "connectivity_timeout",
        "connectivity_restored",
    }
)
class IntegrityCommandRejected(ValueError):
    def __init__(self, code: str, *, command_id: str = "") -> None:
        super().__init__(code)
        self.code = code
        self.command_id = command_id


@dataclass(frozen=True)
class CommandOutcome:
    command_id: str
    status: str
    result: dict[str, object]


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
    action: str
    device_id: str
    evidence: dict[str, object]
    command_fingerprint: str
    command_semantics: dict[str, object]


def resident_service_digest() -> str:
    token = Path(settings.INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE).read_text().strip()
    if not token or not token.isascii() or any(c.isspace() for c in token):
        raise ValueError("resident credential unavailable")
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def authenticate_resident_service(token: str) -> str | None:
    if not token or not token.isascii() or any(c.isspace() for c in token):
        return None
    digest = hashlib.sha256(token.encode("ascii")).hexdigest()
    return digest if hmac.compare_digest(digest, resident_service_digest()) else None


def resident_run_scope(run) -> bool:
    return bool(run is not None
                and run.session_state in {"prepared", "active", "draining"}
                and run.data_state == "open")


def build_resident_descriptor(run) -> dict:
    if not resident_run_scope(run) or run.scheduled_start_at is None or run.accept_until is None:
        raise IntegrityCommandRejected("invalid_integrity_run_scope")
    return {"protocol": "resident-v1", "bootstrap": build_integrity_bootstrap(run),
            "schedule_revision": run.schedule_revision,
            "scheduled_start_ms": int(run.scheduled_start_at.timestamp() * 1000),
            "scheduled_end_ms": int(run.scheduled_end_at.timestamp() * 1000),
            "accept_until_ms": int(run.accept_until.timestamp() * 1000),
            "session_state": run.session_state}


def backend_signing_public_key_b64() -> str:
    private_key = load_integrity_worker_private_key(
        settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE
    )
    public_bytes = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    return base64.b64encode(public_bytes).decode("ascii")


def _archive_bucket() -> str:
    bucket = str(
        getattr(
            settings,
            "INTEGRITY_ARCHIVE_BUCKET",
            settings.ANTICHEAT_RAW_BUCKET,
        )
        or ""
    ).strip()
    if not bucket:
        raise RuntimeError("integrity archive storage is unavailable")
    return bucket


def _archive_capacity_threshold(setting_name: str) -> int:
    value = getattr(settings, setting_name, None)
    if type(value) is not int or value < 0:
        raise IntegrityCommandRejected("invalid_archive_capacity_policy")
    return value


def _current_archive_generation(run: ExamIntegrityRun) -> int:
    return max(1, run.archive_generation)


def _expected_archive_generation(run: ExamIntegrityRun) -> int:
    if run.archive_manifest_key and run.archive_manifest_sha256:
        return run.archive_generation + 1
    return _current_archive_generation(run)


def build_integrity_bootstrap(run: ExamIntegrityRun) -> dict[str, object]:
    if run.scheduled_end_at is None:
        raise IntegrityCommandRejected("integrity_run_schedule_missing")

    participants = []
    active_statuses = {
        ExamStatus.IN_PROGRESS,
        ExamStatus.PAUSED,
        ExamStatus.LOCKED,
    }
    rows = (
        ContestParticipant.objects.filter(
            contest_id=run.contest_id,
            exam_status__in=active_statuses,
        )
        .only("id", "exam_status")
        .order_by("id")
    )
    for participant in rows:
        participants.append(
            {
                "participant_id": participant.id,
                "status": "active",
            }
        )

    generation = _expected_archive_generation(run)
    previous_manifest = None
    if run.archive_manifest_key and run.archive_manifest_sha256:
        previous_manifest = {
            "generation": run.archive_generation,
            "object_key": run.archive_manifest_key,
            "sha256": run.archive_manifest_sha256,
        }

    key_prefix = f"runs/{run.id}/generation-{generation}/"
    return {
        "run_id": str(run.id),
        "contest_id": str(run.contest_id),
        "server_ms": int(timezone.now().timestamp() * 1000),
        "scheduled_start_ms": (
            None
            if run.scheduled_start_at is None
            else int(run.scheduled_start_at.timestamp() * 1000)
        ),
        "scheduled_end_ms": int(run.scheduled_end_at.timestamp() * 1000),
        "participants": participants,
        "policy_snapshot": run.policy_snapshot,
        "registry_snapshot": run.registry_snapshot,
        "backend_signing_public_key_b64": backend_signing_public_key_b64(),
        "archive_policy": {
            "bucket": _archive_bucket(),
            "key_prefix": key_prefix,
            "rotate_after_ms": 60_000,
            "max_segment_bytes": 8 * 1024 * 1024,
            "capacity_warning_bytes": _archive_capacity_threshold(
                "INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES"
            ),
            "capacity_reserve_bytes": _archive_capacity_threshold(
                "INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES"
            ),
            "presigned_url_ttl_seconds": (
                settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS
            ),
        },
        "generation": generation,
        "previous_manifest": previous_manifest,
    }


def generate_archive_put_url(
    *,
    bucket: str,
    object_key: str,
    content_type: str,
    sha256: str,
    byte_length: int,
) -> str:
    checksum_b64 = base64.b64encode(bytes.fromhex(sha256)).decode("ascii")
    endpoint = (
        str(settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or "").strip()
        or None
    )
    client = get_s3_client(endpoint_url=endpoint)
    return client.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": bucket,
            "Key": object_key,
            "ContentType": content_type,
            "ContentLength": byte_length,
            "ChecksumSHA256": checksum_b64,
        },
        ExpiresIn=settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS,
    )


def _canonical_uuid(value: object, code: str) -> UUID:
    if type(value) is not str:
        raise IntegrityCommandRejected(code)
    try:
        parsed = UUID(value)
    except ValueError:
        raise IntegrityCommandRejected(code) from None
    if str(parsed) != value:
        raise IntegrityCommandRejected(code)
    return parsed


def _optional_uuid(value: object, code: str) -> UUID | None:
    if value is None:
        return None
    return _canonical_uuid(value, code)


def _nonnegative_int(value: object, code: str) -> int:
    if type(value) is not int or value < 0:
        raise IntegrityCommandRejected(code)
    return value


def _positive_int(value: object, code: str) -> int:
    result = _nonnegative_int(value, code)
    if result == 0:
        raise IntegrityCommandRejected(code)
    return result


def _json_object(value: object, code: str) -> dict[str, object]:
    if type(value) is not dict:
        raise IntegrityCommandRejected(code)
    try:
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        )
    except (TypeError, ValueError):
        raise IntegrityCommandRejected(code) from None
    return dict(value)


def _command_fingerprint(semantics: dict[str, object]) -> str:
    encoded = json.dumps(
        semantics,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _strict_string(
    value: object,
    code: str,
    *,
    max_length: int,
) -> str:
    if (
        type(value) is not str
        or not value
        or value != value.strip()
        or len(value) > max_length
    ):
        raise IntegrityCommandRejected(code)
    return value


def _command_id(raw: object) -> tuple[dict[str, object], str]:
    if type(raw) is not dict:
        raise IntegrityCommandRejected("invalid_command")
    command = dict(raw)
    try:
        parsed = _canonical_uuid(
            command.get("command_id"),
            "invalid_command_id",
        )
    except IntegrityCommandRejected as exc:
        raise IntegrityCommandRejected(exc.code) from None
    return command, str(parsed)


def _normalize_command(raw: object, run_id: UUID) -> tuple[dict[str, object], str]:
    command, command_id = _command_id(raw)
    kind = command.get("kind")
    if kind not in {
        "record_event",
        "update_run_checkpoint",
    }:
        raise IntegrityCommandRejected(
            "unsupported_command_kind",
            command_id=command_id,
        )

    payload = command.get("payload")
    if payload is not None:
        if kind != "record_event" or type(payload) is not dict:
            raise IntegrityCommandRejected(
                "invalid_command_payload",
                command_id=command_id,
            )
        allowed = {"command_id", "run_id", "kind", "payload"}
        if set(command) - allowed:
            raise IntegrityCommandRejected(
                "invalid_command_fields",
                command_id=command_id,
            )
        command = {
            "command_id": command_id,
            "kind": kind,
            **dict(payload),
            **(
                {}
                if command.get("run_id") is None
                else {"run_id": command["run_id"]}
            ),
        }

    claimed_run = command.get("run_id")
    if claimed_run is not None:
        try:
            claimed_run_id = _canonical_uuid(
                claimed_run,
                "command_run_scope_mismatch",
            )
        except IntegrityCommandRejected:
            raise IntegrityCommandRejected(
                "command_run_scope_mismatch",
                command_id=command_id,
            ) from None
        if claimed_run_id != run_id:
            raise IntegrityCommandRejected(
                "command_run_scope_mismatch",
                command_id=command_id,
            )
    common_fields = {
        "command_id",
        "run_id",
        "kind",
        "participant_id",
        "device_id",
        "incident_id",
        "event_type",
        "action",
        "client_occurred_at_ms",
        "received_at_server_ms",
        "worker_processed_at_ms",
        "delayed_delivery",
        "evidence",
        "metadata",
    }
    if set(command) - common_fields:
        raise IntegrityCommandRejected(
            "invalid_command_fields",
            command_id=command_id,
        )
    command["command_id"] = command_id
    command["kind"] = kind
    return command, command_id


def validate_command_envelope(raw: object, run_id: UUID) -> str:
    _, command_id = _normalize_command(raw, run_id)
    return command_id


def _milliseconds_datetime(value: int) -> datetime:
    try:
        return datetime.fromtimestamp(
            value / 1000,
            tz=datetime_timezone.utc,
        )
    except (OverflowError, OSError, ValueError):
        raise IntegrityCommandRejected("invalid_command_timestamp") from None


def _definition_for_event(
    run: ExamIntegrityRun,
    event_type: str,
) -> tuple[str, dict[str, object], str]:
    snapshot = run.registry_snapshot
    if type(snapshot) is not dict:
        raise IntegrityCommandRejected("invalid_frozen_registry")
    if snapshot.get("version") != run.registry_version:
        raise IntegrityCommandRejected("invalid_frozen_registry")
    definitions = snapshot.get("definitions")
    if type(definitions) is not dict:
        raise IntegrityCommandRejected("invalid_frozen_registry")

    match = None
    for definition_id, raw_definition in definitions.items():
        if type(definition_id) is not str or type(raw_definition) is not dict:
            raise IntegrityCommandRejected("invalid_frozen_registry")
        signals = raw_definition.get("signals")
        if type(signals) is not dict:
            raise IntegrityCommandRejected("invalid_frozen_registry")
        for phase in ("triggered", "escalated", "restored"):
            if signals.get(phase) == event_type:
                if match is not None:
                    raise IntegrityCommandRejected("invalid_frozen_registry")
                match = (definition_id, dict(raw_definition), phase)
    if match is None:
        raise IntegrityCommandRejected("event_not_in_frozen_registry")
    return match


def _validate_event_action(
    *,
    definition: dict[str, object],
    phase: str,
    action: str,
    delayed_delivery: bool,
) -> None:
    registry_action = _REGISTRY_ACTIONS.get(definition.get("action"))
    signals = definition.get("signals")
    if registry_action is None or type(signals) is not dict:
        raise IntegrityCommandRejected("invalid_frozen_registry")
    if delayed_delivery:
        allowed = {"audit"}
    elif phase == "restored":
        allowed = {"audit"}
    elif phase == "triggered" and (
        signals.get("escalated") or signals.get("restored")
    ):
        allowed = {"record", "audit"}
    else:
        allowed = {registry_action, "audit"}
    if action not in allowed:
        raise IntegrityCommandRejected("command_action_registry_mismatch")


def _existing_command_event(
    *,
    command_id: UUID,
    run_id: UUID,
    participant_id: int,
    event_type: str,
    command_fingerprint: str,
    command_semantics: dict[str, object],
) -> ExamEvent | None:
    existing = ExamEvent.objects.filter(integrity_command_id=command_id).first()
    if existing is None:
        return None
    if (
        existing.integrity_run_id != run_id
        or existing.user_id
        != ContestParticipant.objects.only("user_id").get(pk=participant_id).user_id
        or existing.event_type != event_type
    ):
        raise IntegrityCommandRejected("command_id_conflict")
    metadata = existing.metadata
    integrity_metadata = (
        metadata.get("integrity")
        if type(metadata) is dict
        else None
    )
    existing_fingerprint = (
        integrity_metadata.get("command_fingerprint")
        if type(integrity_metadata) is dict
        else None
    )
    if (
        type(existing_fingerprint) is str
        and hmac.compare_digest(existing_fingerprint, command_fingerprint)
    ):
        return existing
    raise IntegrityCommandRejected("command_id_conflict")


def _pause_reason(event_type: str) -> str:
    reasons = {
        "connectivity_timeout": (
            "Connection timeout: no client checkpoint received for 60 seconds; "
            "pre-check is required to continue"
        ),
        "listener_tampered": (
            "Listener tampered: anti-cheat integrity check failed; "
            "pre-check is required to continue"
        ),
        "exit_fullscreen": (
            "Fullscreen recovery timed out; pre-check is required to continue"
        ),
        "screen_share_stopped": (
            "Screen share recovery timed out; pre-check is required to continue"
        ),
        "webcam_stopped": (
            "Webcam recovery timed out; pre-check is required to continue"
        ),
        "viewport_stopped": (
            "Viewport integrity recovery timed out; "
            "pre-check is required to continue"
        ),
        "split_view_detected": (
            "Split view detected; pre-check is required to continue"
        ),
        "multiple_displays": (
            "Multiple displays detected; pre-check is required to continue"
        ),
    }
    return reasons.get(event_type, f"Monitoring recovery required: {event_type}")


def _apply_registry_action(
    participant: ContestParticipant,
    *,
    event_type: str,
    phase: str,
    action: str,
    definition: dict[str, object],
) -> None:
    if action == "audit":
        return

    update_fields: list[str] = []
    signals = definition.get("signals")
    if type(signals) is not dict:
        raise IntegrityCommandRejected("invalid_frozen_registry")
    if registry_action_is_penalty(phase, action, definition):
        participant.violation_count += 1
        update_fields.append("violation_count")

    if action == "pause" and participant.exam_status == ExamStatus.IN_PROGRESS:
        participant.exam_status = ExamStatus.PAUSED
        participant.locked_at = None
        participant.lock_reason = _pause_reason(event_type)
        update_fields.extend(["exam_status", "locked_at", "lock_reason"])
        log_contest_activity(
            participant.contest,
            participant.user,
            "update_participant",
            f"Paused for monitoring re-check due to {event_type}",
        )
    elif action == "lock" and participant.exam_status in {
        ExamStatus.IN_PROGRESS,
        ExamStatus.PAUSED,
    }:
        participant.exam_status = ExamStatus.LOCKED
        participant.locked_at = timezone.now()
        participant.lock_reason = f"System lock: {event_type}"
        update_fields.extend(["exam_status", "locked_at", "lock_reason"])
        log_contest_activity(
            participant.contest,
            participant.user,
            "lock_user",
            f"Auto-locked due to {event_type}",
        )
    elif action == "submit":
        if update_fields:
            participant.save(update_fields=list(dict.fromkeys(update_fields)))
        finalize_submission(
            participant,
            submit_reason=f"Auto-submitted: {event_type}",
            activity_user=participant.user,
            activity_action_type="auto_submit",
            activity_details=f"Auto-submitted: {event_type}",
        )
        return

    if update_fields:
        participant.save(update_fields=list(dict.fromkeys(update_fields)))


@transaction.atomic
def record_integrity_event(command: RecordIntegrityEvent) -> ExamEvent:
    contest_id = ExamIntegrityRun.objects.values_list("contest_id", flat=True).get(pk=command.run_id)
    Contest.objects.select_for_update().get(pk=contest_id)
    run = (
        ExamIntegrityRun.objects.select_for_update(of=("self",))
        .select_related("contest")
        .get(pk=command.run_id)
    )
    participant = (
        ContestParticipant.objects.select_for_update()
        .select_related("contest", "user")
        .filter(pk=command.participant_id, contest_id=run.contest_id)
        .first()
    )
    if participant is None:
        raise IntegrityCommandRejected("participant_run_scope_mismatch")

    definition_id, definition, phase = _definition_for_event(
        run,
        command.event_type,
    )
    _validate_event_action(
        definition=definition,
        phase=phase,
        action=command.action,
        delayed_delivery=command.delayed_delivery,
    )
    if participant.exam_status not in {
        ExamStatus.IN_PROGRESS,
        ExamStatus.PAUSED,
        ExamStatus.LOCKED,
        ExamStatus.SUBMITTED,
    }:
        raise IntegrityCommandRejected("participant_not_active")

    existing = _existing_command_event(
        command_id=command.command_id,
        run_id=run.id,
        participant_id=participant.id,
        event_type=command.event_type,
        command_fingerprint=command.command_fingerprint,
        command_semantics=command.command_semantics,
    )
    if existing is not None:
        return existing

    late_unverified = False
    from .integrity_availability import connectivity_overlaps_observed_gap
    platform_gap = connectivity_overlaps_observed_gap(run, command)
    from apps.contests.models import IntegrityBatchAdmission
    try:
        receipt_id = UUID(str(command.metadata.get("receipt_batch_id")))
    except (ValueError, TypeError, AttributeError):
        receipt_id = None
    late_unverified = not IntegrityBatchAdmission.objects.filter(
        run=run, participant=participant, device_id=command.device_id,
        attempt_id=participant.integrity_attempt_id, batch_id=receipt_id,
        late_unverified=False).exists()
    effective_action = (
        "audit"
        if (
            command.delayed_delivery
            or late_unverified
            or platform_gap
            or participant.exam_status == ExamStatus.SUBMITTED
        )
        else command.action
    )
    metadata = dict(command.metadata)
    metadata["integrity"] = {
        "action": effective_action,
        "definition_id": definition_id,
        "device_id": command.device_id,
        "evidence": command.evidence,
        "phase": phase,
        "requested_action": command.action,
        "command_fingerprint": command.command_fingerprint,
        "late_unverified": late_unverified,
        **({"evidence_gap": command.metadata["evidence_gap"]} if command.metadata.get("evidence_gap") else {}),
        **({"suppressed_reason": "platform_gap"} if platform_gap else {}),
    }
    event = ExamEvent.objects.create(
        contest=run.contest,
        user=participant.user,
        integrity_run=run,
        integrity_command_id=command.command_id,
        incident_id=command.incident_id,
        event_type=command.event_type,
        event_definition_version=run.registry_version,
        event_schema_version=_positive_int(
            definition.get("schema_version"),
            "invalid_frozen_registry",
        ),
        client_occurred_at_ms=command.client_occurred_at_ms,
        server_received_at=command.server_received_at,
        worker_processed_at=command.worker_processed_at,
        delayed_delivery=command.delayed_delivery,
        metadata=metadata,
    )
    if platform_gap:
        run.metrics = {**run.metrics, "backend_suppressed_connectivity_commands":
                       run.metrics.get("backend_suppressed_connectivity_commands", 0) + 1}
        run.save(update_fields=["metrics", "updated_at"])
    if (
        not command.delayed_delivery
        and not late_unverified
        and participant.exam_status != ExamStatus.SUBMITTED
    ):
        _apply_registry_action(
            participant,
            event_type=command.event_type,
            phase=phase,
            action=effective_action,
            definition=definition,
        )
    return event


def _record_event_command(
    run: ExamIntegrityRun,
    command: dict[str, object],
    command_id: str,
) -> CommandOutcome:
    participant_id = _positive_int(
        command.get("participant_id"),
        "invalid_participant_id",
    )
    event_type = _strict_string(
        command.get("event_type"),
        "invalid_event_type",
        max_length=64,
    )
    delayed_delivery = command.get("delayed_delivery")
    if type(delayed_delivery) is not bool:
        raise IntegrityCommandRejected("invalid_delayed_delivery")
    action = command.get("action")
    if action is None:
        _definition_id, definition, phase = _definition_for_event(run, event_type)
        signals = definition.get("signals")
        registry_action = _REGISTRY_ACTIONS.get(definition.get("action"))
        if registry_action is None or type(signals) is not dict:
            raise IntegrityCommandRejected("invalid_frozen_registry")
        if delayed_delivery or phase == "restored":
            action = "audit"
        elif phase == "triggered" and (
            signals.get("escalated") or signals.get("restored")
        ):
            action = "record"
        else:
            action = registry_action
    if action not in _ACTIONS:
        raise IntegrityCommandRejected("invalid_command_action")
    client_ms = _nonnegative_int(
        command.get("client_occurred_at_ms"),
        "invalid_command_timestamp",
    )
    received_ms = command.get("received_at_server_ms")
    if received_ms is None:
        server_received_at = timezone.now()
    else:
        server_received_at = _milliseconds_datetime(
            _nonnegative_int(received_ms, "invalid_command_timestamp")
        )
    processed_ms = command.get("worker_processed_at_ms")
    worker_processed_at = (
        timezone.now()
        if processed_ms is None
        else _milliseconds_datetime(
            _nonnegative_int(processed_ms, "invalid_command_timestamp")
        )
    )
    metadata = _json_object(command.get("metadata", {}), "invalid_event_metadata")
    evidence = _json_object(command.get("evidence", {}), "invalid_event_evidence")
    device_id = _strict_string(
        command.get("device_id", "worker"),
        "invalid_device_id",
        max_length=128,
    )
    incident_id = _optional_uuid(
        command.get("incident_id"),
        "invalid_incident_id",
    )
    command_semantics = {
        "kind": "record_event",
        "run_id": str(run.id),
        "participant_id": participant_id,
        "device_id": device_id,
        "incident_id": None if incident_id is None else str(incident_id),
        "event_type": event_type,
        "action": action,
        "client_occurred_at_ms": client_ms,
        "received_at_server_ms": received_ms,
        "worker_processed_at_ms": processed_ms,
        "delayed_delivery": delayed_delivery,
        "evidence": evidence,
        "metadata": metadata,
    }
    command_fingerprint = _command_fingerprint(command_semantics)
    if (
        event_type in _CONNECTIVITY_TRANSITIONS
        and ContestParticipant.objects.filter(
            pk=participant_id,
            contest_id=run.contest_id,
            exam_status=ExamStatus.SUBMITTED,
        ).exists()
    ):
        return CommandOutcome(
            command_id=command_id,
            status="applied",
            result={"ignored": "participant_submitted"},
        )
    before = ExamEvent.objects.filter(integrity_command_id=command_id).exists()
    record_integrity_event(
        RecordIntegrityEvent(
            command_id=UUID(command_id),
            run_id=run.id,
            participant_id=participant_id,
            event_type=event_type,
            incident_id=incident_id,
            client_occurred_at_ms=client_ms,
            server_received_at=server_received_at,
            worker_processed_at=worker_processed_at,
            delayed_delivery=delayed_delivery,
            metadata=metadata,
            action=str(action),
            device_id=device_id,
            evidence=evidence,
            command_fingerprint=command_fingerprint,
            command_semantics=command_semantics,
        )
    )
    return CommandOutcome(
        command_id=command_id,
        status="already_applied" if before else "applied",
        result={},
    )


def _monotonic_counts(
    current: object,
    incoming: object,
    code: str,
) -> dict[str, int]:
    if type(incoming) is not dict:
        raise IntegrityCommandRejected(code)
    result = dict(current) if type(current) is dict else {}
    for key, value in incoming.items():
        if type(key) is not str or type(value) is not int or value < 0:
            raise IntegrityCommandRejected(code)
        previous = result.get(key, 0)
        if type(previous) is not int or previous < 0:
            previous = 0
        result[key] = max(previous, value)
    return result


def _checkpoint_command(
    run: ExamIntegrityRun,
    command: dict[str, object],
    command_id: str,
) -> CommandOutcome:
    metadata = _json_object(command.get("metadata", {}), "invalid_command_metadata")
    allowed_metadata = {
        "heartbeat_at_ms",
        "received_counts",
        "processed_counts",
        "archived_counts",
        "health",
        "warnings",
        "worker_version",
        "archive_generation",
        "code",
        "skipped_event_type",
        "received_registry_version",
        "expected_registry_version",
    }
    if set(metadata) - allowed_metadata:
        raise IntegrityCommandRejected("invalid_checkpoint_metadata")
    participant_id = command.get("participant_id")
    if participant_id is not None:
        participant_id = _positive_int(
            participant_id,
            "invalid_participant_id",
        )
        if not ContestParticipant.objects.filter(
            pk=participant_id,
            contest_id=run.contest_id,
        ).exists():
            raise IntegrityCommandRejected("participant_run_scope_mismatch")
    warnings = metadata.get("warnings")
    warning_code = metadata.get("code")
    if warnings is None:
        warnings = [] if warning_code is None else [warning_code]
    if (
        type(warnings) is not list
        or any(
            type(code) is not str
            or not code
            or len(code) > 128
            for code in warnings
        )
    ):
        raise IntegrityCommandRejected("invalid_checkpoint_warnings")

    heartbeat_ms = metadata.get(
        "heartbeat_at_ms",
        command.get("received_at_server_ms"),
    )
    heartbeat = (
        timezone.now()
        if heartbeat_ms is None
        else _milliseconds_datetime(
            _nonnegative_int(heartbeat_ms, "invalid_command_timestamp")
        )
    )
    is_newer = (
        run.last_worker_heartbeat_at is None
        or heartbeat >= run.last_worker_heartbeat_at
    )
    update_fields = ["updated_at"]
    if is_newer:
        run.last_worker_heartbeat_at = heartbeat
        update_fields.append("last_worker_heartbeat_at")

    count_fields = (
        ("received_counts", "received_counts"),
        ("processed_counts", "processed_counts"),
        ("archived_counts", "archived_counts"),
    )
    for metadata_key, model_field in count_fields:
        incoming = metadata.get(metadata_key)
        if incoming is None:
            continue
        setattr(
            run,
            model_field,
            _monotonic_counts(
                getattr(run, model_field),
                incoming,
                f"invalid_{metadata_key}",
            ),
        )
        update_fields.append(model_field)

    health = metadata.get("health")
    if health is not None and health not in {
        ExamIntegrityRun.Health.HEALTHY,
        ExamIntegrityRun.Health.UNHEALTHY,
    }:
        raise IntegrityCommandRejected("invalid_checkpoint_health")
    if health == ExamIntegrityRun.Health.UNHEALTHY:
        run.health = health
        update_fields.append("health")

    merged_warnings = sorted(
        set(run.warnings if type(run.warnings) is list else []) | set(warnings)
    )
    if merged_warnings != run.warnings:
        run.warnings = merged_warnings
        update_fields.append("warnings")

    worker_version = metadata.get("worker_version")
    if worker_version is not None:
        worker_version = _strict_string(
            worker_version,
            "invalid_worker_version",
            max_length=64,
        )
        if is_newer and worker_version != run.worker_version:
            run.worker_version = worker_version
            update_fields.append("worker_version")

    archive_generation = metadata.get("archive_generation")
    if archive_generation is not None:
        archive_generation = _nonnegative_int(
            archive_generation,
            "invalid_archive_generation",
        )
        if archive_generation > run.archive_generation:
            run.archive_generation = archive_generation
            update_fields.append("archive_generation")

    run.save(update_fields=list(dict.fromkeys(update_fields)))
    return CommandOutcome(command_id, "applied", {})


@transaction.atomic
def execute_integrity_command(
    run_id: UUID,
    raw_command: object,
    *,
    authenticated_service_digest: str,
) -> CommandOutcome:
    command, command_id = _normalize_command(raw_command, run_id)
    contest_id = ExamIntegrityRun.objects.filter(pk=run_id).values_list("contest_id", flat=True).first()
    if contest_id is not None:
        Contest.objects.select_for_update().get(pk=contest_id)
    run = (
        ExamIntegrityRun.objects.select_for_update(of=("self",))
        .select_related("contest")
        .filter(pk=run_id)
        .first()
    )
    # Recheck the service identity after acquiring the Run lock, including
    # credential rotation and immutable execution ownership.
    if (not resident_run_scope(run)
            or not hmac.compare_digest(resident_service_digest(), authenticated_service_digest)):
        raise IntegrityCommandRejected("invalid_integrity_run_scope")

    kind = command["kind"]
    if kind == "record_event":
        return _record_event_command(run, command, command_id)
    if kind == "update_run_checkpoint":
        return _checkpoint_command(run, command, command_id)
    raise AssertionError("validated command kind is not handled")
