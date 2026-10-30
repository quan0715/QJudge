from types import SimpleNamespace

import pytest

from apps.contests.services.integrity_commands import _policy_suppression_reason


@pytest.mark.parametrize("frozen, current, definition, expected", [
    (True, False, "webcam", "webcam_not_required"),
    (False, True, "webcam", "webcam_not_required"),
    (False, False, "webcam", "webcam_not_required"),
    (True, True, "webcam", None),
    (False, False, "screen_share", None),
])
def test_webcam_penalties_require_both_frozen_and_current_requirement(frozen, current, definition, expected):
    run = SimpleNamespace(policy_snapshot={"webcam_required": frozen}, contest=SimpleNamespace(webcam_required=current))
    assert _policy_suppression_reason(run, definition) == expected
