from types import SimpleNamespace

import pytest

from apps.contests.services.anticheat_config import build_runtime_integrity_policy
from apps.contests.services.integrity_evidence import _enabled_sources


@pytest.mark.parametrize("state", ["prepared", "active", "draining"])
def test_disabling_webcam_overrides_a_live_run_without_changing_its_snapshot(state):
    run = SimpleNamespace(session_state=state, policy_snapshot={"webcam_required": True, "evidence": {"chunk_ms": 5000}})
    policy = build_runtime_integrity_policy(SimpleNamespace(webcam_required=False), run)
    assert policy["webcam_required"] is False
    assert policy["evidence"] == run.policy_snapshot["evidence"]
    assert run.policy_snapshot["webcam_required"] is True


def test_enabling_webcam_does_not_add_a_requirement_to_an_existing_run():
    run = SimpleNamespace(session_state="active", policy_snapshot={"webcam_required": False})
    assert build_runtime_integrity_policy(SimpleNamespace(webcam_required=True), run)["webcam_required"] is False


def test_enabled_webcam_remains_required():
    run = SimpleNamespace(session_state="active", policy_snapshot={"webcam_required": True})
    assert build_runtime_integrity_policy(SimpleNamespace(webcam_required=True), run)["webcam_required"] is True


@pytest.mark.parametrize("state", ["archived", "closed"])
def test_historical_evidence_keeps_its_original_policy(state):
    run = SimpleNamespace(session_state=state, policy_snapshot={"webcam_required": True})
    assert build_runtime_integrity_policy(SimpleNamespace(webcam_required=False), run)["webcam_required"] is True


def test_live_evidence_does_not_request_disabled_webcam():
    run = SimpleNamespace(contest=SimpleNamespace(webcam_required=False), session_state="active", policy_snapshot={"webcam_required": True})
    assert _enabled_sources(run) == frozenset({"screen_share"})
