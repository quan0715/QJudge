from types import SimpleNamespace

from apps.contests.services.livekit_service import _allowed_sources


def test_allowed_sources_follow_the_frozen_webcam_setting():
    assert _allowed_sources(SimpleNamespace(policy_snapshot={"webcam_required": False})) == (
        "screen_share",
    )
    assert _allowed_sources(SimpleNamespace(policy_snapshot={"webcam_required": True})) == (
        "screen_share",
        "webcam",
    )
