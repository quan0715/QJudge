from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

import pytest
from django.db import IntegrityError, close_old_connections, connection, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun
from apps.contests.services.integrity_runs import create_run, LiveIntegrityRunExists
from apps.contests.services.integrity_sessions import ensure_resident_session
from apps.users.models import User
from apps.contests.tests.classroom_candidates import enrol_candidates


@pytest.fixture
def owner(db):
    return User.objects.create_user(username="resident-owner", email="resident@example.com", password="pass", role="teacher")


@pytest.fixture
def contest(owner):
    now = timezone.now()
    return Contest.objects.create(name="Resident exam", owner=owner, start_time=now - timedelta(seconds=1), end_time=now + timedelta(hours=1), status="published", contest_type="paper_exam", cheat_detection_enabled=True)


@pytest.mark.django_db
def test_preparation_does_not_wait_for_worker(contest, settings):
    settings.INTEGRITY_ACCEPT_GRACE_SECONDS = 123
    with patch("httpx.Client.request", side_effect=AssertionError("network forbidden")):
        first = ensure_resident_session(contest.id, actor_id=contest.owner_id)
        second = ensure_resident_session(contest.id, actor_id=contest.owner_id)
    assert first.id == second.id
    assert first.session_state == "prepared"
    assert first.health == "unhealthy"
    assert first.policy_snapshot and first.registry_snapshot
    assert first.accept_until == contest.end_time + timedelta(seconds=123)


@pytest.mark.django_db
@pytest.mark.parametrize("changes", [{"status": "draft"}, {"status": "archived"}, {"cheat_detection_enabled": False}, {"start_time": None}, {"end_time": None}, {"end_time": timezone.now() - timedelta(days=1)}])
def test_ineligible_contest_is_not_prepared(contest, changes):
    Contest.objects.filter(pk=contest.pk).update(**changes)
    assert ensure_resident_session(contest.pk) is None
    assert not ExamIntegrityRun.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_concurrent_preparation_creates_one_session(contest):
    barrier = Barrier(2)
    def prepare():
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            return ensure_resident_session(contest.pk).pk
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(prepare) for _ in range(2)]
        assert futures[0].result(timeout=20) == futures[1].result(timeout=20)
    assert ExamIntegrityRun.objects.count() == 1


@pytest.mark.django_db
def test_snapshots_are_fixed_once_prepared(contest):
    run = ensure_resident_session(contest.pk)
    Contest.objects.filter(pk=contest.pk).update(cheat_detection_enabled=False)
    again = ensure_resident_session(contest.pk)
    assert again.pk == run.pk
    assert again.policy_snapshot == run.policy_snapshot
    assert again.registry_snapshot == run.registry_snapshot


@pytest.mark.django_db
def test_resident_terminal_history_does_not_reserve_live_slot(contest):
    archived = ensure_resident_session(contest.pk)
    archived.session_state = "archived"
    archived.save(update_fields=["session_state"])
    new = ensure_resident_session(contest.pk)
    assert new.pk != archived.pk
    with pytest.raises(IntegrityError), transaction.atomic():
        ExamIntegrityRun.objects.create(contest=contest, session_state="draining")


@pytest.mark.django_db
@pytest.mark.parametrize("failure", [False, True])
def test_immediate_exam_start_is_independent_of_resident(contest, caplog, failure):
    from contextlib import nullcontext
    student = User.objects.create_user(username="resident-student", email="student@example.com", password="pass", role="student")
    enrol_candidates(contest, student)
    participant = ContestParticipant.objects.create(contest=contest, user=student)
    client = APIClient()
    client.force_authenticate(student)
    def database_failure(_contest):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 / 0")
    failing = patch("apps.contests.services.integrity_sessions.build_integrity_policy_snapshot", side_effect=database_failure) if failure else nullcontext()
    with patch("httpx.Client.request", side_effect=AssertionError("resident offline")), failing:
        response = client.post(f"/api/v1/contests/{contest.pk}/exam/start/", {}, format="json", HTTP_X_DEVICE_ID="device-1")
    assert response.status_code == 200, response.data
    participant.refresh_from_db()
    assert participant.exam_status == "in_progress"
    if failure:
        assert not ExamIntegrityRun.objects.exists()
        assert "integrity_session_preparation_missing" in caplog.text
        assert "division by zero" not in caplog.text
    else:
        assert ExamIntegrityRun.objects.get().session_state == "prepared"


@pytest.mark.django_db
def test_publish_and_settings_prepare_but_get_does_not(contest, owner):
    client = APIClient()
    client.force_authenticate(owner)
    assert client.get(f"/api/v1/contests/{contest.pk}/anticheat-config/").status_code == 200
    assert not ExamIntegrityRun.objects.exists()
    contest.status = "draft"
    contest.save(update_fields=["status"])
    assert client.post(f"/api/v1/contests/{contest.pk}/toggle_status/", {}, format="json").status_code == 200
    run = ExamIntegrityRun.objects.get()
    assert client.patch(f"/api/v1/contests/{contest.pk}/", {"description": "updated"}, format="json").status_code == 200
    assert ExamIntegrityRun.objects.get().pk == run.pk


@pytest.mark.django_db
def test_manager_creation_honors_backend_switch_and_conflict(contest, owner):
    create_run(contest, actor=owner)
    with pytest.raises(LiveIntegrityRunExists):
        create_run(contest, actor=owner)


@pytest.mark.django_db
def test_manager_serializer_exposes_readonly_session_descriptor(contest, owner):
    from apps.contests.integrity_serializers import IntegrityRunSerializer
    run = create_run(contest, actor=owner)
    serializer = IntegrityRunSerializer(run)
    for name in ("session_state", "schedule_revision", "accept_until"):
        assert name in serializer.data
        assert serializer.fields[name].read_only
    assert serializer.data["session_state"] == "prepared"


@pytest.mark.django_db
def test_prepares_exam_starting_in_less_than_five_minutes(contest):
    contest.start_time = timezone.now() + timedelta(seconds=20)
    contest.save(update_fields=["start_time"])
    run = ensure_resident_session(contest.pk)
    assert run.scheduled_start_at == contest.start_time


