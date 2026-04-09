import { isFullscreen } from "@/core/usecases/exam";
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";

const FULLSCREEN_SETTLEMENT_MS = 100;

export class FullscreenDetector implements ExamDetector {
  readonly id = "fullscreen" as const;
  readonly severity = "violation" as const;

  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private handleFullscreenChange: ((event: Event) => void) | null = null;
  private lastVerifyResponse: string | null = null;
  private settlementTimer: ReturnType<typeof setTimeout> | null = null;

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    this.handleFullscreenChange = (event: Event) => {
      const verifyToken = (event as Event & { __examVerify?: string }).__examVerify;
      if (verifyToken) {
        this.lastVerifyResponse = verifyToken;
        return;
      }
      if (this.settlementTimer) clearTimeout(this.settlementTimer);
      this.settlementTimer = setTimeout(() => {
        this.settlementTimer = null;
        if (!isFullscreen()) {
          this.onViolation?.({
            detectorId: this.id,
            eventType: "exit_fullscreen_triggered",
            message: "Fullscreen exited",
            severity: "info",
          });
        }
      }, FULLSCREEN_SETTLEMENT_MS);
    };

    document.addEventListener("fullscreenchange", this.handleFullscreenChange as EventListener);
  }

  stop(): void {
    if (this.handleFullscreenChange) {
      document.removeEventListener("fullscreenchange", this.handleFullscreenChange as EventListener);
      this.handleFullscreenChange = null;
    }
    if (this.settlementTimer) {
      clearTimeout(this.settlementTimer);
      this.settlementTimer = null;
    }
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
}
