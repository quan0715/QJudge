from datetime import timedelta
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from time import monotonic, sleep

import pytest
from django.db import close_old_connections, connection, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun
from apps.contests.services.integrity_sessions import ensure_resident_session
from apps.users.models import User


@pytest.fixture(autouse=True)
def signing_key(tmp_path, settings):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    key = Ed25519PrivateKey.generate()
    path = tmp_path / "signing-key"
    path.write_bytes(key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()))
    settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = str(path)
    return key


@pytest.fixture
def owner(db):
    return User.objects.create_user(username="schedule-owner", email="schedule-owner@example.com", role="teacher")


@pytest.fixture
def contest(owner):
    now = timezone.now()
    return Contest.objects.create(name="Schedule", owner=owner, status="published", contest_type="paper_exam", cheat_detection_enabled=True, start_time=now - timedelta(hours=1), end_time=now + timedelta(minutes=10))


@pytest.fixture
def participant(contest):
    student = User.objects.create_user(username="schedule-student", email="schedule-student@example.com", role="student")
    return ContestParticipant.objects.create(contest=contest, user=student, exam_status="in_progress", started_at=contest.start_time)


@pytest.mark.django_db
def test_patch_extension_is_atomic_offline_and_invalidates_old_deadline(contest, participant, owner, settings):
    settings.INTEGRITY_EXECUTION_BACKEND = "resident"
    run = ensure_resident_session(contest.pk)
    old_end = contest.end_time
    client = APIClient()
    client.force_authenticate(owner)
    with patch("httpx.request", side_effect=AssertionError("network forbidden")):
        response = client.patch(f"/api/v1/contests/{contest.pk}/", {"end_time": (old_end + timedelta(minutes=20)).isoformat(), "description": "also saved"}, format="json")
    assert response.status_code == 200, response.data
    contest.refresh_from_db()
    run.refresh_from_db()
    assert contest.schedule_revision == 2
    assert contest.description == "also saved"
    assert run.schedule_revision == 2
    assert run.scheduled_end_at == old_end + timedelta(minutes=20)
    assert run.accept_until == run.scheduled_end_at + timedelta(seconds=300)
    from apps.contests.services.exam_schedule import finalize_due_exam
    assert finalize_due_exam(contest.pk, now=old_end, expected_revision=1) == 0
    participant.refresh_from_db()
    assert participant.exam_status == "in_progress"


@pytest.mark.django_db
def test_runtime_state_is_readonly_and_self_scoped(contest, participant):
    client = APIClient()
    client.force_authenticate(participant.user)
    response = client.get(f"/api/v1/contests/{contest.pk}/exam/runtime-state/")
    assert response.status_code == 200
    assert response.data["schedule_revision"] == 1
    assert response.data["exam_status"] == "in_progress"
    assert response.data["integrity_run"] is None
    assert "server_now" in response.data
    assert not ExamIntegrityRun.objects.exists()


@pytest.mark.django_db
def test_due_without_checkpoints_is_idempotent_and_extension_never_reopens(contest, participant):
    from apps.contests.services.exam_schedule import finalize_due_exam, update_exam_schedule
    run = ensure_resident_session(contest.pk)
    assert finalize_due_exam(contest.pk, now=contest.end_time) == 1
    assert finalize_due_exam(contest.pk, now=contest.end_time) == 0
    updated = update_exam_schedule(contest.pk, start_time=contest.start_time, end_time=contest.end_time + timedelta(hours=1), actor=contest.owner)
    same = update_exam_schedule(contest.pk, start_time=updated.start_time, end_time=updated.end_time, actor=contest.owner)
    assert same.schedule_revision == 2
    participant.refresh_from_db()
    run.refresh_from_db()
    assert participant.exam_status == "submitted"
    assert run.session_state == "active"
    assert run.data_state == "open"


@pytest.mark.django_db
def test_reconcile_offline_finalizes_and_existing_resident_survives_switch_rollback(contest, participant, settings):
    from apps.contests.services.exam_schedule import reconcile_integrity_once
    run = ensure_resident_session(contest.pk)
    settings.INTEGRITY_EXECUTION_BACKEND = "legacy"
    with patch("httpx.put", side_effect=ConnectionError("offline")):
        result = reconcile_integrity_once(contest.end_time)
    assert result["submitted"] == 1
    assert result["failed"] == 1
    run.refresh_from_db()
    assert run.session_state == "draining"
    assert run.health == "unhealthy"
    assert run.last_error == "resident_sync_failed"


@pytest.mark.django_db
def test_reconcile_repairs_missing_preparation(contest, participant, settings):
    from apps.contests.services.exam_schedule import reconcile_integrity_once
    settings.INTEGRITY_EXECUTION_BACKEND = "resident"
    with patch("httpx.put", side_effect=ConnectionError("offline")):
        result = reconcile_integrity_once(timezone.now())
    assert result["prepared"] == 1
    assert ExamIntegrityRun.objects.get().execution_backend == "resident"
    participant.refresh_from_db()
    assert participant.exam_status == "in_progress"


@pytest.mark.django_db
@pytest.mark.parametrize("backend", ["legacy", "resident"])
def test_reconcile_legacy_fallback_only_for_revised_schedules(contest, participant, settings, backend):
    from apps.contests.services.exam_schedule import reconcile_integrity_once, update_exam_schedule
    from apps.contests.services.integrity_runs import create_run
    settings.INTEGRITY_EXECUTION_BACKEND = "legacy"
    run = create_run(contest, actor=contest.owner)
    settings.INTEGRITY_EXECUTION_BACKEND = backend
    assert reconcile_integrity_once(contest.end_time)["submitted"] == 0
    updated = update_exam_schedule(contest.pk, start_time=contest.start_time, end_time=contest.end_time + timedelta(minutes=20), actor=contest.owner)
    assert reconcile_integrity_once(contest.end_time)["submitted"] == 0
    assert reconcile_integrity_once(updated.end_time)["submitted"] == 1
    run.refresh_from_db()
    assert run.execution_backend == "legacy"
    assert run.compute_state == "stopped"


@pytest.mark.django_db
def test_retired_resident_history_does_not_take_over_new_unchanged_legacy(contest, participant, settings):
    from apps.contests.services.exam_schedule import reconcile_integrity_once
    from apps.contests.services.integrity_runs import create_run
    settings.INTEGRITY_EXECUTION_BACKEND = "legacy"
    retired = ensure_resident_session(contest.pk)
    retired.session_state, retired.data_state = "archived", "archived"
    retired.save(update_fields=["session_state", "data_state"])
    assert create_run(contest, actor=contest.owner).execution_backend == "legacy"
    assert reconcile_integrity_once(contest.end_time)["submitted"] == 0


@pytest.mark.django_db
@pytest.mark.parametrize("boundary", ["deadline", "submitted"])
def test_paper_answer_revalidates_after_lock(contest, participant, boundary):
    from apps.contests.models import ExamAnswer, ExamQuestion
    from apps.contests.views import exam_answer
    question = ExamQuestion.objects.create(contest=contest, question_type="single_choice", prompt="Pick", options=["A", "B"], correct_answer="A", score=1, order=1)
    original = exam_answer.validate_exam_operation_for_view
    calls = 0
    def validation(*args, **kwargs):
        nonlocal calls
        result = original(*args, **kwargs)
        calls += 1
        if calls == 1:
            if boundary == "deadline":
                Contest.objects.filter(pk=contest.pk).update(end_time=timezone.now() - timedelta(seconds=1))
            else:
                ContestParticipant.objects.filter(pk=participant.pk).update(exam_status="submitted")
        return result
    client = APIClient()
    client.force_authenticate(participant.user)
    with patch.object(exam_answer, "validate_exam_operation_for_view", side_effect=validation):
        response = client.post(f"/api/v1/contests/{contest.pk}/exam-answers/submit/", {"question_id": str(question.pk), "answer": {"selected": "A"}}, format="json")
    assert response.status_code == 400, response.data
    assert not ExamAnswer.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize("boundary", ["deadline", "submitted"])
def test_coding_submission_revalidates_after_lock(contest, participant, boundary):
    from apps.problems.models import CodingProblem
    from apps.submissions.models import Submission
    from apps.submissions.services import SubmissionService
    from apps.submissions.access_policy import SubmissionAccessError
    problem = CodingProblem.objects.create(slug="boundary", created_by=contest.owner)
    def race(**kwargs):
        if boundary == "deadline":
            Contest.objects.filter(pk=contest.pk).update(end_time=timezone.now() - timedelta(seconds=1))
        else:
            ContestParticipant.objects.filter(pk=participant.pk).update(exam_status="submitted")
        return None
    with patch.object(SubmissionService, "_check_keywords", side_effect=race):
        with pytest.raises(SubmissionAccessError):
            SubmissionService.create_submission(user=participant.user, data={"contest": contest, "problem": problem, "code": "x", "language": "python"})
    assert not Submission.objects.exists()


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("extension_first", [True, False])
def test_postgresql_extension_deadline_lock_order(contest, participant, extension_first):
    from apps.contests.services.exam_schedule import finalize_due_exam, update_exam_schedule
    ensure_resident_session(contest.pk)
    worker_pid = Queue()
    def extend():
        return update_exam_schedule(contest.pk, start_time=contest.start_time,
                                    end_time=contest.end_time + timedelta(hours=1), actor=contest.owner)
    def deadline():
        return finalize_due_exam(contest.pk, now=contest.end_time, expected_revision=1)
    def competing():
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            return deadline() if extension_first else extend()
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            Contest.objects.select_for_update().get(pk=contest.pk)
            extend() if extension_first else deadline()
            future = pool.submit(competing)
            pid = worker_pid.get(timeout=10)
            limit = monotonic() + 10
            while True:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s", [pid])
                    row = cursor.fetchone()
                if row and row[0] == "Lock":
                    break
                assert monotonic() < limit, "competing transaction never waited for PostgreSQL lock"
                sleep(0.02)
        result = future.result(timeout=10)
    participant.refresh_from_db()
    assert participant.exam_status == ("in_progress" if extension_first else "submitted")
    if extension_first:
        assert result == 0


@pytest.mark.django_db
@pytest.mark.parametrize("change", ["revision", "same_revision_state"])
def test_stale_sync_response_cannot_clear_latest_pending_state(contest, settings, tmp_path, change):
    import httpx
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from apps.contests.services.exam_schedule import reconcile_integrity_once, update_exam_schedule
    key = Ed25519PrivateKey.generate()
    path = tmp_path / "key"
    path.write_bytes(key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()))
    settings.INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = str(path)
    run = ensure_resident_session(contest.pk)
    def put(url, *, content, headers, timeout):
        import json
        payload = json.loads(content)
        assert headers["X-QJudge-Protocol"] == "resident-v1"
        return httpx.Response(200, request=httpx.Request("PUT", url), json={"protocol": "resident-v1", "run_id": str(run.pk), "schedule_revision": payload["schedule_revision"]})
    def health(url, **kwargs):
        if change == "revision":
            update_exam_schedule(contest.pk, start_time=contest.start_time, end_time=contest.end_time + timedelta(hours=1), actor=contest.owner)
        else:
            ExamIntegrityRun.objects.filter(pk=run.pk).update(session_state="draining", last_error="newer_state_pending")
        return httpx.Response(200, request=httpx.Request("GET", url), json={"healthy": True, "schedule_revision": 1})
    with patch("httpx.put", side_effect=put), patch("httpx.get", side_effect=health):
        result = reconcile_integrity_once(timezone.now())
    assert result["synchronized"] == 0
    run.refresh_from_db()
    assert run.health == "unhealthy"
    assert run.last_error == ("resident_session_pending_sync" if change == "revision" else "newer_state_pending")


@pytest.mark.django_db
def test_start_only_patch_preserves_newer_locked_end_and_other_fields(contest, owner):
    from apps.contests.views.contest import ContestViewSet
    from apps.contests.services.exam_schedule import update_exam_schedule
    original = ContestViewSet.get_object
    end = contest.end_time + timedelta(hours=1)
    def stale_instance(view):
        instance = original(view)
        update_exam_schedule(contest.pk, start_time=contest.start_time, end_time=end, actor=owner)
        return instance
    client = APIClient()
    client.force_authenticate(owner)
    with patch.object(ContestViewSet, "get_object", stale_instance):
        response = client.patch(f"/api/v1/contests/{contest.pk}/", {"start_time": (contest.start_time - timedelta(minutes=5)).isoformat(), "description": "kept"}, format="json")
    assert response.status_code == 200, response.data
    contest.refresh_from_db()
    assert contest.end_time == end
    assert contest.schedule_revision == 3
    assert contest.description == "kept"


@pytest.mark.django_db
def test_due_with_no_run_and_preparation_failure_still_submits(contest, participant, settings):
    from apps.contests.services.exam_schedule import reconcile_integrity_once
    settings.INTEGRITY_EXECUTION_BACKEND = "resident"
    with patch("apps.contests.services.integrity_sessions.ensure_resident_session", side_effect=RuntimeError("database preparation unavailable")):
        result = reconcile_integrity_once(contest.end_time)
    assert result["submitted"] == 1
    assert result["failed"] == 1
    assert not ExamIntegrityRun.objects.exists()
    participant.refresh_from_db()
    assert participant.exam_status == "submitted"


@pytest.mark.django_db(transaction=True)
def test_duplicate_reconciler_uses_database_ownership_and_signed_sync(contest, signing_key):
    import base64
    import json
    import httpx
    from threading import Event
    from apps.contests.services.exam_schedule import reconcile_integrity_once
    run = ensure_resident_session(contest.pk)
    entered, release = Event(), Event()
    def verify(method, url, content, headers):
        path = url.split("8011", 1)[1]
        message = f"resident-v1\n{method}\n{path}\n{run.pk}\n1\n{headers['X-QJudge-Timestamp']}\n".encode("ascii") + content
        signing_key.public_key().verify(base64.b64decode(headers["X-QJudge-Signature"]), message)
        assert not connection.in_atomic_block, "resident HTTP was inside database transaction"
    def put(url, *, content, headers, timeout):
        verify("PUT", url, content, headers)
        payload = json.loads(content)
        assert payload["session_state"] == "active"
        entered.set()
        assert release.wait(10)
        return httpx.Response(200, request=httpx.Request("PUT", url), json={"protocol": "resident-v1", "run_id": str(run.pk), "schedule_revision": 1})
    def health(url, *, headers, timeout):
        verify("GET", url, b"", headers)
        return httpx.Response(200, request=httpx.Request("GET", url), json={"healthy": True, "schedule_revision": 1})
    def first():
        close_old_connections()
        try:
            return reconcile_integrity_once(timezone.now())
        finally:
            close_old_connections()
    with patch("httpx.put", side_effect=put), patch("httpx.get", side_effect=health), ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(first)
        try:
            assert entered.wait(10)
            second = reconcile_integrity_once(timezone.now())
            assert second["skipped"] == 1
        finally:
            release.set()
        assert future.result(timeout=10)["synchronized"] == 1
    run.refresh_from_db()
    assert run.health == "healthy"
    assert run.last_error == ""


@pytest.mark.django_db
def test_runtime_state_remains_readable_after_deadline_and_does_not_leak_other_participant(contest, participant, owner):
    Contest.objects.filter(pk=contest.pk).update(end_time=timezone.now() - timedelta(seconds=1))
    ContestParticipant.objects.filter(pk=participant.pk).update(exam_status="submitted")
    client = APIClient()
    client.force_authenticate(participant.user)
    response = client.get(f"/api/v1/contests/{contest.pk}/exam/runtime-state/")
    assert response.status_code == 200
    assert response.data["exam_status"] == "submitted"
    client.force_authenticate(owner)
    assert client.get(f"/api/v1/contests/{contest.pk}/exam/runtime-state/?participant_id={participant.pk}").status_code == 404
    assert not ExamIntegrityRun.objects.exists()


@pytest.mark.django_db
def test_shortened_schedule_uses_new_deadline_without_extra_time(contest, participant, owner):
    from apps.contests.services.exam_schedule import finalize_due_exam
    run = ensure_resident_session(contest.pk)
    end = timezone.now() - timedelta(seconds=1)
    client = APIClient()
    client.force_authenticate(owner)
    response = client.patch(f"/api/v1/contests/{contest.pk}/", {"end_time": end.isoformat()}, format="json")
    assert response.status_code == 200
    run.refresh_from_db()
    assert run.scheduled_end_at == end
    assert finalize_due_exam(contest.pk, now=timezone.now(), expected_revision=2) == 1


@pytest.mark.django_db
@pytest.mark.parametrize("clear_schedule", [False, True])
def test_failed_ordinary_save_rolls_back_schedule_and_run(contest, owner, clear_schedule):
    from apps.contests.serializers import ContestCreateUpdateSerializer
    run = ensure_resident_session(contest.pk)
    client = APIClient()
    client.force_authenticate(owner)
    updates = {"status": "draft", "start_time": None, "end_time": None} if clear_schedule else {"end_time": (contest.end_time + timedelta(minutes=20)).isoformat()}
    with patch.object(ContestCreateUpdateSerializer, "update", side_effect=RuntimeError("ordinary save failed")):
        with pytest.raises(RuntimeError, match="ordinary save failed"):
            client.patch(f"/api/v1/contests/{contest.pk}/", updates, format="json")
    contest.refresh_from_db()
    run.refresh_from_db()
    assert contest.schedule_revision == run.schedule_revision == 1
    assert contest.status == "published"
    assert contest.end_time is not None
    assert contest.end_time == run.scheduled_end_at


@pytest.mark.django_db
def test_manual_end_preserves_submission_completed_before_participant_lock(contest, participant):
    from apps.contests.views import exam_lifecycle
    original = exam_lifecycle.validate_exam_operation_for_view
    def validation(*args, **kwargs):
        result = original(*args, **kwargs)
        ContestParticipant.objects.filter(pk=participant.pk).update(exam_status="submitted", submit_reason="already accepted")
        return result
    client = APIClient()
    client.force_authenticate(participant.user)
    with patch.object(exam_lifecycle, "validate_exam_operation_for_view", side_effect=validation):
        response = client.post(f"/api/v1/contests/{contest.pk}/exam/end/", {}, format="json")
    assert response.status_code == 200
    assert response.data["already_submitted"] is True
    participant.refresh_from_db()
    assert participant.submit_reason == "already accepted"


@pytest.mark.django_db(transaction=True)
def test_reconciler_releases_database_ownership_after_exception(contest):
    from apps.contests.services.exam_schedule import reconcile_integrity_once
    with patch.object(Contest.objects, "filter", side_effect=RuntimeError("scan failed")):
        with pytest.raises(RuntimeError, match="scan failed"):
            reconcile_integrity_once(timezone.now())
    def another_owner():
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_try_advisory_lock(%s)", [715090705])
                acquired = cursor.fetchone()[0]
                if acquired:
                    cursor.execute("SELECT pg_advisory_unlock(%s)", [715090705])
                return acquired
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=1) as pool:
        assert pool.submit(another_owner).result(timeout=10)


@pytest.mark.django_db
def test_patch_draft_and_clear_times_uses_complete_locked_update_context(contest, owner):
    run = ensure_resident_session(contest.pk)
    client = APIClient()
    client.force_authenticate(owner)
    response = client.patch(f"/api/v1/contests/{contest.pk}/", {
        "status": "draft", "start_time": None, "end_time": None,
        "description": "draft without schedule",
    }, format="json")
    assert response.status_code == 200, response.data
    contest.refresh_from_db()
    run.refresh_from_db()
    assert contest.status == "draft"
    assert contest.start_time is contest.end_time is None
    assert contest.description == "draft without schedule"
    assert contest.schedule_revision == run.schedule_revision == 2
    assert run.scheduled_start_at is run.scheduled_end_at is run.accept_until is None


@pytest.mark.django_db(transaction=True)
def test_recurring_command_finalizes_between_multiple_stalled_resident_requests(contest, participant):
    import json
    import httpx
    from django.core.management import call_command
    from io import StringIO
    now = timezone.now()
    Contest.objects.filter(pk=contest.pk).update(end_time=now + timedelta(seconds=1))
    ensure_resident_session(contest.pk)
    for index in range(2):
        other = Contest.objects.create(name=f"stalled-{index}", owner=contest.owner,
            status="published", contest_type="paper_exam", cheat_detection_enabled=True,
            start_time=now - timedelta(minutes=1), end_time=now + timedelta(hours=1))
        ensure_resident_session(other.pk)
    backend_clock = [now]
    states_at_request = []
    output = StringIO()
    def stalled_put(*args, **kwargs):
        # Model each slow external PUT consuming its read timeout. Keep real
        # command, database scans and finalization; only HTTP/time are controlled.
        participant.refresh_from_db()
        states_at_request.append(participant.exam_status)
        backend_clock[0] += timedelta(seconds=5)
        raise httpx.ReadTimeout("resident stalled")
    with patch("httpx.put", side_effect=stalled_put), patch("django.utils.timezone.now", side_effect=lambda: backend_clock[0]), patch(
        "apps.contests.management.commands.reconcile_integrity.time.sleep", side_effect=KeyboardInterrupt
    ):
        call_command("reconcile_integrity", interval=10, stdout=output)
    assert states_at_request == ["in_progress", "submitted", "submitted"]
    summary = json.loads(output.getvalue())
    assert summary["submitted"] == 1
    assert summary["failed"] == 3
    participant.refresh_from_db()
    assert participant.submit_reason == "Auto-submitted: scheduled exam end"
