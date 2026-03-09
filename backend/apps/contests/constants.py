"""Shared constants for contest event taxonomy and penalty logic."""

# Priority levels: P0=critical, P1=violation, P2=info, P3=system
EVENT_PRIORITY: dict[str, int] = {
    # P0: Immediate lock level
    'warning_timeout': 0,
    'screen_share_stopped': 0,
    'heartbeat_timeout': 0,
    'listener_tampered': 0,
    # P1: Penalized violations
    'tab_hidden': 1,
    'window_blur': 1,
    'exit_fullscreen': 1,
    'multiple_displays': 1,
    'mouse_leave': 1,
    'forbidden_focus_event': 1,
    # P2: Informational (no penalty)
    'forbidden_action': 2,
    'capture_upload_degraded': 2,
    'screen_share_invalid_surface': 2,
    'screen_share_restored': 2,
    # P3: Lifecycle / management
    'exam_entered': 3,
    'exam_submit_initiated': 3,
    'takeover_locked': 3,
    'takeover_approved': 3,
    'force_submit_locked': 3,
    'concurrent_login_detected': 3,
    'heartbeat': 3,
}

EVENT_CATEGORY: dict[int, str] = {
    0: 'critical',
    1: 'violation',
    2: 'info',
    3: 'system',
}

PENALIZED_EVENT_TYPES = {
    'tab_hidden',
    'window_blur',
    'exit_fullscreen',
    'multiple_displays',
    'mouse_leave',
    'screen_share_stopped',
    'warning_timeout',
    'forbidden_focus_event',
    'heartbeat_timeout',
    'listener_tampered',
}

EVENT_FEED_AGGREGATION_WINDOW_SECONDS = 60
