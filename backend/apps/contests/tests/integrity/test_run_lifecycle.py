import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager, nullcontext
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
import pytest
from django.db import DatabaseError, IntegrityError, close_old_connections, connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.infrastructure.integrity_controller_client import (
    ControllerError,
    ControllerRunStatus,
    IntegrityControllerClient,
)
from apps.contests.services.integrity_tokens import issue_run_token, verify_run_token
from apps.contests.services import integrity_runs as integrity_run_service
from apps.contests.services.integrity_runs import (
    IntegrityLifecycleError,
    InvalidRunTransition,
    LiveIntegrityRunExists,
    create_run,
    destroy_run,
    purge_run,
    restart_run,
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


@contextmanager
def _fail_nth_transaction_commit(commit_number):
    original_commit = connection._commit
    commit_count = 0

    def commit_with_fault():
        nonlocal commit_count
        commit_count += 1
        if commit_count == commit_number:
            raise DatabaseError("transaction commit leaked raw-body")
        return original_commit()

    with patch.object(connection, "_commit", side_effect=commit_with_fault):
        yield lambda: commit_count


def _run_stale_error_persistence_race(failing_call, retry_call):
    error_persistence_entered = threading.Barrier(2)
    release_stale_error = threading.Event()
    original_record_error = integrity_run_service._record_lifecycle_error

    def pause_before_error_persistence(*args, **kwargs):
        error_persistence_entered.wait(timeout=10)
        assert release_stale_error.wait(timeout=10)
        return original_record_error(*args, **kwargs)

    def on_fresh_connection(call):
        close_old_connections()
        try:
            return call()
        finally:
            close_old_connections()

    with patch.object(
        integrity_run_service,
        "_record_lifecycle_error",
        side_effect=pause_before_error_persistence,
    ), ThreadPoolExecutor(max_workers=2) as pool:
        stale_failure = pool.submit(on_fresh_connection, failing_call)
        error_persistence_entered.wait(timeout=10)
        successful_retry = pool.submit(on_fresh_connection, retry_call)
        try:
            retry_result = successful_retry.result(timeout=10)
        finally:
            release_stale_error.set()
        failure_result = stale_failure.result(timeout=10)
    return failure_result, retry_result


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


def test_controller_restart_uses_narrow_bodyless_endpoint(tmp_path):
    token_file = tmp_path / "controller-token"
    token_file.write_text("controller-secret", encoding="utf-8")
    response = Mock(status_code=200)
    response.json.return_value = _controller_start_result()
    client = IntegrityControllerClient(
        base_url="http://controller:8010",
        token_file=str(token_file),
    )

    with patch(
        "apps.contests.infrastructure.integrity_controller_client.httpx.request",
        return_value=response,
    ) as request:
        result = client.restart("run-1")

    assert result == _controller_start_result()
    assert request.call_args.args == (
        "POST",
        "http://controller:8010/v1/runs/run-1/restart",
    )
    assert request.call_args.kwargs["json"] == {}


@pytest.mark.django_db
def test_restart_recovers_only_an_unhealthy_running_worker(integrity_run):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.health = ExamIntegrityRun.Health.UNHEALTHY
    integrity_run.token_digest = "a" * 64
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.last_error = "worker_unavailable"
    integrity_run.save()
    controller = Mock()
    controller.restart.return_value = _controller_start_result()
    controller.status.return_value = _container_status(integrity_run)

    restarted = restart_run(integrity_run.id, controller=controller)

    controller.restart.assert_called_once_with(integrity_run.id)
    assert restarted.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert restarted.health == ExamIntegrityRun.Health.HEALTHY
    assert restarted.last_error == ""


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("compute_state", "health"),
    [
        (ExamIntegrityRun.ComputeState.RUNNING, ExamIntegrityRun.Health.HEALTHY),
        (ExamIntegrityRun.ComputeState.STOPPED, ExamIntegrityRun.Health.UNHEALTHY),
    ],
)
def test_restart_rejects_normal_or_nonrunning_run(integrity_run, compute_state, health):
    integrity_run.compute_state = compute_state
    integrity_run.health = health
    integrity_run.save(update_fields=["compute_state", "health"])
    controller = Mock()

    with pytest.raises(InvalidRunTransition):
        restart_run(integrity_run.id, controller=controller)

    controller.restart.assert_not_called()


@pytest.mark.django_db
def test_restart_keeps_run_unhealthy_when_controller_identity_cannot_reconcile(
    integrity_run,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.health = ExamIntegrityRun.Health.UNHEALTHY
    integrity_run.token_digest = "a" * 64
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.save()
    controller = Mock()
    controller.restart.return_value = _controller_start_result()
    controller.status.return_value = _container_status(
        integrity_run, token_digest="b" * 64
    )

    with pytest.raises(IntegrityLifecycleError):
        restart_run(integrity_run.id, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert integrity_run.last_error == "controller_restart_reconciliation_failed"


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


@pytest.mark.django_db(transaction=True)
def test_start_final_commit_failure_recovers_from_status_without_new_token(
    integrity_run,
):
    controller = _controller_for_new_start(integrity_run.id)
    with _fail_nth_transaction_commit(2) as commit_count:
        with pytest.raises(IntegrityLifecycleError) as caught:
            start_run(integrity_run.id, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STARTING
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    persisted_digest = integrity_run.token_digest
    persisted_expiry = integrity_run.token_expires_at
    controller.status.return_value = _container_status(
        integrity_run,
        token_digest=persisted_digest,
    )

    started = start_run(integrity_run.id, controller=controller)

    assert started.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert started.token_digest == persisted_digest
    assert started.token_expires_at == persisted_expiry
    assert started.health == ExamIntegrityRun.Health.HEALTHY
    assert started.last_error == ""
    assert controller.start.call_count == 1
    assert commit_count() == 2
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


@pytest.mark.django_db(transaction=True)
def test_stale_start_failure_cannot_overwrite_successful_retry(integrity_run):
    controller = Mock()
    external_started = threading.Event()
    failed_reconciliation = False
    captured_digest = ""

    def status(_run_id):
        nonlocal failed_reconciliation
        if not external_started.is_set():
            return _absent_status(integrity_run.id)
        if not failed_reconciliation:
            failed_reconciliation = True
            raise RuntimeError("older status failure leaked raw-body")
        return _container_status(
            integrity_run,
            state="running",
            token_digest=captured_digest,
        )

    def start(_run_id, *, token, image):
        nonlocal captured_digest
        captured_digest = hashlib.sha256(token.encode()).hexdigest()
        external_started.set()
        raise httpx.ReadTimeout("older start response was lost")

    controller.status.side_effect = status
    controller.start.side_effect = start

    def failing_call():
        with pytest.raises(IntegrityLifecycleError) as caught:
            start_run(integrity_run.id, controller=controller)
        return caught.value.code

    failure_code, retry_state = _run_stale_error_persistence_race(
        failing_call,
        lambda: start_run(integrity_run.id, controller=controller).compute_state,
    )

    integrity_run.refresh_from_db()
    assert failure_code == "controller_start_reconciliation_failed"
    assert retry_state == ExamIntegrityRun.ComputeState.RUNNING
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.RUNNING
    assert integrity_run.health == ExamIntegrityRun.Health.HEALTHY
    assert integrity_run.last_error == ""
    assert integrity_run.token_digest == captured_digest
    assert controller.start.call_count == 1
    assert controller.status.call_count == 3


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


@pytest.mark.django_db(transaction=True)
def test_stop_releases_run_row_before_worker_manifest_callback(
    integrity_run,
    owner,
):
    token = "stop-callback-token"
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = hashlib.sha256(token.encode("ascii")).hexdigest()
    integrity_run.token_expires_at = timezone.now() + timedelta(hours=1)
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.save(
        update_fields=[
            "compute_state",
            "token_digest",
            "token_expires_at",
            "container_id",
            "container_name",
            "worker_url",
            "worker_image_digest",
        ]
    )
    manifest_key = f"runs/{integrity_run.id}/generation-1/manifest.json"
    manifest_sha256 = "a" * 64
    publish = {
        "command_id": "99999999-9999-9999-9999-999999999999",
        "run_id": str(integrity_run.id),
        "kind": "publish_archive_manifest",
        "metadata": {
            "object_key": manifest_key,
            "sha256": manifest_sha256,
            "generation": 1,
            "archived_counts": {"segments": 1},
        },
    }
    callback_pool = ThreadPoolExecutor(max_workers=1)

    def publish_callback():
        close_old_connections()
        try:
            return APIClient().post(
                f"/api/v1/internal/integrity/runs/{integrity_run.id}/commands/",
                {"commands": [publish]},
                format="json",
                HTTP_AUTHORIZATION=f"Bearer {token}",
            )
        finally:
            close_old_connections()

    worker = Mock()

    def request_stop(_run):
        callback = callback_pool.submit(publish_callback)
        response = callback.result(timeout=5)
        assert response.status_code == 200
        assert response.json() == {
            "accepted_command_ids": [publish["command_id"]],
            "archive_uploads": [],
        }
        return {
            "archived": True,
            "manifest_key": manifest_key,
            "manifest_sha256": manifest_sha256,
        }

    worker.request_stop.side_effect = request_stop
    controller = Mock()
    controller.stop_container.return_value = {}

    try:
        stopped = stop_run(
            integrity_run.id,
            actor=owner,
            worker=worker,
            controller=controller,
        )
    finally:
        callback_pool.shutdown(wait=True)

    assert stopped.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert stopped.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert stopped.archive_generation == 1
    assert stopped.archive_manifest_key == manifest_key
    assert stopped.archive_manifest_sha256 == manifest_sha256
    assert worker.request_stop.call_count == 1
    controller.stop_container.assert_called_once_with(integrity_run.id)


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


@pytest.mark.django_db(transaction=True)
def test_archive_checkpoint_commit_failure_retries_worker_before_controller(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.archive_generation = 7
    integrity_run.save(
        update_fields=[
            "compute_state",
            "token_digest",
            "container_id",
            "container_name",
            "worker_url",
            "worker_image_digest",
            "archive_generation",
        ]
    )
    worker = Mock()
    worker.request_stop.return_value = _verified_archive(integrity_run)
    controller = Mock()
    controller.stop_container.return_value = {}

    with _fail_nth_transaction_commit(2) as commit_count:
        with pytest.raises(IntegrityLifecycleError) as caught:
            stop_run(
                integrity_run.id,
                actor=owner,
                worker=worker,
                controller=controller,
            )

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPING
    assert integrity_run.archive_manifest_key == ""
    assert integrity_run.archive_manifest_sha256 == ""
    assert integrity_run.archive_generation == 7
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at is None
    assert worker.request_stop.call_count == 1
    controller.stop_container.assert_not_called()
    assert commit_count() == 2
    assert caught.value.code == "controller_stop_finalization_failed"
    assert "raw-body" not in str(caught.value)

    stopped = stop_run(
        integrity_run.id,
        actor=owner,
        worker=worker,
        controller=controller,
    )

    assert stopped.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert stopped.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert stopped.archive_manifest_key == "integrity/run/manifest.json"
    assert stopped.archive_manifest_sha256 == "a" * 64
    assert stopped.archive_generation == 7
    assert stopped.token_digest == "d" * 64
    assert stopped.token_revoked_at is not None
    assert stopped.health == ExamIntegrityRun.Health.HEALTHY
    assert stopped.last_error == ""
    assert worker.request_stop.call_count == 2
    assert controller.stop_container.call_count == 1


@pytest.mark.django_db(transaction=True)
def test_stop_final_commit_failure_retries_from_checkpoint_without_external_repeat(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.archive_generation = 7
    integrity_run.save(
        update_fields=[
            "compute_state",
            "token_digest",
            "container_id",
            "container_name",
            "worker_url",
            "worker_image_digest",
            "archive_generation",
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

    with _fail_nth_transaction_commit(3) as commit_count:
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
    assert integrity_run.archive_manifest_sha256 == "a" * 64
    assert integrity_run.archive_generation == 7
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at is None
    assert commit_count() == 3

    stopped = stop_run(
        integrity_run.id,
        actor=owner,
        worker=worker,
        controller=controller,
    )

    assert stopped.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert stopped.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert stopped.archive_manifest_key == "integrity/run/manifest.json"
    assert stopped.archive_manifest_sha256 == "a" * 64
    assert stopped.archive_generation == 7
    assert stopped.token_digest == "d" * 64
    assert stopped.token_revoked_at is not None
    assert stopped.health == ExamIntegrityRun.Health.HEALTHY
    assert stopped.last_error == ""
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
    second_operation_started = threading.Event()
    controller = Mock()

    def stop_container(_run_id):
        stop_entered.set()
        assert release_stop.wait(timeout=10)
        return {}

    controller.stop_container.side_effect = stop_container

    def call_stop(*, second=False):
        close_old_connections()
        try:
            local_owner = User.objects.get(pk=owner.pk)
            if second:
                second_operation_started.set()
            return stop_run(
                integrity_run.id,
                actor=local_owner,
                worker=worker,
                controller=controller,
            ).compute_state
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(call_stop)
        assert stop_entered.wait(timeout=10)
        second = pool.submit(call_stop, second=True)
        assert second_operation_started.wait(timeout=10)
        assert second.done() is False
        release_stop.set()
        states = [first.result(timeout=10), second.result(timeout=10)]

    assert states == [
        ExamIntegrityRun.ComputeState.STOPPED,
        ExamIntegrityRun.ComputeState.STOPPED,
    ]
    assert worker.request_stop.call_count == 1
    assert controller.stop_container.call_count == 1


@pytest.mark.django_db(transaction=True)
def test_stale_stop_failure_cannot_overwrite_successful_retry(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.container_name = "integrity-run-1"
    integrity_run.worker_url = "http://integrity-run-1:8020"
    integrity_run.worker_image_digest = "sha256:abc"
    integrity_run.archive_generation = 9
    integrity_run.save(
        update_fields=[
            "compute_state",
            "token_digest",
            "container_id",
            "container_name",
            "worker_url",
            "worker_image_digest",
            "archive_generation",
        ]
    )
    worker = Mock()
    worker.request_stop.return_value = _verified_archive(integrity_run)
    controller = Mock()
    old_status_failed = False

    def stop_container(_run_id):
        raise httpx.ReadTimeout("older stop response was lost")

    def status(_run_id):
        nonlocal old_status_failed
        if not old_status_failed:
            old_status_failed = True
            raise RuntimeError("older status failure leaked raw-body")
        return _container_status(integrity_run, state="stopped")

    controller.stop_container.side_effect = stop_container
    controller.status.side_effect = status

    def failing_call():
        local_owner = User.objects.get(pk=owner.pk)
        with pytest.raises(IntegrityLifecycleError) as caught:
            stop_run(
                integrity_run.id,
                actor=local_owner,
                worker=worker,
                controller=controller,
            )
        return caught.value.code

    def retry_call():
        local_owner = User.objects.get(pk=owner.pk)
        return stop_run(
            integrity_run.id,
            actor=local_owner,
            worker=worker,
            controller=controller,
        ).compute_state

    failure_code, retry_state = _run_stale_error_persistence_race(
        failing_call,
        retry_call,
    )

    integrity_run.refresh_from_db()
    assert failure_code == "controller_stop_reconciliation_failed"
    assert retry_state == ExamIntegrityRun.ComputeState.STOPPED
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.health == ExamIntegrityRun.Health.HEALTHY
    assert integrity_run.last_error == ""
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"
    assert integrity_run.archive_manifest_sha256 == "a" * 64
    assert integrity_run.archive_generation == 9
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at is not None
    assert worker.request_stop.call_count == 1
    assert controller.stop_container.call_count == 1
    assert controller.status.call_count == 2


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
    integrity_run.archive_generation = 5
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
            "archive_generation",
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


@pytest.mark.django_db(transaction=True)
def test_destroy_external_success_then_commit_failure_is_safe_and_retryable(
    integrity_run,
    owner,
):
    revoked_at = timezone.now()
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.archive_generation = 5
    integrity_run.token_digest = "d" * 64
    integrity_run.token_revoked_at = revoked_at
    integrity_run.save(
        update_fields=[
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
            "archive_generation",
            "token_digest",
            "token_revoked_at",
        ]
    )
    controller = Mock()
    controller.destroy.return_value = {}

    with _fail_nth_transaction_commit(1) as commit_count:
        with pytest.raises(IntegrityLifecycleError) as caught:
            destroy_run(integrity_run.id, actor=owner, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"
    assert integrity_run.archive_manifest_sha256 == "a" * 64
    assert integrity_run.archive_generation == 5
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at == revoked_at
    assert integrity_run.destroyed_at is None
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert integrity_run.last_error == "controller_destroy_indeterminate"
    assert commit_count() == 1
    destroyed = destroy_run(integrity_run.id, actor=owner, controller=controller)
    assert destroyed.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert destroyed.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert destroyed.archive_manifest_key == "integrity/run/manifest.json"
    assert destroyed.archive_manifest_sha256 == "a" * 64
    assert destroyed.archive_generation == 5
    assert destroyed.token_digest == "d" * 64
    assert destroyed.token_revoked_at == revoked_at
    assert destroyed.health == ExamIntegrityRun.Health.HEALTHY
    assert destroyed.last_error == ""
    assert controller.destroy.call_count == 2
    assert "raw-body" not in str(caught.value)
    assert caught.value.__cause__ is None


@pytest.mark.django_db(transaction=True)
def test_stale_destroy_failure_cannot_overwrite_successful_retry(
    integrity_run,
    owner,
):
    revoked_at = timezone.now()
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.archive_generation = 5
    integrity_run.token_digest = "d" * 64
    integrity_run.token_revoked_at = revoked_at
    integrity_run.save(
        update_fields=[
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
            "archive_generation",
            "token_digest",
            "token_revoked_at",
        ]
    )
    controller = Mock()
    controller.destroy.side_effect = [
        RuntimeError("older destroy failure leaked raw-body"),
        {},
    ]

    def failing_call():
        local_owner = User.objects.get(pk=owner.pk)
        with pytest.raises(IntegrityLifecycleError) as caught:
            destroy_run(
                integrity_run.id,
                actor=local_owner,
                controller=controller,
            )
        return caught.value.code

    def retry_call():
        local_owner = User.objects.get(pk=owner.pk)
        return destroy_run(
            integrity_run.id,
            actor=local_owner,
            controller=controller,
        ).compute_state

    failure_code, retry_state = _run_stale_error_persistence_race(
        failing_call,
        retry_call,
    )

    integrity_run.refresh_from_db()
    assert failure_code == "controller_destroy_indeterminate"
    assert retry_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.health == ExamIntegrityRun.Health.HEALTHY
    assert integrity_run.last_error == ""
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"
    assert integrity_run.archive_manifest_sha256 == "a" * 64
    assert integrity_run.archive_generation == 5
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at == revoked_at
    assert controller.destroy.call_count == 2


@pytest.mark.django_db(transaction=True)
def test_purge_object_failure_preserves_volume_and_retries_safely(
    integrity_run,
    owner,
):
    revoked_at = timezone.now()
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.archive_generation = 5
    integrity_run.token_digest = "d" * 64
    integrity_run.token_revoked_at = revoked_at
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
            "archive_generation",
            "token_digest",
            "token_revoked_at",
        ]
    )
    purger = Mock(
        side_effect=[RuntimeError("object purge leaked raw-body"), None],
    )
    controller = Mock()

    with pytest.raises(IntegrityLifecycleError) as caught:
        purge_run(
            integrity_run.id,
            actor=owner,
            purger=purger,
            controller=controller,
        )

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"
    assert integrity_run.archive_manifest_sha256 == "a" * 64
    assert integrity_run.archive_generation == 5
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at == revoked_at
    assert integrity_run.purged_at is None
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert integrity_run.last_error == "integrity_purge_indeterminate"
    assert purger.call_count == 1
    controller.purge_data.assert_not_called()

    purged = purge_run(
        integrity_run.id,
        actor=owner,
        purger=purger,
        controller=controller,
    )

    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purged.archive_manifest_key == ""
    assert purged.archive_manifest_sha256 == ""
    assert purged.archive_generation == 5
    assert purged.token_digest == "d" * 64
    assert purged.token_revoked_at == revoked_at
    assert purged.health == ExamIntegrityRun.Health.HEALTHY
    assert purged.last_error == ""
    assert purger.call_count == 2
    assert controller.purge_data.call_count == 1
    assert caught.value.code == "integrity_purge_indeterminate"
    assert "raw-body" not in str(caught.value)


@pytest.mark.django_db(transaction=True)
def test_purge_object_success_then_volume_failure_retries_both_boundaries(
    integrity_run,
    owner,
):
    revoked_at = timezone.now()
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.archive_generation = 5
    integrity_run.token_digest = "d" * 64
    integrity_run.token_revoked_at = revoked_at
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
            "archive_generation",
            "token_digest",
            "token_revoked_at",
        ]
    )
    calls = []
    purger = Mock(side_effect=lambda run: calls.append("objects"))
    controller = Mock()
    volume_attempt = 0

    def purge_volume(_run_id):
        nonlocal volume_attempt
        volume_attempt += 1
        calls.append("volume")
        if volume_attempt == 1:
            raise RuntimeError("volume purge leaked raw-body")
        return {}

    controller.purge_data.side_effect = purge_volume

    with pytest.raises(IntegrityLifecycleError) as caught:
        purge_run(
            integrity_run.id,
            actor=owner,
            purger=purger,
            controller=controller,
        )

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"
    assert integrity_run.archive_manifest_sha256 == "a" * 64
    assert integrity_run.archive_generation == 5
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at == revoked_at
    assert integrity_run.purged_at is None
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert integrity_run.last_error == "integrity_purge_indeterminate"
    assert purger.call_count == 1
    assert controller.purge_data.call_count == 1

    purged = purge_run(
        integrity_run.id,
        actor=owner,
        purger=purger,
        controller=controller,
    )

    assert purged.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purged.archive_manifest_key == ""
    assert purged.archive_manifest_sha256 == ""
    assert purged.archive_generation == 5
    assert purged.token_digest == "d" * 64
    assert purged.token_revoked_at == revoked_at
    assert purged.health == ExamIntegrityRun.Health.HEALTHY
    assert purged.last_error == ""
    assert calls == ["objects", "volume", "objects", "volume"]
    assert purger.call_count == 2
    assert controller.purge_data.call_count == 2
    assert caught.value.code == "integrity_purge_indeterminate"
    assert "raw-body" not in str(caught.value)


@pytest.mark.django_db(transaction=True)
def test_purge_preserves_durable_object_receipt_across_volume_failure(
    integrity_run,
    owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_generation = 1
    integrity_run.archive_manifest_key = (
        f"runs/{integrity_run.id}/generation-1/manifest.json"
    )
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_generation",
            "archive_manifest_key",
            "archive_manifest_sha256",
        ]
    )

    def persist_object_receipt(run):
        ExamIntegrityRun.objects.filter(pk=run.pk).update(
            metrics={"integrity_purge": {"durable": True}},
        )

    controller = Mock()
    controller.purge_data.side_effect = RuntimeError("volume unavailable")

    with pytest.raises(IntegrityLifecycleError):
        purge_run(
            integrity_run.id,
            actor=owner,
            purger=persist_object_receipt,
            controller=controller,
        )

    integrity_run.refresh_from_db()
    assert integrity_run.metrics == {
        "integrity_purge": {"durable": True},
    }
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.archive_manifest_key.endswith("/manifest.json")


@pytest.mark.django_db(transaction=True)
def test_purge_external_success_then_commit_failure_retries_both_boundaries(
    integrity_run,
    owner,
):
    revoked_at = timezone.now()
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.archive_generation = 5
    integrity_run.token_digest = "d" * 64
    integrity_run.token_revoked_at = revoked_at
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
            "archive_generation",
            "token_digest",
            "token_revoked_at",
        ]
    )
    calls = []
    purger = Mock(side_effect=lambda run: calls.append("objects"))
    controller = Mock()
    controller.purge_data.side_effect = lambda run_id: calls.append("volume") or {}

    with _fail_nth_transaction_commit(1) as commit_count:
        with pytest.raises(IntegrityLifecycleError) as caught:
            purge_run(
                integrity_run.id,
                actor=owner,
                purger=purger,
                controller=controller,
            )

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"
    assert integrity_run.archive_manifest_sha256 == "a" * 64
    assert integrity_run.archive_generation == 5
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at == revoked_at
    assert integrity_run.purged_at is None
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert integrity_run.last_error == "integrity_purge_indeterminate"
    assert commit_count() == 1
    purged = purge_run(
        integrity_run.id,
        actor=owner,
        purger=purger,
        controller=controller,
    )
    assert purged.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purged.archive_manifest_key == ""
    assert purged.archive_manifest_sha256 == ""
    assert purged.archive_generation == 5
    assert purged.token_digest == "d" * 64
    assert purged.token_revoked_at == revoked_at
    assert purged.health == ExamIntegrityRun.Health.HEALTHY
    assert purged.last_error == ""
    assert calls == ["objects", "volume", "objects", "volume"]
    assert purger.call_count == 2
    assert controller.purge_data.call_count == 2
    assert "raw-body" not in str(caught.value)
    assert caught.value.__cause__ is None


@pytest.mark.django_db(transaction=True)
def test_stale_purge_failure_cannot_overwrite_successful_retry(
    integrity_run,
    owner,
):
    revoked_at = timezone.now()
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
    integrity_run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    integrity_run.archive_manifest_key = "integrity/run/manifest.json"
    integrity_run.archive_manifest_sha256 = "a" * 64
    integrity_run.archive_generation = 5
    integrity_run.token_digest = "d" * 64
    integrity_run.token_revoked_at = revoked_at
    integrity_run.save(
        update_fields=[
            "compute_state",
            "data_state",
            "archive_manifest_key",
            "archive_manifest_sha256",
            "archive_generation",
            "token_digest",
            "token_revoked_at",
        ]
    )
    purger = Mock()
    controller = Mock()
    controller.purge_data.side_effect = [
        RuntimeError("older volume purge failure leaked raw-body"),
        {},
    ]

    def failing_call():
        local_owner = User.objects.get(pk=owner.pk)
        with pytest.raises(IntegrityLifecycleError) as caught:
            purge_run(
                integrity_run.id,
                actor=local_owner,
                purger=purger,
                controller=controller,
            )
        return caught.value.code

    def retry_call():
        local_owner = User.objects.get(pk=owner.pk)
        return purge_run(
            integrity_run.id,
            actor=local_owner,
            purger=purger,
            controller=controller,
        ).data_state

    failure_code, retry_state = _run_stale_error_persistence_race(
        failing_call,
        retry_call,
    )

    integrity_run.refresh_from_db()
    assert failure_code == "integrity_purge_indeterminate"
    assert retry_state == ExamIntegrityRun.DataState.PURGED
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert integrity_run.data_state == ExamIntegrityRun.DataState.PURGED
    assert integrity_run.health == ExamIntegrityRun.Health.HEALTHY
    assert integrity_run.last_error == ""
    assert integrity_run.archive_manifest_key == ""
    assert integrity_run.archive_manifest_sha256 == ""
    assert integrity_run.archive_generation == 5
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at == revoked_at
    assert purger.call_count == 2
    assert controller.purge_data.call_count == 2


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
        ("post", "{run_id}/restart/"),
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
        ("post", "{run_id}/restart/", "restart_run"),
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
