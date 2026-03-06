import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

export class PopupGuardDetector implements ExamDetector {
  readonly id = "popup-guard" as const;
  readonly severity = "info" as const;

  private t: TFunction;
  private originalWindowOpen: typeof window.open | null = null;
  private originalRequestPiP:
    | typeof HTMLVideoElement.prototype.requestPictureInPicture
    | null = null;
  private pipListener: ((e: Event) => void) | null = null;
  private originalRequestPermission:
    | typeof Notification.requestPermission
    | null = null;
  private onViolation: ((e: ViolationEvent) => void) | null = null;

  constructor(t: TFunction) {
    this.t = t;
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    // 1. Intercept window.open
    this.originalWindowOpen = window.open;
    window.open = (..._args: Parameters<typeof window.open>) => {
      this.onViolation?.({
        detectorId: this.id,
        eventType: "forbidden_action",
        message: this.t("exam.popupBlocked", "Popup windows are blocked"),
        severity: this.severity,
      });
      return null;
    };

    // 2. Intercept PiP API
    if (typeof HTMLVideoElement.prototype.requestPictureInPicture === "function") {
      this.originalRequestPiP =
        HTMLVideoElement.prototype.requestPictureInPicture;
      HTMLVideoElement.prototype.requestPictureInPicture = () => {
        this.onViolation?.({
          detectorId: this.id,
          eventType: "forbidden_action",
          message: this.t(
            "exam.pipBlocked",
            "Picture-in-Picture is blocked",
          ),
          severity: this.severity,
        });
        return Promise.reject(
          new DOMException("Blocked by exam mode", "NotAllowedError"),
        );
      };
    }

    // 3. Listen for PiP enter events (in case PiP was triggered externally)
    this.pipListener = (e: Event) => {
      const video = e.target as HTMLVideoElement;
      if (document.pictureInPictureElement === video) {
        document.exitPictureInPicture?.().catch(() => {});
      }
      this.onViolation?.({
        detectorId: this.id,
        eventType: "forbidden_action",
        message: this.t("exam.pipBlocked", "Picture-in-Picture is blocked"),
        severity: this.severity,
      });
    };
    document.addEventListener("enterpictureinpicture", this.pipListener, true);

    // 4. Block Notification permission requests
    if (typeof Notification !== "undefined") {
      this.originalRequestPermission = Notification.requestPermission;
      Notification.requestPermission = () =>
        Promise.resolve("denied" as NotificationPermission);
    }
  }

  stop(): void {
    if (this.originalWindowOpen) {
      window.open = this.originalWindowOpen;
      this.originalWindowOpen = null;
    }
    if (this.originalRequestPiP) {
      HTMLVideoElement.prototype.requestPictureInPicture =
        this.originalRequestPiP;
      this.originalRequestPiP = null;
    }
    if (this.pipListener) {
      document.removeEventListener(
        "enterpictureinpicture",
        this.pipListener,
        true,
      );
      this.pipListener = null;
    }
    if (this.originalRequestPermission) {
      Notification.requestPermission = this.originalRequestPermission;
      this.originalRequestPermission = null;
    }
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: true };
  }
}
