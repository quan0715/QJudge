import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useAnticheatScreenCapture } from "./useAnticheatScreenCapture";

const { handoffs, setRuntimeHandoff } = vi.hoisted(() => ({
  handoffs: {
    precheck: null as MediaStream | null,
    runtime: null as MediaStream | null,
  },
  setRuntimeHandoff: vi.fn(),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: () => "capture-session",
  setExamCaptureSessionId: vi.fn(),
}));
vi.mock("@/features/contest/anticheat/screenShareHandoffStore", () => ({
  consumePrecheckScreenShareHandoff: () => {
    const stream = handoffs.precheck;
    handoffs.precheck = null;
    return stream;
  },
  consumeRuntimeScreenShareHandoff: () => {
    const stream = handoffs.runtime;
    handoffs.runtime = null;
    return stream;
  },
  setRuntimeScreenShareHandoff: setRuntimeHandoff,
  peekPrecheckScreenShareHandoff: () => null,
  peekRuntimeScreenShareHandoff: () => null,
  clearPrecheckScreenShareHandoff: vi.fn(),
  clearRuntimeScreenShareHandoff: vi.fn(),
}));

describe("useAnticheatScreenCapture", () => {
  it("exposes the policy-owned live stream without registering event screenshot capture", async () => {
    const track = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn() };
    handoffs.precheck = { active: true, getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    const { result } = renderHook(() => useAnticheatScreenCapture({
      contestId: "contest-a", enabled: true, monitorStream: true,
    }));

    await waitFor(() => expect(result.current.stream).toBeTruthy());
    act(() => result.current.forceStopCapture("submitted"));
    expect(track.stop).toHaveBeenCalled();
  });

  it("adopts a replacement screen-share handoff after runtime reauthorization", async () => {
    handoffs.precheck = null;
    const replacementTrack = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn() };
    const replacement = {
      active: true,
      getTracks: () => [replacementTrack],
      getVideoTracks: () => [replacementTrack],
    } as unknown as MediaStream;
    handoffs.runtime = replacement;
    const { result } = renderHook(() => useAnticheatScreenCapture({
      contestId: "contest-a", enabled: true, monitorStream: false,
    }));

    await act(async () => {
      expect(await result.current.resumeFromRuntimeHandoff()).toBe(true);
    });

    expect(result.current.stream).toBe(replacement);
    expect(result.current.streamActive).toBe(true);
  });
});
