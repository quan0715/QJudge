import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useExamMonitoring } from "./useExamMonitoring";
import { recordExamEvent } from "@/infrastructure/api/repositories";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  recordExamEvent: vi.fn().mockResolvedValue(null),
}));

describe("useExamMonitoring", () => {
  beforeEach(() => {
    vi.mocked(recordExamEvent).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not attach listeners if not enabled", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const onViolation = vi.fn();

    renderHook(() => useExamMonitoring({ enabled: false, onViolation }));

    // ClipboardDetector would add copy/paste/cut listeners
    expect(addEventListenerSpy).not.toHaveBeenCalledWith("copy", expect.any(Function), expect.anything());
  });

  it("attaches clipboard listeners when enabled", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const onViolation = vi.fn();

    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    // ClipboardDetector should attach copy listener
    expect(addEventListenerSpy).toHaveBeenCalledWith("copy", expect.any(Function));
  });

  it("records copy without blocking or storing content", async () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({
      contestId: "contest-1",
      enabled: true,
      onViolation,
      onBlockedAction,
    }));

    const event = new Event("copy", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onViolation).not.toHaveBeenCalled();
    expect(onBlockedAction).not.toHaveBeenCalled();
    await waitFor(() => expect(recordExamEvent).toHaveBeenCalled());
    expect(recordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "clipboard_action",
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: "copy",
          content_captured: false,
          source: "clipboard_detector",
        }),
      }),
    );
    expect(
      (vi.mocked(recordExamEvent).mock.calls[0][2] as { metadata?: Record<string, unknown> })?.metadata,
    ).not.toHaveProperty("content");
  });

  it("records paste content without blocking", async () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({
      contestId: "contest-1",
      enabled: true,
      onViolation,
      onBlockedAction,
    }));

    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text/plain" ? "line 1\nline 2" : ""),
      },
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onViolation).not.toHaveBeenCalled();
    expect(onBlockedAction).not.toHaveBeenCalled();
    await waitFor(() => expect(recordExamEvent).toHaveBeenCalled());
    expect(recordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "clipboard_action",
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: "paste",
          content: "line 1\nline 2",
          content_captured: true,
          content_truncated: false,
          line_count: 2,
          text_length: 13,
        }),
      }),
    );
  });

  it("truncates oversized paste content before recording", async () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({
      contestId: "contest-1",
      enabled: true,
      onViolation,
    }));

    const content = "x".repeat(50001);
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text/plain" ? content : ""),
      },
    });
    document.dispatchEvent(event);

    await waitFor(() => expect(recordExamEvent).toHaveBeenCalled());
    const metadata = (vi.mocked(recordExamEvent).mock.calls[0][2] as { metadata?: Record<string, unknown> })
      ?.metadata as Record<string, unknown>;
    expect(metadata.content).toBe("x".repeat(50000));
    expect(metadata.content_truncated).toBe(true);
    expect(metadata.original_text_length).toBe(50001);
    expect(metadata.captured_text_length).toBe(50000);
  });

  it("records cut without blocking or storing content", async () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({
      contestId: "contest-1",
      enabled: true,
      onViolation,
      onBlockedAction,
    }));

    const event = new Event("cut", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    await waitFor(() => expect(recordExamEvent).toHaveBeenCalled());
    expect(recordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "clipboard_action",
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: "cut",
          content_captured: false,
        }),
      }),
    );
    expect(onViolation).not.toHaveBeenCalled();
    expect(onBlockedAction).not.toHaveBeenCalled();
    expect(
      (vi.mocked(recordExamEvent).mock.calls[0][2] as { metadata?: Record<string, unknown> })?.metadata,
    ).not.toHaveProperty("content");
  });

  it("blocks context menu and notifies blocked action callback", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    const event = new Event("contextmenu", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).not.toHaveBeenCalledWith(
      "forbidden_action",
      "exam.forbiddenContextMenu"
    );
    expect(onBlockedAction).toHaveBeenCalledWith("exam.forbiddenContextMenu");
  });

  // --- KeyboardShortcutDetector extended tests ---

  it("blocks Cmd+Space (Spotlight) and calls onBlockedAction", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    const event = new KeyboardEvent("keydown", {
      key: " ",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBlockedAction).toHaveBeenCalledWith("exam.forbiddenKeyboardShortcut");
  });

  it("blocks Cmd+P (print) and calls onBlockedAction", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    const event = new KeyboardEvent("keydown", {
      key: "p",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBlockedAction).toHaveBeenCalledWith("exam.printBlocked");
  });

  it("blocks F12 (DevTools) and calls onBlockedAction", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    const event = new KeyboardEvent("keydown", {
      key: "F12",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBlockedAction).toHaveBeenCalledWith("exam.forbiddenKeyboardShortcut");
  });

  it("triggers onBlockedAction on beforeprint event", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    window.dispatchEvent(new Event("beforeprint"));

    expect(onBlockedAction).toHaveBeenCalledWith("exam.printBlocked");
  });

  // --- PopupGuardDetector tests ---

  it("blocks window.open and calls onBlockedAction", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    const result = window.open("https://example.com");

    expect(result).toBeNull();
    expect(onBlockedAction).toHaveBeenCalledWith("exam.popupBlocked");
  });

  it("calls onBlockedAction on enterpictureinpicture event", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    document.dispatchEvent(new Event("enterpictureinpicture", { bubbles: true }));

    expect(onBlockedAction).toHaveBeenCalledWith("exam.pipBlocked");
  });
});
