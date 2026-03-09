import { isFullscreen } from "@/core/usecases/exam";
import { EXAM_MONITORING_RECOVERY_GRACE_MS } from "@/features/contest/domain/examMonitoringPolicy";
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

export interface FullscreenDetectorOptions {
  onCountdownChange?: (secondsLeft: number | null) => void;
}

export class FullscreenDetector implements ExamDetector {
  readonly id = "fullscreen" as const;
  readonly severity = "violation" as const;

  private t: TFunction;
  private options: FullscreenDetectorOptions;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;
  private recoveryActive = false;
  private graceStartedAt = 0;
  private handleFullscreenChange: ((event: Event) => void) | null = null;
  private lastVerifyResponse: string | null = null;

  constructor(t: TFunction, options: FullscreenDetectorOptions = {}) {
    this.t = t;
    this.options = options;
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    this.handleFullscreenChange = ((event: Event) => {
      const verifyToken = (event as Event & { __examVerify?: string }).__examVerify;
      if (verifyToken) {
        this.lastVerifyResponse = verifyToken;
        return;
      }
      // Wait 100ms for browser to settle fullscreen state
      setTimeout(() => {
        if (isFullscreen()) {
          this.clearRecovery();
          return;
        }
        this.startRecovery();
      }, 100);
    });

    document.addEventListener("fullscreenchange", this.handleFullscreenChange as EventListener);
  }

  stop(): void {
    if (this.handleFullscreenChange) {
      document.removeEventListener("fullscreenchange", this.handleFullscreenChange as EventListener);
      this.handleFullscreenChange = null;
    }
    this.clearRecovery();
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: isFullscreen(), detail: isFullscreen() ? undefined : "Not in fullscreen" };
  }

  verifyIntegrity(token: string): boolean {
    this.lastVerifyResponse = null;
    const synthetic = new Event("fullscreenchange");
    (synthetic as any).__examVerify = token;
    document.dispatchEvent(synthetic);
    return this.lastVerifyResponse === token;
  }

  private startRecovery(): void {
    if (this.recoveryActive) return;
    this.recoveryActive = true;
    this.graceStartedAt = Date.now();

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
      this.onViolation?.({
        detectorId: this.id,
        eventType: "exit_fullscreen",
        message: this.t("exam.exitedFullscreen"),
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
