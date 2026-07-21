from __future__ import annotations

import hashlib
import hmac
import re
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable, Mapping, Protocol

from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from apps.contests.integrity.registry import REGISTRY_VERSION, build_registry_snapshot
from apps.contests.models import ExamIntegrityRun
from apps.contests.services.anticheat_config import build_integrity_policy_snapshot
from apps.contests.services.integrity_tokens import issue_run_token


_LIVE_RUN_CONSTRAINT = "uniq_live_integrity_run_per_contest"
_SHA256_RE = re.compile(r"[0-9a-fA-F]{64}\Z")
_MANIFEST_KEY_MAX_LENGTH = 2048
_SAFE_LIFECYCLE_CODES = frozenset(
    {
        "controller_start_reconciliation_failed",
        "controller_start_finalization_failed",
        "worker_archive_failed",
        "controller_stop_reconciliation_failed",
        "controller_stop_finalization_failed",
        "controller_destroy_indeterminate",
        "integrity_purge_indeterminate",
    }
)
_PUBLIC_LIFECYCLE_DETAIL = "Integrity lifecycle operation could not be confirmed."


class InvalidRunTransition(RuntimeError):
    pass


class LiveIntegrityRunExists(RuntimeError):
    pass


class IntegrityLifecycleError(RuntimeError):
    """A fixed, credential-free error safe for API and logging boundaries."""

    def __init__(self, code: str) -> None:
        safe_code = (
            code
            if code in _SAFE_LIFECYCLE_CODES
            else "controller_start_reconciliation_failed"
        )
        super().__init__(_PUBLIC_LIFECYCLE_DETAIL)
        self.code = safe_code


class ControllerClient(Protocol):
    def start(self, run_id, *, token: str, image: str) -> Mapping[str, object]:
        ...

    def status(self, run_id) -> object:
        ...

    def stop_container(self, run_id) -> Mapping[str, object]:
        ...

    def destroy(self, run_id) -> Mapping[str, object]:
        ...

    def purge_data(self, run_id) -> Mapping[str, object]:
        ...


class WorkerStopClient(Protocol):
    def request_stop(self, run: ExamIntegrityRun) -> Mapping[str, object]:
        ...


PurgeRunData = Callable[[ExamIntegrityRun], object]


@dataclass(frozen=True)
class StartedContainer:
    container_id: str
    container_name: str
    worker_url: str
    image_digest: str


@dataclass(frozen=True)
class ReconciledControllerStatus:
    run_id: str
    exists: bool
    state: str
    container_id: str = ""
    container_name: str = ""
    worker_url: str = ""
    image_digest: str = ""
    run_token_sha256: str = ""


@dataclass(frozen=True)
class VerifiedArchiveManifest:
    manifest_key: str
    manifest_sha256: str


def _build_controller_client() -> ControllerClient:
    from apps.contests.infrastructure.integrity_controller_client import (
        build_integrity_controller_client,
    )

    return build_integrity_controller_client()


def _build_worker_client() -> WorkerStopClient:
    # Task 8 owns this adapter. Keeping resolution lazy preserves the fixed port.
    from apps.contests.infrastructure.integrity_worker_client import (
        build_integrity_worker_client,
    )

    return build_integrity_worker_client()


def _resolve_purger() -> PurgeRunData:
    # Task 10 owns exact-run object deletion behind this narrow callable.
    from apps.contests.services.integrity_evidence import purge_integrity_data

    return purge_integrity_data


def _constraint_name(exc: IntegrityError) -> str | None:
    cause = exc.__cause__
    diagnostic = getattr(cause, "diag", None)
    name = getattr(diagnostic, "constraint_name", None)
    return name if isinstance(name, str) else None


def create_run(
    contest,
    *,
    actor,
    worker_image: str | None = None,
) -> ExamIntegrityRun:
    try:
        with transaction.atomic():
            return ExamIntegrityRun.objects.create(
                contest=contest,
                created_by=actor,
                worker_image=worker_image or settings.INTEGRITY_WORKER_IMAGE,
                registry_version=REGISTRY_VERSION,
                scheduled_start_at=contest.start_time,
                scheduled_end_at=contest.end_time,
            )
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


def _record_lifecycle_error(run_id, code: str) -> None:
    safe_code = code if code in _SAFE_LIFECYCLE_CODES else "lifecycle_operation_failed"
    try:
        ExamIntegrityRun.objects.filter(pk=run_id).update(
            health=ExamIntegrityRun.Health.UNHEALTHY,
            last_error=safe_code,
        )
    except Exception:
        pass


def _required_object_string(value: object, *, max_length: int) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or len(value) > max_length
    ):
        raise ValueError
    return value


def _parse_started_container(result: object) -> StartedContainer:
    try:
        if not isinstance(result, Mapping):
            raise ValueError
        return StartedContainer(
            container_id=_required_object_string(
                result.get("container_id"),
                max_length=128,
            ),
            container_name=_required_object_string(
                result.get("container_name"),
                max_length=128,
            ),
            worker_url=_required_object_string(
                result.get("worker_url"),
                max_length=512,
            ),
            image_digest=_required_object_string(
                result.get("image_digest"),
                max_length=255,
            ),
        )
    except Exception:
        raise IntegrityLifecycleError(
            "controller_start_reconciliation_failed"
        ) from None


def _read_controller_status(
    controller: ControllerClient,
    run_id,
    *,
    error_code: str,
) -> ReconciledControllerStatus:
    try:
        result = controller.status(run_id)
        response_run_id = _required_object_string(
            getattr(result, "run_id"),
            max_length=64,
        )
        exists = getattr(result, "exists")
        state = getattr(result, "state")
        if response_run_id != str(run_id) or not isinstance(exists, bool):
            raise ValueError
        if exists is False:
            if state != "absent":
                raise ValueError
            return ReconciledControllerStatus(
                run_id=response_run_id,
                exists=False,
                state="absent",
            )
        if state not in {"created", "running", "stopping", "stopped", "exited"}:
            raise ValueError
        token_digest = _required_object_string(
            getattr(result, "run_token_sha256"),
            max_length=64,
        )
        if not _SHA256_RE.fullmatch(token_digest):
            raise ValueError
        return ReconciledControllerStatus(
            run_id=response_run_id,
            exists=True,
            state=state,
            container_id=_required_object_string(
                getattr(result, "container_id"),
                max_length=128,
            ),
            container_name=_required_object_string(
                getattr(result, "container_name"),
                max_length=128,
            ),
            worker_url=_required_object_string(
                getattr(result, "worker_url"),
                max_length=512,
            ),
            image_digest=_required_object_string(
                getattr(result, "image_digest"),
                max_length=255,
            ),
            run_token_sha256=token_digest.lower(),
        )
    except Exception:
        raise IntegrityLifecycleError(error_code) from None


def _status_has_run_token(
    run: ExamIntegrityRun,
    status: ReconciledControllerStatus,
) -> bool:
    return bool(
        status.exists
        and run.token_digest
        and hmac.compare_digest(status.run_token_sha256, run.token_digest)
    )


def _status_matches_container(
    run: ExamIntegrityRun,
    status: ReconciledControllerStatus,
) -> bool:
    return bool(
        _status_has_run_token(run, status)
        and status.container_id == run.container_id
        and status.container_name == run.container_name
        and status.worker_url == run.worker_url
        and status.image_digest == run.worker_image_digest
    )


def _apply_started_container(
    run: ExamIntegrityRun,
    container: StartedContainer,
) -> ExamIntegrityRun:
    run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    run.health = ExamIntegrityRun.Health.HEALTHY
    run.container_id = container.container_id
    run.container_name = container.container_name
    run.worker_url = container.worker_url
    run.worker_image_digest = container.image_digest
    run.started_at = run.started_at or timezone.now()
    run.last_error = ""
    run.save()
    return run


def _finalize_start_result(
    run_id,
    *,
    expected_token_digest: str,
    container: StartedContainer,
) -> ExamIntegrityRun:
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if (
            run.compute_state != ExamIntegrityRun.ComputeState.STARTING
            or not hmac.compare_digest(run.token_digest, expected_token_digest)
        ):
            raise IntegrityLifecycleError(
                "controller_start_reconciliation_failed"
            ) from None
        return _apply_started_container(run, container)


def _finalize_start_status(
    run_id,
    status: ReconciledControllerStatus,
) -> ExamIntegrityRun:
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if (
            run.compute_state != ExamIntegrityRun.ComputeState.STARTING
            or status.state != "running"
            or not _status_has_run_token(run, status)
        ):
            raise IntegrityLifecycleError(
                "controller_start_reconciliation_failed"
            ) from None
        return _apply_started_container(
            run,
            StartedContainer(
                container_id=status.container_id,
                container_name=status.container_name,
                worker_url=status.worker_url,
                image_digest=status.image_digest,
            ),
        )


def _reconcile_start(
    run_id,
    controller: ControllerClient,
) -> ExamIntegrityRun:
    status = _read_controller_status(
        controller,
        run_id,
        error_code="controller_start_reconciliation_failed",
    )
    return _finalize_start_status(run_id, status)


def _start_run_serialized(run_id, controller: ControllerClient) -> ExamIntegrityRun:
    plaintext_token: str | None = None
    with transaction.atomic():
        run = (
            ExamIntegrityRun.objects.select_for_update()
            .select_related("contest")
            .get(pk=run_id)
        )
        if run.compute_state == ExamIntegrityRun.ComputeState.STOPPED:
            if (
                run.data_state != ExamIntegrityRun.DataState.OPEN
                or run.started_at is not None
            ):
                raise InvalidRunTransition(
                    "an archived or previously started run cannot be restarted; "
                    "destroy it and create a new run"
                ) from None
            status = _read_controller_status(
                controller,
                run.id,
                error_code="controller_start_reconciliation_failed",
            )
            if status.exists:
                raise IntegrityLifecycleError(
                    "controller_start_reconciliation_failed"
                ) from None
            run.policy_snapshot = build_integrity_policy_snapshot(run.contest)
            run.registry_snapshot = build_registry_snapshot()
            run.registry_version = run.registry_snapshot["version"]
        elif run.compute_state == ExamIntegrityRun.ComputeState.STARTING:
            status = _read_controller_status(
                controller,
                run.id,
                error_code="controller_start_reconciliation_failed",
            )
            if status.exists:
                if status.state == "running" and _status_has_run_token(run, status):
                    return _apply_started_container(
                        run,
                        StartedContainer(
                            container_id=status.container_id,
                            container_name=status.container_name,
                            worker_url=status.worker_url,
                            image_digest=status.image_digest,
                        ),
                    )
                raise IntegrityLifecycleError(
                    "controller_start_reconciliation_failed"
                ) from None
        else:
            raise InvalidRunTransition("start requires stopped or starting") from None

        token = issue_run_token(run.contest.end_time)
        plaintext_token = token.plaintext
        run.compute_state = ExamIntegrityRun.ComputeState.STARTING
        run.token_digest = token.digest
        run.token_expires_at = token.expires_at
        run.token_revoked_at = None
        run.last_error = ""
        run.save()
        expected_token_digest = token.digest
        worker_image = run.worker_image

    try:
        result = controller.start(
            run_id,
            token=plaintext_token,
            image=worker_image,
        )
        container = _parse_started_container(result)
    except Exception:
        return _reconcile_start(run_id, controller)
    return _finalize_start_result(
        run_id,
        expected_token_digest=expected_token_digest,
        container=container,
    )


def start_run(run_id, *, controller=None) -> ExamIntegrityRun:
    controller = controller or _build_controller_client()
    try:
        with _serialized_run_operation(run_id):
            return _start_run_serialized(run_id, controller)
    except InvalidRunTransition:
        raise
    except IntegrityLifecycleError as exc:
        _record_lifecycle_error(run_id, exc.code)
        raise IntegrityLifecycleError(exc.code) from None
    except Exception:
        code = "controller_start_finalization_failed"
        _record_lifecycle_error(run_id, code)
        raise IntegrityLifecycleError(code) from None


def _parse_archive_manifest(
    result: object,
    run: ExamIntegrityRun,
) -> VerifiedArchiveManifest:
    try:
        if not isinstance(result, Mapping) or result.get("archived") is not True:
            raise ValueError
        manifest_key = _required_object_string(
            result.get("manifest_key"),
            max_length=_MANIFEST_KEY_MAX_LENGTH,
        )
        manifest_sha256 = _required_object_string(
            result.get("manifest_sha256"),
            max_length=64,
        )
        if not _SHA256_RE.fullmatch(manifest_sha256):
            raise ValueError
        if "run_id" in result:
            response_run_id = result["run_id"]
            if not isinstance(response_run_id, str) or response_run_id != str(run.id):
                raise ValueError
        if "generation" in result:
            generation = result["generation"]
            if (
                not isinstance(generation, int)
                or isinstance(generation, bool)
                or generation != run.archive_generation
            ):
                raise ValueError
        return VerifiedArchiveManifest(
            manifest_key=manifest_key,
            manifest_sha256=manifest_sha256.lower(),
        )
    except Exception:
        raise InvalidRunTransition(
            "stop requires a verified archive manifest"
        ) from None


def _mark_stopping(run_id) -> ExamIntegrityRun:
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if (
            run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
            and run.data_state == ExamIntegrityRun.DataState.ARCHIVED
        ):
            return run
        if run.compute_state == ExamIntegrityRun.ComputeState.RUNNING:
            run.compute_state = ExamIntegrityRun.ComputeState.STOPPING
            run.save(update_fields=["compute_state", "updated_at"])
        elif run.compute_state != ExamIntegrityRun.ComputeState.STOPPING:
            raise InvalidRunTransition("stop requires running or stopping") from None
        return run


def _archive_checkpoint_present(run: ExamIntegrityRun) -> bool:
    return bool(run.archive_manifest_key or run.archive_manifest_sha256)


def _checkpoint_archive(
    run_id,
    worker: WorkerStopClient | None,
) -> tuple[ExamIntegrityRun, bool]:
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if (
            run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
            and run.data_state == ExamIntegrityRun.DataState.ARCHIVED
        ):
            return run, False
        if run.compute_state != ExamIntegrityRun.ComputeState.STOPPING:
            raise InvalidRunTransition("stop requires running or stopping") from None
        if _archive_checkpoint_present(run):
            _parse_archive_manifest(
                {
                    "archived": True,
                    "manifest_key": run.archive_manifest_key,
                    "manifest_sha256": run.archive_manifest_sha256,
                },
                run,
            )
            return run, False
        try:
            resolved_worker = worker or _build_worker_client()
            response = resolved_worker.request_stop(run)
        except Exception:
            raise IntegrityLifecycleError("worker_archive_failed") from None
        manifest = _parse_archive_manifest(response, run)
        run.archive_manifest_key = manifest.manifest_key
        run.archive_manifest_sha256 = manifest.manifest_sha256
        run.save(
            update_fields=[
                "archive_manifest_key",
                "archive_manifest_sha256",
                "updated_at",
            ]
        )
        return run, True


def _finalize_stopped(run: ExamIntegrityRun, actor) -> ExamIntegrityRun:
    now = timezone.now()
    run.compute_state = ExamIntegrityRun.ComputeState.STOPPED
    run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    run.token_revoked_at = now
    run.stopped_by = actor
    run.stopped_at = now
    run.health = ExamIntegrityRun.Health.HEALTHY
    run.last_error = ""
    run.save()
    return run


def _complete_stop(
    run_id,
    *,
    actor,
    controller: ControllerClient,
    reconcile_first: bool,
) -> ExamIntegrityRun:
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if (
            run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
            and run.data_state == ExamIntegrityRun.DataState.ARCHIVED
        ):
            return run
        if run.compute_state != ExamIntegrityRun.ComputeState.STOPPING:
            raise InvalidRunTransition("stop completion requires stopping") from None
        _parse_archive_manifest(
            {
                "archived": True,
                "manifest_key": run.archive_manifest_key,
                "manifest_sha256": run.archive_manifest_sha256,
            },
            run,
        )

        if reconcile_first:
            status = _read_controller_status(
                controller,
                run.id,
                error_code="controller_stop_reconciliation_failed",
            )
            if not _status_matches_container(run, status):
                raise IntegrityLifecycleError(
                    "controller_stop_reconciliation_failed"
                ) from None
            if status.state in {"stopped", "exited"}:
                return _finalize_stopped(run, actor)
            if status.state != "running":
                raise IntegrityLifecycleError(
                    "controller_stop_reconciliation_failed"
                ) from None

        try:
            controller.stop_container(run.id)
        except Exception:
            status = _read_controller_status(
                controller,
                run.id,
                error_code="controller_stop_reconciliation_failed",
            )
            if not _status_matches_container(run, status) or status.state not in {
                "stopped",
                "exited",
            }:
                raise IntegrityLifecycleError(
                    "controller_stop_reconciliation_failed"
                ) from None
        return _finalize_stopped(run, actor)


def stop_run(
    run_id,
    *,
    actor,
    worker: WorkerStopClient | None = None,
    controller=None,
) -> ExamIntegrityRun:
    try:
        marked = _mark_stopping(run_id)
        if (
            marked.compute_state == ExamIntegrityRun.ComputeState.STOPPED
            and marked.data_state == ExamIntegrityRun.DataState.ARCHIVED
        ):
            return marked
        checkpointed, created_checkpoint = _checkpoint_archive(run_id, worker)
        if checkpointed.compute_state == ExamIntegrityRun.ComputeState.STOPPED:
            return checkpointed
        resolved_controller = controller or _build_controller_client()
        return _complete_stop(
            run_id,
            actor=actor,
            controller=resolved_controller,
            reconcile_first=not created_checkpoint,
        )
    except InvalidRunTransition:
        raise
    except IntegrityLifecycleError as exc:
        _record_lifecycle_error(run_id, exc.code)
        raise IntegrityLifecycleError(exc.code) from None
    except Exception:
        code = "controller_stop_finalization_failed"
        _record_lifecycle_error(run_id, code)
        raise IntegrityLifecycleError(code) from None


def destroy_run(run_id, *, actor, controller=None) -> ExamIntegrityRun:
    try:
        with transaction.atomic():
            run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
            if not (
                run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
                and run.data_state == ExamIntegrityRun.DataState.ARCHIVED
            ):
                raise InvalidRunTransition(
                    "destroy requires stopped and archived"
                ) from None

            resolved_controller = controller or _build_controller_client()
            resolved_controller.destroy(run.id)
            now = timezone.now()
            run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
            run.token_revoked_at = run.token_revoked_at or now
            run.destroyed_by = actor
            run.destroyed_at = now
            run.last_error = ""
            run.save()
            return run
    except InvalidRunTransition:
        raise
    except Exception:
        code = "controller_destroy_indeterminate"
        _record_lifecycle_error(run_id, code)
        raise IntegrityLifecycleError(code) from None


def purge_run(
    run_id,
    *,
    actor,
    purger: PurgeRunData | None = None,
    controller=None,
) -> ExamIntegrityRun:
    try:
        with transaction.atomic():
            run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
            if not (
                run.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
                and run.data_state == ExamIntegrityRun.DataState.ARCHIVED
            ):
                raise InvalidRunTransition(
                    "purge requires destroyed and archived"
                ) from None

            resolved_purger = purger or _resolve_purger()
            resolved_purger(run)
            resolved_controller = controller or _build_controller_client()
            resolved_controller.purge_data(run.id)

            run.data_state = ExamIntegrityRun.DataState.PURGED
            run.archive_manifest_key = ""
            run.archive_manifest_sha256 = ""
            run.purged_by = actor
            run.purged_at = timezone.now()
            run.last_error = ""
            run.save()
            return run
    except InvalidRunTransition:
        raise
    except Exception:
        code = "integrity_purge_indeterminate"
        _record_lifecycle_error(run_id, code)
        raise IntegrityLifecycleError(code) from None
