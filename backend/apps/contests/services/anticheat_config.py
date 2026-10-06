"""Frozen anti-cheat policy builders."""
from __future__ import annotations


def build_contest_anticheat_config(contest) -> dict:
    """Return only the policy needed before a run is active."""
    return {"webcam_required": contest.webcam_required}


def build_runtime_integrity_policy(contest, run) -> dict:
    """Allow disabling webcam live without rewriting the resident's frozen identity.

    Enabling it still requires a run prepared with webcam; archived evidence
    retains the policy under which it was collected.
    """
    policy = dict(run.policy_snapshot)
    if run.session_state in ("prepared", "active", "draining"):
        policy["webcam_required"] = (
            policy.get("webcam_required") is True and contest.webcam_required
        )
    return policy


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
