import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useEventEvidenceCapture } from "./useEventEvidenceCapture";

vi.mock("./useAnticheatUploader", () => ({
  useAnticheatUploader: () => ({
    uploadBatchDetailed: vi.fn().mockResolvedValue([]),
  }),
}));

const blob = () => new Blob(["frame"], { type: "image/webp" });

describe("useEventEvidenceCapture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the configured capture interval for evidence buffering", async () => {
    const captureFrameBlob = vi.fn().mockResolvedValue(blob());

    renderHook(() =>
      useEventEvidenceCapture({
        contestId: "contest-1",
        module: "screen_share",
        enabled: true,
        intervalMs: 5_000,
        uploadSessionId: "session-1",
        captureFrameBlob,
        isStreamUnavailable: () => false,
        onStreamUnavailable: vi.fn(),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(captureFrameBlob).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(captureFrameBlob).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(captureFrameBlob).toHaveBeenCalledTimes(2);
  });

  it("applies shared cooldown to repeated forced captures", async () => {
    const captureFrameBlob = vi.fn().mockResolvedValue(blob());
    const { result } = renderHook(() =>
      useEventEvidenceCapture({
        contestId: "contest-1",
        module: "webcam",
        enabled: true,
        intervalMs: 1_000,
        uploadSessionId: "session-1",
        captureFrameBlob,
        isStreamUnavailable: () => false,
        onStreamUnavailable: vi.fn(),
        cooldown: {
          defaultMs: 5_000,
          p1Ms: 15_000,
        },
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.forceCaptureNow("first", {
        eventId: 1,
        eventType: "webcam_stopped",
      });
    });
    const second = await result.current.forceCaptureNow("second", {
      eventId: 2,
      eventType: "webcam_stopped",
    });

    expect(second.skipped).toBe("cooldown");
    expect(second.errorCode).toBe("capture_cooldown");
  });
});
