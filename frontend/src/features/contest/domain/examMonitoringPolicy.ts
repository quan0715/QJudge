/**
 * Shared anti-cheat monitoring rhythm for runtime + precheck.
 * Keep these constants as the single source of truth.
 */
const DEFAULT_EXAM_MONITORING_BLUR_DEBOUNCE_MS = 450;
const DEFAULT_EXAM_MONITORING_FOCUS_CHECK_DELAY_MS = 50;
const DEFAULT_EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS = 700;
const DEFAULT_EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS = 1200;
const DEFAULT_EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS = 5000;
const DEFAULT_EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS = 15000;
const DEFAULT_EXAM_MONITORING_SCREEN_DETAILS_TIMEOUT_MS = 2500;
const DEFAULT_EXAM_MONITORING_DISPLAY_API_FAILURE_THRESHOLD = 3;
const DEFAULT_EXAM_MONITORING_DISPLAY_CONFIRM_COUNT = 2;
const DEFAULT_EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS = 2500;
const DEFAULT_EXAM_MONITORING_RECOVERY_GRACE_MS = 3000;
const DEFAULT_EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS = 3000;
const DEFAULT_SCREEN_SHARE_RECOVERY_GRACE_MS = 10_000;

export const EXAM_MONITORING_BLUR_DEBOUNCE_MS = DEFAULT_EXAM_MONITORING_BLUR_DEBOUNCE_MS;
export const EXAM_MONITORING_FOCUS_CHECK_DELAY_MS = DEFAULT_EXAM_MONITORING_FOCUS_CHECK_DELAY_MS;
export const EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS = DEFAULT_EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS;
export const EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS =
  DEFAULT_EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS;
export let EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS =
  DEFAULT_EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS;
export let EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS =
  DEFAULT_EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS;
export const EXAM_MONITORING_SCREEN_DETAILS_TIMEOUT_MS =
  DEFAULT_EXAM_MONITORING_SCREEN_DETAILS_TIMEOUT_MS;
export const EXAM_MONITORING_DISPLAY_API_FAILURE_THRESHOLD =
  DEFAULT_EXAM_MONITORING_DISPLAY_API_FAILURE_THRESHOLD;
export const EXAM_MONITORING_DISPLAY_CONFIRM_COUNT =
  DEFAULT_EXAM_MONITORING_DISPLAY_CONFIRM_COUNT;
export const EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS =
  DEFAULT_EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS;
export let EXAM_MONITORING_RECOVERY_GRACE_MS = DEFAULT_EXAM_MONITORING_RECOVERY_GRACE_MS;
export let EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS =
  DEFAULT_EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS;
export let SCREEN_SHARE_RECOVERY_GRACE_MS = DEFAULT_SCREEN_SHARE_RECOVERY_GRACE_MS;

export let EXAM_MONITORING_FOCUS_STABILIZE_WINDOW_MS =
  EXAM_MONITORING_BLUR_DEBOUNCE_MS +
  EXAM_MONITORING_FOCUS_CHECK_DELAY_MS +
  EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS;

const positiveNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
};

export interface ExamMonitoringPolicyOverrides {
  monitoringRecoveryGraceMs?: number;
  mouseLeaveCooldownMs?: number;
  screenShareRecoveryGraceMs?: number;
  multiDisplayCheckIntervalMs?: number;
  multiDisplayReportCooldownMs?: number;
}

export function applyExamMonitoringPolicyOverrides(
  overrides?: ExamMonitoringPolicyOverrides
): void {
  if (!overrides) return;

  const recovery = positiveNumber(overrides.monitoringRecoveryGraceMs);
  if (recovery != null) EXAM_MONITORING_RECOVERY_GRACE_MS = recovery;

  const mouseCooldown = positiveNumber(overrides.mouseLeaveCooldownMs);
  if (mouseCooldown != null) EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS = mouseCooldown;

  const screenShareRecovery = positiveNumber(overrides.screenShareRecoveryGraceMs);
  if (screenShareRecovery != null) SCREEN_SHARE_RECOVERY_GRACE_MS = screenShareRecovery;

  const multiDisplayInterval = positiveNumber(overrides.multiDisplayCheckIntervalMs);
  if (multiDisplayInterval != null) {
    EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS = multiDisplayInterval;
  }

  const multiDisplayCooldown = positiveNumber(overrides.multiDisplayReportCooldownMs);
  if (multiDisplayCooldown != null) {
    EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS = multiDisplayCooldown;
  }

  EXAM_MONITORING_FOCUS_STABILIZE_WINDOW_MS =
    EXAM_MONITORING_BLUR_DEBOUNCE_MS +
    EXAM_MONITORING_FOCUS_CHECK_DELAY_MS +
    EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS;
}

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
