import {
  EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS,
  EXAM_MONITORING_BLUR_DEBOUNCE_MS,
  EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS,
  EXAM_MONITORING_FOCUS_CHECK_DELAY_MS,
} from "@/features/contest/domain/examMonitoringPolicy";
import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

const INTERACTION_EVENTS = [
  "mousedown", "pointerdown", "click", "keydown", "keyup",
  "touchstart", "touchend", "focusin", "focusout", "input",
];

export class FocusDetector implements ExamDetector {
  readonly id = "focus" as const;
  readonly severity = "violation" as const;

  private t: TFunction;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private lastInteractionTime = 0;
  private lastVisibilityHiddenAt = 0;
  private blurCheckTimeout: ReturnType<typeof setTimeout> | undefined;
  private blurConfirmTimeout: ReturnType<typeof setTimeout> | undefined;
  private handleInteraction: (() => void) | null = null;
  private handleVisibilityChange: ((event: Event) => void) | null = null;
  private lastVerifyResponse: string | null = null;
  private handleBlur: (() => void) | null = null;
  private onInteractionCallbacks: Array<() => void> = [];

  constructor(t: TFunction) {
    this.t = t;
  }

  /** Register a callback invoked on every user interaction (for display check). */
  onInteraction(cb: () => void): void {
    this.onInteractionCallbacks.push(cb);
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    this.handleInteraction = () => {
      this.lastInteractionTime = Date.now();
      this.onInteractionCallbacks.forEach((cb) => cb());
    };

    this.handleVisibilityChange = ((event: Event) => {
      const verifyToken = (event as Event & { __examVerify?: string }).__examVerify;
      if (verifyToken) {
        this.lastVerifyResponse = verifyToken;
        return;
      }
      if (document.visibilityState === "hidden") {
        this.lastVisibilityHiddenAt = Date.now();
        this.emitViolation("tab_hidden", this.t("exam.tabHidden"));
      }
    });

    this.handleBlur = () => {
      const timeSinceInteraction = Date.now() - this.lastInteractionTime;
      if (timeSinceInteraction < EXAM_MONITORING_BLUR_DEBOUNCE_MS) return;

      clearTimeout(this.blurCheckTimeout);
      clearTimeout(this.blurConfirmTimeout);

      this.blurCheckTimeout = setTimeout(() => {
        this.blurCheckTimeout = undefined;
        if (document.hasFocus()) return;

        if (
          Date.now() - this.lastVisibilityHiddenAt <
          EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS
        ) return;

        if (document.visibilityState === "hidden") {
          this.emitViolation("window_blur", this.t("exam.windowBlur"));
          return;
        }

        this.blurConfirmTimeout = setTimeout(() => {
          this.blurConfirmTimeout = undefined;
          if (document.hasFocus()) return;
          if (
            Date.now() - this.lastVisibilityHiddenAt <
            EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS
          ) return;
          this.emitViolation("window_blur", this.t("exam.windowBlur"));
        }, EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS);
      }, EXAM_MONITORING_FOCUS_CHECK_DELAY_MS);
    };

    INTERACTION_EVENTS.forEach((ev) =>
      document.addEventListener(ev, this.handleInteraction!, true)
    );
    document.addEventListener("visibilitychange", this.handleVisibilityChange as EventListener);
    window.addEventListener("blur", this.handleBlur);
  }

  stop(): void {
    if (this.handleInteraction) {
      INTERACTION_EVENTS.forEach((ev) =>
        document.removeEventListener(ev, this.handleInteraction!, true)
      );
    }
    if (this.handleVisibilityChange) {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange as EventListener);
    }
    if (this.handleBlur) {
      window.removeEventListener("blur", this.handleBlur);
    }
    clearTimeout(this.blurCheckTimeout);
    clearTimeout(this.blurConfirmTimeout);
    this.blurCheckTimeout = undefined;
    this.blurConfirmTimeout = undefined;
    this.onViolation = null;
    this.onInteractionCallbacks = [];
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: document.hasFocus() };
  }

  /** Expose lastInteractionTime for MultiDisplayDetector interaction-triggered checks. */
  getLastInteractionTime(): number {
    return this.lastInteractionTime;
  }

  verifyIntegrity(token: string): boolean {
    this.lastVerifyResponse = null;
    const synthetic = new Event("visibilitychange");
    (synthetic as any).__examVerify = token;
    document.dispatchEvent(synthetic);
    return this.lastVerifyResponse === token;
  }

  private emitViolation(eventType: string, message: string): void {
    this.onViolation?.({
      detectorId: this.id,
      eventType,
      message,
      severity: this.severity,
    });
  }
}
