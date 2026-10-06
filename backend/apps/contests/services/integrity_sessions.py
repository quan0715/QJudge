"""Database-only session preparation; remote synchronization belongs to reconciliation."""
import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.contests.integrity.registry import REGISTRY_VERSION, build_registry_snapshot
from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.services.anticheat_config import build_integrity_policy_snapshot

logger = logging.getLogger(__name__)
LIVE_SESSION_STATES = ("prepared", "active", "draining")
STARTED_SESSION_STATES = ("active", "draining")


class WebcamRequirementLocked(APIException):
    """A started exam cannot newly require students to turn on a webcam."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "webcam_required_locked"
    default_detail = "考試已開始，無法再要求學生開啟 webcam。考試中只能關閉 webcam；若要開啟，請在考試開始前設定。"


def ensure_webcam_can_be_required(contest: Contest) -> None:
    """Reject turning webcam on once the exam is underway; turning it off is allowed.

    A run stays prepared until the reconciler's next sweep after the start time,
    so a passed start time counts as started for a prepared run too.
    """
    if contest.webcam_required:
        return
    started_states = list(STARTED_SESSION_STATES)
    if contest.start_time and contest.start_time <= timezone.now():
        started_states.append("prepared")
    if ExamIntegrityRun.objects.filter(contest=contest, session_state__in=started_states).exists():
        raise WebcamRequirementLocked()


def build_runtime_integrity_policy(contest: Contest, run: ExamIntegrityRun) -> dict:
    """Let a teacher turn webcam off for a live run without rewriting its snapshot.

    The integrity resident treats the snapshot as immutable, so the change is
    applied only to what the browser receives. Evidence retention keeps using
    the frozen snapshot, so webcam evidence recorded before the change is kept.
    """
    policy = dict(run.policy_snapshot)
    if run.session_state in LIVE_SESSION_STATES:
        policy["webcam_required"] = policy.get("webcam_required") is True and contest.webcam_required
    return policy


def ensure_resident_session(contest_id, *, actor_id=None) -> ExamIntegrityRun | None:
    """Prepare an eligible exam, reusing any existing live session.

    This is also the repair entrypoint for the future periodic reconciler. It
    deliberately has no remote dependency or after-commit delivery requirement.
    """
    with transaction.atomic():
        contest = Contest.objects.select_for_update().get(pk=contest_id)
        existing = ExamIntegrityRun.objects.filter(
            contest=contest, session_state__in=LIVE_SESSION_STATES
        ).first()
        if existing is not None:
            return existing
        if not (
            contest.cheat_detection_enabled
            and contest.status == "published"
            and contest.contest_type in ("coding", "paper_exam")
            and contest.start_time and contest.end_time
            and contest.start_time < contest.end_time
            and contest.end_time > timezone.now()
        ):
            return None
        return ExamIntegrityRun.objects.create(
            contest=contest,
            created_by_id=actor_id,
            session_state="prepared",
            health=ExamIntegrityRun.Health.UNHEALTHY,
            last_error="resident_session_pending_sync",
            schedule_revision=contest.schedule_revision,
            scheduled_start_at=contest.start_time,
            scheduled_end_at=contest.end_time,
            accept_until=contest.end_time + timedelta(seconds=settings.INTEGRITY_ACCEPT_GRACE_SECONDS),
            policy_snapshot=build_integrity_policy_snapshot(contest),
            registry_snapshot=build_registry_snapshot(),
            registry_version=REGISTRY_VERSION,
        )


def apply_webcam_setting_to_prepared_run(contest_id) -> None:
    """Carry a changed webcam requirement into a run that has not started.

    The run is frozen when the contest is published, before anyone sits it, so
    a teacher's later change would otherwise never reach it. Started runs keep
    the value they began with.
    """
    with transaction.atomic():
        contest = Contest.objects.select_for_update().get(pk=contest_id)
        for run in ExamIntegrityRun.objects.select_for_update().filter(
            contest=contest, session_state="prepared"
        ):
            if run.policy_snapshot.get("webcam_required") == contest.webcam_required:
                continue
            run.policy_snapshot = {**run.policy_snapshot, "webcam_required": contest.webcam_required}
            run.save(update_fields=["policy_snapshot", "updated_at"])


def prepare_integrity_session(contest_id, *, actor_id=None) -> ExamIntegrityRun | None:
    """Fail open at exam writes, leaving a visible log for missing preparation.

    An inner savepoint allows the exam transaction to commit after a preparation
    database error. The published contest remains discoverable for reconciliation.
    Never report prepared or healthy when this operation fails.
    """
    try:
        with transaction.atomic():
            return ensure_resident_session(contest_id, actor_id=actor_id)
    except Exception:
        # Do not interpolate raw DB exceptions or snapshot data into logs.
        logger.error("integrity_session_preparation_missing contest_id=%s", contest_id)
        return None
