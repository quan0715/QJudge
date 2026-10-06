"""Frozen anti-cheat policy builders."""
from __future__ import annotations


def build_contest_anticheat_config(contest) -> dict:
    """Return only the policy needed before a run is active."""
    return {"webcam_required": contest.webcam_required}


def build_integrity_policy_snapshot(contest) -> dict:
    """Freeze the browser/worker contract for one integrity run."""
    return {
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
        "webcam_required": contest.webcam_required,
    }
