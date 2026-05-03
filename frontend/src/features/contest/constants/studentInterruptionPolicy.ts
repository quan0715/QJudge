export type StudentInterruptionPolicy =
  | "silent"
  | "toast"
  | "recovery_modal"
  | "critical_modal";

export const ROUTE_STUDENT_INTERRUPTION_POLICY: Record<string, StudentInterruptionPolicy> = {
  screen_share: "recovery_modal",
  webcam: "recovery_modal",
  viewport: "recovery_modal",
  fullscreen: "recovery_modal",
  multiple_displays: "recovery_modal",
  mouse_leave: "silent",
};

export const EVENT_STUDENT_INTERRUPTION_POLICY: Record<string, StudentInterruptionPolicy> = {
  capture_upload_degraded: "silent",
  display_api_degraded: "silent",
  webcam_quality_degraded: "silent",
  forbidden_action: "toast",
  heartbeat_timeout: "recovery_modal",
  listener_tampered: "recovery_modal",
  concurrent_login_detected: "critical_modal",
};

export const shouldShowRecoveryModalForRoute = (routeId: string | null | undefined): boolean =>
  !!routeId && ROUTE_STUDENT_INTERRUPTION_POLICY[routeId] === "recovery_modal";

const GENERIC_RECOVERY_MODAL_ROUTES = new Set(["fullscreen", "multiple_displays"]);

export const shouldShowGenericRecoveryModalForRoute = (
  routeId: string | null | undefined,
): boolean => !!routeId && GENERIC_RECOVERY_MODAL_ROUTES.has(routeId);
