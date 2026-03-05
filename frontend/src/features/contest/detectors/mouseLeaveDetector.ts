import { EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS } from "@/features/contest/domain/examMonitoringPolicy";
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

export class MouseLeaveDetector implements ExamDetector {
  readonly id = "mouse-leave" as const;
  readonly severity = "warning" as const;

  private t: TFunction;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private lastReportAt = 0;
  private handleMouseLeave: ((e: MouseEvent) => void) | null = null;

  constructor(t: TFunction) {
    this.t = t;
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    this.handleMouseLeave = (e: MouseEvent) => {
      // relatedTarget === null means the mouse truly left the window
      if (e.relatedTarget !== null) return;

      const now = Date.now();
      if (now - this.lastReportAt < EXAM_MONITORING_MOUSE_LEAVE_COOLDOWN_MS) return;
      this.lastReportAt = now;

      this.onViolation?.({
        detectorId: this.id,
        eventType: "mouse_leave",
        message: this.t("exam.mouseLeftWindow", "Mouse left the window"),
        severity: this.severity,
      });
    };

    document.documentElement.addEventListener("mouseleave", this.handleMouseLeave);
  }

  stop(): void {
    if (this.handleMouseLeave) {
      document.documentElement.removeEventListener("mouseleave", this.handleMouseLeave);
      this.handleMouseLeave = null;
    }
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: true };
  }
}
