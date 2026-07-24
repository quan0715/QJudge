import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useAnticheatWebcamCapture } from "./useAnticheatWebcamCapture";

let handoff: MediaStream | null = null;

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: () => "capture-session",
  setExamCaptureSessionId: vi.fn(),
}));
vi.mock("@/features/contest/anticheat/webcamHandoffStore", () => ({
  consumePrecheckWebcamHandoff: () => handoff,
  consumeRuntimeWebcamHandoff: () => null,
  setRuntimeWebcamHandoff: vi.fn(),
  clearPrecheckWebcamHandoff: vi.fn(),
  clearRuntimeWebcamHandoff: vi.fn(),
}));
vi.mock("@/features/contest/anticheat/mediaApi", () => ({
  requestUserMediaVideo: vi.fn(),
  supportsUserMediaApi: () => true,
}));

describe("useAnticheatWebcamCapture", () => {
  it("exposes the policy-owned live webcam stream", async () => {
    const track = { readyState: "live", muted: false, stop: vi.fn(), addEventListener: vi.fn() };
    handoff = { active: true, getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    const { result } = renderHook(() => useAnticheatWebcamCapture({
      contestId: "contest-a", enabled: true, monitorStream: true,
    }));

    await waitFor(() => expect(result.current.stream).toBe(handoff));
  });
});
