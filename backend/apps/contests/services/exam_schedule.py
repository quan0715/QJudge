"""Database schedule authority. Remote delivery never belongs to an exam write."""
from datetime import timedelta
import json
import logging

import httpx

from django.conf import settings
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun, ExamStatus
from apps.contests.services.exam_submission import finalize_submission


ACTIVE_STATUSES = (ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED)
logger = logging.getLogger(__name__)


def lock_exam_runs(contest_id):
    """Caller owns Contest; evaluate before taking any Participant row lock."""
    return list(ExamIntegrityRun.objects.select_for_update().filter(
        contest_id=contest_id, session_state__in=("prepared", "active", "draining")
    ).order_by("id"))


@transaction.atomic
def update_exam_schedule(contest_id, *, start_time, end_time, actor, pending_updates=None):
    contest = Contest.objects.select_for_update().get(pk=contest_id)
    if (contest.start_time, contest.end_time) == (start_time, end_time):
        return contest
    # Reuse the ordinary editor's validation and authorization at the caller.
    from apps.contests.serializers import ContestCreateUpdateSerializer
    validator = ContestCreateUpdateSerializer(contest)
    # A combined PATCH may unpublish and clear dates in the same transaction.
    # Validate its complete pending context, not only the persisted status.
    validator.validate({**(pending_updates or {}), "start_time": start_time, "end_time": end_time})
    runs = lock_exam_runs(contest.pk)
    contest.start_time, contest.end_time = start_time, end_time
    contest.schedule_revision += 1
    contest.save(update_fields=["start_time", "end_time", "schedule_revision", "updated_at"])
    now = timezone.now()
    for run in runs:
        run.schedule_revision = contest.schedule_revision
        run.scheduled_start_at, run.scheduled_end_at = start_time, end_time
        run.accept_until = end_time + timedelta(seconds=settings.INTEGRITY_ACCEPT_GRACE_SECONDS) if end_time else None
        fields = ["schedule_revision", "scheduled_start_at", "scheduled_end_at", "accept_until", "updated_at"]
        if run.execution_backend == "resident":
            run.health, run.last_error = "unhealthy", "resident_session_pending_sync"
            if end_time and end_time > now and run.session_state == "draining":
                run.session_state = "active" if start_time <= now else "prepared"
            fields += ["health", "last_error", "session_state"]
        run.save(update_fields=fields)
        if run.execution_backend == "resident" and run.accept_until is not None:
            from apps.contests.models import IntegrityUploadGrant
            # A shortened schedule permanently narrows existing grants. A later
            # extension cannot resurrect an expired/revoked/completed scope.
            IntegrityUploadGrant.objects.filter(run=run, accept_until__gt=run.accept_until).update(accept_until=run.accept_until)
    return contest


@transaction.atomic
def finalize_due_exam(contest_id, *, now, expected_revision=None):
    contest = Contest.objects.select_for_update().get(pk=contest_id)
    if expected_revision is not None and expected_revision != contest.schedule_revision:
        return 0
    if contest.status != "published" or contest.end_time is None or now < contest.end_time:
        return 0
    runs = lock_exam_runs(contest.pk)
    submitted = 0
    for participant in ContestParticipant.objects.select_for_update(of=("self",)).select_related("user").filter(
        contest=contest, exam_status__in=ACTIVE_STATUSES
    ).order_by("id"):
        participant.contest = contest
        finalize_submission(participant, submit_reason="Auto-submitted: scheduled exam end",
                            activity_user=participant.user, activity_action_type="auto_submit",
                            activity_details="Auto-submitted: scheduled exam end")
        submitted += 1
    for run in runs:
        if run.execution_backend == "resident" and run.session_state != "draining":
            run.session_state = "draining"
            run.save(update_fields=["session_state", "updated_at"])
    return submitted


def _sync_resident(run_id, now):
    from apps.contests.infrastructure.integrity_worker_client import sign_resident_request
    from apps.contests.services.integrity_commands import build_resident_descriptor
    from apps.contests.services.integrity_availability import record_outage, outage_handoff, acknowledge_outage

    contest_id = ExamIntegrityRun.objects.values_list("contest_id", flat=True).get(pk=run_id)
    with transaction.atomic():
        Contest.objects.select_for_update().get(pk=contest_id)
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        if run.session_state not in ("prepared", "active", "draining") or run.data_state != "open":
            return False
        if run.session_state == "prepared" and run.scheduled_start_at <= now < run.scheduled_end_at:
            run.session_state = "active"
            run.save(update_fields=["session_state", "updated_at"])
        # The state and updated_at guard also excludes slow responses for an
        # older same-revision activation/drain, including heartbeat changes.
        guard = {"pk": run.pk, "schedule_revision": run.schedule_revision,
                 "session_state": run.session_state, "updated_at": run.updated_at}
    gap = outage_handoff(run_id)
    if gap:
        guard["updated_at"] = ExamIntegrityRun.objects.values_list("updated_at", flat=True).get(pk=run_id)
    started_ms = int(timezone.now().timestamp() * 1000)
    try:
        descriptor = build_resident_descriptor(run)
        if gap:
            descriptor["service_gap"] = gap
        path = f"/v1/runs/{run.id}"
        body = json.dumps(descriptor, separators=(",", ":")).encode("utf-8")
        headers = sign_resident_request(method="PUT", path=path, run_id=run.id,
                                        revision=run.schedule_revision, body=body)
        headers["Content-Type"] = "application/json"
        base_url = settings.INTEGRITY_RESIDENT_URL.rstrip("/")
        timeout = httpx.Timeout(5.0, connect=2.0)
        response = httpx.put(base_url + path, content=body, headers=headers, timeout=timeout)
        response.raise_for_status()
        if response.json() != {"protocol": "resident-v1", "run_id": str(run.pk), "schedule_revision": run.schedule_revision}:
            raise ValueError("resident sync scope conflict")
        if gap and response.headers.get("X-QJudge-Gap-Generation") != str(gap["generation"]):
            raise ValueError("resident gap handoff not acknowledged")
        health_path = path + "/health"
        try:
            response = httpx.get(base_url + health_path,
                                headers=sign_resident_request(method="GET", path=health_path,
                                    run_id=run.pk, revision=run.schedule_revision, body=b""), timeout=timeout)
            # Only a scoped resident maintenance projection may use HTTP 503.
            # Gateway errors must retain HTTPStatusError classification instead
            # of becoming JSON/scope errors that bypass observed outage history.
            if response.status_code != 503:
                response.raise_for_status()
            try:
                health = response.json()
            except ValueError:
                response.raise_for_status()
                raise
            if response.status_code == 503 and not (
                    isinstance(health, dict)
                    and type(health.get("schedule_revision")) is int
                    and health["schedule_revision"] == run.schedule_revision
                    and health.get("healthy") is False
                    and type(health.get("accepting")) is bool
                    and isinstance(health.get("warnings"), list)
                    and isinstance(health.get("maintenance_errors"), dict)
                    and isinstance(health.get("service_gaps"), dict)):
                response.raise_for_status()
            if health.get("schedule_revision") != run.schedule_revision:
                raise ValueError("resident health scope conflict")
            synchronized = _persist_resident_health(guard, health, now)
        finally:
            # Archive failure may itself make health 503. Still retry the archive
            # lane; health is not authorization, and backend CAS rechecks time.
            if run.session_state == "draining" and run.accept_until and run.accept_until <= timezone.now():
                finalize_path = path + "/control/finalize"
                finalize_body = json.dumps({"expected_revision": run.schedule_revision}, separators=(",", ":")).encode()
                result = httpx.post(base_url + finalize_path, content=finalize_body,
                    headers={**sign_resident_request(method="POST", path=finalize_path, run_id=run.pk,
                        revision=run.schedule_revision, body=finalize_body), "Content-Type": "application/json"}, timeout=timeout)
                if result.status_code not in (202, 409, 503):
                    result.raise_for_status()
                if result.status_code == 202 and result.json() != {"protocol": "resident-v1", "run_id": str(run.pk),
                        "schedule_revision": run.schedule_revision, "accepted": True}:
                    raise ValueError("resident finalize scope conflict")
        if gap:
            acknowledge_outage(run_id, gap["generation"])
        if health.get("healthy") is not True:
            raise ValueError("resident health unavailable")
    except Exception as error:
        ExamIntegrityRun.objects.filter(**guard).update(health="unhealthy", last_error="resident_sync_failed")
        if isinstance(error, httpx.TransportError) or (isinstance(error, httpx.HTTPStatusError)
                and error.response.status_code in {404, 429, 502, 503, 504, 507}):
            record_outage(run_id, started_ms=started_ms)
        raise
    return synchronized


def _persist_resident_health(guard, health, now):
    # Merge only the health projection while locked; never replace concurrently
    # created candidate/outage metadata with the pre-HTTP JSON snapshot.
    with transaction.atomic():
        run = ExamIntegrityRun.objects.select_for_update().filter(**guard).first()
        if run is None:
            return False
        gaps = health.get("service_gaps")
        if gaps is not None:
            if (type(gaps) is not dict or set(gaps) != {"count", "last_ended_ms", "suppressed_connectivity_commands", "affected_participant_count"}
                    or any(type(gaps[k]) is not int or gaps[k] < 0 for k in ("count", "suppressed_connectivity_commands", "affected_participant_count"))
                    or (gaps["last_ended_ms"] is not None and (type(gaps["last_ended_ms"]) is not int or gaps["last_ended_ms"] < 0))):
                raise ValueError("invalid service gap health")
            run.metrics = {**run.metrics, "service_gaps": gaps}
        run.health = "healthy" if health.get("healthy") is True else "unhealthy"
        run.last_error = "" if run.health == "healthy" else "resident_maintenance_failed"
        run.last_worker_heartbeat_at = now
        run.save(update_fields=["metrics", "health", "last_error", "last_worker_heartbeat_at", "updated_at"])
        return True


def reconcile_integrity_once(now):
    """Single owner across processes, with no row locks held during HTTP.

    Unchanged legacy schedules retain the existing worker lifecycle. Revised
    legacy exams get a backend fallback because their original end command is
    now terminally ignored. Existing resident ownership survives switch rollback.
    """
    from apps.contests.services.integrity_sessions import ensure_resident_session
    result = {"prepared": 0, "synchronized": 0, "failed": 0, "submitted": 0, "skipped": 0}
    # Session advisory lock spans remote work without a database transaction;
    # a crashed process releases ownership with its database connection.
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [715090705])
        acquired = cursor.fetchone()[0]
    if not acquired:
        result["skipped"] = 1
        return result
    try:
        ownership = Q(
            integrity_runs__execution_backend="resident",
            integrity_runs__session_state__in=("prepared", "active", "draining"),
        ) | Q(
            integrity_runs__execution_backend="legacy", schedule_revision__gt=1,
            integrity_runs__session_state__in=("prepared", "active", "draining"))
        if settings.INTEGRITY_EXECUTION_BACKEND == "resident":
            # The default only chooses new ownership. Even archived legacy
            # reserves its slot until explicitly destroyed, as preparation does.
            legacy_owners = ExamIntegrityRun.objects.filter(
                execution_backend="legacy", session_state__in=("prepared", "active", "draining", "archived")
            ).values("contest_id")
            ownership |= Q(cheat_detection_enabled=True, contest_type__in=("coding", "paper_exam")) & ~Q(pk__in=legacy_owners)
        ids = list(Contest.objects.filter(ownership, status="published").distinct().values_list("pk", flat=True))
        for contest_id in ids:
            # Deadline authority must work even if preparation fails or no
            # student has ever sent an Integrity checkpoint.
            try:
                result["submitted"] += finalize_due_exam(contest_id, now=now)
                if settings.INTEGRITY_EXECUTION_BACKEND == "resident":
                    before = ExamIntegrityRun.objects.filter(contest_id=contest_id).count()
                    ensure_resident_session(contest_id)
                    result["prepared"] += int(ExamIntegrityRun.objects.filter(contest_id=contest_id).count() > before)
            except Exception:
                logger.error("integrity_reconcile_database_failed contest_id=%s", contest_id)
                result["failed"] += 1
        for run_id in ExamIntegrityRun.objects.filter(execution_backend="resident", data_state="open",
                session_state__in=("prepared", "active", "draining")).order_by("id").values_list("pk", flat=True):
            try:
                result["synchronized"] += int(_sync_resident(run_id, now))
            except Exception:
                logger.warning("integrity_reconcile_sync_failed run_id=%s", run_id)
                result["failed"] += 1
            finally:
                # Each bounded PUT/health unit yields to current deadlines,
                # including on timeout. A long fair sweep must not postpone
                # idle students' submission until every remote Run completes.
                _finalize_intervening_deadlines(ownership, result)
        return result
    finally:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(%s)", [715090705])


def _finalize_intervening_deadlines(ownership, result):
    now = timezone.now()
    due_ids = Contest.objects.filter(ownership, status="published", end_time__lte=now).distinct().values_list("pk", flat=True)
    for contest_id in due_ids:
        try:
            result["submitted"] += finalize_due_exam(contest_id, now=now)
        except Exception:
            logger.error("integrity_reconcile_deadline_failed contest_id=%s", contest_id)
            result["failed"] += 1
