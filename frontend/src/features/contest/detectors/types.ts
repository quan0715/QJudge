export type ExamDetectorId =
  | "multi-display"
  | "keyboard-shortcut"
  | "clipboard"
  | "popup-guard";

export type ViolationSeverity = "info" | "warning" | "violation";

export interface ViolationEvent {
  detectorId: ExamDetectorId;
  eventType: string;
  clientOccurredAtMs: number;
  message: string;
  severity: ViolationSeverity;
  metadata?: Record<string, unknown>;
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
