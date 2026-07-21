import json
from uuid import UUID

import pytest

from integrity_service.core.commands import EngineContext, FrozenDict, make_command


RUN_ID = UUID("00000000-0000-0000-0000-000000000444")
EVENT_ID = UUID("00000000-0000-0000-0000-000000000445")


@pytest.mark.parametrize("invalid", [UUID(int=0), "not-a-uuid", None])
def test_engine_context_rejects_missing_or_zero_uuid(invalid):
    with pytest.raises((TypeError, ValueError), match="run_id"):
        EngineContext(run_id=invalid)  # type: ignore[arg-type]


def test_command_recursively_freezes_json_and_returns_fresh_canonical_projection():
    nested = {"outer": ({"items": [1, {"ok": True}]},)}
    command = make_command(
        context=EngineContext(RUN_ID),
        kind="record_event",
        participant_id=101,
        device_id="device-1",
        incident_id=None,
        event_id=EVENT_ID,
        phase="triggered",
        event_type="test_event",
        action="record",
        client_occurred_at_ms=1,
        received_at_server_ms=2,
        evidence=nested,
        metadata={"value": ["original"]},
    )

    nested["outer"][0]["items"][1]["ok"] = False
    with pytest.raises(TypeError):
        command.evidence["outer"][0]["items"][1]["ok"] = False  # type: ignore[index]

    projection = command.to_json()
    assert projection["command_id"] == "722f531d-65bd-5c83-9986-835c374c67ee"
    assert projection["run_id"] == str(RUN_ID)
    assert projection["evidence"] == {"outer": [{"items": [1, {"ok": True}]}]}
    assert json.loads(json.dumps(projection, allow_nan=False)) == projection

    projection["evidence"]["outer"][0]["items"][1]["ok"] = False
    assert command.to_json()["evidence"]["outer"][0]["items"][1]["ok"] is True


def test_command_refreezes_prebuilt_mapping_without_retaining_constructor_input():
    source = {"nested": {"value": "original"}}
    prebuilt = FrozenDict(source)
    command = make_command(
        context=EngineContext(RUN_ID),
        kind="record_event",
        participant_id=101,
        device_id="device-1",
        incident_id=None,
        event_id=EVENT_ID,
        phase="triggered",
        event_type="test_event",
        action="audit",
        client_occurred_at_ms=1,
        received_at_server_ms=2,
        evidence=prebuilt,
    )

    source["nested"]["value"] = "mutated"

    assert command.to_json()["evidence"] == {"nested": {"value": "original"}}


@pytest.mark.parametrize(
    "invalid",
    [
        {"bad": {1, 2}},
        {"bad": object()},
        {1: "non-string-key"},
        {"bad": float("nan")},
        {"bad": float("inf")},
        {"bad": float("-inf")},
        ({"nested": object()},),
    ],
)
def test_command_rejects_every_non_json_or_non_finite_nested_value(invalid):
    with pytest.raises((TypeError, ValueError), match="JSON|finite|string"):
        make_command(
            context=EngineContext(RUN_ID),
            kind="record_event",
            participant_id=101,
            device_id="device-1",
            incident_id=None,
            event_id=EVENT_ID,
            phase="triggered",
            event_type="test_event",
            action="audit",
            client_occurred_at_ms=1,
            received_at_server_ms=2,
            metadata={"container": invalid},
        )
