/**
 * Single derivation of "which monitoring problem is the student facing right now".
 *
 * Every consumer — the top-nav reminder chip and the recovery modal — reads the
 * same source from here. Two independent priority ladders used to exist, which
 * let the fullscreen modal and the screen-share modal open at the same time.
 */

export type ExamSensorSource =
  | "policy_unavailable"
  | "screen_share"
  | "webcam"
  | "fullscreen"
  | "mouse_leave"
  | "multiple_displays";

export type ExamSensorTone = "warning" | "critical";

export interface ExamSensorSnapshot {
  /** Anti-cheat policy could not be resolved for this device. */
  policyUnavailable: boolean;
  screenShareInterrupted: boolean;
  webcamInterrupted: boolean;
  fullscreenInterrupted: boolean;
  mouseLeaveInterrupted: boolean;
  multiDisplayInterrupted: boolean;
}

/**
 * Most blocking first. A source earlier in this ladder makes the ones after it
 * irrelevant: re-sharing the screen is pointless while the policy is unknown,
 * and returning to fullscreen is pointless while the share is already gone.
 */
export const resolveActiveExamSensorSource = (
  snapshot: ExamSensorSnapshot,
): ExamSensorSource | null => {
  if (snapshot.policyUnavailable) return "policy_unavailable";
  if (snapshot.screenShareInterrupted) return "screen_share";
  if (snapshot.webcamInterrupted) return "webcam";
  if (snapshot.fullscreenInterrupted) return "fullscreen";
  if (snapshot.mouseLeaveInterrupted) return "mouse_leave";
  if (snapshot.multiDisplayInterrupted) return "multiple_displays";
  return null;
};

const CRITICAL_SOURCES: ReadonlySet<ExamSensorSource> = new Set([
  "policy_unavailable",
  "screen_share",
  "webcam",
]);

export const examSensorTone = (source: ExamSensorSource): ExamSensorTone =>
  CRITICAL_SOURCES.has(source) ? "critical" : "warning";

/** Rendered by the full-screen lock overlay, never by the modal layer. */
const OVERLAY_SOURCES: ReadonlySet<ExamSensorSource> = new Set([
  "policy_unavailable",
]);

export const isSensorRecoverableByModal = (
  source: ExamSensorSource | null,
): boolean => source != null && !OVERLAY_SOURCES.has(source);
