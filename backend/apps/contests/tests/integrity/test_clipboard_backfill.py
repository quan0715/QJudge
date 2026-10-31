from importlib import import_module
from types import SimpleNamespace

import pytest

from apps.contests.integrity.registry import build_registry_snapshot


migration = import_module("apps.contests.migrations.0016_correct_clipboard_violation_counts")


@pytest.mark.parametrize("overrides, delayed, expected", [
    ({}, False, True),
    ({"action": "audit"}, False, False),
    ({"phase": "restored"}, False, False),
    ({"counted_as_violation": False}, False, False),
    ({}, True, False),
])
def test_only_previously_counted_clipboard_events_are_deducted(overrides, delayed, expected):
    event = SimpleNamespace(
        metadata={"integrity": {
            "definition_id": "clipboard", "phase": "triggered", "action": "record", **overrides,
        }},
        delayed_delivery=delayed,
        integrity_run=SimpleNamespace(registry_snapshot=build_registry_snapshot()),
    )
    assert migration.was_counted(event) is expected


@pytest.mark.parametrize("changes", [
    {"priority": 3},
    {"signals": {"triggered": "clipboard_action", "restored": "restored"}},
])
def test_backfill_respects_historical_registry(changes):
    snapshot = build_registry_snapshot()
    snapshot["definitions"]["clipboard"].update(changes)
    event = SimpleNamespace(
        metadata={"integrity": {
            "definition_id": "clipboard", "phase": "triggered", "action": "record",
        }},
        delayed_delivery=False,
        integrity_run=SimpleNamespace(registry_snapshot=snapshot),
    )
    assert not migration.was_counted(event)
