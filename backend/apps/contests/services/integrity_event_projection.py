"""Project normalized events using their run-scoped frozen registry."""

from apps.contests.models import ExamEvent


def event_phase(event: ExamEvent) -> str:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    integrity = metadata.get("integrity")
    if isinstance(integrity, dict) and isinstance(integrity.get("phase"), str):
        return integrity["phase"]
    return "event"


def event_definition(event: ExamEvent) -> dict[str, object]:
    run = event.integrity_run
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    integrity = metadata.get("integrity")
    if run is None or not isinstance(integrity, dict):
        return {}
    snapshot = run.registry_snapshot if isinstance(run.registry_snapshot, dict) else {}
    definitions = snapshot.get("definitions")
    definition = (
        definitions.get(integrity.get("definition_id"))
        if isinstance(definitions, dict)
        else None
    )
    return definition if isinstance(definition, dict) else {}


def event_priority(event: ExamEvent) -> int:
    priority = event_definition(event).get("priority")
    return priority if isinstance(priority, int) and 0 <= priority <= 3 else 3


def event_penalized(event: ExamEvent) -> bool:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    integrity = metadata.get("integrity")
    if not isinstance(integrity, dict):
        return False
    phase = integrity.get("phase")
    action = integrity.get("action")
    signals = event_definition(event).get("signals")
    incident_opening = bool(
        phase == "triggered"
        and action == "record"
        and isinstance(signals, dict)
        and (signals.get("escalated") or signals.get("restored"))
    )
    return bool(
        phase in {"triggered", "escalated"}
        and action in {"record", "pause", "lock", "submit"}
        and not incident_opening
    )


def priority_category(priority: int) -> str:
    return ("critical", "violation", "info", "system")[priority]
