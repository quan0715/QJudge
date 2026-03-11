import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXAM_MONITORING_RECOVERY_GRACE_MS } from "@/features/contest/domain/examMonitoringPolicy";
import type { TFunction } from "i18next";
import { MouseLeaveDetector } from "./mouseLeaveDetector";

const t = ((key: string) => key) as TFunction;

describe("MouseLeaveDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores mouseleave while IME composition is active", () => {
    const onViolation = vi.fn();
    const detector = new MouseLeaveDetector(t);
    detector.start(onViolation);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new Event("compositionstart", { bubbles: true }));

    document.documentElement.dispatchEvent(
      new MouseEvent("mouseleave", { bubbles: false, cancelable: true, relatedTarget: null })
    );
    vi.advanceTimersByTime(EXAM_MONITORING_RECOVERY_GRACE_MS + 50);

    expect(onViolation).not.toHaveBeenCalled();

    input.remove();
    detector.stop();
  });

  it("ignores mouseleave shortly after IME composition ends", () => {
    const onViolation = vi.fn();
    const detector = new MouseLeaveDetector(t);
    detector.start(onViolation);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    input.dispatchEvent(new Event("compositionend", { bubbles: true }));

    document.documentElement.dispatchEvent(
      new MouseEvent("mouseleave", { bubbles: false, cancelable: true, relatedTarget: null })
    );
    vi.advanceTimersByTime(EXAM_MONITORING_RECOVERY_GRACE_MS + 50);

    expect(onViolation).not.toHaveBeenCalled();

    input.remove();
    detector.stop();
  });

  it("still reports regular mouseleave when not composing", () => {
    const onViolation = vi.fn();
    const detector = new MouseLeaveDetector(t);
    detector.start(onViolation);

    document.documentElement.dispatchEvent(
      new MouseEvent("mouseleave", { bubbles: false, cancelable: true, relatedTarget: null })
    );

    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "mouse_leave_triggered", detectorId: "mouse-leave" })
    );

    vi.advanceTimersByTime(EXAM_MONITORING_RECOVERY_GRACE_MS + 50);

    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "mouse_leave", detectorId: "mouse-leave" })
    );

    detector.stop();
  });
});
