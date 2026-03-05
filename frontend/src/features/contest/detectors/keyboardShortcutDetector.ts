import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

/** Keys that are dangerous when combined with Cmd/Ctrl. */
const BLOCKED_CTRL_KEYS = new Set([
  "t", "n", "w", "l", "f", "i", "j", "u", "r", "Tab", "p",
]);

/** Special modifier combos to block (beyond simple Cmd/Ctrl + key). */
const BLOCKED_COMBOS: Array<{
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  key: string;
}> = [
  // macOS Spotlight: Cmd+Space
  { meta: true, key: " " },
  // macOS Emoji Picker: Ctrl+Cmd+Space
  { ctrl: true, meta: true, key: " " },
  // macOS Screenshot tool: Cmd+Shift+5
  { meta: true, shift: true, key: "5" },
  // macOS Screenshot area: Cmd+Shift+4
  { meta: true, shift: true, key: "4" },
  // macOS Screenshot full: Cmd+Shift+3
  { meta: true, shift: true, key: "3" },
];

function matchesCombo(
  e: KeyboardEvent,
  combo: (typeof BLOCKED_COMBOS)[number],
): boolean {
  if (combo.key !== e.key) return false;
  if (combo.meta && !e.metaKey) return false;
  if (combo.ctrl && !e.ctrlKey) return false;
  if (combo.shift && !e.shiftKey) return false;
  if (combo.alt && !e.altKey) return false;
  return true;
}

export class KeyboardShortcutDetector implements ExamDetector {
  readonly id = "keyboard-shortcut" as const;
  readonly severity = "info" as const;

  private t: TFunction;
  private onViolation: ((e: ViolationEvent) => void) | null = null;
  private handleKeydown: ((e: KeyboardEvent) => void) | null = null;
  private handleBeforeprint: (() => void) | null = null;
  private printGuardStyle: HTMLStyleElement | null = null;

  constructor(t: TFunction) {
    this.t = t;
  }

  start(onViolation: (e: ViolationEvent) => void): void {
    this.onViolation = onViolation;

    this.handleKeydown = (e: KeyboardEvent) => {
      // 1. Check special modifier combos
      const comboMatch = BLOCKED_COMBOS.some((combo) =>
        matchesCombo(e, combo),
      );
      if (comboMatch) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.onViolation?.({
          detectorId: this.id,
          eventType: "forbidden_action",
          message: this.t(
            "exam.forbiddenKeyboardShortcut",
            "Keyboard shortcuts are disabled",
          ),
          severity: this.severity,
        });
        return;
      }

      // 2. Check Cmd/Ctrl + blocked key
      if ((e.metaKey || e.ctrlKey) && BLOCKED_CTRL_KEYS.has(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const message =
          e.key === "p"
            ? this.t("exam.printBlocked", "Printing is disabled during exam")
            : this.t(
                "exam.forbiddenKeyboardShortcut",
                "Keyboard shortcuts are disabled",
              );

        this.onViolation?.({
          detectorId: this.id,
          eventType: "forbidden_action",
          message,
          severity: this.severity,
        });
        return;
      }

      // 3. Block F12 (DevTools)
      if (e.key === "F12") {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.onViolation?.({
          detectorId: this.id,
          eventType: "forbidden_action",
          message: this.t(
            "exam.forbiddenKeyboardShortcut",
            "Keyboard shortcuts are disabled",
          ),
          severity: this.severity,
        });
      }
    };

    document.addEventListener("keydown", this.handleKeydown, true);

    // Print protection: beforeprint event + blocking CSS
    this.handleBeforeprint = () => {
      this.onViolation?.({
        detectorId: this.id,
        eventType: "forbidden_action",
        message: this.t(
          "exam.printBlocked",
          "Printing is disabled during exam",
        ),
        severity: this.severity,
      });
    };
    window.addEventListener("beforeprint", this.handleBeforeprint);

    this.printGuardStyle = document.createElement("style");
    this.printGuardStyle.id = "exam-print-guard";
    this.printGuardStyle.textContent =
      "@media print { body { display: none !important; } }";
    document.head.appendChild(this.printGuardStyle);
  }

  stop(): void {
    if (this.handleKeydown) {
      document.removeEventListener("keydown", this.handleKeydown, true);
      this.handleKeydown = null;
    }
    if (this.handleBeforeprint) {
      window.removeEventListener("beforeprint", this.handleBeforeprint);
      this.handleBeforeprint = null;
    }
    if (this.printGuardStyle) {
      this.printGuardStyle.remove();
      this.printGuardStyle = null;
    }
    this.onViolation = null;
  }

  async runCheck(): Promise<CheckResult> {
    return { passed: true };
  }
}
