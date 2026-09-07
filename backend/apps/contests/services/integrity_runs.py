from __future__ import annotations

import hashlib
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable

from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.services.integrity_sessions import ensure_resident_session


_LIVE_RUN_CONSTRAINT = "uniq_live_integrity_run_per_contest"
_SAFE_LIFECYCLE_CODES = frozenset({"integrity_purge_indeterminate"})
_PUBLIC_LIFECYCLE_DETAIL = "Integrity lifecycle operation could not be confirmed."


class InvalidRunTransition(RuntimeError):
    pass


class LiveIntegrityRunExists(RuntimeError):
    pass


class IntegrityLifecycleError(RuntimeError):
    """A fixed, credential-free error safe for API and logging boundaries."""

    def __init__(self, code: str) -> None:
        safe_code = code if code in _SAFE_LIFECYCLE_CODES else "integrity_purge_indeterminate"
        super().__init__(_PUBLIC_LIFECYCLE_DETAIL)
        self.code = safe_code


PurgeRunData = Callable[[ExamIntegrityRun], object]
ResidentDataPurge = Callable[[ExamIntegrityRun], object]


@dataclass
class LifecycleErrorClaim:
    session_state: str
    data_state: str
    archive_generation: int
    archive_manifest_key: str
    archive_manifest_sha256: str


@dataclass
class LifecycleErrorGuard:
    claim: LifecycleErrorClaim | None = None

    def observe(self, run: ExamIntegrityRun) -> None:
        self.claim = LifecycleErrorClaim(
            session_state=run.session_state,
            data_state=run.data_state,
            archive_generation=run.archive_generation,
            archive_manifest_key=run.archive_manifest_key,
            archive_manifest_sha256=run.archive_manifest_sha256,
        )


def _resolve_purger() -> PurgeRunData:
    from apps.contests.services.integrity_evidence import purge_integrity_data

    return purge_integrity_data


def _resolve_resident_purger() -> ResidentDataPurge:
    from apps.contests.infrastructure.integrity_worker_client import (
        build_integrity_worker_client,
    )

    def purge(run: ExamIntegrityRun) -> object:
        return build_integrity_worker_client().purge_run_data(run)

    return purge


def _constraint_name(exc: IntegrityError) -> str | None:
    cause = exc.__cause__
    diagnostic = getattr(cause, "diag", None)
    name = getattr(diagnostic, "constraint_name", None)
    return name if isinstance(name, str) else None


def create_run(contest, *, actor) -> ExamIntegrityRun:
    try:
        with transaction.atomic():
            contest = Contest.objects.select_for_update().get(pk=contest.pk)
            existing_ids = set(contest.integrity_runs.values_list("id", flat=True))
            run = ensure_resident_session(contest.pk, actor_id=actor.pk)
            if run is None:
                raise InvalidRunTransition(
                    "contest is not eligible for resident preparation"
                )
            if run.pk in existing_ids:
                raise LiveIntegrityRunExists("live integrity run already exists")
            return run
    except IntegrityError as exc:
        if _constraint_name(exc) == _LIVE_RUN_CONSTRAINT:
            raise LiveIntegrityRunExists("live integrity run already exists") from None
        raise


@contextmanager
def _serialized_run_operation(run_id):
    """Serialize a multi-transaction lifecycle operation without another table."""

    if connection.vendor != "postgresql":
        yield
        return
    digest = hashlib.sha256(
        ("exam-integrity-run:" + str(uuid.UUID(str(run_id)))).encode("ascii")
    ).digest()
    advisory_key = int.from_bytes(digest[:8], byteorder="big", signed=True)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_lock(%s)", [advisory_key])
    try:
        yield
    finally:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [advisory_key])
        except Exception:
            # A closed/broken connection releases its session locks itself.
            pass


def _record_lifecycle_error(run_id, code: str, *, claim: LifecycleErrorClaim | None) -> None:
    if claim is None:
        return
    safe_code = code if code in _SAFE_LIFECYCLE_CODES else "lifecycle_operation_failed"
    try:
        ExamIntegrityRun.objects.filter(
            pk=run_id,
            session_state=claim.session_state,
            data_state=claim.data_state,
            archive_generation=claim.archive_generation,
            archive_manifest_key=claim.archive_manifest_key,
            archive_manifest_sha256=claim.archive_manifest_sha256,
        ).update(
            health=ExamIntegrityRun.Health.UNHEALTHY,
            last_error=safe_code,
        )
    except Exception:
        pass


def purge_run(
    run_id,
    *,
    actor,
    purger: PurgeRunData | None = None,
    resident_purger: ResidentDataPurge | None = None,
) -> ExamIntegrityRun:
    """Delete archived evidence and the resident's local Run data, in that order.

    Purge stays terminal only when both stores are gone: object storage first,
    then the resident volume that still holds the Run journal after finalization.
    """

    error_guard = LifecycleErrorGuard()
    try:
        with _serialized_run_operation(run_id):
            run = ExamIntegrityRun.objects.get(pk=run_id)
            error_guard.observe(run)
            if not (
                run.session_state
                in (
                    ExamIntegrityRun.SessionState.ARCHIVED,
                    ExamIntegrityRun.SessionState.CLOSED,
                )
                and run.data_state == ExamIntegrityRun.DataState.ARCHIVED
            ):
                raise InvalidRunTransition(
                    "purge requires an archived Run and archived data"
                ) from None

            (purger or _resolve_purger())(run)
            (resident_purger or _resolve_resident_purger())(run)

            with transaction.atomic():
                locked = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
                if not (
                    locked.session_state == run.session_state
                    and locked.data_state == ExamIntegrityRun.DataState.ARCHIVED
                    and locked.archive_generation == run.archive_generation
                    and locked.archive_manifest_key == run.archive_manifest_key
                    and locked.archive_manifest_sha256 == run.archive_manifest_sha256
                ):
                    raise InvalidRunTransition(
                        "purge Run changed before finalization"
                    ) from None
                locked.data_state = ExamIntegrityRun.DataState.PURGED
                locked.session_state = ExamIntegrityRun.SessionState.CLOSED
                locked.archive_manifest_key = ""
                locked.archive_manifest_sha256 = ""
                locked.purged_by = actor
                locked.purged_at = timezone.now()
                locked.health = ExamIntegrityRun.Health.HEALTHY
                locked.last_error = ""
                locked.save()
                return locked
    except InvalidRunTransition:
        raise
    except Exception:
        code = "integrity_purge_indeterminate"
        _record_lifecycle_error(run_id, code, claim=error_guard.claim)
        raise IntegrityLifecycleError(code) from None
