import pytest

from apps.contests.services.integrity_commands import _default_event_action, IntegrityCommandRejected
from apps.contests.integrity.registry import build_registry_snapshot, registry_action_is_penalty


@pytest.mark.parametrize("definition_id, phase, delayed, action, penalized", [
    ("clipboard", "triggered", False, "record", False),
    ("forbidden_action", "triggered", False, "record", True),
    ("exam_entered", "triggered", False, "record", False),
    ("fullscreen_integrity", "triggered", False, "record", False),
    ("fullscreen_integrity", "escalated", False, "record", True),
    ("fullscreen_integrity", "restored", False, "audit", False),
    ("webcam", "triggered", False, "record", False),
    ("webcam", "escalated", False, "pause", True),
    ("webcam", "escalated", True, "audit", False),
    ("listener_integrity", "triggered", False, "pause", True),
])
def test_event_policy_contract(definition_id, phase, delayed, action, penalized):
    definition = build_registry_snapshot()["definitions"][definition_id]
    actual = _default_event_action(definition, phase, delayed_delivery=delayed)
    assert actual == action
    assert registry_action_is_penalty(phase, actual, definition) is penalized


@pytest.mark.parametrize("definition", [{}, {"action": "unknown", "signals": {}}, {"action": "record", "signals": []}])
def test_invalid_registry_has_no_default_action(definition):
    with pytest.raises(IntegrityCommandRejected, match="invalid_frozen_registry"):
        _default_event_action(definition, "triggered", delayed_delivery=False)
