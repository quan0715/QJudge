import pytest
from django.apps import apps
from django.urls import NoReverseMatch, reverse


def test_notifications_app_is_not_installed():
    assert not apps.is_installed("apps.notifications")


def test_classroom_announcement_notify_route_is_removed():
    with pytest.raises(NoReverseMatch):
        reverse(
            "classrooms:classroom-notify-announcement",
            kwargs={
                "id": "00000000-0000-0000-0000-000000000001",
                "ann_id": 1,
            },
        )
