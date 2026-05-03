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
import type { ExamEventResponse } from "@/infrastructure/api/repositories";

describe("forcedCapture", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    unregisterForcedCaptureHandler("contest-1");
  });

  it("records event with evidence anchor metadata and schedules capture after event id", async () => {
    const handler = vi.fn().mockResolvedValue({
      attempted: true,
      captured: true,
      uploaded: true,
      uploadSessionId: "session-123",
      seq: 7,
      uploadedSeqs: [3, 4, 5, 7],
      uploadedObjectKeys: ["raw/3.webp", "raw/4.webp", "raw/5.webp", "raw/7.webp"],
      evidencePreBufferAttempted: true,
      evidencePreBufferComplete: true,
      evidencePreBufferFrameCount: 3,
      evidenceUploadedFrameCount: 4,
    });
    registerForcedCaptureHandler("contest-1", "screen_share", handler);
    vi.mocked(recordExamEvent).mockResolvedValue({
      status: "ok",
      event_id: 42,
      evidence_cluster_id: "cluster-1",
      evidence_mode: "anchor_window",
      evidence_anchor_at_ms: 1774106646951,
      evidence_window_start: "2026-03-21T10:03:58.951Z",
      evidence_window_end: "2026-03-21T10:04:04.951Z",
    } satisfies ExamEventResponse);

    await recordExamEventWithForcedCapture("contest-1", "tab_hidden", {
      reason: "window hidden",
      source: "detector:test",
      metadata: { existing: true, evidence_anchor_at_ms: 1774106646951 },
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
          evidence_anchor_at_ms: 1774106646951,
          client_observed_at_ms: 1774106646951,
          evidence_mode: "anchor_window",
          upload_session_id: "session-123",
        }),
      })
    );
    expect(handler).toHaveBeenCalledWith(
      "tab_hidden:window hidden",
      expect.objectContaining({
        eventId: 42,
        evidenceClusterId: "cluster-1",
        evidenceMode: "anchor_window",
        evidenceAnchorAtMs: 1774106646951,
      })
    );
  });

  it("records evidence request metadata when no handler is registered", async () => {
    vi.mocked(recordExamEvent).mockResolvedValue({ status: "ok" } satisfies ExamEventResponse);

    await recordExamEventWithForcedCapture("contest-1", "exam_entered", {
      reason: "entered exam",
    });

    expect(recordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "exam_entered",
      expect.objectContaining({
        metadata: expect.objectContaining({
          forced_capture_requested: true,
          forced_capture_reason: "exam_entered",
          evidence_mode: "anchor_window",
          upload_session_id: "session-123",
        }),
      })
    );
  });

  it("returns an unavailable result when the handler throws", async () => {
    registerForcedCaptureHandler("contest-1", "screen_share", vi.fn().mockRejectedValue(new Error("boom")));

    const result = await forceCaptureForContest("contest-1", "tab_hidden:test");

    expect(result).toEqual({
      attempted: false,
      captured: false,
      uploaded: false,
      skipped: "capture_unavailable",
      errorCode: "boom",
      uploadSessionId: "session-123",
      seq: null,
      modules: ["screen_share"],
      module_results: {
        screen_share: {
          attempted: false,
          captured: false,
          uploaded: false,
          skipped: "capture_unavailable",
          errorCode: "boom",
          uploadSessionId: "session-123",
          seq: null,
        },
      },
    });
  });

  it("captures requested modules explicitly", async () => {
    const screenHandler = vi.fn().mockResolvedValue({
      attempted: true,
      captured: true,
      uploaded: false,
      uploadSessionId: "session-123",
      seq: 1,
    });
    const webcamHandler = vi.fn().mockResolvedValue({
      attempted: true,
      captured: true,
      uploaded: true,
      uploadSessionId: "session-123",
      seq: 2,
    });
    registerForcedCaptureHandler("contest-1", "screen_share", screenHandler);
    registerForcedCaptureHandler("contest-1", "webcam", webcamHandler);

    const result = await forceCaptureForContest("contest-1", "submit:test", {
      modules: ["screen_share", "webcam"],
      eventType: "exam_submit_initiated",
    });

    expect(screenHandler).toHaveBeenCalledTimes(1);
    expect(webcamHandler).toHaveBeenCalledTimes(1);
    expect(result.uploaded).toBe(true);
    expect(result.modules).toEqual(["screen_share", "webcam"]);
  });

  it("passes event evidence context to all requested modules", async () => {
    const screenHandler = vi.fn().mockResolvedValue({
      attempted: true,
      captured: true,
      uploaded: true,
      uploadSessionId: "session-123",
      seq: 1,
      uploadedSeqs: [1],
      uploadedObjectKeys: ["contest_1/user_1/session_s/screen_share/ts_1_seq_0001.webp"],
      evidenceUploadedFrameCount: 1,
    });
    const webcamHandler = vi.fn().mockResolvedValue({
      attempted: true,
      captured: true,
      uploaded: true,
      uploadSessionId: "session-123",
      seq: 2,
      uploadedSeqs: [2],
      uploadedObjectKeys: ["contest_1/user_1/session_s/webcam/ts_2_seq_0002.webp"],
      evidenceUploadedFrameCount: 1,
    });
    registerForcedCaptureHandler("contest-1", "screen_share", screenHandler);
    registerForcedCaptureHandler("contest-1", "webcam", webcamHandler);
    vi.mocked(recordExamEvent).mockResolvedValue({
      status: "ok",
      event_id: 77,
      evidence_cluster_id: "cluster-submit",
      evidence_mode: "anchor_window",
    } satisfies ExamEventResponse);

    await recordExamEventWithForcedCapture("contest-1", "exam_submit_initiated", {
      reason: "submit",
      captureOptions: {
        eventType: "exam_submit_initiated",
        modules: ["screen_share", "webcam"],
      },
    });

    expect(screenHandler).toHaveBeenCalledWith(
      "exam_submit_initiated",
      expect.objectContaining({
        eventId: 77,
        evidenceClusterId: "cluster-submit",
        modules: ["screen_share", "webcam"],
      })
    );
    expect(webcamHandler).toHaveBeenCalledWith(
      "exam_submit_initiated",
      expect.objectContaining({ eventId: 77, evidenceClusterId: "cluster-submit" })
    );
  });

  it("does not fall back when an explicit empty module list is requested", async () => {
    const screenHandler = vi.fn().mockResolvedValue({
      attempted: true,
      captured: true,
      uploaded: true,
      uploadSessionId: "session-123",
      seq: 1,
    });
    registerForcedCaptureHandler("contest-1", "screen_share", screenHandler);

    const result = await forceCaptureForContest("contest-1", "submit:test", {
      modules: [],
      eventType: "exam_submit_initiated",
    });

    expect(screenHandler).not.toHaveBeenCalled();
    expect(result.skipped).toBe("capture_unavailable");
  });
});
