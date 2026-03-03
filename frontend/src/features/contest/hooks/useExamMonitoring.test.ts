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

  it("calls onViolation when exiting fullscreen", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    Object.defineProperty(document, "fullscreenElement", { value: null });
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(onViolation).toHaveBeenCalledWith("exit_fullscreen", "exam.exitedFullscreen");
  });

  it("calls onViolation for blur event if no recent interaction", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    // Simulate no interaction by advancing time
    vi.advanceTimersByTime(1000); // 1000ms later
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    window.dispatchEvent(new Event("blur"));

    vi.advanceTimersByTime(50); // FOCUS_CHECK_DELAY_MS

    expect(onViolation).toHaveBeenCalledWith("window_blur", "exam.windowBlur");
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

  it("blocks copy and reports forbidden action", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    const event = new Event("copy", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).toHaveBeenCalledWith("forbidden_action", "exam.forbiddenCopy");
  });

  it("blocks paste and reports forbidden action", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    const event = new Event("paste", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).toHaveBeenCalledWith("forbidden_action", "exam.forbiddenPaste");
  });

  it("blocks context menu and reports forbidden action", () => {
    const onViolation = vi.fn();
    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    const event = new Event("contextmenu", { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).toHaveBeenCalledWith(
      "forbidden_action",
      "exam.forbiddenContextMenu"
    );
  });

  it("reports multiple displays when Screen Details API detects more than one screen", async () => {
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
    await Promise.resolve();
    await Promise.resolve();

    expect(onViolation).toHaveBeenCalledWith(
      "multiple_displays",
      "exam.multipleDisplaysDetected"
    );
  });

  it("reports multiple displays when Screen Details API is unavailable but screen is extended", () => {
    const onViolation = vi.fn();
    Object.defineProperty(window.screen, "isExtended", {
      value: true,
      configurable: true,
    });

    renderHook(() => useExamMonitoring({ enabled: true, onViolation }));

    expect(onViolation).toHaveBeenCalledWith(
      "multiple_displays",
      "exam.multipleDisplaysDetected"
    );
  });
});
