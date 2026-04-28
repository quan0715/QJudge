/**
 * Declarative violation route registry.
 *
 * Each route defines the event lifecycle (triggered → grace → escalated/restored)
 * and the escalation action to take when the grace period expires.
 * useViolationPipeline consumes these routes to drive the shared engine.
 */
export type EscalationAction = "force_submit" | "penalized_event" | "log_only";

export interface ViolationRouteConfig {
  id: string;
  events: { triggered: string; escalated: string; restored?: string };
  defaultGraceMs: number;
  escalation: EscalationAction;
  continued?: {
    intervalMs: number;
    maxEvents?: number;
    eventType?: string;
    reason?: string;
  };
  /** Lower = higher priority. Used by selectPrimaryCountdownFromRegistry. */
  countdownPriority: number;
  /** Source string for exam event metadata. */
  eventSource: string;
}

export const VIOLATION_ROUTES: ViolationRouteConfig[] = [
  {
    id: "screen_share",
    events: { triggered: "screen_share_interrupted", escalated: "screen_share_stopped", restored: "screen_share_restored" },
    defaultGraceMs: 10_000,
    escalation: "penalized_event",
    countdownPriority: 0,
    eventSource: "anticheat:screen_capture",
  },
  {
    id: "webcam",
    events: { triggered: "webcam_interrupted", escalated: "webcam_stopped", restored: "webcam_restored" },
    defaultGraceMs: 10_000,
    escalation: "penalized_event",
    countdownPriority: 1,
    eventSource: "anticheat:webcam_capture",
  },
  {
    id: "viewport",
    events: { triggered: "viewport_interrupted", escalated: "viewport_stopped", restored: "viewport_restored" },
    defaultGraceMs: 5_000,
    escalation: "penalized_event",
    countdownPriority: 2,
    eventSource: "anticheat:viewport_integrity",
  },
  {
    id: "fullscreen",
    events: { triggered: "exit_fullscreen_triggered", escalated: "exit_fullscreen" },
    defaultGraceMs: 30_000,
    escalation: "penalized_event",
    continued: {
      intervalMs: 30_000,
      maxEvents: 20,
      reason: "fullscreen_continued",
    },
    countdownPriority: 3,
    eventSource: "anticheat:fullscreen",
  },
  {
    id: "mouse_leave",
    events: { triggered: "mouse_leave_triggered", escalated: "mouse_leave" },
    defaultGraceMs: 3_000,
    escalation: "penalized_event",
    continued: {
      intervalMs: 30_000,
      maxEvents: 20,
      reason: "mouse_leave_continued",
    },
    countdownPriority: 4,
    eventSource: "anticheat:mouse_leave",
  },
  // Legacy focus routes remain for compatibility with historical events/tests.
  // The primary runtime no longer mounts these detectors.
  {
    id: "tab_hidden",
    events: { triggered: "tab_hidden_triggered", escalated: "tab_hidden", restored: "tab_hidden_restored" },
    defaultGraceMs: 3_000,
    escalation: "penalized_event",
    countdownPriority: 5,
    eventSource: "anticheat:focus",
  },
  {
    id: "window_blur",
    events: { triggered: "window_blur_triggered", escalated: "window_blur", restored: "window_blur_restored" },
    defaultGraceMs: 3_000,
    escalation: "penalized_event",
    countdownPriority: 6,
    eventSource: "anticheat:focus",
  },
  {
    id: "multiple_displays",
    events: { triggered: "multi_display_triggered", escalated: "multiple_displays", restored: "multi_display_restored" },
    defaultGraceMs: 10_000,
    escalation: "penalized_event",
    countdownPriority: 7,
    eventSource: "anticheat:multi_display",
  },
];

export const VIOLATION_ROUTES_MAP: Record<string, ViolationRouteConfig> = Object.fromEntries(
  VIOLATION_ROUTES.map((r) => [r.id, r]),
);


export interface PrimaryCountdownFromRegistryResult {
  value: number | null;
  source: string | null;
}

/**
 * Selects the single most important countdown to display in the exam UI,
 * using the registry's countdownPriority ordering.
 */
export function selectPrimaryCountdownFromRegistry(
  countdowns: Map<string, number | null>,
): PrimaryCountdownFromRegistryResult {
  let best: { value: number; source: string; priority: number } | null = null;

  for (const route of VIOLATION_ROUTES) {
    const value = countdowns.get(route.id);
    if (value == null) continue;
    if (best === null || route.countdownPriority < best.priority) {
      best = { value, source: route.id, priority: route.countdownPriority };
    }
  }

  return best ? { value: best.value, source: best.source } : { value: null, source: null };
}
