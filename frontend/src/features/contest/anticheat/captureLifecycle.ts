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

