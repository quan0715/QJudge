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
    // Reset document state
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    Object.defineProperty(document, "fullscreenElement", {
      value: document.createElement("div"), // Mock some element to simulate fullscreen
      configurable: true,
    });
    Object.defineProperty(window.screen, "isExtended", {
      value: false,
      configurable: true,
    });
    delete (window as { getScreenDetails?: unknown }).getScreenDetails;
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not attach listeners if not enabled", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const onViolation = vi.fn();

    renderHook(() => useExamMonitoring({ enabled: false, onViolation }));

    expect(addEventListenerSpy).not.toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("attaches listeners when enabled", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const onViolation = vi.fn();

    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    expect(addEventListenerSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
  });

  it("calls onViolation when visibility changes to hidden", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    Object.defineProperty(document, "visibilityState", { value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onViolation).toHaveBeenCalledWith("tab_hidden", "exam.tabHidden");
  });

  it("starts fullscreen recovery countdown and records violation only after 3 seconds", () => {
    const onViolation = vi.fn();
    const onRecoveryCountdownChange = vi.fn();
    renderHook(() =>
      useExamMonitoring({ enabled: true, onViolation, onRecoveryCountdownChange })
    );

    Object.defineProperty(document, "fullscreenElement", { value: null });
    document.dispatchEvent(new Event("fullscreenchange"));

    // Wait for 100ms stabilization delay before fullscreen state is read
    vi.advanceTimersByTime(100);

    expect(onRecoveryCountdownChange).toHaveBeenCalledWith(3, "fullscreen");
    expect(onViolation).not.toHaveBeenCalledWith("exit_fullscreen", "exam.exitedFullscreen");

    vi.advanceTimersByTime(3000);
    expect(onViolation).toHaveBeenCalledWith("exit_fullscreen", "exam.exitedFullscreen");
  });

  it("cancels fullscreen violation if user returns to fullscreen within 3 seconds", () => {
    const onViolation = vi.fn();
    const onRecoveryCountdownChange = vi.fn();
    renderHook(() =>
      useExamMonitoring({ enabled: true, onViolation, onRecoveryCountdownChange })
    );

    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    document.dispatchEvent(new Event("fullscreenchange"));
    vi.advanceTimersByTime(100); // stabilization delay
    vi.advanceTimersByTime(2000);

    Object.defineProperty(document, "fullscreenElement", {
      value: document.createElement("div"),
      configurable: true,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    vi.advanceTimersByTime(100); // stabilization delay
    vi.advanceTimersByTime(2000);

    expect(onViolation).not.toHaveBeenCalledWith("exit_fullscreen", "exam.exitedFullscreen");
    expect(onRecoveryCountdownChange).toHaveBeenCalledWith(null, "fullscreen");
  });

  it("calls onViolation for blur event if no recent interaction", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    // Simulate no interaction by advancing time
    vi.advanceTimersByTime(1000); // 1000ms later
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    window.dispatchEvent(new Event("blur"));

    vi.advanceTimersByTime(800); // FOCUS_CHECK_DELAY_MS + confirmation window

    expect(onViolation).toHaveBeenCalledWith("window_blur", "exam.windowBlur");
  });

  it("does not duplicate window_blur right after tab_hidden", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(1000);

    expect(onViolation).toHaveBeenCalledWith("tab_hidden", "exam.tabHidden");
    expect(onViolation).not.toHaveBeenCalledWith("window_blur", "exam.windowBlur");
  });

  it("ignores blur event if there was recent interaction", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    // Simulate interaction
    document.dispatchEvent(new Event("click"));
    
    // Blur right after interaction
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    window.dispatchEvent(new Event("blur"));

    vi.advanceTimersByTime(50); // FOCUS_CHECK_DELAY_MS

    expect(onViolation).not.toHaveBeenCalled();
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

  it("reports multiple displays after 2 consecutive detections (debounce)", async () => {
    const onViolation = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        screens: [{ id: 1 }, { id: 2 }],
        addEventListener,
        removeEventListener,
      }),
    });

    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));
    // First poll — detection count = 1, not yet reported
    await vi.advanceTimersByTimeAsync(0);
    expect(onViolation).not.toHaveBeenCalledWith(
      "multiple_displays",
      "exam.multipleDisplaysDetected"
    );

    // Second poll — detection count = 2, now reported
    await vi.advanceTimersByTimeAsync(5000);
    expect(onViolation).toHaveBeenCalledWith(
      "multiple_displays",
      "exam.multipleDisplaysDetected"
    );
  });

  it("reports multiple displays after 2 polls when display is extended", async () => {
    const onViolation = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        screens: [{ id: 1 }],
        addEventListener,
        removeEventListener,
      }),
    });
    Object.defineProperty(window.screen, "isExtended", {
      value: true,
      configurable: true,
    });

    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));
    // First poll
    await vi.advanceTimersByTimeAsync(0);
    expect(onViolation).not.toHaveBeenCalledWith(
      "multiple_displays",
      "exam.multipleDisplaysDetected"
    );

    // Second poll
    await vi.advanceTimersByTimeAsync(5000);
    expect(onViolation).toHaveBeenCalledWith(
      "multiple_displays",
      "exam.multipleDisplaysDetected"
    );
  });

  it("reports multiple displays after 2 polls when API unavailable but screen is extended", async () => {
    const onViolation = vi.fn();
    Object.defineProperty(window.screen, "isExtended", {
      value: true,
      configurable: true,
    });

    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));
    // First poll — API unavailable, falls back to sync isExtended check, count = 1
    await vi.advanceTimersByTimeAsync(0);
    expect(onViolation).not.toHaveBeenCalledWith(
      "multiple_displays",
      "exam.multipleDisplaysDetected"
    );

    // Second poll
    await vi.advanceTimersByTimeAsync(5000);
    expect(onViolation).toHaveBeenCalledWith(
      "multiple_displays",
      "exam.multipleDisplaysDetected"
    );
  });

  it("reports display_api_degraded warning after 3 consecutive API failures", async () => {
    const onViolation = vi.fn();

    // API is "supported" but always rejects (simulates permission revoked)
    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("Permission denied")),
    });

    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));
    // Poll 1
    await vi.advanceTimersByTimeAsync(0);
    // Poll 2
    await vi.advanceTimersByTimeAsync(5000);
    expect(onViolation).not.toHaveBeenCalledWith(
      "display_api_degraded",
      expect.any(String)
    );

    // Poll 3 — threshold reached
    await vi.advanceTimersByTimeAsync(5000);
    expect(onViolation).toHaveBeenCalledWith(
      "display_api_degraded",
      "exam.displayApiDegraded"
    );
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
    const originalOpen = window.open;
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    const result = window.open("https://example.com");

    expect(result).toBeNull();
    expect(onBlockedAction).toHaveBeenCalledWith("exam.popupBlocked");

    // Cleanup: window.open is restored by detector stop, but let's verify
    // it won't affect other tests by unmounting (renderHook cleanup)
  });

  it("calls onBlockedAction on enterpictureinpicture event", () => {
    const onViolation = vi.fn();
    const onBlockedAction = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation, onBlockedAction }));

    document.dispatchEvent(new Event("enterpictureinpicture", { bubbles: true }));

    expect(onBlockedAction).toHaveBeenCalledWith("exam.pipBlocked");
  });
});
