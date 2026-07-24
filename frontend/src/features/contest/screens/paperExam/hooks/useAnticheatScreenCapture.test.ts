import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useAnticheatScreenCapture } from "./useAnticheatScreenCapture";

const setRuntimeHandoff = vi.fn();
let handoff: MediaStream | null = null;

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: () => "capture-session",
  setExamCaptureSessionId: vi.fn(),
}));
vi.mock("@/features/contest/anticheat/screenShareHandoffStore", () => ({
  consumePrecheckScreenShareHandoff: () => handoff,
  consumeRuntimeScreenShareHandoff: () => null,
  setRuntimeScreenShareHandoff: setRuntimeHandoff,
  peekPrecheckScreenShareHandoff: () => null,
  peekRuntimeScreenShareHandoff: () => null,
  clearPrecheckScreenShareHandoff: vi.fn(),
  clearRuntimeScreenShareHandoff: vi.fn(),
}));

describe("useAnticheatScreenCapture", () => {
  it("exposes the policy-owned live stream without registering event screenshot capture", async () => {
    const track = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn() };
    handoff = { active: true, getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    const { result } = renderHook(() => useAnticheatScreenCapture({
      contestId: "contest-a", enabled: true, monitorStream: true,
    }));

    await waitFor(() => expect(result.current.stream).toBe(handoff));
    act(() => result.current.forceStopCapture("submitted"));
    expect(track.stop).toHaveBeenCalled();
  });
});
