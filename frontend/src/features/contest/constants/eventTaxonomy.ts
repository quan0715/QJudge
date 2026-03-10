/**
 * Event Priority Taxonomy — shared classification for exam events.
 *
 * P0 = critical (immediate lock)
 * P1 = violation (penalized)
 * P2 = info (no penalty)
 * P3 = system / lifecycle
 */

export const EVENT_PRIORITY: Record<string, number> = {
  // P0: Immediate lock level
  warning_timeout: 0,
  screen_share_stopped: 0,
  heartbeat_timeout: 0,
  listener_tampered: 0,
  // P1: Penalized violations
  tab_hidden: 1,
  window_blur: 1,
  exit_fullscreen: 1,
  multiple_displays: 1,
  mouse_leave: 1,
  forbidden_focus_event: 1,
  // P2: Informational (no penalty)
  forbidden_action: 2,
  capture_upload_degraded: 2,
  screen_share_interrupted: 2,
  screen_share_invalid_surface: 2,
  screen_share_restored: 2,
  exit_fullscreen_triggered: 2,
  mouse_leave_triggered: 2,
  // P3: Lifecycle / management
  exam_entered: 3,
  exam_submit_initiated: 3,
  takeover_locked: 3,
  takeover_approved: 3,
  force_submit_locked: 3,
  concurrent_login_detected: 3,
  heartbeat: 3,
};

export const EVENT_CATEGORY: Record<number, string> = {
  0: "critical",
  1: "violation",
  2: "info",
  3: "system",
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: "P0",
  1: "P1",
  2: "P2",
  3: "P3",
};

export const PRIORITY_TAG_COLOR: Record<number, "red" | "magenta" | "teal" | "cool-gray"> = {
  0: "red",
  1: "magenta",
  2: "teal",
  3: "cool-gray",
};

export const getEventPriority = (eventType: string): number =>
  EVENT_PRIORITY[eventType] ?? 3;

export const getEventCategory = (eventType: string): string =>
  EVENT_CATEGORY[getEventPriority(eventType)] ?? "system";
