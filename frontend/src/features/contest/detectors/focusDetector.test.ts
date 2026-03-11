import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { FocusDetector } from "./focusDetector";

const t = ((key: string) => key) as TFunction;

describe("FocusDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("ignores blur while IME composition is active", () => {
    const onViolation = vi.fn();
    const detector = new FocusDetector(t);
    detector.start(onViolation);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new Event("compositionstart", { bubbles: true }));

    vi.advanceTimersByTime(1000);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(1000);

    expect(onViolation).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "window_blur" })
    );

    input.remove();
    detector.stop();
  });

  it("ignores blur shortly after IME composition ends", () => {
    const onViolation = vi.fn();
    const detector = new FocusDetector(t);
    detector.start(onViolation);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    const input = document.createElement("input");
    document.body.appendChild(input);
    vi.advanceTimersByTime(500);
    input.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    input.dispatchEvent(new Event("compositionend", { bubbles: true }));

    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(1000);

    expect(onViolation).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "window_blur" })
    );

    input.remove();
    detector.stop();
  });

  it("still emits window_blur when not composing", () => {
    const onViolation = vi.fn();
    const detector = new FocusDetector(t);
    detector.start(onViolation);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    vi.advanceTimersByTime(1000);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(1000);

    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "window_blur", detectorId: "focus" })
    );

    detector.stop();
  });
});
