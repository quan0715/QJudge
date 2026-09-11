"""Platform service status probes for the operator-facing panel.

Deliberately shallow: each probe answers "is this reachable right now", not
"is it correct". Probes are independent and individually time-boxed so one
dead dependency cannot stall the whole report.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from typing import Callable

import httpx
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone

PROBE_TIMEOUT_SECONDS = 2.0
# A resident that stopped checking in is not "down" -- it may simply have no
# active exam. Report the age and let the operator judge.
HEARTBEAT_STALE_AFTER_SECONDS = 120


@dataclass(frozen=True)
class ComponentStatus:
    id: str
    status: str  # "up" | "down" | "unknown"
    detail: str
    latency_ms: int | None


def _timed(probe_id: str, probe: Callable[[], str]) -> ComponentStatus:
    started = time.monotonic()
    try:
        detail = probe()
        status = "up"
    except Exception as exc:  # noqa: BLE001 - any failure is a down report
        detail = f"{type(exc).__name__}: {exc}"[:200]
        status = "down"
    return ComponentStatus(
        id=probe_id,
        status=status,
        detail=detail,
        latency_ms=int((time.monotonic() - started) * 1000),
    )


def _probe_database() -> str:
    connection.ensure_connection()
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return connection.settings_dict.get("NAME", "")


def _probe_cache() -> str:
    key = "qjudge:service-status:probe"
    cache.set(key, "1", 10)
    if cache.get(key) != "1":
        raise RuntimeError("cache write did not read back")
    return "read/write ok"


def _probe_http(url: str) -> str:
    response = httpx.get(url, timeout=PROBE_TIMEOUT_SECONDS)
    response.raise_for_status()
    return f"HTTP {response.status_code}"


def _probe_celery() -> str:
    from config.celery import app  # local import keeps module import cheap

    replies = app.control.ping(timeout=PROBE_TIMEOUT_SECONDS)
    if not replies:
        raise RuntimeError("no worker replied to ping")
    workers = sorted(name for reply in replies for name in reply)
    return f"{len(workers)} worker(s): {', '.join(workers)}"[:200]


def collect_component_statuses() -> list[ComponentStatus]:
    ai_url = str(settings.AI_SERVICE_URL).rstrip("/")
    resident_url = str(settings.INTEGRITY_RESIDENT_URL).rstrip("/")
    return [
        _timed("database", _probe_database),
        _timed("cache", _probe_cache),
        _timed("celery", _probe_celery),
        _timed("ai_service", lambda: _probe_http(f"{ai_url}/health/ready")),
        _timed("integrity_resident", lambda: _probe_http(f"{resident_url}/ready")),
    ]


def collect_integrity_run_summary() -> dict:
    """Aggregate integrity runs so a stuck worker is visible without SQL."""
    from apps.contests.models import ExamIntegrityRun

    now = timezone.now()
    live_states = ("prepared", "active", "draining")
    live = ExamIntegrityRun.objects.filter(session_state__in=live_states)

    stale_cutoff = now - timezone.timedelta(seconds=HEARTBEAT_STALE_AFTER_SECONDS)
    unhealthy = list(
        ExamIntegrityRun.objects.filter(health="unhealthy")
        .order_by("-updated_at")
        .values("id", "contest_id", "session_state", "data_state", "last_error",
                "worker_version", "last_worker_heartbeat_at", "updated_at")[:20]
    )

    return {
        "live_run_count": live.count(),
        "unhealthy_run_count": ExamIntegrityRun.objects.filter(health="unhealthy").count(),
        "stale_heartbeat_count": live.filter(
            last_worker_heartbeat_at__lt=stale_cutoff
        ).count(),
        "never_reported_count": live.filter(last_worker_heartbeat_at__isnull=True).count(),
        "heartbeat_stale_after_seconds": HEARTBEAT_STALE_AFTER_SECONDS,
        "unhealthy_runs": [
            {
                **run,
                "id": str(run["id"]),
                "contest_id": str(run["contest_id"]),
                "last_worker_heartbeat_at": (
                    run["last_worker_heartbeat_at"].isoformat()
                    if run["last_worker_heartbeat_at"] else None
                ),
                "updated_at": run["updated_at"].isoformat(),
            }
            for run in unhealthy
        ],
    }


def build_service_status_report() -> dict:
    components = collect_component_statuses()
    return {
        "generated_at": timezone.now().isoformat(),
        "components": [asdict(component) for component in components],
        "integrity": collect_integrity_run_summary(),
    }
