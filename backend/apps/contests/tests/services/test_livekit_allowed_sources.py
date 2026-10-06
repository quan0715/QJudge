from types import SimpleNamespace

from apps.contests.services.livekit_service import _allowed_sources


def test_allowed_sources_follow_the_frozen_webcam_setting():
    contest = SimpleNamespace(webcam_required=True)
    assert _allowed_sources(SimpleNamespace(contest=contest, session_state="active", policy_snapshot={"webcam_required": False})) == (
        "screen_share",
    )
    assert _allowed_sources(SimpleNamespace(contest=contest, session_state="active", policy_snapshot={"webcam_required": True})) == (
        "screen_share",
        "webcam",
    )


def test_disabled_webcam_is_not_an_allowed_live_source():
    run = SimpleNamespace(contest=SimpleNamespace(webcam_required=False), session_state="active", policy_snapshot={"webcam_required": True})
    assert _allowed_sources(run) == ("screen_share",)
