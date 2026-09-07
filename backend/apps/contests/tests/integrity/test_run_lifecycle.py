"""Run creation, purge and the manager API surface.

Compute lifecycle (start/restart/stop/destroy) went away with the Docker
Controller: the resident owns every Run in one process, so the only remaining
operator action is Purge, which must clear object storage *and* the resident's
local volume before it may report a terminal state.
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from datetime import timedelta
from unittest.mock import Mock, patch

import pytest
from django.db import IntegrityError, close_old_connections
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.services import integrity_runs as integrity_run_service
from apps.contests.services.integrity_runs import (
    IntegrityLifecycleError,
    InvalidRunTransition,
    LiveIntegrityRunExists,
    create_run,
    purge_run,
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
        scheduled_start_at=contest.start_time,
        scheduled_end_at=contest.end_time,
    )


@pytest.fixture
def api_client():
    return APIClient()


def _archived(run, **extra):
    run.session_state = ExamIntegrityRun.SessionState.ARCHIVED
    run.data_state = ExamIntegrityRun.DataState.ARCHIVED
    run.archive_manifest_key = "integrity/run/manifest.json"
    run.archive_manifest_sha256 = "a" * 64
    run.archive_generation = 5
    fields = [
        "session_state",
        "data_state",
        "archive_manifest_key",
        "archive_manifest_sha256",
        "archive_generation",
    ]
    for name, value in extra.items():
        setattr(run, name, value)
        fields.append(name)
    run.save(update_fields=fields)
    return run


@pytest.mark.django_db
def test_purge_requires_an_archived_run_and_commits_after_both_stores(
    integrity_run,
    owner,
):
    purger = Mock()
    resident = Mock()
    with pytest.raises(InvalidRunTransition):
        purge_run(
            integrity_run.id,
            actor=owner,
            purger=purger,
            resident_purger=resident,
        )
    purger.assert_not_called()
    resident.assert_not_called()

    _archived(integrity_run)
    calls = []
    purger.side_effect = lambda run: calls.append("objects")
    resident.side_effect = lambda run: calls.append("volume")

    purged = purge_run(
        integrity_run.id,
        actor=owner,
        purger=purger,
        resident_purger=resident,
    )

    assert calls == ["objects", "volume"]
    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purged.session_state == ExamIntegrityRun.SessionState.CLOSED
    assert purged.archive_manifest_key == ""
    assert purged.archive_manifest_sha256 == ""
    assert purged.purged_by == owner
    assert purged.purged_at is not None


@pytest.mark.django_db
def test_object_purge_failure_leaves_the_resident_volume_and_retries_safely(
    integrity_run,
    owner,
):
    _archived(integrity_run)
    purger = Mock(side_effect=[RuntimeError("object purge leaked raw-body"), None])
    resident = Mock()

    with pytest.raises(IntegrityLifecycleError) as caught:
        purge_run(
            integrity_run.id,
            actor=owner,
            purger=purger,
            resident_purger=resident,
        )

    integrity_run.refresh_from_db()
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.archive_manifest_key == "integrity/run/manifest.json"
    assert integrity_run.archive_generation == 5
    assert integrity_run.purged_at is None
    assert integrity_run.health == ExamIntegrityRun.Health.UNHEALTHY
    assert integrity_run.last_error == "integrity_purge_indeterminate"
    assert purger.call_count == 1
    resident.assert_not_called()
    assert caught.value.code == "integrity_purge_indeterminate"
    assert "raw-body" not in str(caught.value)

    purged = purge_run(
        integrity_run.id,
        actor=owner,
        purger=purger,
        resident_purger=resident,
    )

    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purged.archive_generation == 5
    assert purged.health == ExamIntegrityRun.Health.HEALTHY
    assert purged.last_error == ""
    assert purger.call_count == 2
    assert resident.call_count == 1


@pytest.mark.django_db
def test_resident_volume_failure_keeps_the_run_archived_and_retries_both_stores(
    integrity_run,
    owner,
):
    """Objects may already be gone, but Purge is not terminal until the
    resident volume is too; a retry re-runs both boundaries rather than
    reporting a completeness the data does not have."""
    _archived(integrity_run)
    purger = Mock()
    resident = Mock(side_effect=[RuntimeError("resident purge leaked raw-body"), None])

    with pytest.raises(IntegrityLifecycleError) as caught:
        purge_run(
            integrity_run.id,
            actor=owner,
            purger=purger,
            resident_purger=resident,
        )

    integrity_run.refresh_from_db()
    assert integrity_run.data_state == ExamIntegrityRun.DataState.ARCHIVED
    assert integrity_run.purged_at is None
    assert integrity_run.last_error == "integrity_purge_indeterminate"
    assert "raw-body" not in str(caught.value)

    purged = purge_run(
        integrity_run.id,
        actor=owner,
        purger=purger,
        resident_purger=resident,
    )

    assert purged.data_state == ExamIntegrityRun.DataState.PURGED
    assert purger.call_count == 2
    assert resident.call_count == 2


@pytest.mark.django_db(transaction=True)
def test_stale_purge_failure_cannot_overwrite_a_successful_retry(
    integrity_run,
    owner,
):
    _archived(integrity_run)
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

    def failing_call():
        with pytest.raises(IntegrityLifecycleError):
            purge_run(
                integrity_run.id,
                actor=owner,
                purger=Mock(side_effect=RuntimeError("stale")),
                resident_purger=Mock(),
            )

    def retry_call():
        return purge_run(
            integrity_run.id,
            actor=owner,
            purger=Mock(),
            resident_purger=Mock(),
        )

    with patch.object(
        integrity_run_service,
        "_record_lifecycle_error",
        side_effect=pause_before_error_persistence,
    ), ThreadPoolExecutor(max_workers=2) as pool:
        stale_failure = pool.submit(on_fresh_connection, failing_call)
        error_persistence_entered.wait(timeout=10)
        successful_retry = pool.submit(on_fresh_connection, retry_call)
        try:
            successful_retry.result(timeout=10)
        finally:
            release_stale_error.set()
        stale_failure.result(timeout=10)

    integrity_run.refresh_from_db()
    assert integrity_run.data_state == ExamIntegrityRun.DataState.PURGED
    assert integrity_run.health == ExamIntegrityRun.Health.HEALTHY
    assert integrity_run.last_error == ""


@pytest.mark.django_db
def test_create_run_translates_live_run_constraint(contest, owner):
    with patch(
        "apps.contests.services.integrity_runs.ensure_resident_session",
        side_effect=IntegrityError("duplicate"),
    ) as prepare:
        prepare.side_effect = None
        prepare.return_value = None
        with pytest.raises(InvalidRunTransition):
            create_run(contest, actor=owner)


@pytest.mark.django_db
def test_create_run_reuses_the_existing_live_session(contest, owner):
    first = create_run(contest, actor=owner)
    assert first is not None
    with pytest.raises(LiveIntegrityRunExists):
        create_run(contest, actor=owner)
    assert ExamIntegrityRun.objects.filter(contest=contest).count() == 1


@pytest.mark.django_db
def test_manager_api_create_does_not_accept_client_snapshots(
    api_client,
    contest,
    owner,
):
    api_client.force_authenticate(owner)
    url = f"/api/v1/contests/{contest.id}/integrity-runs/"

    response = api_client.post(url, {"worker_image": "evil:latest"}, format="json")

    assert response.status_code == 400
    assert "worker_image" in response.data["error"]["details"]
    assert not ExamIntegrityRun.objects.filter(contest=contest).exists()


@pytest.mark.django_db
def test_manager_api_returns_explicit_live_run_conflict(api_client, contest, owner):
    api_client.force_authenticate(owner)
    url = f"/api/v1/contests/{contest.id}/integrity-runs/"
    assert api_client.post(url, {}, format="json").status_code == 201

    response = api_client.post(url, {}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "live_integrity_run_exists"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "suffix"),
    [
        ("get", ""),
        ("get", "{run_id}/"),
        ("post", ""),
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


@pytest.mark.django_db
def test_no_compute_lifecycle_endpoint_remains(api_client, integrity_run, owner):
    """Teachers never manage Workers or containers; only Purge survives."""
    api_client.force_authenticate(owner)
    base = f"/api/v1/contests/{integrity_run.contest_id}/integrity-runs/{integrity_run.id}"

    for action in ("start", "restart", "stop", "destroy"):
        response = api_client.post(f"{base}/{action}/", {}, format="json")
        assert response.status_code == 404, action
