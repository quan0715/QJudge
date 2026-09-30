export type CaptureStopReason =
  | "manual"
  | "submitted"
  | "contest_ended"
  | "monitor_disabled"
  | "screen_share_timeout_submit"
  | "fullscreen_exit_submit"
  | "unmount";

export interface CaptureStopResult {
  reason: CaptureStopReason;
  status: "stopped" | "already_stopped";
  timestamp: string;
}

export type CaptureStopHandler = (reason?: CaptureStopReason) => CaptureStopResult;

const stopHandlers = new Map<string, CaptureStopHandler>();

export const registerCaptureStopHandler = (
  contestId: string,
  handler: CaptureStopHandler,
) => {
  if (!contestId) return;
  stopHandlers.set(contestId, handler);
};

export const unregisterCaptureStopHandler = (
  contestId: string,
  handler?: CaptureStopHandler,
) => {
  if (!contestId) return;
  if (!handler) {
    stopHandlers.delete(contestId);
    return;
  }
  const current = stopHandlers.get(contestId);
  if (current === handler) {
    stopHandlers.delete(contestId);
  }
};

export const stopCaptureForContest = (
  contestId: string,
  reason: CaptureStopReason = "manual",
): CaptureStopResult | null => {
  const handler = stopHandlers.get(contestId);
  if (!handler) return null;
  try {
    return handler(reason);
  } catch {
    return null;
  }
};
