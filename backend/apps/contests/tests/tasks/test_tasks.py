"""Regression tests for the Integrity Worker authority cutover."""

from django.conf import settings


def test_contest_periodic_tasks_are_retired():
    retired = {
        "apps.contests.tasks.check_contest_end",
        "apps.contests.tasks.check_force_submit_locked",
        "apps.contests.tasks.check_heartbeat_timeout",
    }
    configured = {
        item["task"] for item in settings.CELERY_BEAT_SCHEDULE.values()
    }

    assert configured.isdisjoint(retired)
    assert "sweep-stale-ai-runs-every-60-seconds" in settings.CELERY_BEAT_SCHEDULE


def test_legacy_contest_task_symbols_are_gone():
    from apps.contests import tasks

    retired_symbols = {
        "check_contest_end",
        "auto_submit_participants",
        "check_force_submit_locked",
        "force_submit_locked_participant",
        "check_heartbeat_timeout",
    }

    assert retired_symbols.isdisjoint(vars(tasks))
