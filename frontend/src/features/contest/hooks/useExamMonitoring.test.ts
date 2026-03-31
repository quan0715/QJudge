import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useExamMonitoring } from "./useExamMonitoring";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("useExamMonitoring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("blocks copy and notifies blocked action callback", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    const event = new Event("copy", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).not.toHaveBeenCalledWith("forbidden_action", "exam.forbiddenCopy");
    expect(onBlockedAction).toHaveBeenCalledWith("exam.forbiddenCopy");
  });

  it("blocks paste and notifies blocked action callback", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    const event = new Event("paste", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).not.toHaveBeenCalledWith("forbidden_action", "exam.forbiddenPaste");
    expect(onBlockedAction).toHaveBeenCalledWith("exam.forbiddenPaste");
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
