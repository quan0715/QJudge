import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useExamState } from "./useExamState";

describe("useExamState", () => {
  it("reflects the server-projected locked state without creating an event authority", () => {
    const { result } = renderHook(() => useExamState({
      contestId: "contest-1",
      examStatus: "locked",
      isExamMonitored: true,
      isBypassed: false,
      requestFullscreen: vi.fn(),
    }));

    expect(result.current.examState.isLocked).toBe(true);
  });
});
