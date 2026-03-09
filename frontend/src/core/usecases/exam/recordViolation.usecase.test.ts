import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordViolationUseCase } from "./recordViolation.usecase";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";

vi.mock("@/features/contest/anticheat/forcedCapture", () => ({
  recordExamEventWithForcedCapture: vi.fn(),
}));

describe("recordViolation.usecase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps violation response payload", async () => {
    vi.mocked(recordExamEventWithForcedCapture).mockResolvedValue({
      violation_count: 2,
      max_cheat_warnings: 3,
      auto_unlock_at: "2026-02-24T10:00:00Z",
      bypass: true,
      locked: true,
    } as any);

    const result = await recordViolationUseCase({
      contestId: "contest-1",
      eventType: "window_blur",
      reason: "left window",
    });

    expect(recordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "window_blur",
      expect.objectContaining({
        reason: "left window",
      })
    );
    expect(result).toEqual({
      success: true,
      violationCount: 2,
      maxWarnings: 3,
      autoUnlockAt: "2026-02-24T10:00:00Z",
      isLocked: true,
      bypass: true,
    });
  });

  it("returns default success payload when response is not object", async () => {
    vi.mocked(recordExamEventWithForcedCapture).mockResolvedValue(null as any);

    const result = await recordViolationUseCase({
      contestId: "contest-1",
      eventType: "tab_hidden",
    });

    expect(result).toEqual({
      success: true,
      violationCount: 0,
      maxWarnings: 0,
      isLocked: false,
      bypass: false,
    });
  });

  it("returns error payload when repository throws", async () => {
    vi.mocked(recordExamEventWithForcedCapture).mockRejectedValue(new Error("network down"));

    const result = await recordViolationUseCase({
      contestId: "contest-1",
      eventType: "exit_fullscreen",
    });

    expect(result).toEqual({
      success: false,
      violationCount: 0,
      maxWarnings: 0,
      isLocked: false,
      bypass: false,
      error: "network down",
    });
  });
});
