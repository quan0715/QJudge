"""Project normalized events using their run-scoped frozen registry."""

from apps.contests.integrity.event_policy import registry_action_is_penalty
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
    definition_id = integrity.get("definition_id")
    definition = (
        definitions.get(definition_id)
        if isinstance(definitions, dict) and isinstance(definition_id, str)
        else None
    )
    return definition if isinstance(definition, dict) else {}


def event_priority(event: ExamEvent) -> int:
    if event.event_type == "clipboard_action":
        return 2
    priority = event_definition(event).get("priority")
    return priority if isinstance(priority, int) and 0 <= priority <= 3 else 3


def event_penalized(event: ExamEvent) -> bool:
    if event.event_type == "clipboard_action":
        return False
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    integrity = metadata.get("integrity")
    if not isinstance(integrity, dict):
        return False
    return registry_action_is_penalty(
        integrity.get("phase"), integrity.get("action"), event_definition(event),
    )


def priority_category(priority: int) -> str:
    return ("critical", "violation", "info", "system")[priority]
