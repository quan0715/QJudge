"""Shared constants for contest event taxonomy and penalty logic."""

# ---------------------------------------------------------------------------
# Incident families — group raw event types into semantic categories.
# The orchestrator and penalty logic use families for dedup / arbitration
# so that a single user action doesn't produce multiple penalties.
# ---------------------------------------------------------------------------

INCIDENT_FAMILY: dict[str, str] = {
    'screen_share_stopped': 'capture_loss',
    'webcam_stopped': 'capture_loss',
    'exit_fullscreen': 'display_escape',
    'multiple_displays': 'display_escape',
    'mouse_leave': 'pointer_escape',
    'viewport_stopped': 'viewport_loss',
    'split_view_detected': 'display_escape',
    'forbidden_focus_event': 'display_escape',
    # P0 / re-check events: each is its own family (no cross-dedup).
    'heartbeat_timeout': 'heartbeat_timeout',
    'listener_tampered': 'listener_tampered',
}

# Priority levels: P0=critical re-check, P1=violation, P2=info, P3=system
EVENT_PRIORITY: dict[str, int] = {
    # P0: Critical monitoring failures that pause the exam and require pre-check.
    'screen_share_stopped': 0,
    'heartbeat_timeout': 0,
    'listener_tampered': 0,
    # P1: Penalized violations
    'exit_fullscreen': 1,
    'multiple_displays': 1,
    'mouse_leave': 1,
    'forbidden_focus_event': 1,
    'webcam_stopped': 1,
    'viewport_stopped': 1,
    'split_view_detected': 1,
    # P2: Informational (no penalty)
    'forbidden_action': 2,
    'capture_upload_degraded': 2,
    'screen_share_interrupted': 2,
    'screen_share_invalid_surface': 2,
    'screen_share_restored': 2,
    'webcam_interrupted': 2,
    'webcam_restored': 2,
    'webcam_quality_degraded': 2,
    'viewport_interrupted': 2,
    'viewport_restored': 2,
    'exit_fullscreen_triggered': 2,
    'mouse_leave_triggered': 2,
    # Legacy focus events — kept for historical event display, no longer penalized.
    'tab_hidden': 2,
    'tab_hidden_triggered': 2,
    'tab_hidden_restored': 2,
    'window_blur': 2,
    'window_blur_triggered': 2,
    'window_blur_restored': 2,
    'multi_display_triggered': 2,
    'multi_display_restored': 2,
    'display_api_degraded': 2,
    # Legacy frontend penalty-timer event. Kept for historical display only.
    'warning_timeout': 2,
    # P3: Lifecycle / management
    'exam_entered': 3,
    'exam_submit_initiated': 3,
    'force_submit_locked': 3,
    'concurrent_login_detected': 3,
    'heartbeat': 3,
    'manual_proctor_note': 3,
    'attendance_check_in': 3,
    'attendance_check_out': 3,
}

EVENT_CATEGORY: dict[int, str] = {
    0: 'critical',
    1: 'violation',
    2: 'info',
    3: 'system',
}

PENALIZED_EVENT_TYPES = {
    'exit_fullscreen',
    'multiple_displays',
    'mouse_leave',
    'screen_share_stopped',
    'webcam_stopped',
    'viewport_stopped',
    'split_view_detected',
    'forbidden_focus_event',
    'heartbeat_timeout',
    'listener_tampered',
}

IMMEDIATE_LOCK_EVENT_TYPES = set()

ENVIRONMENT_RECHECK_EVENT_TYPES = {
    'screen_share_stopped',
    'webcam_stopped',
    'viewport_stopped',
    'split_view_detected',
    'multiple_displays',
    'heartbeat_timeout',
    'listener_tampered',
}

RESTORE_EVENT_TO_INCIDENT_FAMILY = {
    'screen_share_restored': 'capture_loss',
    'webcam_restored': 'capture_loss',
    'viewport_restored': 'viewport_loss',
    'multi_display_restored': 'display_escape',
    'tab_hidden_restored': 'display_escape',
    'window_blur_restored': 'display_escape',
}

EVENT_FEED_AGGREGATION_WINDOW_SECONDS = 60

# Frontend-consumed anti-cheat runtime defaults (server as source of truth)
WARNING_TIMEOUT_SECONDS = 20
FORCED_CAPTURE_COOLDOWN_MS = 1_000
FORCED_CAPTURE_P1_COOLDOWN_MS = 15_000

INCIDENT_SCREENSHOT_WINDOW_BEFORE_MS = 15_000
INCIDENT_SCREENSHOT_WINDOW_AFTER_MS = 15_000
INCIDENT_SCREENSHOT_PREVIEW_LIMIT = 10
INCIDENT_SCREENSHOT_CATEGORIES = ("critical", "violation")

EXAM_MONITORING_RECOVERY_GRACE_MS = 3_000
EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS = 3_000
SCREEN_SHARE_RECOVERY_GRACE_MS = 10_000
WEBCAM_RECOVERY_GRACE_MS = 10_000
WEBCAM_CAPTURE_INTERVAL_SECONDS = 10

EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS = 5_000
EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS = 15_000
