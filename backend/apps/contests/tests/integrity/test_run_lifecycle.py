import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
import pytest
from django.db import IntegrityError, close_old_connections
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.infrastructure.integrity_controller_client import (
    ControllerError,
    ControllerRunStatus,
    IntegrityControllerClient,
)
from apps.contests.services.integrity_tokens import issue_run_token, verify_run_token
from apps.contests.services.integrity_runs import (
    IntegrityLifecycleError,
    InvalidRunTransition,
    LiveIntegrityRunExists,
    create_run,
    destroy_run,
    purge_run,
    start_run,
    stop_run,
)
from apps.users.models import User


@pytest.fixture
def owner(db):
    return User.objects.create_user(
        username="integrity-owner",
        email="integrity-owner@example.com",
        password="pass",
        role="teacher",
    )


@pytest.fixture
def student(db):
    return User.objects.create_user(
        username="integrity-student",
        email="integrity-student@example.com",
        password="pass",
        role="student",
    )


@pytest.fixture
def contest(owner):
    now = timezone.now()
    return Contest.objects.create(
        name="Integrity lifecycle contest",
        owner=owner,
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        status="published",
        contest_type="paper_exam",
        cheat_detection_enabled=True,
    )


@pytest.fixture
def integrity_run(contest, owner):
    return ExamIntegrityRun.objects.create(
        contest=contest,
        created_by=owner,
        registry_version="registry-v1",
        worker_image="registry.example/integrity:1",
        scheduled_start_at=contest.start_time,
        scheduled_end_at=contest.end_time,
    )


@pytest.fixture
def api_client():
    return APIClient()


def _controller_start_result():
    return {
        "container_id": "container-1",
        "container_name": "integrity-run-1",
        "worker_url": "http://integrity-run-1:8020",
        "image_digest": "sha256:abc",
    }


def _absent_status(run_id):
    return ControllerRunStatus(
        run_id=str(run_id),
        exists=False,
        state="absent",
    )


def _container_status(run, *, state="running", token_digest=None):
    return ControllerRunStatus(
        run_id=str(run.id),
        exists=True,
        state=state,
        container_id=run.container_id or "container-1",
        container_name=run.container_name or "integrity-run-1",
        worker_url=run.worker_url or "http://integrity-run-1:8020",
        image_digest=run.worker_image_digest or "sha256:abc",
        run_token_sha256=token_digest or run.token_digest,
    )


def _controller_for_new_start(run_id):
    controller = Mock()
    controller.status.return_value = _absent_status(run_id)
    controller.start.return_value = _controller_start_result()
    return controller


def _verified_archive(run=None):
    archive = {
        "archived": True,
        "manifest_key": "integrity/run/manifest.json",
        "manifest_sha256": "a" * 64,
    }
    if run is not None:
        archive.update(run_id=str(run.id), generation=run.archive_generation)
    return archive


def test_controller_client_uses_file_credential_and_operation_timeout(tmp_path):
    token_file = tmp_path / "controller-token"
    token_file.write_text("controller-secret\n", encoding="utf-8")
    response = Mock(status_code=200)
    response.json.return_value = _controller_start_result()
    client = IntegrityControllerClient(
        base_url="http://controller:8010/",
        token_file=str(token_file),
        connect_timeout_seconds=1.5,
        start_read_timeout_seconds=90.0,
    )

    with patch(
        "apps.contests.infrastructure.integrity_controller_client.httpx.request",
        return_value=response,
    ) as request:
        result = client.start("run-1", token="run-secret", image="worker:1")

    assert result == _controller_start_result()
    request.assert_called_once()
    assert request.call_args.args == (
        "POST",
        "http://controller:8010/v1/runs/run-1/start",
    )
    assert request.call_args.kwargs == {
        "json": {"run_token": "run-secret", "worker_image": "worker:1"},
        "headers": {"Authorization": "Bearer controller-secret"},
        "timeout": request.call_args.kwargs["timeout"],
    }
    timeout = request.call_args.kwargs["timeout"]
    assert timeout.connect == 1.5
    assert timeout.read == 90.0


def test_controller_stop_timeout_exceeds_docker_stop_upper_bound(tmp_path):
    token_file = tmp_path / "controller-token"
    token_file.write_text("controller-secret", encoding="utf-8")
    response = Mock(status_code=200)
    response.json.return_value = {}
    client = IntegrityControllerClient(
        base_url="http://controller:8010",
        token_file=str(token_file),
        stop_read_timeout_seconds=40.0,
    )

    with patch(
        "apps.contests.infrastructure.integrity_controller_client.httpx.request",
        return_value=response,
    ) as request:
        client.stop_container("run-1")

    assert request.call_args.kwargs["timeout"].read == 40.0
    assert request.call_args.kwargs["timeout"].read > 30.0


def test_controller_status_contract_proves_exact_run_and_secret_digest(tmp_path):
    token_file = tmp_path / "controller-token"
    token_file.write_text("controller-secret", encoding="utf-8")
    response = Mock(status_code=200)
    response.json.return_value = {
        "run_id": "run-1",
        "exists": True,
        "state": "running",
        "container_id": "container-1",
        "container_name": "integrity-run-1",
        "worker_url": "http://integrity-run-1:8020",
        "image_digest": "sha256:abc",
        "run_token_sha256": "a" * 64,
    }
    client = IntegrityControllerClient(
        base_url="http://controller:8010",
        token_file=str(token_file),
    )

    with patch(
        "apps.contests.infrastructure.integrity_controller_client.httpx.request",
        return_value=response,
    ) as request:
        status = client.status("run-1")

    assert status == ControllerRunStatus(
        run_id="run-1",
        exists=True,
        state="running",
        container_id="container-1",
        container_name="integrity-run-1",
        worker_url="http://integrity-run-1:8020",
        image_digest="sha256:abc",
        run_token_sha256="a" * 64,
    )
    assert request.call_args.args == (
        "GET",
        "http://controller:8010/v1/runs/run-1/status",
    )


def test_controller_error_does_not_include_file_credential(tmp_path):
    token_file = tmp_path / "controller-token"
    token_file.write_text("controller-secret", encoding="utf-8")
    response = Mock(status_code=503)
    client = IntegrityControllerClient(
        base_url="http://controller:8010",
        token_file=str(token_file),
    )

    with patch(
        "apps.contests.infrastructure.integrity_controller_client.httpx.request",
        return_value=response,
    ), pytest.raises(ControllerError) as caught:
        client.stop_container("run-1")

    assert str(caught.value) == "controller_http_failed"
    assert "controller-secret" not in str(caught.value)
    assert caught.value.__cause__ is None


@pytest.mark.parametrize(
    "failure",
    [
        FileNotFoundError("credential controller-secret"),
        httpx.ReadTimeout("transport run-secret and raw-body"),
        ValueError("invalid JSON raw-body run-secret"),
    ],
)
def test_controller_normalizes_credential_transport_and_json_failures(
    tmp_path,
    failure,
    caplog,
):
    token_file = tmp_path / "controller-token"
    token_file.write_text("controller-secret", encoding="utf-8")
    response = Mock(status_code=200)
    client = IntegrityControllerClient(
        base_url="http://controller:8010",
        token_file=str(token_file),
    )

    if isinstance(failure, FileNotFoundError):
        with patch(
            "apps.contests.infrastructure.integrity_controller_client.Path.read_text",
            side_effect=failure,
        ), pytest.raises(ControllerError) as caught:
            client.start("run-1", token="run-secret", image="worker:1")
    elif isinstance(failure, httpx.HTTPError):
        with patch(
            "apps.contests.infrastructure.integrity_controller_client.httpx.request",
            side_effect=failure,
        ), pytest.raises(ControllerError) as caught:
            client.start("run-1", token="run-secret", image="worker:1")
    else:
        response.json.side_effect = failure
        with patch(
            "apps.contests.infrastructure.integrity_controller_client.httpx.request",
            return_value=response,
        ), pytest.raises(ControllerError) as caught:
            client.start("run-1", token="run-secret", image="worker:1")

    exposed = str(caught.value) + repr(caught.value) + caplog.text
    assert "controller-secret" not in exposed
    assert "run-secret" not in exposed
    assert "raw-body" not in exposed
    assert caught.value.__cause__ is None


@pytest.mark.django_db
def test_opaque_token_is_scoped_by_digest_expiry_and_revocation(integrity_run):
    issued = issue_run_token(integrity_run.scheduled_end_at)

    assert len(issued.plaintext) >= 64
    assert issued.digest == hashlib.sha256(issued.plaintext.encode()).hexdigest()
    assert issued.expires_at == integrity_run.scheduled_end_at + timedelta(hours=6)

    integrity_run.token_digest = issued.digest
    integrity_run.token_expires_at = issued.expires_at
    assert verify_run_token(integrity_run, issued.plaintext) is True
    assert verify_run_token(integrity_run, issued.plaintext + "wrong") is False

    integrity_run.token_revoked_at = timezone.now()
    assert verify_run_token(integrity_run, issued.plaintext) is False
    integrity_run.token_revoked_at = None
    integrity_run.token_expires_at = timezone.now() - timedelta(seconds=1)
    assert verify_run_token(integrity_run, issued.plaintext) is False


@pytest.mark.django_db
def test_start_freezes_policy_registry_and_persists_only_token_digest(integrity_run):
    captured = {}
    controller = _controller_for_new_start(integrity_run.id)

    def start(run_id, *, token, image):
        captured.update(run_id=run_id, token=token, image=image)
        return _controller_start_result()

    controller.start.side_effect = start
    started = start_run(integrity_run.id, controller=controller)

    assert started.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert started.health == ExamIntegrityRun.Health.HEALTHY
    assert started.policy_snapshot["batch_interval_ms"] == 5_000
    assert started.registry_snapshot["definitions"]
    assert started.registry_version == started.registry_snapshot["version"]
    assert (
        started.token_digest == hashlib.sha256(captured["token"].encode()).hexdigest()
    )
    assert captured["token"] not in repr(started.__dict__)
    assert captured["image"] == integrity_run.worker_image
    assert started.container_id == "container-1"
    assert started.started_at is not None


@pytest.mark.django_db
def test_start_rejects_non_stopped_run_without_resolving_controller(integrity_run):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.save(update_fields=["compute_state"])

    with pytest.raises(InvalidRunTransition, match="start requires stopped"):
        start_run(integrity_run.id)


@pytest.mark.django_db
def test_start_failure_is_safe_and_remains_reconcilable(integrity_run, caplog):
    captured = {}
    controller = _controller_for_new_start(integrity_run.id)

    def fail(_run_id, *, token, image):
        captured["token"] = token
        raise RuntimeError("controller rejected " + token)

    controller.start.side_effect = fail
    controller.status.side_effect = [
        _absent_status(integrity_run.id),
        RuntimeError("status leaked raw-body"),
    ]

    with pytest.raises(IntegrityLifecycleError) as caught:
        start_run(integrity_run.id, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STARTING
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert integrity_run.token_revoked_at is None
    assert captured["token"] not in integrity_run.last_error
    assert captured["token"] not in repr(integrity_run.__dict__)
    assert captured["token"] not in str(caught.value)
    assert captured["token"] not in caplog.text
    assert "raw-body" not in str(caught.value)
    assert "raw-body" not in caplog.text
    assert caught.value.__cause__ is None


@pytest.mark.django_db
def test_start_response_loss_reconciles_matching_running_container(integrity_run):
    captured = {}
    controller = _controller_for_new_start(integrity_run.id)

    def lose_response(_run_id, *, token, image):
        captured["digest"] = hashlib.sha256(token.encode()).hexdigest()
        raise httpx.ReadTimeout("response contained " + token)

    def status(_run_id):
        if "digest" not in captured:
            return _absent_status(integrity_run.id)
        return _container_status(integrity_run, token_digest=captured["digest"])

    controller.start.side_effect = lose_response
    controller.status.side_effect = status

    started = start_run(integrity_run.id, controller=controller)

    assert started.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert started.token_digest == captured["digest"]
    assert started.container_id == "container-1"
    assert controller.start.call_count == 1
    assert controller.status.call_count == 2


@pytest.mark.django_db
def test_start_final_db_failure_recovers_from_status_without_new_token(
    integrity_run,
):
    controller = _controller_for_new_start(integrity_run.id)
    original_save = ExamIntegrityRun.save
    failed = False

    def fail_running_save(instance, *args, **kwargs):
        nonlocal failed
        if (
            instance.compute_state == ExamIntegrityRun.ComputeState.RUNNING
            and not failed
        ):
            failed = True
            raise RuntimeError("database failure with raw-body")
        return original_save(instance, *args, **kwargs)

    with patch.object(
        ExamIntegrityRun, "save", autospec=True, side_effect=fail_running_save
    ):
        with pytest.raises(IntegrityLifecycleError) as caught:
            start_run(integrity_run.id, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STARTING
    persisted_digest = integrity_run.token_digest
    controller.status.return_value = _container_status(
        integrity_run,
        token_digest=persisted_digest,
    )

    started = start_run(integrity_run.id, controller=controller)

    assert started.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert started.token_digest == persisted_digest
    assert controller.start.call_count == 1
    assert "raw-body" not in str(caught.value)
    assert caught.value.__cause__ is None


@pytest.mark.django_db
def test_starting_retry_reissues_token_only_after_authoritative_absence(integrity_run):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.STARTING
    integrity_run.token_digest = "a" * 64
    integrity_run.save(update_fields=["compute_state", "token_digest"])
    captured = {}
    controller = Mock()
    controller.status.return_value = _absent_status(integrity_run.id)

    def start(_run_id, *, token, image):
        captured["token"] = token
        return _controller_start_result()

    controller.start.side_effect = start

    started = start_run(integrity_run.id, controller=controller)

    assert started.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert started.token_digest != "a" * 64
    assert (
        started.token_digest == hashlib.sha256(captured["token"].encode()).hexdigest()
    )
    controller.status.assert_called_once_with(integrity_run.id)


@pytest.mark.django_db
@pytest.mark.parametrize("status_state", ["running", "created", "stopped"])
def test_starting_retry_rejects_mismatched_or_unknown_existing_container(
    integrity_run,
    status_state,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.STARTING
    integrity_run.token_digest = "a" * 64
    integrity_run.save(update_fields=["compute_state", "token_digest"])
    controller = Mock()
    controller.status.return_value = _container_status(
        integrity_run,
        state=status_state,
        token_digest="b" * 64,
    )

    with pytest.raises(IntegrityLifecycleError) as caught:
        start_run(integrity_run.id, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STARTING
    assert integrity_run.token_digest == "a" * 64
    assert integrity_run.last_error == "controller_start_reconciliation_failed"
    controller.start.assert_not_called()
    assert caught.value.__cause__ is None


@pytest.mark.django_db
def test_stop_requires_verified_archive_and_preserves_retry_credentials(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.save(update_fields=["compute_state", "token_digest", "container_id"])
    worker = Mock()
    worker.request_stop.return_value = {
        "archived": False,
        "manifest_key": "",
        "manifest_sha256": "",
    }
    controller = Mock()

    with pytest.raises(InvalidRunTransition, match="verified archive"):
        stop_run(integrity_run.id, actor=owner, worker=worker, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPING
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at is None
    assert integrity_run.container_id == "container-1"
    controller.stop_container.assert_not_called()


@pytest.mark.django_db
def test_stop_can_retry_from_stopping_and_archives_before_stopping_container(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.STOPPING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.save(update_fields=["compute_state", "token_digest", "container_id"])
    calls = []
    worker = Mock()
    worker.request_stop.side_effect = (
        lambda run: calls.append("archive") or _verified_archive()
    )
    controller = Mock()
    controller.stop_container.side_effect = (
        lambda run_id: calls.append("container") or {}
    )

    stopped = stop_run(
        integrity_run.id,
        actor=owner,
        worker=worker,
        controller=controller,
    )

    assert calls == ["archive", "container"]
    assert stopped.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert stopped.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert stopped.archive_manifest_key == "integrity/run/manifest.json"
    assert stopped.archive_manifest_sha256 == "a" * 64
    assert stopped.token_revoked_at is not None
    assert stopped.stopped_by == owner
    assert stopped.stopped_at is not None


@pytest.mark.django_db
def test_stop_controller_failure_leaves_stopping_and_credentials_for_retry(
    integrity_run,
    owner,
    caplog,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.save(update_fields=["compute_state", "token_digest", "container_id"])
    worker = Mock()
    worker.request_stop.return_value = _verified_archive(integrity_run)
    controller = Mock()
    controller.stop_container.side_effect = RuntimeError(
        "unavailable controller-secret raw-body",
    )
    controller.status.side_effect = RuntimeError("status leaked raw-body")

    with pytest.raises(IntegrityLifecycleError) as caught:
        stop_run(integrity_run.id, actor=owner, worker=worker, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPING
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"
    assert integrity_run.archive_manifest_sha256 == "a" * 64
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at is None
    assert integrity_run.container_id == "container-1"
    assert integrity_run.last_error == "controller_stop_reconciliation_failed"
    assert "controller-secret" not in str(caught.value) + caplog.text
    assert "raw-body" not in str(caught.value) + caplog.text
    assert caught.value.__cause__ is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    "archive",
    [
        {"archived": True, "manifest_key": 1, "manifest_sha256": "a" * 64},
        {"archived": True, "manifest_key": "   ", "manifest_sha256": "a" * 64},
        {
            "archived": True,
            "manifest_key": "x" * 2049,
            "manifest_sha256": "a" * 64,
        },
        {
            "archived": True,
            "manifest_key": "manifest.json",
            "manifest_sha256": "g" * 64,
        },
        {
            "archived": True,
            "manifest_key": "manifest.json",
            "manifest_sha256": "a" * 64,
            "run_id": "stale-run",
        },
        {
            "archived": True,
            "manifest_key": "manifest.json",
            "manifest_sha256": "a" * 64,
            "generation": 99,
        },
    ],
)
def test_stop_rejects_malformed_or_stale_manifest_before_container_stop(
    integrity_run,
    owner,
    archive,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.save(update_fields=["compute_state"])
    worker = Mock()
    worker.request_stop.return_value = archive
    controller = Mock()

    with pytest.raises(InvalidRunTransition, match="verified archive") as caught:
        stop_run(integrity_run.id, actor=owner, worker=worker, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPING
    assert integrity_run.archive_manifest_key == ""
    assert integrity_run.archive_manifest_sha256 == ""
    controller.stop_container.assert_not_called()
    assert caught.value.__cause__ is None


@pytest.mark.django_db
def test_stop_timeout_reconciles_external_success(integrity_run, owner):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.save(
        update_fields=[
            "compute_state",
            "token_digest",
            "container_id",
            "container_name",
            "worker_url",
            "worker_image_digest",
        ]
    )
    worker = Mock()
    worker.request_stop.return_value = _verified_archive(integrity_run)
    controller = Mock()
    controller.stop_container.side_effect = httpx.ReadTimeout("lost response")
    controller.status.return_value = _container_status(
        integrity_run,
        state="stopped",
    )

    stopped = stop_run(
        integrity_run.id,
        actor=owner,
        worker=worker,
        controller=controller,
    )

    assert stopped.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert stopped.data_state == ExamIntegrityRun.DataState.ARCHIVED
    controller.stop_container.assert_called_once_with(integrity_run.id)
    controller.status.assert_called_once_with(integrity_run.id)


@pytest.mark.django_db
def test_stop_final_db_failure_retries_from_checkpoint_without_worker_or_stop_repeat(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.save(
        update_fields=[
            "compute_state",
            "token_digest",
            "container_id",
            "container_name",
            "worker_url",
            "worker_image_digest",
        ]
    )
    worker = Mock()
    worker.request_stop.return_value = _verified_archive(integrity_run)
    controller = Mock()
    controller.stop_container.return_value = {}
    controller.status.return_value = _container_status(
        integrity_run,
        state="stopped",
    )
    original_save = ExamIntegrityRun.save
    failed = False

    def fail_final_save(instance, *args, **kwargs):
        nonlocal failed
        if (
            instance.compute_state == ExamIntegrityRun.ComputeState.STOPPED
            and not failed
        ):
            failed = True
            raise RuntimeError("final persist leaked raw-body")
        return original_save(instance, *args, **kwargs)

    with patch.object(
        ExamIntegrityRun, "save", autospec=True, side_effect=fail_final_save
    ):
        with pytest.raises(IntegrityLifecycleError) as caught:
            stop_run(
                integrity_run.id,
                actor=owner,
                worker=worker,
                controller=controller,
            )

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPING
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"

    stopped = stop_run(
        integrity_run.id,
        actor=owner,
        worker=worker,
        controller=controller,
    )

    assert stopped.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert stopped.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert worker.request_stop.call_count == 1
    assert controller.stop_container.call_count == 1
    assert controller.status.call_count == 1
    assert "raw-body" not in str(caught.value)
    assert caught.value.__cause__ is None


@pytest.mark.django_db(transaction=True)
def test_concurrent_stop_serializes_worker_and_controller_side_effects(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.save(
        update_fields=[
            "compute_state",
            "token_digest",
            "container_id",
            "container_name",
            "worker_url",
            "worker_image_digest",
        ]
    )
    worker = Mock()
    worker.request_stop.return_value = _verified_archive(integrity_run)
    stop_entered = threading.Event()
    release_stop = threading.Event()
    second_started = threading.Event()
    controller = Mock()

    def stop_container(_run_id):
        stop_entered.set()
        assert release_stop.wait(timeout=10)
        return {}

    controller.stop_container.side_effect = stop_container

    def call_stop(*, second=False):
        close_old_connections()
        try:
            if second:
                second_started.set()
            return stop_run(
                integrity_run.id,
                actor=User.objects.get(pk=owner.pk),
                worker=worker,
                controller=controller,
            ).compute_state
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(call_stop)
        assert stop_entered.wait(timeout=10)
        second = pool.submit(call_stop, second=True)
        assert second_started.wait(timeout=10)
        release_stop.set()
        states = [first.result(timeout=10), second.result(timeout=10)]

    assert states == [
        ExamIntegrityRun.ComputeState.STOPPED,
        ExamIntegrityRun.ComputeState.STOPPED,
    ]
    assert worker.request_stop.call_count == 1
    assert controller.stop_container.call_count == 1


@pytest.mark.django_db
def test_destroy_requires_stopped_archived_and_keeps_data_for_later_purge(
    integrity_run,
    owner,
):
    controller = Mock()
    with pytest.raises(InvalidRunTransition):
        destroy_run(integrity_run.id, actor=owner, controller=controller)
    controller.destroy.assert_not_called()

    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.save(update_fields=["data_state", "archive_manifest_key"])
    destroyed = destroy_run(integrity_run.id, actor=owner, controller=controller)

    controller.destroy.assert_called_once_with(integrity_run.id)
    assert destroyed.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert destroyed.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert destroyed.archive_manifest_key == "integrity/run/manifest.json"
    assert destroyed.destroyed_by == owner
    assert destroyed.destroyed_at is not None


@pytest.mark.django_db
def test_purge_requires_destroyed_archived_and_commits_after_both_purges(
    integrity_run,
    owner,
):
    controller = Mock()
    purger = Mock()
    with pytest.raises(InvalidRunTransition):
        purge_run(integrity_run.id, actor=owner, purger=purger, controller=controller)
    purger.assert_not_called()

    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
        ]
    )
    calls = []
    purger.side_effect = lambda run: calls.append("objects")
    controller.purge_data.side_effect = lambda run_id: calls.append("volume") or {}
    purged = purge_run(
        integrity_run.id,
        actor=owner,
        purger=purger,
        controller=controller,
    )

    assert calls == ["objects", "volume"]
    assert purged.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purged.archive_manifest_key == ""
    assert purged.archive_manifest_sha256 == ""
    assert purged.purged_by == owner
    assert purged.purged_at is not None


@pytest.mark.django_db
def test_destroy_external_success_then_db_failure_is_safe_and_retryable(
    integrity_run,
    owner,
):
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.save(
        update_fields=[
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
        ]
    )
    controller = Mock()
    controller.destroy.return_value = {}
    original_save = ExamIntegrityRun.save
    failed = False

    def fail_destroy_save(instance, *args, **kwargs):
        nonlocal failed
        if (
            instance.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
            and not failed
        ):
            failed = True
            raise RuntimeError("destroy persist raw-body")
        return original_save(instance, *args, **kwargs)

    with patch.object(
        ExamIntegrityRun, "save", autospec=True, side_effect=fail_destroy_save
    ):
        with pytest.raises(IntegrityLifecycleError) as caught:
            destroy_run(integrity_run.id, actor=owner, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    destroyed = destroy_run(integrity_run.id, actor=owner, controller=controller)
    assert destroyed.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert controller.destroy.call_count == 2
    assert "raw-body" not in str(caught.value)
    assert caught.value.__cause__ is None


@pytest.mark.django_db
def test_purge_external_success_then_db_failure_is_safe_and_retryable(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
        ]
    )
    purger = Mock()
    controller = Mock()
    original_save = ExamIntegrityRun.save
    failed = False

    def fail_purge_save(instance, *args, **kwargs):
        nonlocal failed
        if instance.data_state == ExamIntegrityRun.DataState.PURGED and not failed:
            failed = True
            raise RuntimeError("purge persist raw-body")
        return original_save(instance, *args, **kwargs)

    with patch.object(
        ExamIntegrityRun, "save", autospec=True, side_effect=fail_purge_save
    ):
        with pytest.raises(IntegrityLifecycleError) as caught:
            purge_run(
                integrity_run.id,
                actor=owner,
                purger=purger,
                controller=controller,
            )

    integrity_run.refresh_from_db()
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    purged = purge_run(
        integrity_run.id,
        actor=owner,
        purger=purger,
        controller=controller,
    )
    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purger.call_count == 2
    assert controller.purge_data.call_count == 2
    assert "raw-body" not in str(caught.value)
    assert caught.value.__cause__ is None


@pytest.mark.django_db(transaction=True)
def test_create_run_translates_live_run_constraint(contest, owner):
    first = create_run(contest, actor=owner)
    assert first.registry_version
    assert first.policy_snapshot == {}
    assert first.registry_snapshot == {}
    assert first.scheduled_start_at == contest.start_time
    assert first.scheduled_end_at == contest.end_time

    with pytest.raises(LiveIntegrityRunExists):
        create_run(contest, actor=owner)


@pytest.mark.django_db
def test_create_run_does_not_translate_unrelated_integrity_error_with_live_row(
    contest,
    owner,
):
    create_run(contest, actor=owner)
    database_cause = RuntimeError("unrelated database failure")
    database_cause.diag = SimpleNamespace(constraint_name="some_other_constraint")

    def fail_create(*args, **kwargs):
        raise IntegrityError("sensitive database detail") from database_cause

    with patch.object(ExamIntegrityRun.objects, "create", side_effect=fail_create):
        with pytest.raises(IntegrityError) as caught:
            create_run(contest, actor=owner)

    assert caught.value.__cause__.diag.constraint_name == "some_other_constraint"


@pytest.mark.django_db(transaction=True)
def test_concurrent_create_maps_only_partial_unique_constraint(contest, owner):
    barrier = threading.Barrier(2)

    def create_concurrently():
        close_old_connections()
        try:
            local_contest = Contest.objects.get(pk=contest.pk)
            local_owner = User.objects.get(pk=owner.pk)
            barrier.wait(timeout=10)
            try:
                create_run(local_contest, actor=local_owner)
            except LiveIntegrityRunExists:
                return "conflict"
            return "created"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = sorted(
            future.result(timeout=15)
            for future in [
                pool.submit(create_concurrently),
                pool.submit(create_concurrently),
            ]
        )

    assert results == ["conflict", "created"]
    assert ExamIntegrityRun.objects.filter(contest=contest).count() == 1


@pytest.mark.django_db
def test_manager_api_create_does_not_accept_client_snapshots(
    api_client, contest, owner
):
    api_client.force_authenticate(owner)
    url = f"/api/v1/contests/{contest.id}/integrity-runs/"

    rejected = api_client.post(
        url,
        {"policy_snapshot": {"client": "owned"}},
        format="json",
    )
    assert rejected.status_code == 400
    assert ExamIntegrityRun.objects.count() == 0

    created = api_client.post(url, {}, format="json")
    assert created.status_code == 201
    assert created.json()["policy_snapshot"] == {}
    assert created.json()["registry_snapshot"] == {}
    assert "token_digest" not in created.json()


@pytest.mark.django_db(transaction=True)
def test_manager_api_returns_explicit_live_run_conflict(api_client, contest, owner):
    create_run(contest, actor=owner)
    api_client.force_authenticate(owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/integrity-runs/",
        {},
        format="json",
    )

    assert response.status_code == 409
    assert response.json() == {"code": "live_integrity_run_exists"}


@pytest.mark.django_db
def test_manager_api_maps_invalid_transition_to_conflict(
    api_client,
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.save(update_fields=["compute_state"])
    api_client.force_authenticate(owner)

    response = api_client.post(
        f"/api/v1/contests/{integrity_run.contest_id}/integrity-runs/"
        f"{integrity_run.id}/start/",
        {},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["code"] == "invalid_integrity_run_transition"


@pytest.mark.django_db
def test_manager_api_and_logs_never_render_start_token_or_raw_failure(
    api_client,
    integrity_run,
    owner,
    caplog,
):
    captured = {}
    controller = _controller_for_new_start(integrity_run.id)

    def fail(_run_id, *, token, image):
        captured["token"] = token
        raise RuntimeError("raw failure contains " + token)

    controller.start.side_effect = fail
    controller.status.side_effect = [
        _absent_status(integrity_run.id),
        RuntimeError("raw response body contains credential"),
    ]
    api_client.force_authenticate(owner)

    with patch(
        "apps.contests.services.integrity_runs._build_controller_client",
        return_value=controller,
    ):
        response = api_client.post(
            f"/api/v1/contests/{integrity_run.contest_id}/integrity-runs/"
            f"{integrity_run.id}/start/",
            {},
            format="json",
        )

    rendered = response.content.decode() + caplog.text
    assert response.status_code == 502
    assert response.json() == {
        "code": "integrity_lifecycle_external_error",
        "detail": "Integrity lifecycle operation could not be confirmed.",
    }
    assert captured["token"] not in rendered
    assert "raw response body" not in rendered
    assert "credential" not in rendered


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "suffix"),
    [
        ("get", ""),
        ("get", "{run_id}/"),
        ("post", ""),
        ("post", "{run_id}/start/"),
        ("post", "{run_id}/stop/"),
        ("post", "{run_id}/destroy/"),
        ("post", "{run_id}/purge/"),
    ],
)
def test_every_manager_endpoint_uses_contest_manager_permission(
    method,
    suffix,
    api_client,
    integrity_run,
    student,
):
    api_client.force_authenticate(student)
    suffix = suffix.format(run_id=integrity_run.id)
    url = f"/api/v1/contests/{integrity_run.contest_id}/integrity-runs/{suffix}"

    response = getattr(api_client, method)(url, {}, format="json")

    assert response.status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "suffix", "service_name"),
    [
        ("get", "", None),
        ("get", "{run_id}/", None),
        ("post", "", None),
        ("post", "{run_id}/start/", "start_run"),
        ("post", "{run_id}/stop/", "stop_run"),
        ("post", "{run_id}/destroy/", "destroy_run"),
        ("post", "{run_id}/purge/", "purge_run"),
    ],
)
def test_every_manager_endpoint_calls_existing_permission_logic(
    method,
    suffix,
    service_name,
    api_client,
    integrity_run,
    owner,
):
    api_client.force_authenticate(owner)
    suffix = suffix.format(run_id=integrity_run.id)
    if method == "post" and not suffix:
        integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
        integrity_run.save(update_fields=["compute_state"])
    url = f"/api/v1/contests/{integrity_run.contest_id}/integrity-runs/{suffix}"
    service_patch = (
        patch(
            "apps.contests.views.integrity_runs." + service_name,
            return_value=integrity_run,
        )
        if service_name
        else nullcontext()
    )

    with patch(
        "apps.contests.views.integrity_runs.can_manage_contest",
        return_value=True,
    ) as permission, service_patch:
        response = getattr(api_client, method)(url, {}, format="json")

    assert response.status_code in {200, 201}
    permission.assert_called()
