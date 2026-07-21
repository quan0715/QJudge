import hashlib
from contextlib import nullcontext
from datetime import timedelta
from unittest.mock import Mock, patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.infrastructure.integrity_controller_client import (
    ControllerError,
    IntegrityControllerClient,
)
from apps.contests.services.integrity_tokens import issue_run_token, verify_run_token
from apps.contests.services.integrity_runs import (
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


def _verified_archive():
    return {
        "archived": True,
        "manifest_key": "integrity/run/manifest.json",
        "manifest_sha256": "a" * 64,
    }


def test_controller_client_uses_file_credential_and_fixed_start_contract(tmp_path):
    token_file = tmp_path / "controller-token"
    token_file.write_text("controller-secret\n", encoding="utf-8")
    response = Mock(status_code=200)
    response.json.return_value = _controller_start_result()
    client = IntegrityControllerClient(
        base_url="http://controller:8010/",
        token_file=str(token_file),
        timeout_seconds=3.0,
    )

    with patch(
        "apps.contests.infrastructure.integrity_controller_client.httpx.post",
        return_value=response,
    ) as post:
        result = client.start("run-1", token="run-secret", image="worker:1")

    assert result == _controller_start_result()
    post.assert_called_once_with(
        "http://controller:8010/v1/runs/run-1/start",
        json={"run_token": "run-secret", "worker_image": "worker:1"},
        headers={"Authorization": "Bearer controller-secret"},
        timeout=3.0,
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
        "apps.contests.infrastructure.integrity_controller_client.httpx.post",
        return_value=response,
    ), pytest.raises(ControllerError) as caught:
        client.stop_container("run-1")

    assert "status=503" in str(caught.value)
    assert "controller-secret" not in str(caught.value)


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
    controller = Mock()

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
    assert started.token_digest == hashlib.sha256(captured["token"].encode()).hexdigest()
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
def test_start_failure_returns_to_stopped_without_persisting_plaintext(integrity_run):
    captured = {}
    controller = Mock()

    def fail(_run_id, *, token, image):
        captured["token"] = token
        raise RuntimeError("controller rejected " + token)

    controller.start.side_effect = fail

    with pytest.raises(RuntimeError):
        start_run(integrity_run.id, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPED
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert captured["token"] not in integrity_run.last_error
    assert captured["token"] not in repr(integrity_run.__dict__)


@pytest.mark.django_db
def test_stop_requires_verified_archive_and_preserves_retry_credentials(
    integrity_run, owner,
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
    integrity_run, owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.STOPPING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.save(update_fields=["compute_state", "token_digest", "container_id"])
    calls = []
    worker = Mock()
    worker.request_stop.side_effect = lambda run: calls.append("archive") or _verified_archive()
    controller = Mock()
    controller.stop_container.side_effect = lambda run_id: calls.append("container") or {}

    stopped = stop_run(
        integrity_run.id, actor=owner, worker=worker, controller=controller,
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
    integrity_run, owner,
):
    integrity_run.compute_state = ExamIntegrityRun.ComputeState.RUNNING
    integrity_run.token_digest = "d" * 64
    integrity_run.container_id = "container-1"
    integrity_run.save(update_fields=["compute_state", "token_digest", "container_id"])
    worker = Mock()
    worker.request_stop.return_value = _verified_archive()
    controller = Mock()
    controller.stop_container.side_effect = RuntimeError("unavailable")

    with pytest.raises(RuntimeError, match="unavailable"):
        stop_run(integrity_run.id, actor=owner, worker=worker, controller=controller)

    integrity_run.refresh_from_db()
    assert integrity_run.compute_state == ExamIntegrityRun.ComputeState.STOPPING
    assert integrity_run.token_digest == "d" * 64
    assert integrity_run.token_revoked_at is None
    assert integrity_run.container_id == "container-1"


@pytest.mark.django_db
def test_destroy_requires_stopped_archived_and_keeps_data_for_later_purge(
    integrity_run, owner,
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
    integrity_run, owner,
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
    integrity_run.save(update_fields=[
        "compute_state", "data_state", "archive_manifest_key",
        "archive_manifest_sha256",
    ])
    calls = []
    purger.side_effect = lambda run: calls.append("objects")
    controller.purge_data.side_effect = lambda run_id: calls.append("volume") or {}
    purged = purge_run(
        integrity_run.id, actor=owner, purger=purger, controller=controller,
    )

    assert calls == ["objects", "volume"]
    assert purged.compute_state == ExamIntegrityRun.ComputeState.DESTROYED
    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purged.archive_manifest_key == ""
    assert purged.archive_manifest_sha256 == ""
    assert purged.purged_by == owner
    assert purged.purged_at is not None


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
def test_manager_api_create_does_not_accept_client_snapshots(api_client, contest, owner):
    api_client.force_authenticate(owner)
    url = f"/api/v1/contests/{contest.id}/integrity-runs/"

    rejected = api_client.post(
        url, {"policy_snapshot": {"client": "owned"}}, format="json",
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
        f"/api/v1/contests/{contest.id}/integrity-runs/", {}, format="json",
    )

    assert response.status_code == 409
    assert response.json() == {"code": "live_integrity_run_exists"}


@pytest.mark.django_db
def test_manager_api_maps_invalid_transition_to_conflict(
    api_client, integrity_run, owner,
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
    method, suffix, api_client, integrity_run, student,
):
    api_client.force_authenticate(student)
    suffix = suffix.format(run_id=integrity_run.id)
    url = (
        f"/api/v1/contests/{integrity_run.contest_id}/integrity-runs/{suffix}"
    )

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
    method, suffix, service_name, api_client, integrity_run, owner,
):
    api_client.force_authenticate(owner)
    suffix = suffix.format(run_id=integrity_run.id)
    if method == "post" and not suffix:
        integrity_run.compute_state = ExamIntegrityRun.ComputeState.DESTROYED
        integrity_run.save(update_fields=["compute_state"])
    url = (
        f"/api/v1/contests/{integrity_run.contest_id}/integrity-runs/{suffix}"
    )
    service_patch = (
        patch(
            "apps.contests.views.integrity_runs." + service_name,
            return_value=integrity_run,
        )
        if service_name
        else nullcontext()
    )

    with patch(
        "apps.contests.views.integrity_runs.can_manage_contest", return_value=True,
    ) as permission, service_patch:
        response = getattr(api_client, method)(url, {}, format="json")

    assert response.status_code in {200, 201}
    permission.assert_called()
