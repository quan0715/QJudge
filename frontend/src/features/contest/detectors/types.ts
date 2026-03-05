export type ExamDetectorId =
  | "fullscreen"
  | "multi-display"
  | "focus"
  | "keyboard-shortcut"
  | "mouse-leave"
  | "clipboard"
  | "popup-guard";

export type ViolationSeverity = "info" | "warning" | "violation";

export interface ViolationEvent {
  detectorId: ExamDetectorId;
  eventType: string;
  message: string;
  severity: ViolationSeverity;
}

export interface CheckResult {
  passed: boolean;
  detail?: string;
}

export interface ExamDetector {
  readonly id: ExamDetectorId;
  readonly severity: ViolationSeverity;
  start(onViolation: (e: ViolationEvent) => void): void;
  stop(): void;
  runCheck(): Promise<CheckResult>;
}
