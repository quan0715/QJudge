"""Upload-only scopes. These never satisfy answer/session permissions."""
from datetime import timedelta
from uuid import UUID, uuid4
import hashlib
import json

from django.conf import settings
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamIntegrityRun,
    IntegrityUploadGrant,
    IntegrityBatchAdmission,
    ExamEvidenceChunk,
    ExamStatus,
)
from .anti_cheat_session import get_active_session


def rotate_integrity_attempt(participant):
    """Explicit start/reset/re-entry only, never called by a schedule update."""
    IntegrityUploadGrant.objects.filter(
        participant=participant, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())
    participant.integrity_attempt_id = uuid4()
    return "integrity_attempt_id"


def prepare_upload_grant(participant, *, submitted_at):
    """Caller owns Contest -> Run -> Participant; isolate optional grant writes."""
    session = get_active_session(participant.contest_id, participant.user_id)
    if not isinstance(session, dict) or (
        session.get("participant_id") != participant.pk
        or session.get("user_id") != participant.user_id
        or not isinstance(session.get("device_id"), str)
        or not session["device_id"]
    ):
        return
    with transaction.atomic():
        run = ExamIntegrityRun.objects.filter(
            contest_id=participant.contest_id,
            execution_backend="resident",
            data_state="open",
            session_state__in=("prepared", "active", "draining"),
        ).first()
        if run is None or run.accept_until is None or run.accept_until <= submitted_at:
            return
        IntegrityUploadGrant.objects.get_or_create(
            run=run,
            participant=participant,
            attempt_id=participant.integrity_attempt_id,
            device_id=session["device_id"],
            defaults={
                "submitted_at": submitted_at,
                "accept_until": min(
                    run.accept_until,
                    submitted_at
                    + timedelta(seconds=settings.INTEGRITY_ACCEPT_GRACE_SECONDS),
                ),
            },
        )


def authorize_integrity_upload(*, run, participant, device_id, attempt_id, now) -> bool:
    try:
        attempt_id = UUID(str(attempt_id))
    except (ValueError, TypeError, AttributeError):
        return False
    if (
        run.execution_backend != "resident"
        or run.contest_id != participant.contest_id
        or participant.exam_status != ExamStatus.SUBMITTED
        or attempt_id != participant.integrity_attempt_id
        or run.data_state != "open"
        or run.session_state not in ("active", "draining", "prepared")
        or run.accept_until is None
        or now >= run.accept_until
    ):
        return False
    return IntegrityUploadGrant.objects.filter(
        run=run,
        participant=participant,
        device_id=device_id,
        attempt_id=attempt_id,
        revoked_at__isnull=True,
        submitted_at__lte=now,
        accept_until__gt=now,
        completed_at__isnull=True,
    ).exists()


def next_sequence(run, participant, device_id):
    # Sequence is a Run/device stream, even across explicit attempt resets.
    return 1 + (
        IntegrityBatchAdmission.objects.filter(
            run=run, participant=participant, device_id=device_id
        ).aggregate(value=Max("last_seq"))["value"]
        or 0
    )


@transaction.atomic
def admit_checkpoint(
    contest,
    participant,
    scope,
    observations,
    *,
    request_device,
    final_seq=None,
    has_evidence=False,
):
    from .exam_schedule import lock_exam_runs

    Contest.objects.select_for_update().get(pk=contest.pk)
    runs = lock_exam_runs(contest.pk)
    participant = ContestParticipant.objects.select_for_update().get(pk=participant.pk)
    run = next((run for run in runs if run.pk == scope["run_id"]), None)
    if (
        run is None
        or run.execution_backend != "resident"
        or run.data_state != "open"
        or scope["participant_id"] != participant.pk
        or scope["attempt_id"] != participant.integrity_attempt_id
        or request_device != scope["device_id"]
    ):
        raise PermissionDenied("Integrity upload scope invalid.")
    now = timezone.now()
    grant = None
    if participant.exam_status in (
        ExamStatus.IN_PROGRESS,
        ExamStatus.PAUSED,
        ExamStatus.LOCKED,
    ):
        session = get_active_session(contest.pk, participant.user_id)
        if (
            not isinstance(session, dict)
            or session.get("participant_id") != participant.pk
            or session.get("user_id") != participant.user_id
            or session.get("device_id") != scope["device_id"]
        ):
            raise PermissionDenied(
                "Checkpoint identity does not match the active exam session."
            )
        if final_seq is not None:
            raise ValidationError("Final sequence is only accepted after submission.")
    else:
        grant = IntegrityUploadGrant.objects.select_for_update().filter(
            run=run,
            participant=participant,
            attempt_id=scope["attempt_id"],
            device_id=scope["device_id"],
        ).first()
        if not authorize_integrity_upload(
            run=run,
            participant=participant,
            device_id=scope["device_id"],
            attempt_id=scope["attempt_id"],
            now=now,
        ):
            if not (
                grant
                and grant.completed_at
                and not observations
                and not has_evidence
                and final_seq is None
                and not grant.revoked_at
            ):
                raise PermissionDenied("Integrity upload scope expired or invalid.")
    if run.accept_until is None or now >= run.accept_until:
        raise PermissionDenied("Integrity Run upload scope expired.")
    body = None
    if observations:
        if any(
            observations[key] != scope[key]
            for key in ("run_id", "participant_id", "device_id")
        ):
            raise PermissionDenied("Observation scope mismatch.")
        from apps.contests.integrity_serializers import canonical_integrity_batch_bytes

        for record in observations["records"]:
            fence = record["payload"].get("evidence_fence")
            if fence is not None and str(scope["attempt_id"]) != fence["attempt_id"]:
                raise PermissionDenied("Evidence fence attempt scope mismatch.")

        raw = canonical_integrity_batch_bytes(observations)
        fingerprint = hashlib.sha256(raw).hexdigest()
        existing = IntegrityBatchAdmission.objects.filter(
            run=run, batch_id=observations["batch_id"]
        ).first()
        if existing:
            if (
                existing.body_sha256 != fingerprint
                or existing.attempt_id != scope["attempt_id"]
                or existing.participant_id != participant.pk
                or existing.device_id != scope["device_id"]
            ):
                raise ValidationError("Batch identity conflict.")
        else:
            admissions = IntegrityBatchAdmission.objects.filter(
                run=run, participant=participant, device_id=scope["device_id"]
            )
            if admissions.count() >= 10000 or observations["last_seq"] > 10_000_000:
                raise ValidationError("Integrity admission capacity reached.")
            if admissions.filter(
                first_seq__lte=observations["last_seq"],
                last_seq__gte=observations["first_seq"],
            ).exists():
                raise ValidationError(
                    "Sequence range already belongs to another batch; retry its original identity."
                )
            if (
                admissions.exclude(attempt_id=scope["attempt_id"])
                .filter(last_seq__gte=observations["first_seq"])
                .exists()
            ):
                raise ValidationError(
                    "New attempts continue the existing Run/device sequence."
                )
            if (
                grant
                and grant.final_seq is not None
                and observations["last_seq"] > grant.final_seq
            ):
                raise ValidationError("Batch exceeds declared final sequence.")
            existing = IntegrityBatchAdmission.objects.create(
                run=run,
                participant=participant,
                batch_id=observations["batch_id"],
                attempt_id=scope["attempt_id"],
                device_id=scope["device_id"],
                body_sha256=fingerprint,
                first_seq=observations["first_seq"],
                last_seq=observations["last_seq"],
                first_received_at=now,
                late_unverified=participant.exam_status == ExamStatus.SUBMITTED,
            )
        body = json.dumps(
            {"batch": json.loads(raw), "late_unverified": existing.late_unverified,
             "attempt_id": str(existing.attempt_id)},
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
    if grant and final_seq is not None:
        if final_seq < next_sequence(run, participant, scope["device_id"]) - 1:
            raise ValidationError("Final sequence excludes admitted records.")
        if grant.final_seq is not None and grant.final_seq != final_seq:
            raise ValidationError("Final sequence declaration is immutable.")
        grant.final_seq = final_seq
        grant.save(update_fields=["final_seq"])
    return run, participant, body


def upload_status(grant, *, now):
    if grant.completed_at:
        return "complete"
    if grant.revoked_at or now >= min(
        grant.accept_until, grant.run.accept_until or grant.accept_until
    ):
        return "expired"
    return "pending"


@transaction.atomic
def save_upload_progress(run, participant, scope, progress):
    from .exam_schedule import lock_exam_runs
    from .integrity_evidence import build_evidence_delivery

    Contest.objects.select_for_update().get(pk=run.contest_id)
    runs = lock_exam_runs(run.contest_id)
    current = next((value for value in runs if value.pk == run.pk), None)
    participant = ContestParticipant.objects.select_for_update().get(pk=participant.pk)
    grant = (
        IntegrityUploadGrant.objects.select_related("run")
        .filter(
            run=run,
            participant=participant,
            attempt_id=scope["attempt_id"],
            device_id=scope["device_id"],
        )
        .first()
    )
    if grant is None:
        return "pending"
    now = timezone.now()
    if upload_status(grant, now=now) != "pending":
        return upload_status(grant, now=now)
    if (
        current is None
        or current.schedule_revision != run.schedule_revision
        or participant.integrity_attempt_id != scope["attempt_id"]
    ):
        return "pending"
    grant.received_seq, grant.processed_seq = (
        progress["received_seq"],
        progress["processed_seq"],
    )
    grant.commands_drained = progress["commands_drained"]
    if (
        grant.final_seq is not None
        and grant.received_seq >= grant.final_seq
        and grant.processed_seq >= grant.final_seq
        and grant.commands_drained
        and not build_evidence_delivery(
            run, participant, int(now.timestamp() * 1000)
        ).pending_commands
        and not ExamEvidenceChunk.objects.filter(
            integrity_run=run, participant=participant
        )
        .exclude(status__in=("verified", "unavailable"))
        .exists()
    ):
        grant.completed_at = now
    grant.save(
        update_fields=[
            "received_seq",
            "processed_seq",
            "commands_drained",
            "completed_at",
        ]
    )
    return upload_status(grant, now=now)
