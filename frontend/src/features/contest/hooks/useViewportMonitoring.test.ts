import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useViewportMonitoring } from "./useViewportMonitoring";

describe("useViewportMonitoring", () => {
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
});
