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
def update_exam_schedule(contest_id, *, start_time, end_time, actor):
    contest = Contest.objects.select_for_update().get(pk=contest_id)
    if (contest.start_time, contest.end_time) == (start_time, end_time):
        return contest
    # Reuse the ordinary editor's validation and authorization at the caller.
    from apps.contests.serializers import ContestCreateUpdateSerializer
    validator = ContestCreateUpdateSerializer(contest)
    validator.validate({"start_time": start_time, "end_time": end_time})
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
    try:
        descriptor = build_resident_descriptor(run)
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
        health_path = path + "/health"
        response = httpx.get(base_url + health_path,
                            headers=sign_resident_request(method="GET", path=health_path,
                                run_id=run.pk, revision=run.schedule_revision, body=b""), timeout=timeout)
        response.raise_for_status()
        health = response.json()
        if health.get("schedule_revision") != run.schedule_revision or health.get("healthy") is not True:
            raise ValueError("resident health unavailable")
    except Exception:
        ExamIntegrityRun.objects.filter(**guard).update(health="unhealthy", last_error="resident_sync_failed")
        raise
    return bool(ExamIntegrityRun.objects.filter(**guard).update(
        health="healthy", last_error="", last_worker_heartbeat_at=now))


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
                session_state__in=("prepared", "active", "draining")).values_list("pk", flat=True):
            try:
                result["synchronized"] += int(_sync_resident(run_id, now))
            except Exception:
                logger.warning("integrity_reconcile_sync_failed run_id=%s", run_id)
                result["failed"] += 1
        return result
    finally:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(%s)", [715090705])
