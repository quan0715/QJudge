"""Database-only session preparation; remote synchronization belongs to reconciliation."""
import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.contests.integrity.registry import REGISTRY_VERSION, build_registry_snapshot
from apps.contests.models import Contest, ExamIntegrityRun
from apps.contests.services.anticheat_config import build_integrity_policy_snapshot

logger = logging.getLogger(__name__)
LIVE_SESSION_STATES = ("prepared", "active", "draining")


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
