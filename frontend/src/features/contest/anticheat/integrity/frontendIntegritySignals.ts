import type { IntegrityRegistrySnapshot } from "@/core/entities/contest.entity";

/**
 * The complete set of literal signals emitted by the browser integrity runtime.
 * Keep this contract synchronized with the frozen Backend registry; the runtime
 * fails closed before writing any record if a run snapshot omits one.
 */
export const FRONTEND_INTEGRITY_SIGNAL_IDS = [
  "clipboard_action",
  "exam_entered",
  "exam_submit_initiated",
  "exit_fullscreen_triggered",
  "forbidden_action",
  "fullscreen_restored",
  "listener_tampered",
  "mouse_leave_restored",
  "mouse_leave_triggered",
  "multi_display_restored",
  "multi_display_triggered",
  "screen_share_interrupted",
  "screen_share_restored",
  "health_snapshot",
  "viewport_interrupted",
  "viewport_restored",
  "webcam_interrupted",
  "webcam_restored",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const assertFrontendSignalsInRegistry = (
  registry: IntegrityRegistrySnapshot,
): void => {
  const activeSignals = new Set<string>();
  for (const definition of Object.values(registry.definitions)) {
    if (!isRecord(definition) || !isRecord(definition.signals)) continue;
    for (const signal of Object.values(definition.signals)) {
      if (typeof signal === "string" && signal) activeSignals.add(signal);
    }
  }
  const missing = FRONTEND_INTEGRITY_SIGNAL_IDS.filter(
    (signal) => !activeSignals.has(signal),
  );
  if (missing.length > 0) {
    throw new Error(
      `Frozen integrity registry is missing frontend signals: ${missing.join(", ")}`,
    );
  }
};
