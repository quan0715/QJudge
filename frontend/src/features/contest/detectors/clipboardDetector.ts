import type { ExamDetector, ViolationEvent, CheckResult } from "./types";
import type { TFunction } from "i18next";

const MAX_CLIPBOARD_METADATA_BYTES = 28 * 1024;

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

const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const trimToJsonByteLimit = (
  text: string,
  buildMetadata: (content: string) => Record<string, unknown>,
): string => {
  if (utf8ByteLength(JSON.stringify(buildMetadata(text))) <= MAX_CLIPBOARD_METADATA_BYTES) {
    return text;
  }
  const encoder = new TextEncoder();
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encoder.encode(JSON.stringify(buildMetadata(text.slice(0, mid)))).byteLength <= MAX_CLIPBOARD_METADATA_BYTES) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return text.slice(0, low);
};

/** Keep the complete metadata envelope well below the 32 KiB outbox limit. */
export const buildClipboardMetadata = ({
  action,
  rawText,
  target,
  sha256,
}: {
  action: ClipboardAction;
  rawText: string;
  target: EventTarget | null;
  sha256?: string;
}): Record<string, unknown> => {
  const metadata: Record<string, unknown> = {
    source: "clipboard_detector",
    action,
    content_captured: action === "paste",
    text_length: rawText.length,
    line_count: getLineCount(rawText),
    ...getTargetMetadata(target),
    ...(sha256 ? { sha256 } : {}),
  };
  if (action !== "paste") return metadata;

  const buildPasteMetadata = (content: string): Record<string, unknown> => ({
    ...metadata,
    content,
    content_truncated: true,
    original_text_length: rawText.length,
    captured_text_length: content.length,
  });
  const capturedText = trimToJsonByteLimit(rawText, buildPasteMetadata);
  if (capturedText === rawText) {
    return { ...metadata, content: capturedText, content_truncated: false };
  }
  return buildPasteMetadata(capturedText);
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
      const clientOccurredAtMs = Date.now();
      const action = e.type as ClipboardAction;
      const rawText =
        action === "paste"
          ? e.clipboardData?.getData("text/plain") || ""
          : getEditableText(e.target);

      void sha256Hex(rawText).catch(() => undefined).then((hash) => {
        this.onViolation?.({
          detectorId: this.id,
          eventType: "clipboard_action",
          clientOccurredAtMs,
          message: this.t("exam.clipboardAction", "Clipboard action recorded"),
          severity: this.severity,
          metadata: buildClipboardMetadata({
            action,
            rawText,
            target: e.target,
            sha256: hash,
          }),
        });
      });
    };

    this.handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      this.onViolation?.({
        detectorId: this.id,
        eventType: "forbidden_action",
        clientOccurredAtMs: Date.now(),
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
