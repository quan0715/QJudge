"""One bounded, durable observed outage handoff per Run; merge under row locks."""
from contextlib import contextmanager

from django.db import transaction
from django.utils import timezone

from apps.contests.models import Contest, ExamIntegrityRun

MAX_OBSERVED_GAPS = 10000


@contextmanager
def _run(run_id):
    with transaction.atomic():
        contest_id = ExamIntegrityRun.objects.values_list("contest_id", flat=True).get(pk=run_id)
        Contest.objects.select_for_update().get(pk=contest_id)
        run = ExamIntegrityRun.objects.select_for_update().get(pk=run_id)
        yield run


def record_outage(run_id, *, started_ms=None):
    started_ms = int(timezone.now().timestamp() * 1000) if started_ms is None else started_ms
    with _run(run_id) as run:
        if run.execution_backend != "resident" or run.data_state != "open":
            return
        prior = run.metrics.get("service_outage", {})
        generation = run.metrics.get("service_outage_generation", 0) + 1
        run.metrics = {**run.metrics, "service_outage_generation": generation,
            "service_outage": {"generation": generation,
                "started_ms": min(started_ms, prior.get("started_ms", started_ms)),
                "ended_ms": None, "reason": "platform_unavailable"}}
        run.save(update_fields=["metrics", "updated_at"])


def outage_handoff(run_id, *, ended_ms=None):
    ended_ms = int(timezone.now().timestamp() * 1000) if ended_ms is None else ended_ms
    with _run(run_id) as run:
        gap = run.metrics.get("service_outage")
        if not gap:
            return None
        if gap["ended_ms"] is None:
            gap = {**gap, "ended_ms": max(gap["started_ms"], ended_ms)}
            run.metrics = {**run.metrics, "service_outage": gap}
            run.save(update_fields=["metrics", "updated_at"])
        return gap


def acknowledge_outage(run_id, generation):
    with _run(run_id) as run:
        gap = run.metrics.get("service_outage", {})
        if gap.get("generation") == generation and gap.get("ended_ms") is not None:
            history = list(run.metrics.get("observed_service_gaps", []))
            if len(history) >= MAX_OBSERVED_GAPS:
                # Leave the current marker intact. Never forget enforcement
                # history to make an acknowledgment appear successful.
                raise ValueError("observed outage history capacity reached")
            history.append(gap)
            run.metrics = {**{key: value for key, value in run.metrics.items() if key != "service_outage"},
                           "observed_service_gaps": history}
            run.save(update_fields=["metrics", "updated_at"])


def connectivity_overlaps_observed_gap(run, command):
    """Called inside the existing command-application transaction, before effects.

    A batch signed before the observer persisted an outage may arrive afterward.
    Keep original command identity/history; audit its effect at this boundary.
    """
    if (run.execution_backend != "resident"
            or command.event_type not in {"connectivity_suspect", "connectivity_timeout"}
            or command.action not in {"record", "pause", "lock", "submit"}
            or command.metadata.get("timing_basis") != "server_receipt"):
        return False
    last = command.metadata.get("last_received_at_server_ms")
    transition = command.metadata.get("transition_at_server_ms")
    if type(last) is not int or type(transition) is not int or not 0 <= last <= transition:
        return False
    gaps = run.metrics.get("observed_service_gaps", [])
    pending = run.metrics.get("service_outage")
    if pending:
        gaps = [*gaps, pending]
    now_ms = int(timezone.now().timestamp() * 1000)
    return any(gap["started_ms"] < (gap["ended_ms"] if gap["ended_ms"] is not None else now_ms)
               and transition > gap["started_ms"] and last < (gap["ended_ms"] if gap["ended_ms"] is not None else now_ms)
               for gap in gaps)
