import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

const MAX_CAPTURED_PASTE_BYTES = 50000;

type ClipboardAction = "copy" | "cut" | "paste";

const getEditableText = (target: EventTarget | null): string => {
  const element = target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!element || typeof element !== "object") return "";
  if (
    (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) &&
    typeof element.selectionStart === "number" &&
    typeof element.selectionEnd === "number"
  ) {
    return element.value.slice(element.selectionStart, element.selectionEnd);
  }
  return document.getSelection()?.toString() || "";
};

const getLineCount = (text: string): number => {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
};

const getTargetMetadata = (target: EventTarget | null): Record<string, unknown> => {
  const element = target as HTMLElement | null;
  const tagName = element?.tagName?.toLowerCase() || "unknown";
  const isEditable =
    !!element &&
    (
      element.isContentEditable ||
      tagName === "textarea" ||
      tagName === "input"
    );
  return {
    target_tag: tagName,
    is_editable: isEditable,
  };
};

const sha256Hex = async (text: string): Promise<string | undefined> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const data = new TextEncoder().encode(text);
  const digest = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const truncateUtf8 = (text: string, maxBytes: number): string => {
  const encoder = new TextEncoder();
  if (encoder.encode(text).byteLength <= maxBytes) return text;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encoder.encode(text.slice(0, mid)).byteLength <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return text.slice(0, low);
};

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
      const action = e.type as ClipboardAction;
      const rawText =
        action === "paste"
          ? e.clipboardData?.getData("text/plain") || ""
          : getEditableText(e.target);
      const capturedText =
        action === "paste"
          ? truncateUtf8(rawText, MAX_CAPTURED_PASTE_BYTES)
          : "";

      void sha256Hex(rawText).catch(() => undefined).then((hash) => {
        const metadata: Record<string, unknown> = {
          source: "clipboard_detector",
          action,
          content_captured: action === "paste",
          text_length: rawText.length,
          line_count: getLineCount(rawText),
          ...getTargetMetadata(e.target),
        };

        if (hash) metadata.sha256 = hash;
        if (action === "paste") {
          metadata.content = capturedText;
          metadata.content_truncated = rawText.length > capturedText.length;
          if (metadata.content_truncated) {
            metadata.original_text_length = rawText.length;
            metadata.captured_text_length = capturedText.length;
          }
        }

        this.onViolation?.({
          detectorId: this.id,
          eventType: "clipboard_action",
          message: this.t("exam.clipboardAction", "Clipboard action recorded"),
          severity: this.severity,
          metadata,
        });
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
