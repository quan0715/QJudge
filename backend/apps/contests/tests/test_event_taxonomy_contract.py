from __future__ import annotations

import pytest
from django.urls import Resolver404, resolve

from apps.contests.models import ContestActivity, ExamEvent


def _choice_values(choices: list[tuple[str, str]]) -> set[str]:
    return {value for value, _label in choices}


def test_exam_event_choices_cover_server_created_events() -> None:
    choices = _choice_values(ExamEvent.EVENT_TYPE_CHOICES)

    assert {
        "manual_proctor_note",
        "other_devices_logged_out",
        "end_exam_device_mismatch",
    } <= choices


def test_contest_activity_choices_cover_server_logged_actions() -> None:
    choices = _choice_values(ContestActivity.ACTION_TYPE_CHOICES)

    assert {
        "resume_exam",
        "reopen_exam",
        "reset_exam_record",
    } <= choices


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/contests/00000000-0000-0000-0000-000000000001/exam/anticheat-urls/",
        "/api/v1/contests/00000000-0000-0000-0000-000000000001/exam/active-sessions/",
        "/api/v1/contests/00000000-0000-0000-0000-000000000001/exam/active-sessions/clear/",
    ],
)
def test_removed_anticheat_legacy_and_debug_routes_do_not_resolve(path: str) -> None:
    with pytest.raises(Resolver404):
        resolve(path)
