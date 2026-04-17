"""Celery tasks for durable AI chat runs."""

from datetime import timedelta

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.utils import timezone

from .models import AIChatRun
from .services.run_runtime import execute_run, mark_run_failed

# 30-min soft limit covers even long reasoning conversations while still
# guaranteeing a stuck celery task eventually releases the run.
_SOFT_TIME_LIMIT = 30 * 60
_HARD_TIME_LIMIT = _SOFT_TIME_LIMIT + 60

# A run that never sets started_at within this window means the celery task
# was lost (worker crash, queue misroute) and will never run on its own.
_STALE_PICKUP_GRACE = timedelta(minutes=2)


@shared_task(
    bind=True,
    ignore_result=True,
    soft_time_limit=_SOFT_TIME_LIMIT,
    time_limit=_HARD_TIME_LIMIT,
)
def execute_ai_chat_run(self, run_id: str) -> None:
    """Execute a durable AI chat run independently of frontend connections."""
    try:
        execute_run(run_id)
    except SoftTimeLimitExceeded:
        run = AIChatRun.objects.filter(pk=run_id).first()
        if run and run.status == AIChatRun.Status.RUNNING:
            mark_run_failed(run, f"Run exceeded {_SOFT_TIME_LIMIT // 60}-minute time limit")


@shared_task(ignore_result=True)
def sweep_stale_ai_runs() -> int:
    """Fail AI runs whose celery task never picked them up.

    Targets only runs that were dispatched but never reached ``execute_run``
    (``started_at IS NULL``). Running-but-slow runs are left alone — they're
    protected by the per-task soft_time_limit and the httpx read timeout.
    """
    cutoff = timezone.now() - _STALE_PICKUP_GRACE
    stale = AIChatRun.objects.filter(
        status=AIChatRun.Status.RUNNING,
        started_at__isnull=True,
        created_at__lt=cutoff,
    )
    count = 0
    for run in stale:
        mark_run_failed(run, "Worker did not pick up the task; please retry.")
        count += 1
    return count
