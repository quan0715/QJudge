import {
  EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS,
  EXAM_MONITORING_RECOVERY_GRACE_MS,
} from "@/features/contest/domain/examMonitoringPolicy";
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

const IME_COMPOSITION_GUARD_MS = 900;

export interface MouseLeaveDetectorOptions {
  onCountdownChange?: (secondsLeft: number | null) => void;
}

export class MouseLeaveDetector implements ExamDetector {
  readonly id = "mouse-leave" as const;
  readonly severity = "warning" as const;

  private t: TFunction;
  private options: MouseLeaveDetectorOptions;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private lastReportAt = 0;
  private handleMouseLeave: ((e: MouseEvent) => void) | null = null;
  private handleMouseEnter: (() => void) | null = null;
  private recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;
  private recoveryActive = false;
  private graceStartedAt = 0;
  private isComposing = false;
  private lastCompositionEndAt = 0;
  private handleCompositionStart: (() => void) | null = null;
  private handleCompositionEnd: (() => void) | null = null;

  constructor(t: TFunction, options: MouseLeaveDetectorOptions = {}) {
    this.t = t;
    this.options = options;
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    this.handleMouseLeave = (e: MouseEvent) => {
      // relatedTarget === null means the mouse truly left the window
      if (e.relatedTarget !== null) return;
      if (this.isComposing) return;
      if (Date.now() - this.lastCompositionEndAt < IME_COMPOSITION_GUARD_MS) return;
      if (this.recoveryActive) return; // already in recovery

      const now = Date.now();
      if (now - this.lastReportAt < EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS) return;

      this.startRecovery();
    };

    this.handleCompositionStart = () => {
      this.isComposing = true;
    };

    this.handleCompositionEnd = () => {
      this.isComposing = false;
      this.lastCompositionEndAt = Date.now();
    };

    this.handleMouseEnter = () => {
      // Mouse came back — cancel pending violation
      if (this.recoveryActive) {
        this.clearRecovery();
      }
    };

    document.documentElement.addEventListener("mouseleave", this.handleMouseLeave);
    document.documentElement.addEventListener("mouseenter", this.handleMouseEnter);
    document.addEventListener("compositionstart", this.handleCompositionStart, true);
    document.addEventListener("compositionend", this.handleCompositionEnd, true);
  }

  stop(): void {
    if (this.handleMouseLeave) {
      document.documentElement.removeEventListener("mouseleave", this.handleMouseLeave);
      this.handleMouseLeave = null;
    }
    if (this.handleMouseEnter) {
      document.documentElement.removeEventListener("mouseenter", this.handleMouseEnter);
      this.handleMouseEnter = null;
    }
    if (this.handleCompositionStart) {
      document.removeEventListener("compositionstart", this.handleCompositionStart, true);
      this.handleCompositionStart = null;
    }
    if (this.handleCompositionEnd) {
      document.removeEventListener("compositionend", this.handleCompositionEnd, true);
      this.handleCompositionEnd = null;
    }
    this.clearRecovery();
    this.isComposing = false;
    this.lastCompositionEndAt = 0;
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: true };
  }

  private startRecovery(): void {
    if (this.recoveryActive) return;
    this.recoveryActive = true;
    this.graceStartedAt = Date.now();

    // Record trigger event immediately (P2 trace — no penalty, no modal)
    this.onViolation?.({
      detectorId: this.id,
      eventType: "mouse_leave_triggered",
      message: this.t("exam.mouseLeftWindow", "Mouse left the window"),
      severity: "info",
    });

    const graceSeconds = EXAM_MONITORING_RECOVERY_GRACE_MS / 1000;
    this.options.onCountdownChange?.(graceSeconds);

    this.recoveryInterval = setInterval(() => {
      const elapsed = Date.now() - this.graceStartedAt;
      const remaining = Math.ceil((EXAM_MONITORING_RECOVERY_GRACE_MS - elapsed) / 1000);
      if (remaining > 0) {
        this.options.onCountdownChange?.(remaining);
      }
    }, 1000);

    this.recoveryTimeout = setTimeout(() => {
      this.clearRecovery();
      this.lastReportAt = Date.now();
      this.onViolation?.({
        detectorId: this.id,
        eventType: "mouse_leave",
        message: this.t("exam.mouseLeftWindow", "Mouse left the window"),
        severity: this.severity,
      });
    }, EXAM_MONITORING_RECOVERY_GRACE_MS);
  }

  private clearRecovery(): void {
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
      this.recoveryTimeout = null;
    }
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
    this.recoveryActive = false;
    this.options.onCountdownChange?.(null);
  }
}
