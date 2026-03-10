"""Builders for contest anti-cheat runtime config payloads."""
from __future__ import annotations

from django.conf import settings

from apps.contests.constants import (
    CAPTURE_UPLOAD_MAX_RETRIES,
    EVENT_FEED_AGGREGATION_WINDOW_SECONDS,
    EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS,
    EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS,
    EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS,
    EXAM_MONITORING_RECOVERY_GRACE_MS,
    FORCED_CAPTURE_COOLDOWN_MS,
    FORCED_CAPTURE_P1_COOLDOWN_MS,
    INCIDENT_SCREENSHOT_CATEGORIES,
    INCIDENT_SCREENSHOT_PREVIEW_LIMIT,
    INCIDENT_SCREENSHOT_WINDOW_AFTER_MS,
    INCIDENT_SCREENSHOT_WINDOW_BEFORE_MS,
    SCREEN_SHARE_RECOVERY_GRACE_MS,
    WARNING_TIMEOUT_SECONDS,
)


def build_contest_anticheat_config(contest) -> dict:
    """
    Return anti-cheat config for frontend runtime behavior.

    Payload shape intentionally separates:
    - global_defaults: cluster-wide policy knobs
    - contest_settings: per-contest settings persisted on Contest
    - effective: frontend should consume from here
    - frontend_controlled_settings: migration map for global vs per-contest knobs
    """

    global_defaults = {
        "capture_interval_seconds": int(settings.ANTICHEAT_CAPTURE_INTERVAL_SECONDS),
        "capture_upload_max_retries": CAPTURE_UPLOAD_MAX_RETRIES,
        "warning_timeout_seconds": WARNING_TIMEOUT_SECONDS,
        "forced_capture_cooldown_ms": FORCED_CAPTURE_COOLDOWN_MS,
        "forced_capture_p1_cooldown_ms": FORCED_CAPTURE_P1_COOLDOWN_MS,
        "event_feed_aggregation_window_seconds": EVENT_FEED_AGGREGATION_WINDOW_SECONDS,
        "incident_screenshot_window_before_ms": INCIDENT_SCREENSHOT_WINDOW_BEFORE_MS,
        "incident_screenshot_window_after_ms": INCIDENT_SCREENSHOT_WINDOW_AFTER_MS,
        "incident_screenshot_preview_limit": INCIDENT_SCREENSHOT_PREVIEW_LIMIT,
        "incident_screenshot_categories": list(INCIDENT_SCREENSHOT_CATEGORIES),
        "monitoring_recovery_grace_ms": EXAM_MONITORING_RECOVERY_GRACE_MS,
        "mouse_leave_cooldown_ms": EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS,
        "screen_share_recovery_grace_ms": SCREEN_SHARE_RECOVERY_GRACE_MS,
        "multi_display_check_interval_ms": EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS,
        "multi_display_report_cooldown_ms": EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS,
        "presigned_url_ttl_seconds": int(settings.ANTICHEAT_PRESIGNED_URL_TTL_SECONDS),
    }

    contest_settings = {
        "cheat_detection_enabled": bool(contest.cheat_detection_enabled),
        "allow_multiple_joins": bool(contest.allow_multiple_joins),
        "max_cheat_warnings": int(contest.max_cheat_warnings or 0),
        "allow_auto_unlock": bool(contest.allow_auto_unlock),
        "auto_unlock_minutes": int(contest.auto_unlock_minutes or 0),
        "contest_type": str(contest.contest_type or "coding"),
    }

    frontend_controlled_settings = {
        "global": [
            {
                "key": "capture_interval_seconds",
                "description": "Background screenshot capture interval",
            },
            {
                "key": "capture_upload_max_retries",
                "description": "Retry attempts before marking upload degraded",
            },
            {
                "key": "warning_timeout_seconds",
                "description": "Warning modal timeout before forced warning_timeout event",
            },
            {
                "key": "forced_capture_cooldown_ms",
                "description": "Base forced-capture cooldown for non-P1 events",
            },
            {
                "key": "forced_capture_p1_cooldown_ms",
                "description": "Forced-capture cooldown for P1 violation events",
            },
            {
                "key": "event_feed_aggregation_window_seconds",
                "description": "Exam-event grouping window in admin logs",
            },
            {
                "key": "incident_screenshot_window_before_ms",
                "description": "Screenshot preview lookback window before incident",
            },
            {
                "key": "incident_screenshot_window_after_ms",
                "description": "Screenshot preview lookahead window after incident",
            },
            {
                "key": "incident_screenshot_preview_limit",
                "description": "Max screenshots returned per incident preview",
            },
            {
                "key": "incident_screenshot_categories",
                "description": "Incident categories eligible for screenshot preview",
            },
            {
                "key": "monitoring_recovery_grace_ms",
                "description": "Fullscreen/mouse leave recovery grace period",
            },
            {
                "key": "mouse_leave_cooldown_ms",
                "description": "Cooldown between mouse_leave violations",
            },
            {
                "key": "screen_share_recovery_grace_ms",
                "description": "Screen-share reauth grace before force submit",
            },
            {
                "key": "multi_display_check_interval_ms",
                "description": "Polling interval for multi-display checks",
            },
            {
                "key": "multi_display_report_cooldown_ms",
                "description": "Cooldown between multi-display reports",
            },
            {
                "key": "presigned_url_ttl_seconds",
                "description": "Presigned upload URL validity duration",
            },
        ],
        "contest": [
            {
                "key": "cheat_detection_enabled",
                "description": "Enable anti-cheat runtime and lock workflow",
            },
            {
                "key": "allow_multiple_joins",
                "description": "Allow re-entry after leaving/submitting",
            },
            {
                "key": "max_cheat_warnings",
                "description": "Violation threshold before lock/escalation",
            },
            {
                "key": "allow_auto_unlock",
                "description": "Enable timed unlock after lock",
            },
            {
                "key": "auto_unlock_minutes",
                "description": "Minutes before locked participant auto-unlocks",
            },
        ],
    }

    return {
        "version": 1,
        "global_defaults": global_defaults,
        "contest_settings": contest_settings,
        "effective": {
            **global_defaults,
            **contest_settings,
        },
        "frontend_controlled_settings": frontend_controlled_settings,
    }
