import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  forceCaptureForContest,
  registerForcedCaptureHandler,
  unregisterForcedCaptureHandler,
} from "./forcedCapture";

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: vi.fn(() => "session-123"),
}));

describe("forcedCapture", () => {
  beforeEach(() => unregisterForcedCaptureHandler("contest-1"));

  it("retains capture-handler registration for the later evidence migration", async () => {
    const handler = vi.fn().mockResolvedValue({
      attempted: true,
      captured: true,
      uploaded: true,
      uploadSessionId: "session-123",
      seq: 1,
    });
    registerForcedCaptureHandler("contest-1", "screen_share", handler);

    const result = await forceCaptureForContest("contest-1", "manual-test", {
      modules: ["screen_share"],
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(result.modules).toEqual(["screen_share"]);
  });
});
