"""Contest policy defaults."""
from __future__ import annotations


def default_anticheat_device_policy():
    """Default anti-cheat device policy (desktop/tablet)."""
    return {
        "desktop": {
            "enabled": True,
            "sources": {
                "screen_share": {
                    "enabled": True,
                    "capture_interval_seconds": 5,
                },
                "webcam": {
                    "enabled": False,
                    "capture_interval_seconds": 10,
                },
            },
            "detectors": {
                "pwa_mode": False,
                "fullscreen": True,
                "focus": False,
                "tab_visibility": False,
                "multi_display": True,
                "mouse_leave": True,
                "viewport_integrity": False,
            },
        },
        "tablet": {
            "enabled": True,
            "sources": {
                "screen_share": {
                    "enabled": False,
                    "capture_interval_seconds": 5,
                },
                "webcam": {
                    "enabled": True,
                    "capture_interval_seconds": 10,
                },
            },
            "detectors": {
                "pwa_mode": True,
                "fullscreen": False,
                "focus": False,
                "tab_visibility": False,
                "multi_display": False,
                "mouse_leave": True,
                "viewport_integrity": True,
            },
        },
    }


default_anticheat_device_policy.__module__ = "apps.contests.models"
