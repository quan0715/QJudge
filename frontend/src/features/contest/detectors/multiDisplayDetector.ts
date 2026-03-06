import {
  EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS,
  EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS,
  EXAM_MONITORING_DISPLAY_API_FAILURE_THRESHOLD,
  EXAM_MONITORING_DISPLAY_CONFIRM_COUNT,
  type ScreenDetailsLike,
} from "@/features/contest/domain/examMonitoringPolicy";
import { DisplayCheckService } from "./displayCheckService";
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

export class MultiDisplayDetector implements ExamDetector {
  readonly id = "multi-display" as const;
  readonly severity = "violation" as const;

  private t: TFunction;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private disposed = false;
  private lastReportAt = 0;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  private displayService: DisplayCheckService;
  private attachedScreenDetails: ScreenDetailsLike | null = null;
  private detachScreensChangeListener: (() => void) | null = null;

  // Fix 1: consecutive detection counter for isExtended debounce
  private consecutiveDetections = 0;

  // Fix 2: track consecutive API failures
  private consecutiveApiFailures = 0;
  private apiDegradedReported = false;

  constructor(t: TFunction, displayService?: DisplayCheckService) {
    this.t = t;
    this.displayService = displayService ?? new DisplayCheckService();
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;
    this.disposed = false;
    this.consecutiveDetections = 0;
    this.consecutiveApiFailures = 0;
    this.apiDegradedReported = false;

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
    this.attachedScreenDetails = null;
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    const diag = await this.displayService.check();
    if (diag.isExtended) return { passed: false, detail: "Screen is extended" };
    if (diag.screenCount !== null && diag.screenCount > 1) {
      return { passed: false, detail: `${diag.screenCount} screens detected` };
    }
    return { passed: true };
  }

  triggerCheck(): void {
    void this.ensureSingleDisplay();
  }

  // Fix 5: stable bound reference for screenschange
  private handleScreensChange = () => {
    // screenschange from the API is authoritative — check screenCount directly
    const details = this.displayService.getLastScreenDetails();
    const screens = details?.screens;
    if (Array.isArray(screens) && screens.length > 1) {
      // Fix 1: screenCount > 1 from event is definitive, report immediately
      this.consecutiveDetections = EXAM_MONITORING_DISPLAY_CONFIRM_COUNT;
      this.reportViolation();
    } else {
      // trigger a full check for isExtended
      void this.ensureSingleDisplay();
    }
  };

  private reportViolation(): void {
    const now = Date.now();
    if (now - this.lastReportAt < EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS) return;
    this.lastReportAt = now;
    this.onViolation?.({
      detectorId: this.id,
      eventType: "multiple_displays",
      message: this.t(
        "exam.multipleDisplaysDetected",
        "Multiple displays detected. Please keep only one physical screen connected.",
      ),
      severity: this.severity,
    });
  }

  private reportApiDegraded(): void {
    if (this.apiDegradedReported) return;
    this.apiDegradedReported = true;
    this.onViolation?.({
      detectorId: this.id,
      eventType: "display_api_degraded",
      message: this.t(
        "exam.displayApiDegraded",
        "Display monitoring API is unavailable. The system may not detect multiple displays.",
      ),
      severity: "warning",
    });
  }

  private async ensureSingleDisplay(): Promise<void> {
    if (this.disposed) return;

    // Fix 3: timeout is handled inside DisplayCheckService
    const diag = await this.displayService.check();
    if (this.disposed) return;

    // Fix 2: track API failures
    if (diag.supportsScreenDetails && diag.screenCount === null) {
      this.consecutiveApiFailures++;
      if (this.consecutiveApiFailures >= EXAM_MONITORING_DISPLAY_API_FAILURE_THRESHOLD) {
        this.reportApiDegraded();
      }
      // Fall back to sync check
      if (this.displayService.checkExtendedSync()) {
        this.handleDetection();
      }
      return;
    }

    // API succeeded — reset failure counter
    this.consecutiveApiFailures = 0;
    this.apiDegradedReported = false;

    const multiDetected =
      diag.isExtended || (diag.screenCount !== null && diag.screenCount > 1);

    if (multiDetected) {
      this.handleDetection();
    } else {
      this.consecutiveDetections = 0;
    }

    // Fix 4 & 5: attach screenschange event listener
    const currentDetails = this.displayService.getLastScreenDetails();
    if (
      currentDetails &&
      this.attachedScreenDetails !== currentDetails &&
      typeof currentDetails.addEventListener === "function"
    ) {
      // Detach from old reference
      if (this.detachScreensChangeListener) {
        this.detachScreensChangeListener();
        this.detachScreensChangeListener = null;
      }
      currentDetails.addEventListener("screenschange", this.handleScreensChange as EventListener);
      this.attachedScreenDetails = currentDetails;
      this.detachScreensChangeListener = () => {
        currentDetails.removeEventListener(
          "screenschange",
          this.handleScreensChange as EventListener,
        );
      };
    }
  }

  // Fix 1: require consecutive detections before reporting
  private handleDetection(): void {
    this.consecutiveDetections++;
    if (this.consecutiveDetections >= EXAM_MONITORING_DISPLAY_CONFIRM_COUNT) {
      this.reportViolation();
    }
  }
}
