import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  forceCaptureForContest,
  recordExamEventWithForcedCapture,
  registerForcedCaptureHandler,
  unregisterForcedCaptureHandler,
} from "./forcedCapture";

vi.mock("@/infrastructure/api/repositories", () => ({
  recordExamEvent: vi.fn(),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: vi.fn(() => "session-123"),
}));

import { recordExamEvent } from "@/infrastructure/api/repositories";

describe("forcedCapture", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    unregisterForcedCaptureHandler("contest-1");
  });

  it("records event with forced-capture metadata when capture succeeds", async () => {
    registerForcedCaptureHandler("contest-1", vi.fn().mockResolvedValue({
      attempted: true,
      captured: true,
      uploaded: true,
      uploadSessionId: "session-123",
      seq: 7,
    }));
    vi.mocked(recordExamEvent).mockResolvedValue({ status: "ok" } as any);

    await recordExamEventWithForcedCapture("contest-1", "tab_hidden", {
      reason: "window hidden",
      source: "detector:test",
      metadata: { existing: true },
      forceCaptureReason: "tab_hidden:window hidden",
    });

    expect(recordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "tab_hidden",
      expect.objectContaining({
        reason: "window hidden",
        metadata: expect.objectContaining({
          existing: true,
          forced_capture_requested: true,
          forced_capture_reason: "tab_hidden:window hidden",
          forced_capture_result: "uploaded",
          forced_capture_uploaded: true,
          forced_capture_seq: 7,
          upload_session_id: "session-123",
        }),
      })
    );
  });

  it("falls back to capture_unavailable when no handler is registered", async () => {
    vi.mocked(recordExamEvent).mockResolvedValue({ status: "ok" } as any);

    await recordExamEventWithForcedCapture("contest-1", "exam_entered", {
      reason: "entered exam",
    });

    expect(recordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "exam_entered",
      expect.objectContaining({
        metadata: expect.objectContaining({
          forced_capture_result: "skipped:capture_unavailable",
          forced_capture_error_code: "capture_unavailable",
          upload_session_id: "session-123",
        }),
      })
    );
  });

  it("returns an unavailable result when the handler throws", async () => {
    registerForcedCaptureHandler("contest-1", vi.fn().mockRejectedValue(new Error("boom")));

    const result = await forceCaptureForContest("contest-1", "tab_hidden:test");

    expect(result).toEqual({
      attempted: false,
      captured: false,
      uploaded: false,
      skipped: "capture_unavailable",
      errorCode: "boom",
      uploadSessionId: "session-123",
      seq: null,
    });
  });
});
