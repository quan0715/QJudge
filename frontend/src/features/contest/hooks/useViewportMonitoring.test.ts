import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewportMonitoring } from "./useViewportMonitoring";

describe("useViewportMonitoring", () => {
  const dimensions = (width: number, height: number) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
    Object.defineProperty(window.screen, "width", { value: 1_000, configurable: true });
    Object.defineProperty(window.screen, "height", { value: 1_000, configurable: true });
  };

  beforeEach(() => dimensions(1_000, 1_000));
  afterEach(() => vi.restoreAllMocks());

  it("starts browser geometry sampling without a local recovery countdown", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useViewportMonitoring({
      enabled: true,
      examSubmitted: false,
      isTablet: false,
      primarySourceModule: "screen_share",
      emitter,
    }));
    expect(typeof result.current.interrupted).toBe("boolean");
  });

  it("emits only abnormal and recovery viewport transitions", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { unmount } = renderHook(() => useViewportMonitoring({
      enabled: true,
      examSubmitted: false,
      isTablet: false,
      primarySourceModule: "screen_share",
      emitter,
    }));

    expect(emitter.emit).not.toHaveBeenCalled();
    act(() => {
      dimensions(500, 500);
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    expect(emitter.emit).toHaveBeenLastCalledWith(expect.objectContaining({
      eventType: "viewport_interrupted",
    }));

    act(() => {
      dimensions(1_000, 1_000);
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(emitter.emit).toHaveBeenCalledTimes(2);
    expect(emitter.emit).toHaveBeenLastCalledWith(expect.objectContaining({
      eventType: "viewport_restored",
    }));
    unmount();
  });
});
