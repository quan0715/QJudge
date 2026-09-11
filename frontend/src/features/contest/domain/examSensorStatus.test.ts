import { describe, expect, it } from "vitest";
import {
  examSensorTone,
  isSensorRecoverableByModal,
  resolveActiveExamSensorSource,
  type ExamSensorSnapshot,
} from "./examSensorStatus";

const quiet: ExamSensorSnapshot = {
  policyUnavailable: false,
  pwaRequired: false,
  screenShareInterrupted: false,
  webcamInterrupted: false,
  viewportInterrupted: false,
  fullscreenInterrupted: false,
  mouseLeaveInterrupted: false,
  multiDisplayInterrupted: false,
  isTablet: false,
};

describe("resolveActiveExamSensorSource", () => {
  it("returns null when every sensor is healthy", () => {
    expect(resolveActiveExamSensorSource(quiet)).toBeNull();
  });

  it("reports screen share over fullscreen when leaving fullscreen also killed the share", () => {
    expect(
      resolveActiveExamSensorSource({
        ...quiet,
        fullscreenInterrupted: true,
        screenShareInterrupted: true,
      }),
    ).toBe("screen_share");
  });

  it("keeps policy problems ahead of every sensor", () => {
    expect(
      resolveActiveExamSensorSource({
        ...quiet,
        policyUnavailable: true,
        pwaRequired: true,
        screenShareInterrupted: true,
      }),
    ).toBe("policy_unavailable");
  });

  it("splits viewport interruption by device class", () => {
    expect(
      resolveActiveExamSensorSource({ ...quiet, viewportInterrupted: true }),
    ).toBe("viewport");
    expect(
      resolveActiveExamSensorSource({
        ...quiet,
        viewportInterrupted: true,
        isTablet: true,
      }),
    ).toBe("split_view");
  });

  it("falls through the full ladder in priority order", () => {
    expect(
      resolveActiveExamSensorSource({ ...quiet, webcamInterrupted: true, fullscreenInterrupted: true }),
    ).toBe("webcam");
    expect(
      resolveActiveExamSensorSource({ ...quiet, fullscreenInterrupted: true, mouseLeaveInterrupted: true }),
    ).toBe("fullscreen");
    expect(
      resolveActiveExamSensorSource({ ...quiet, mouseLeaveInterrupted: true, multiDisplayInterrupted: true }),
    ).toBe("mouse_leave");
    expect(
      resolveActiveExamSensorSource({ ...quiet, multiDisplayInterrupted: true }),
    ).toBe("multiple_displays");
  });
});

describe("examSensorTone", () => {
  it("marks source loss and policy failure critical, local sensors warning", () => {
    expect(examSensorTone("screen_share")).toBe("critical");
    expect(examSensorTone("webcam")).toBe("critical");
    expect(examSensorTone("policy_unavailable")).toBe("critical");
    expect(examSensorTone("pwa_required")).toBe("critical");
    expect(examSensorTone("fullscreen")).toBe("warning");
    expect(examSensorTone("viewport")).toBe("warning");
    expect(examSensorTone("multiple_displays")).toBe("warning");
  });
});

describe("isSensorRecoverableByModal", () => {
  it("leaves the lock-overlay sources to the overlay", () => {
    expect(isSensorRecoverableByModal("policy_unavailable")).toBe(false);
    expect(isSensorRecoverableByModal("pwa_required")).toBe(false);
    expect(isSensorRecoverableByModal(null)).toBe(false);
  });

  it("accepts every recoverable sensor", () => {
    for (const source of [
      "screen_share",
      "webcam",
      "viewport",
      "split_view",
      "fullscreen",
      "mouse_leave",
      "multiple_displays",
    ] as const) {
      expect(isSensorRecoverableByModal(source)).toBe(true);
    }
  });
});
