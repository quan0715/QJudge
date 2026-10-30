from types import SimpleNamespace

import pytest

from apps.contests.integrity.registry import build_registry_snapshot
from apps.contests.integrity.event_policy import registry_action_is_penalty
from apps.contests.services.integrity_event_projection import (
    event_penalized,
    event_priority,
)


@pytest.mark.parametrize("action", ["record", "audit"])
def test_clipboard_is_evidence_only_in_frozen_registry(action):
    definition = build_registry_snapshot()["definitions"]["clipboard"]
    assert not registry_action_is_penalty("triggered", action, definition)


def test_historical_clipboard_projects_as_information():
    definition = build_registry_snapshot()["definitions"]["clipboard"]
    definition["priority"] = 1
    event = SimpleNamespace(
        event_type="clipboard_action",
        metadata={"source": "clipboard_detector", "content": "answer", "integrity": {
            "definition_id": "clipboard", "phase": "triggered", "action": "record",
        }},
        integrity_run=SimpleNamespace(registry_snapshot={"definitions": {"clipboard": definition}}),
    )
    assert event_priority(event) == 2
    assert not event_penalized(event)
    assert event.metadata["content"] == "answer"


def test_forbidden_actions_still_count():
    definition = build_registry_snapshot()["definitions"]["forbidden_action"]
    assert registry_action_is_penalty("triggered", "record", definition)


def test_missing_registry_definition_cannot_become_a_penalty():
    event = SimpleNamespace(
        event_type="exit_fullscreen",
        metadata={"integrity": {"definition_id": "missing", "phase": "escalated", "action": "record"}},
        integrity_run=SimpleNamespace(registry_snapshot={"definitions": {}}),
    )
    assert not event_penalized(event)


def test_malformed_historical_definition_id_is_safe():
    event = SimpleNamespace(
        event_type="exit_fullscreen",
        metadata={"integrity": {"definition_id": [], "phase": "escalated", "action": "record"}},
        integrity_run=SimpleNamespace(registry_snapshot={"definitions": {}}),
    )
    assert event_priority(event) == 3
    assert not event_penalized(event)
