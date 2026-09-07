from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone

from apps.contests.tests.integrity.test_batch_gateway import (
    participant,
    running_integrity_run,
)
from apps.contests.tests.integrity.test_batch_gateway import another_participant
from apps.contests.services.anti_cheat_session import get_active_session
from apps.contests.services.exam_submission import finalize_submission
from apps.contests.tests.integrity.test_batch_gateway import (
    api_client,
    make_batch,
    worker_server,
)
import httpx
import json
import base64
from urllib.parse import urlparse


@pytest.fixture
def resident_http(worker_server, monkeypatch):
    state = {
        "received_seq": 1,
        "processed_seq": 0,
        "commands_drained": False,
        "requests": [],
    }

    def post(url, *, content, headers, timeout):
        assert urlparse(url).hostname == "integrity-resident"
        assert headers["X-QJudge-Protocol"] == "resident-v1"
        message = (
            f"resident-v1\nPOST\n{urlparse(url).path}\n{headers['X-QJudge-Run-Id']}\n"
            f"{headers['X-QJudge-Revision']}\n{headers['X-QJudge-Timestamp']}\n"
        ).encode() + content
        worker_server.private_key.public_key().verify(
            base64.b64decode(headers["X-QJudge-Signature"]), message
        )
        state["requests"].append((url, json.loads(content), headers))
        if url.endswith("/progress"):
            scope = json.loads(content)
            return httpx.Response(
                200,
                json={
                    **scope,
                    **{
                        k: state[k]
                        for k in ("received_seq", "processed_seq", "commands_drained")
                    },
                    **({"evidence_fence_version": "resident-evidence-fence-v1", "release_evidence_before_ms": state["release"]} if "release" in state else {}),
                },
                headers={"X-QJudge-Protocol": "resident-v1"},
            )
        return httpx.Response(
            200,
            json={
                "acked_through_seq": 1,
                "pending_commands": [],
                "release_evidence_before_ms": 0,
            },
            headers={"X-QJudge-Protocol": "resident-v1"},
        )

    monkeypatch.setattr(httpx, "post", post)
    return state


def scope(run, participant):
    return {
        "run_id": str(run.pk),
        "participant_id": participant.pk,
        "device_id": "device-a",
        "attempt_id": str(participant.integrity_attempt_id),
    }


def send(client, run, participant, batch=None, **extra):
    return client.post(
        f"/api/v1/contests/{run.contest_id}/exam/integrity/checkpoints/",
        {"upload_scope": scope(run, participant), "observations": batch, **extra},
        format="json",
        HTTP_X_DEVICE_ID="device-a",
    )


@pytest.mark.django_db
def test_active_fence_release_and_trusted_attempt(resident, participant, api_client, resident_http):
    api_client.force_authenticate(participant.user)
    resident_http.update(received_seq=1, processed_seq=1, release=123000)
    batch = make_batch(run_id=resident.pk, participant_id=participant.pk)
    record = batch["records"][0]
    record.update(kind="health_snapshot", event_type="health_snapshot", payload={"evidence_fence": {
        "version": "resident-evidence-fence-v1", "attempt_id": str(participant.integrity_attempt_id),
        "through_seq": 1, "before_client_ms": 123000}})
    response = send(api_client, resident, participant, batch)
    assert response.status_code == 200
    assert response.json()["release_evidence_before_ms"] == 123000
    assert resident_http["requests"][-1][1]["attempt_id"] == str(participant.integrity_attempt_id)
    assert resident_http["requests"][0][1]["attempt_id"] == str(participant.integrity_attempt_id)
    record["payload"]["evidence_fence"]["attempt_id"] = str(uuid4())
    assert send(api_client, resident, participant, batch).status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("field,value", [("version", "unknown"), ("through_seq", 2), ("before_client_ms", -1)])
def test_gateway_rejects_invalid_fence(resident, participant, api_client, resident_http, field, value):
    api_client.force_authenticate(participant.user)
    batch = make_batch(run_id=resident.pk, participant_id=participant.pk)
    record = batch["records"][0]
    fence = {"version": "resident-evidence-fence-v1", "attempt_id": str(participant.integrity_attempt_id), "through_seq": 1, "before_client_ms": 123000}
    fence[field] = value
    record.update(kind="health_snapshot", event_type="health_snapshot", payload={"evidence_fence": fence})
    assert send(api_client, resident, participant, batch).status_code == 400


@pytest.mark.django_db
def test_post_submit_replay_and_empty_poll_do_not_claim_decisions_complete(
    resident, participant, api_client, resident_http
):
    api_client.force_authenticate(participant.user)
    batch = make_batch(run_id=resident.pk, participant_id=participant.pk)
    assert send(api_client, resident, participant, batch).status_code == 200
    finalize_submission(participant, submit_reason="manual")
    response = send(api_client, resident, participant, batch, final_seq=1)
    assert response.status_code == 200
    assert response.json()["upload_status"] == "pending"
    assert resident_http["requests"][0][1] == resident_http["requests"][2][1]
    resident_http.update(processed_seq=1, commands_drained=True)
    response = send(api_client, resident, participant)
    assert response.status_code == 200
    assert response.json()["upload_status"] == "complete"
    assert resident_http["requests"][-1][0].endswith("/progress")


@pytest.mark.django_db
def test_missing_final_marker_and_wrong_device_never_complete(
    resident, participant, api_client, resident_http
):
    api_client.force_authenticate(participant.user)
    finalize_submission(participant, submit_reason="manual")
    resident_http.update(processed_seq=1, commands_drained=True)
    response = send(api_client, resident, participant)
    assert response.status_code == 200
    assert response.json()["upload_status"] == "pending"
    wrong = {**scope(resident, participant), "device_id": "device-b"}
    response = api_client.post(
        f"/api/v1/contests/{resident.contest_id}/exam/integrity/checkpoints/",
        {"upload_scope": wrong, "observations": None},
        format="json",
        HTTP_X_DEVICE_ID="device-b",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_new_post_submission_batch_is_server_marked_late(
    resident, participant, api_client, resident_http
):
    api_client.force_authenticate(participant.user)
    finalize_submission(participant, submit_reason="manual")
    response = send(
        api_client,
        resident,
        participant,
        make_batch(run_id=resident.pk, participant_id=participant.pk),
    )
    assert response.status_code == 200
    assert resident_http["requests"][0][1]["late_unverified"] is True


@pytest.fixture
def resident(running_integrity_run):
    run = running_integrity_run
    run.execution_backend = "resident"
    run.session_state = "active"
    run.accept_until = timezone.now() + timedelta(hours=1)
    run.policy_snapshot = {"device_policy": {}}
    run.save()
    return run


@pytest.mark.django_db
def test_submission_preserves_trusted_scope_but_clears_answer_session(
    resident, participant
):
    finalize_submission(
        participant, submit_reason="manual", upload_session_id="untrusted-media-id"
    )
    assert get_active_session(participant.contest_id, participant.user_id) is None
    from apps.contests.models import IntegrityUploadGrant

    grant = IntegrityUploadGrant.objects.get(participant=participant)
    assert grant.device_id == "device-a"
    assert grant.attempt_id == participant.integrity_attempt_id
    assert grant.attempt_id != "untrusted-media-id"
    assert grant.accept_until <= grant.submitted_at + timedelta(seconds=300)
    participant.refresh_from_db()
    assert participant.exam_status == "submitted"


@pytest.mark.django_db
def test_grant_rejects_wrong_scope_expiry_and_revocation(resident, participant):
    finalize_submission(participant, submit_reason="manual")
    from apps.contests.models import IntegrityUploadGrant
    from apps.contests.services.integrity_upload_grants import (
        authorize_integrity_upload,
    )

    grant = IntegrityUploadGrant.objects.get(participant=participant)
    args = dict(
        run=resident,
        participant=participant,
        device_id=grant.device_id,
        attempt_id=grant.attempt_id,
        now=grant.submitted_at,
    )
    assert authorize_integrity_upload(**args)
    assert not authorize_integrity_upload(**{**args, "device_id": "device-b"})
    assert not authorize_integrity_upload(**{**args, "attempt_id": uuid4()})
    assert not authorize_integrity_upload(**{**args, "now": grant.accept_until})
    grant.revoked_at = timezone.now()
    grant.save()
    assert not authorize_integrity_upload(**args)


@pytest.mark.django_db
def test_grant_failure_cannot_undo_submission(resident, participant, monkeypatch):
    from apps.contests.services import integrity_upload_grants

    def unavailable(*args, **kwargs):
        raise RuntimeError("grant storage unavailable")

    monkeypatch.setattr(integrity_upload_grants, "prepare_upload_grant", unavailable)
    finalize_submission(participant, submit_reason="manual")
    participant.refresh_from_db()
    assert participant.exam_status == "submitted"
    assert get_active_session(participant.contest_id, participant.user_id) is None


@pytest.mark.django_db
@pytest.mark.parametrize("new_status", ["not_started", "in_progress"])
def test_reset_rotates_attempt_and_revokes_old_upload_scope(
    resident, participant, new_status
):
    from apps.contests.services.participant_state import admin_update_participant
    from apps.contests.models import IntegrityUploadGrant

    finalize_submission(participant, submit_reason="manual")
    old_attempt = participant.integrity_attempt_id
    admin_update_participant(
        participant,
        exam_status=new_status,
        activity_user=participant.contest.owner,
        activity_details="reset",
    )
    participant.refresh_from_db()
    assert participant.integrity_attempt_id != old_attempt
    assert (
        IntegrityUploadGrant.objects.get(participant=participant).revoked_at is not None
    )


@pytest.mark.django_db
def test_shortened_then_extended_schedule_never_revives_upload_scope(
    resident, participant
):
    from apps.contests.services.exam_schedule import update_exam_schedule
    from apps.contests.models import IntegrityUploadGrant

    finalize_submission(participant, submit_reason="manual")
    short_end = timezone.now() - timedelta(seconds=301)
    update_exam_schedule(
        participant.contest_id,
        start_time=participant.contest.start_time,
        end_time=short_end,
        actor=participant.contest.owner,
    )
    grant = IntegrityUploadGrant.objects.get(participant=participant)
    assert grant.accept_until == short_end + timedelta(seconds=300)
    update_exam_schedule(
        participant.contest_id,
        start_time=participant.contest.start_time,
        end_time=timezone.now() + timedelta(hours=1),
        actor=participant.contest.owner,
    )
    grant.refresh_from_db()
    assert grant.accept_until == short_end + timedelta(seconds=300)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "change", ["scope", "body", "device", "run", "missing_session"]
)
def test_resident_rejects_identity_changes_before_http(
    resident, participant, api_client, resident_http, change
):
    from apps.contests.services.anti_cheat_session import clear_active_session

    api_client.force_authenticate(participant.user)
    batch = make_batch(run_id=resident.pk, participant_id=participant.pk)
    assert send(api_client, resident, participant, batch).status_code == 200
    before = len(resident_http["requests"])
    if change == "scope":
        participant.integrity_attempt_id = uuid4()
        participant.save()
    elif change == "body":
        batch["records"][0]["payload"] = {"changed": True}
    elif change == "device":
        batch["device_id"] = "device-b"
    elif change == "run":
        batch["run_id"] = str(uuid4())
    else:
        clear_active_session(participant.contest_id, participant.user_id)
    response = send(api_client, resident, participant, batch)
    assert response.status_code in (400, 403)
    assert len(resident_http["requests"]) == before


@pytest.mark.django_db
def test_ack_gap_keeps_evidence_even_when_contiguous_cursors_equal(
    resident, participant, api_client, resident_http
):
    api_client.force_authenticate(participant.user)
    resident_http.update(received_seq=0, processed_seq=0, commands_drained=True)
    response = send(
        api_client,
        resident,
        participant,
        make_batch(
            run_id=resident.pk, participant_id=participant.pk, first_seq=3, last_seq=3
        ),
    )
    assert response.status_code == 200
    assert response.json()["release_evidence_before_ms"] == 0


@pytest.mark.django_db
@pytest.mark.parametrize("headers", [{}, {"X-QJudge-Protocol": "unknown-v2"}])
def test_resident_ack_requires_explicit_protocol(
    resident, participant, api_client, worker_server, monkeypatch, headers
):
    api_client.force_authenticate(participant.user)
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **kw: httpx.Response(
            200,
            json={
                "acked_through_seq": 1,
                "pending_commands": [],
                "release_evidence_before_ms": 0,
            },
            headers=headers,
        ),
    )
    response = send(
        api_client,
        resident,
        participant,
        make_batch(run_id=resident.pk, participant_id=participant.pk),
    )
    assert response.status_code == 502
    assert "acked_through_seq" not in response.json()


@pytest.mark.django_db
def test_runtime_state_stays_local_during_resident_outage(
    resident, participant, api_client, monkeypatch
):
    api_client.force_authenticate(participant.user)
    finalize_submission(participant, submit_reason="manual")

    def forbidden(*args, **kwargs):
        raise AssertionError("schedule poll must not call resident")

    monkeypatch.setattr(httpx, "post", forbidden)
    response = api_client.get(
        f"/api/v1/contests/{resident.contest_id}/exam/runtime-state/",
        HTTP_X_DEVICE_ID="device-a",
    )
    assert response.status_code == 200
    assert response.json()["integrity_upload"]["upload_status"] == "pending"
    assert response.json()["session_identity"]["attempt_id"] == str(
        participant.integrity_attempt_id
    )
    assert response.json()["session_identity"]["active_device_matches"] is False


@pytest.mark.django_db
def test_final_marker_cannot_hide_admitted_records_or_change(
    resident, participant, api_client, resident_http
):
    api_client.force_authenticate(participant.user)
    assert (
        send(
            api_client,
            resident,
            participant,
            make_batch(run_id=resident.pk, participant_id=participant.pk),
        ).status_code
        == 200
    )
    finalize_submission(participant, submit_reason="manual")
    assert send(api_client, resident, participant, final_seq=0).status_code == 400
    assert send(api_client, resident, participant, final_seq=1).status_code == 200
    assert send(api_client, resident, participant, final_seq=2).status_code == 400
    assert (
        send(
            api_client,
            resident,
            participant,
            make_batch(
                run_id=resident.pk,
                participant_id=participant.pk,
                first_seq=2,
                last_seq=2,
            ),
        ).status_code
        == 400
    )


@pytest.mark.django_db
def test_database_grant_error_cannot_poison_real_end_transaction(
    resident, participant, api_client, monkeypatch
):
    from django.db import connection
    from apps.contests.models import IntegrityUploadGrant

    def fail_database(*args, **kwargs):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 / 0")

    monkeypatch.setattr(IntegrityUploadGrant.objects, "get_or_create", fail_database)
    api_client.force_authenticate(participant.user)
    response = api_client.post(
        f"/api/v1/contests/{resident.contest_id}/exam/end/",
        {},
        format="json",
        HTTP_X_DEVICE_ID="device-a",
    )
    assert response.status_code == 200
    participant.refresh_from_db()
    assert participant.exam_status == "submitted"
    assert get_active_session(participant.contest_id, participant.user_id) is None


@pytest.mark.django_db
def test_active_grant_never_reopens_answer_writes(resident, participant, api_client):
    from apps.contests.models import ExamQuestion, ExamAnswer
    from django.urls import reverse

    resident.contest.contest_type = "paper_exam"
    resident.contest.save()
    question = ExamQuestion.objects.create(
        contest=resident.contest,
        question_type="single_choice",
        prompt="Example",
        options=["A", "B"],
        correct_answer="A",
        score=5,
        order=1,
    )
    finalize_submission(participant, submit_reason="manual")
    api_client.force_authenticate(participant.user)
    url = reverse(
        "contests:contest-exam-answers-submit-answer",
        kwargs={"contest_pk": str(resident.contest_id)},
    )
    response = api_client.post(
        url,
        {"question_id": question.pk, "answer": {"selected": "A"}},
        format="json",
        HTTP_X_DEVICE_ID="device-a",
    )
    assert response.status_code == 400
    assert "not in progress" in response.json()["error"].lower()
    assert not ExamAnswer.objects.filter(participant=participant).exists()


@pytest.mark.django_db
def test_gateway_capacity_rejection_does_not_ack_or_mutate_ledger(
    resident, participant, api_client, resident_http
):
    from apps.contests.models import IntegrityBatchAdmission

    IntegrityBatchAdmission.objects.bulk_create(
        [
            IntegrityBatchAdmission(
                run=resident,
                participant=participant,
                batch_id=uuid4(),
                attempt_id=participant.integrity_attempt_id,
                device_id="device-a",
                body_sha256="a" * 64,
                first_seq=i,
                last_seq=i,
                first_received_at=timezone.now(),
            )
            for i in range(1, 10001)
        ]
    )
    api_client.force_authenticate(participant.user)
    response = send(
        api_client,
        resident,
        participant,
        make_batch(
            run_id=resident.pk,
            participant_id=participant.pk,
            first_seq=10001,
            last_seq=10001,
        ),
    )
    assert response.status_code == 400
    assert "acked_through_seq" not in response.json()
    assert resident_http["requests"] == []
    assert IntegrityBatchAdmission.objects.count() == 10000


@pytest.mark.django_db
def test_completed_grant_is_readonly_even_for_evidence_operations(
    resident, participant, api_client, resident_http
):
    api_client.force_authenticate(participant.user)
    finalize_submission(participant, submit_reason="manual")
    resident_http.update(received_seq=0, processed_seq=0, commands_drained=True)
    assert (
        send(api_client, resident, participant, final_seq=0).json()["upload_status"]
        == "complete"
    )
    response = send(
        api_client,
        resident,
        participant,
        evidence={
            "unavailable": [
                {
                    "run_id": str(resident.pk),
                    "incident_id": str(uuid4()),
                    "event_id": 123,
                    "source": "webcam",
                    "reason": "local_gap",
                }
            ]
        },
    )
    assert response.status_code == 403


@pytest.mark.django_db(transaction=True)
def test_migration_assigns_distinct_trusted_attempts_to_existing_participants(
    participant, another_participant
):
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor
    from apps.contests.models import ContestParticipant

    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    try:
        executor.migrate([("contests", "0097_resident_integrity_sessions")])
        MigrationExecutor(connection).migrate(latest)
        attempts = list(
            ContestParticipant.objects.filter(
                pk__in=[participant.pk, another_participant.pk]
            ).values_list("integrity_attempt_id", flat=True)
        )
        assert len(set(attempts)) == 2
    finally:
        MigrationExecutor(connection).migrate(latest)
