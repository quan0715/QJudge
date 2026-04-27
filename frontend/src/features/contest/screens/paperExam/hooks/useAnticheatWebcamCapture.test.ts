import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnticheatWebcamCapture } from "./useAnticheatWebcamCapture";

vi.mock("./anticheat/useCanvasProcessor", () => ({
  useCanvasProcessor: () => ({
    encodeUnderBudget: vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/webp" })),
  }),
}));

vi.mock("./anticheat/useAnticheatUploader", () => ({
  useAnticheatUploader: () => ({ uploadBatchDetailed: vi.fn().mockResolvedValue([]) }),
}));

const { mockSfuStart, mockSfuStop } = vi.hoisted(() => ({
  mockSfuStart: vi.fn().mockResolvedValue(null),
  mockSfuStop: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./anticheat/sfuScreenSharePublisher", () => ({
  createSfuVideoPublisher: () => ({
    get state() {
      return null;
    },
    start: (...args: unknown[]) => mockSfuStart(...args),
    stop: (...args: unknown[]) => mockSfuStop(...args),
  }),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: () => "test-session",
  setExamCaptureSessionId: vi.fn(),
}));

const mockClearPrecheck = vi.fn();
const mockClearRuntime = vi.fn();
const mockSetRuntime = vi.fn();

let mockHandoffStream: MediaStream | null = null;

vi.mock("@/features/contest/anticheat/webcamHandoffStore", () => ({
  consumePrecheckWebcamHandoff: () => {
    const stream = mockHandoffStream;
    mockHandoffStream = null;
    return stream;
  },
  consumeRuntimeWebcamHandoff: () => null,
  setRuntimeWebcamHandoff: (...args: unknown[]) => mockSetRuntime(...args),
  clearPrecheckWebcamHandoff: (...args: unknown[]) => mockClearPrecheck(...args),
  clearRuntimeWebcamHandoff: (...args: unknown[]) => mockClearRuntime(...args),
}));

vi.mock("@/features/contest/anticheat/mediaApi", () => ({
  requestUserMediaVideo: vi.fn(),
  supportsUserMediaApi: vi.fn().mockReturnValue(true),
}));

vi.mock("@/features/contest/anticheat/orchestrator", () => ({
  getAnticheatPhase: vi.fn().mockReturnValue("RUNNING"),
}));

type MutableTrack = {
  readyState: "live" | "ended";
  muted: boolean;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};

const createMockStream = () => {
  const track: MutableTrack = {
    readyState: "live",
    muted: false,
    stop: vi.fn(),
    addEventListener: vi.fn(),
  };

  const stream = {
    active: true,
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;

  return { stream, track };
};

describe("useAnticheatWebcamCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandoffStream = null;
  });

  it("detects webcam loss when video track ends even if stream.active remains true", async () => {
    vi.useFakeTimers();
    const onWebcamLost = vi.fn();
    const { stream, track } = createMockStream();
    mockHandoffStream = stream;

    const { result } = renderHook(() =>
      useAnticheatWebcamCapture({
        contestId: "contest-1",
        enabled: false,
        monitorStream: true,
        expectInitialStream: true,
        onWebcamLost,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.streamActive).toBe(true);

    act(() => {
      track.readyState = "ended";
      vi.advanceTimersByTime(2500);
    });

    expect(onWebcamLost).toHaveBeenCalledTimes(1);
    expect(result.current.streamActive).toBe(false);
    vi.useRealTimers();
  });

  it("starts webcam live publisher when webcam is the live source", async () => {
    const { stream } = createMockStream();
    mockHandoffStream = stream;

    renderHook(() =>
      useAnticheatWebcamCapture({
        contestId: "contest-1",
        enabled: false,
        monitorStream: true,
        expectInitialStream: true,
        publishLiveStream: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSfuStart).toHaveBeenCalledWith("contest-1", stream);
  });

  it("does not start webcam live publisher when webcam is secondary", async () => {
    const { stream } = createMockStream();
    mockHandoffStream = stream;

    renderHook(() =>
      useAnticheatWebcamCapture({
        contestId: "contest-1",
        enabled: false,
        monitorStream: true,
        expectInitialStream: true,
        publishLiveStream: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSfuStart).not.toHaveBeenCalled();
  });
});
