from __future__ import annotations

from typing import Callable, Mapping, Protocol

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.contests.integrity.registry import REGISTRY_VERSION, build_registry_snapshot
from apps.contests.models import ExamIntegrityRun
from apps.contests.services.anticheat_config import build_integrity_policy_snapshot
from apps.contests.services.integrity_tokens import issue_run_token


class InvalidRunTransition(RuntimeError):
    pass


class LiveIntegrityRunExists(RuntimeError):
    pass


class WorkerStopClient(Protocol):
    def request_stop(self, run: ExamIntegrityRun) -> Mapping[str, object]: ...


PurgeRunData = Callable[[ExamIntegrityRun], object]


def _build_controller_client():
    from apps.contests.infrastructure.integrity_controller_client import (
        build_integrity_controller_client,
    )

    return build_integrity_controller_client()


def _build_worker_client() -> WorkerStopClient:
    # Task 8 owns this adapter. Keeping resolution here lazy lets Task 3 run
    # independently while fixing the public lifecycle port it must implement.
    from apps.contests.infrastructure.integrity_worker_client import (
        build_integrity_worker_client,
    )

    return build_integrity_worker_client()


def _resolve_purger() -> PurgeRunData:
    # Task 10 owns object-storage deletion and implements this narrow callable.
    from apps.contests.services.integrity_evidence import purge_integrity_data

    return purge_integrity_data


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
        if ExamIntegrityRun.objects.filter(
            contest=contest,
        ).exclude(compute_state=ExamIntegrityRun.ComputeState.DESTROYED).exists():
            raise LiveIntegrityRunExists("live integrity run already exists") from exc
        raise


def start_run(run_id, *, controller=None) -> ExamIntegrityRun:
    with transaction.atomic():
        run = (
            ExamIntegrityRun.objects.select_for_update()
            .select_related("contest")
            .get(pk=run_id)
        )
        if run.compute_state != ExamIntegrityRun.ComputeState.STOPPED:
            raise InvalidRunTransition("start requires stopped")
        if (
            run.data_state != ExamIntegrityRun.DataState.OPEN
            or run.started_at is not None
        ):
            raise InvalidRunTransition(
                "an archived or previously started run cannot be restarted; "
                "destroy it and create a new run"
            )

        token = issue_run_token(run.contest.end_time)
        run.compute_state = ExamIntegrityRun.ComputeState.STARTING
        run.policy_snapshot = build_integrity_policy_snapshot(run.contest)
        run.registry_snapshot = build_registry_snapshot()
        run.registry_version = run.registry_snapshot["version"]
        run.token_digest = token.digest
        run.token_expires_at = token.expires_at
        run.token_revoked_at = None
        run.last_error = ""
        run.save()

    controller = controller or _build_controller_client()
    try:
        result = controller.start(
            run.id,
            token=token.plaintext,
            image=run.worker_image,
        )
        required = (
            "container_id", "container_name", "worker_url", "image_digest",
        )
        if not isinstance(result, Mapping) or any(
            not result.get(key) for key in required
        ):
            raise RuntimeError("controller returned an invalid start response")
    except Exception:
        ExamIntegrityRun.objects.filter(pk=run.id).update(
            compute_state=ExamIntegrityRun.ComputeState.STOPPED,
            health=ExamIntegrityRun.Health.UNHEALTHY,
            token_revoked_at=timezone.now(),
            last_error="controller_start_failed",
        )
        raise

    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run.id)
        if run.compute_state != ExamIntegrityRun.ComputeState.STARTING:
            raise InvalidRunTransition("start completion requires starting")
        run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
        run.health = ExamIntegrityRun.Health.HEALTHY
        run.container_id = result["container_id"]
        run.container_name = result["container_name"]
        run.worker_url = result["worker_url"]
        run.worker_image_digest = result["image_digest"]
        run.started_at = timezone.now()
        run.save()
        return run


def _verified_archive(result: Mapping[str, object]) -> bool:
    manifest_sha256 = result.get("manifest_sha256")
    return bool(
        result.get("archived") is True
        and result.get("manifest_key")
        and isinstance(manifest_sha256, str)
        and len(manifest_sha256) == 64
    )


def stop_run(
    run_id,
    *,
    actor,
    worker: WorkerStopClient | None = None,
    controller=None,
) -> ExamIntegrityRun:
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if run.compute_state == ExamIntegrityRun.ComputeState.RUNNING:
            run.compute_state = ExamIntegrityRun.ComputeState.STOPPING
            run.save(update_fields=["compute_state", "updated_at"])
        elif run.compute_state != ExamIntegrityRun.ComputeState.STOPPING:
            raise InvalidRunTransition("stop requires running or stopping")

    worker = worker or _build_worker_client()
    archive = worker.request_stop(run)
    if not isinstance(archive, Mapping) or not _verified_archive(archive):
        raise InvalidRunTransition("stop requires a verified archive manifest")

    controller = controller or _build_controller_client()
    controller.stop_container(run.id)

    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run.id)
        if run.compute_state != ExamIntegrityRun.ComputeState.STOPPING:
            raise InvalidRunTransition("stop completion requires stopping")
        now = timezone.now()
        run.compute_state = ExamIntegrityRun.ComputeState.STOPPED
        run.data_state = ExamIntegrityRun.DataState.ARCHIVED
        run.archive_manifest_key = str(archive["manifest_key"])
        run.archive_manifest_sha256 = str(archive["manifest_sha256"])
        run.token_revoked_at = now
        run.stopped_by = actor
        run.stopped_at = now
        run.last_error = ""
        run.save()
        return run


def destroy_run(run_id, *, actor, controller=None) -> ExamIntegrityRun:
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if not (
            run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
            and run.data_state == ExamIntegrityRun.DataState.ARCHIVED
        ):
            raise InvalidRunTransition("destroy requires stopped and archived")

        controller = controller or _build_controller_client()
        controller.destroy(run.id)
        now = timezone.now()
        run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
        run.token_revoked_at = run.token_revoked_at or now
        run.destroyed_by = actor
        run.destroyed_at = now
        run.save()
        return run


def purge_run(
    run_id,
    *,
    actor,
    purger: PurgeRunData | None = None,
    controller=None,
) -> ExamIntegrityRun:
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if not (
            run.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
            and run.data_state == ExamIntegrityRun.DataState.ARCHIVED
        ):
            raise InvalidRunTransition("purge requires destroyed and archived")

        purger = purger or _resolve_purger()
        purger(run)
        controller = controller or _build_controller_client()
        controller.purge_data(run.id)

        run.data_state = ExamIntegrityRun.DataState.PURGED
        run.archive_manifest_key = ""
        run.archive_manifest_sha256 = ""
        run.purged_by = actor
        run.purged_at = timezone.now()
        run.save()
        return run
