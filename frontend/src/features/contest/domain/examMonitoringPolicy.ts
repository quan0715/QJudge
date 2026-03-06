/**
 * Shared anti-cheat monitoring rhythm for runtime + precheck.
 * Keep these constants as the single source of truth.
 */
export const EXAM_MONITORING_BLUR_DEBOUNCE_MS = 450;
export const EXAM_MONITORING_FOCUS_CHECK_DELAY_MS = 50;
export const EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS = 700;
export const EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS = 1200;
export const EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS = 5000;
export const EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS = 15000;
export const EXAM_MONITORING_SCREEN_DETAILS_TIMEOUT_MS = 2500;
export const EXAM_MONITORING_DISPLAY_API_FAILURE_THRESHOLD = 3;
export const EXAM_MONITORING_DISPLAY_CONFIRM_COUNT = 2;
export const EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS = 2500;

/** Unified recovery grace period for fullscreen exit & mouse leave (3 s). */
export const EXAM_MONITORING_RECOVERY_GRACE_MS = 3000;
export const EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS = 3000;

export const EXAM_MONITORING_FOCUS_STABILIZE_WINDOW_MS =
  EXAM_MONITORING_BLUR_DEBOUNCE_MS +
  EXAM_MONITORING_FOCUS_CHECK_DELAY_MS +
  EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS;

// --- Screen Details API shared utilities ---

export interface ScreenDetailsLike extends EventTarget {
  screens?: unknown[];
}

export type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

/** Check if the current screen is in extended mode (multi-display). */
export function isScreenExtended(): boolean {
  const screenWithExtended = window.screen as Screen & { isExtended?: boolean };
  return screenWithExtended.isExtended === true;
}
