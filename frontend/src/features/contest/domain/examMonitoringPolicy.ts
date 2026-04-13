/**
 * Shared anti-cheat monitoring timing config.
 *
 * All backend-overridable timing values live in a single object.
 * Backend-provided overrides are applied once via applyExamMonitoringPolicyOverrides();
 * consumers read the current snapshot via getTimingConfig().
 */

export interface ExamMonitoringTimingConfig {
  recoveryGraceMs: number;
  mouseLeaveCooldownMs: number;
  screenShareRecoveryGraceMs: number;
  webcamRecoveryGraceMs: number;
  multiDisplayCheckIntervalMs: number;
  multiDisplayReportCooldownMs: number;
}

const DEFAULTS: Readonly<ExamMonitoringTimingConfig> = {
  recoveryGraceMs: 3000,
  mouseLeaveCooldownMs: 3000,
  screenShareRecoveryGraceMs: 30_000,
  webcamRecoveryGraceMs: 10_000,
  multiDisplayCheckIntervalMs: 5000,
  multiDisplayReportCooldownMs: 15000,
};

let current: ExamMonitoringTimingConfig = { ...DEFAULTS };

export const getTimingConfig = (): Readonly<ExamMonitoringTimingConfig> => current;

// --- Immutable constants (never overridden by backend) ---

export const EXAM_MONITORING_BLUR_DEBOUNCE_MS = 450;
export const EXAM_MONITORING_FOCUS_CHECK_DELAY_MS = 50;
export const EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS = 700;
export const EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS = 1200;
export const EXAM_MONITORING_SCREEN_DETAILS_TIMEOUT_MS = 2500;
export const EXAM_MONITORING_DISPLAY_API_FAILURE_THRESHOLD = 3;
export const EXAM_MONITORING_DISPLAY_CONFIRM_COUNT = 2;
export const EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS = 2500;

export const EXAM_MONITORING_FOCUS_STABILIZE_WINDOW_MS =
  EXAM_MONITORING_BLUR_DEBOUNCE_MS +
  EXAM_MONITORING_FOCUS_CHECK_DELAY_MS +
  EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS;

// --- Override application ---

const positiveNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
};

export interface ExamMonitoringPolicyOverrides {
  monitoringRecoveryGraceMs?: number;
  mouseLeaveCooldownMs?: number;
  screenShareRecoveryGraceMs?: number;
  webcamRecoveryGraceMs?: number;
  multiDisplayCheckIntervalMs?: number;
  multiDisplayReportCooldownMs?: number;
}

export function applyExamMonitoringPolicyOverrides(
  overrides?: ExamMonitoringPolicyOverrides,
): void {
  if (!overrides) return;

  const next = { ...current };

  const recovery = positiveNumber(overrides.monitoringRecoveryGraceMs);
  if (recovery != null) next.recoveryGraceMs = recovery;

  const mouseCooldown = positiveNumber(overrides.mouseLeaveCooldownMs);
  if (mouseCooldown != null) next.mouseLeaveCooldownMs = mouseCooldown;

  const screenShareRecovery = positiveNumber(overrides.screenShareRecoveryGraceMs);
  if (screenShareRecovery != null) next.screenShareRecoveryGraceMs = screenShareRecovery;

  const webcamRecovery = positiveNumber(overrides.webcamRecoveryGraceMs);
  if (webcamRecovery != null) next.webcamRecoveryGraceMs = webcamRecovery;

  const multiDisplayInterval = positiveNumber(overrides.multiDisplayCheckIntervalMs);
  if (multiDisplayInterval != null) next.multiDisplayCheckIntervalMs = multiDisplayInterval;

  const multiDisplayCooldown = positiveNumber(overrides.multiDisplayReportCooldownMs);
  if (multiDisplayCooldown != null) next.multiDisplayReportCooldownMs = multiDisplayCooldown;

  current = next;
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
