"""Frozen anti-cheat policy builders."""
from __future__ import annotations

from apps.contests.models import default_anticheat_device_policy


DEVICE_KINDS = ("desktop", "tablet")
SOURCE_KINDS = ("screen_share", "webcam")
DETECTOR_KINDS = (
    "pwa_mode",
    "fullscreen",
    "multi_display",
    "mouse_leave",
    "viewport_integrity",
)


def _as_bool(value, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def normalize_anticheat_device_policy(raw_policy) -> dict:
    defaults = default_anticheat_device_policy()
    policy = raw_policy if isinstance(raw_policy, dict) else {}
    normalized: dict[str, dict] = {}

    for device in DEVICE_KINDS:
        default_device = defaults[device]
        raw_device = policy.get(device)
        if not isinstance(raw_device, dict):
            raw_device = {}

        raw_sources = raw_device.get("sources")
        if not isinstance(raw_sources, dict):
            raw_sources = {}
        sources = {}
        for source in SOURCE_KINDS:
            raw_source = raw_sources.get(source)
            if not isinstance(raw_source, dict):
                raw_source = {}
            sources[source] = {
                "enabled": _as_bool(
                    raw_source.get("enabled"),
                    default_device["sources"][source]["enabled"],
                ),
            }

        raw_detectors = raw_device.get("detectors")
        if not isinstance(raw_detectors, dict):
            raw_detectors = {}
        detectors = {
            detector: _as_bool(
                raw_detectors.get(detector),
                default_device["detectors"][detector],
            )
            for detector in DETECTOR_KINDS
        }

        normalized[device] = {
            "enabled": _as_bool(raw_device.get("enabled"), default_device["enabled"]),
            "sources": sources,
            "detectors": detectors,
        }

    normalized["tablet"]["sources"]["screen_share"]["enabled"] = False
    normalized["tablet"]["detectors"]["fullscreen"] = False
    normalized["tablet"]["detectors"]["multi_display"] = False
    return normalized


def build_contest_anticheat_config(contest) -> dict:
    """Return only the policy needed before a run is active."""
    return {
        "version": 3,
        "device_policy": normalize_anticheat_device_policy(
            contest.anticheat_device_policy,
        ),
    }


def build_integrity_policy_snapshot(contest) -> dict:
    """Freeze the browser/worker contract for one integrity run."""
    return {
        "version": 1,
        "batch_interval_ms": 5_000,
        "suspect_after_ms": 15_000,
        "disconnected_after_ms": 30_000,
        "evidence": {
            "chunk_ms": 5_000,
            "minimum_local_buffer_ms": 60_000,
            "local_cap_ms": 300_000,
            "local_cap_bytes_per_source": 100_000_000,
            "screen": {
                "width": 1280,
                "height": 720,
                "fps": 5,
                "bitrate": 800_000,
            },
            "webcam": {
                "width": 640,
                "height": 480,
                "fps": 10,
                "bitrate": 350_000,
            },
        },
        "device_policy": normalize_anticheat_device_policy(
            contest.anticheat_device_policy,
        ),
    }
