import {
  EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS,
  EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS,
} from "@/features/contest/domain/examMonitoringPolicy";
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

interface ScreenDetailsLike extends EventTarget {
  screens?: unknown[];
}

type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

export class MultiDisplayDetector implements ExamDetector {
  readonly id = "multi-display" as const;
  readonly severity = "violation" as const;

  private t: TFunction;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private disposed = false;
  private lastReportAt = 0;
  private screenDetails: ScreenDetailsLike | null = null;
  private attachedScreenDetails: ScreenDetailsLike | null = null;
  private detachScreensChangeListener: (() => void) | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(t: TFunction) {
    this.t = t;
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;
    this.disposed = false;

    void this.ensureSingleDisplay();
    this.pollInterval = setInterval(() => {
      void this.ensureSingleDisplay();
    }, EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS);
  }

  stop(): void {
    this.disposed = true;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.detachScreensChangeListener) {
      this.detachScreensChangeListener();
      this.detachScreensChangeListener = null;
    }
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    const extended = this.checkScreenExtended();
    if (extended) return { passed: false, detail: "Screen is extended" };
    const getScreenDetails = (window as WindowWithScreenDetails).getScreenDetails;
    if (getScreenDetails) {
      try {
        const details = await getScreenDetails();
        if (Array.isArray(details.screens) && details.screens.length > 1) {
          return { passed: false, detail: `${details.screens.length} screens detected` };
        }
      } catch {
        // permission denied — fall through
      }
    }
    return { passed: true };
  }

  /** Trigger a check on user interaction (called by orchestrator). */
  triggerCheck(): void {
    void this.ensureSingleDisplay();
  }

  private checkScreenExtended(): boolean {
    const screenWithExtended = window.screen as Screen & { isExtended?: boolean };
    return screenWithExtended.isExtended === true;
  }

  private hasMultipleDisplays(screens: unknown[] | undefined): boolean {
    return Array.isArray(screens) && screens.length > 1;
  }

  private evaluateDisplays(screens: unknown[] | undefined): void {
    if (this.hasMultipleDisplays(screens) || this.checkScreenExtended()) {
      this.reportViolation();
    }
  }

  private reportViolation(): void {
    const now = Date.now();
    if (now - this.lastReportAt < EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS) return;
    this.lastReportAt = now;
    this.onViolation?.({
      detectorId: this.id,
      eventType: "multiple_displays",
      message: this.t("exam.multipleDisplaysDetected",
        "Multiple displays detected. Please keep only one physical screen connected."
      ),
      severity: this.severity,
    });
  }

  private async ensureSingleDisplay(): Promise<void> {
    if (this.disposed) return;

    if (this.screenDetails) {
      this.evaluateDisplays(this.screenDetails.screens);
    }

    const getScreenDetails = (window as WindowWithScreenDetails).getScreenDetails;
    if (!getScreenDetails) {
      if (this.checkScreenExtended()) this.reportViolation();
      return;
    }

    try {
      const details = await getScreenDetails();
      if (this.disposed) return;

      this.screenDetails = details;
      this.evaluateDisplays(details.screens);

      if (
        this.attachedScreenDetails !== details &&
        typeof details.addEventListener === "function"
      ) {
        if (this.detachScreensChangeListener) {
          this.detachScreensChangeListener();
          this.detachScreensChangeListener = null;
        }
        const onScreensChange = () => this.evaluateDisplays(this.screenDetails?.screens);
        details.addEventListener("screenschange", onScreensChange as EventListener);
        this.attachedScreenDetails = details;
        this.detachScreensChangeListener = () => {
          details.removeEventListener("screenschange", onScreensChange as EventListener);
        };
      }
    } catch {
      if (this.checkScreenExtended()) this.reportViolation();
    }
  }
}
