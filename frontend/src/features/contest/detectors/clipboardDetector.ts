import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

export class ClipboardDetector implements ExamDetector {
  readonly id = "clipboard" as const;
  readonly severity = "info" as const;

  private t: TFunction;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private handleCopyPaste: ((e: ClipboardEvent) => void) | null = null;
  private handleContextMenu: ((e: MouseEvent) => void) | null = null;

  constructor(t: TFunction) {
    this.t = t;
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    this.handleCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const messageKey =
        e.type === "copy" || e.type === "cut"
          ? "exam.forbiddenCopy"
          : "exam.forbiddenPaste";
      this.onViolation?.({
        detectorId: this.id,
        eventType: "forbidden_action",
        message: this.t(messageKey),
        severity: this.severity,
      });
    };

    this.handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      this.onViolation?.({
        detectorId: this.id,
        eventType: "forbidden_action",
        message: this.t("exam.forbiddenContextMenu", "Context menu is forbidden"),
        severity: this.severity,
      });
    };

    document.addEventListener("copy", this.handleCopyPaste);
    document.addEventListener("cut", this.handleCopyPaste);
    document.addEventListener("paste", this.handleCopyPaste);
    document.addEventListener("contextmenu", this.handleContextMenu);
  }

  stop(): void {
    if (this.handleCopyPaste) {
      document.removeEventListener("copy", this.handleCopyPaste);
      document.removeEventListener("cut", this.handleCopyPaste);
      document.removeEventListener("paste", this.handleCopyPaste);
    }
    if (this.handleContextMenu) {
      document.removeEventListener("contextmenu", this.handleContextMenu);
    }
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: true };
  }
}
