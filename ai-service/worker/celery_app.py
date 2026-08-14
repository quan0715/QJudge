"""Celery application owned exclusively by AI Service."""

from celery import Celery

from config import get_settings

settings = get_settings()

celery_app = Celery("qjudge_ai", include=["worker.tasks"])
celery_app.conf.update(
    broker_url=settings.ai_redis_url,
    result_backend=None,
    task_default_queue=settings.ai_queue_name,
    task_routes={"ai.*": {"queue": settings.ai_queue_name}},
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_transport_options={
        "global_keyprefix": settings.ai_queue_key_prefix
    },
    beat_schedule={
        "recover-stale-ai-runs": {
            "task": "ai.recover_stale_runs",
            "schedule": settings.stale_run_scan_seconds,
        },
        "dispatch-unblocked-ai-sessions": {
            "task": "ai.dispatch_unblocked_sessions",
            "schedule": settings.queue_reconcile_seconds,
        },
    },
)
