import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getTargets: vi.fn(),
  requestToken: vi.fn(),
  createTransport: vi.fn(),
}));
const translate = vi.hoisted(() => (_key: string, fallback: string) => fallback);

vi.mock("@/infrastructure/api/repositories/liveMonitoring.repository", () => ({
  getLiveMonitoringConfig: mocks.getConfig,
  getLiveMonitoringTargets: mocks.getTargets,
  requestLiveMonitoringToken: mocks.requestToken,
}));

vi.mock("@/infrastructure/realtime/livekitTransport", () => ({
  createLiveKitTransport: mocks.createTransport,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}));

import type { ContestParticipant } from "@/core/entities/contest.entity";
import { MinimalLiveStage } from "./AdminProctoringPanel";

const participant = (userId: string): ContestParticipant => ({
  userId,
  username: `student-${userId}`,
  email: `${userId}@test.example`,
  displayName: `Student ${userId}`,
  score: 0,
  joinedAt: "2026-09-16T11:00:00Z",
  examStatus: "in_progress",
  violationCount: 0,
  liveMonitoringOnline: false,
  liveMonitoringSources: [],
  liveMonitoringStatus: "available",
  connectionStatus: "online",
  lastCheckpointAt: null,
  startedAt: null,
  leftAt: null,
  lockedAt: null,
  lockReason: "",
  submitReason: "",
});

beforeEach(() => {
  mocks.getConfig.mockReset().mockResolvedValue({
    enabled: true,
    configured: true,
    provider: "livekit",
  });
  mocks.requestToken.mockReset().mockResolvedValue({
    serverUrl: "wss://livekit.example.test",
    token: "subscriber-token",
    roomName: "run-1",
    identity: "qj-proctor",
    runId: "run-1",
    role: "subscriber",
    allowedSources: [],
    expiresAt: "2026-09-16T12:01:00Z",
  });
  mocks.getTargets.mockReset().mockResolvedValue({
    observedAt: "2026-09-16T12:00:00Z",
    stale: false,
    targets: [
      { userId: "7", identity: "qj-student-a", sources: ["screen_share"] },
      { userId: "8", identity: "qj-student-b", sources: ["webcam"] },
    ],
  });
  mocks.createTransport.mockReset().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    selectTarget: vi.fn(),
    bindVideo: vi.fn(),
    onState: vi.fn(() => () => undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }));
});

describe("MinimalLiveStage", () => {
  it("retries a transient subscriber connection failure with a fresh token", async () => {
    const firstTransport = {
      connect: vi.fn().mockRejectedValueOnce(new Error("signaling unavailable")),
      selectTarget: vi.fn(),
      bindVideo: vi.fn(),
      onState: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const secondTransport = {
      connect: vi.fn().mockResolvedValue(undefined),
      selectTarget: vi.fn(),
      bindVideo: vi.fn(),
      onState: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mocks.createTransport
      .mockReturnValueOnce(firstTransport)
      .mockReturnValueOnce(secondTransport);

    render(
      <MinimalLiveStage
        contestId="contest-1"
        participant={participant("7")}
        discoveryRefreshKey={0}
        lockActionBusy={false}
        monitoringAvailable
      />,
    );

    await waitFor(() => expect(firstTransport.connect).toHaveBeenCalledOnce());
    await waitFor(
      () => expect(secondTransport.connect).toHaveBeenCalledOnce(),
      { timeout: 1500 },
    );

    expect(mocks.requestToken).toHaveBeenCalledTimes(2);
    expect(firstTransport.close).toHaveBeenCalledOnce();
  });

  it("does not retry a subscriber token conflict", async () => {
    const conflict = Object.assign(
      new Error("The exam live monitoring session is not available for this scope."),
      { status: 409 },
    );
    mocks.requestToken.mockRejectedValue(conflict);

    render(
      <MinimalLiveStage
        contestId="contest-1"
        participant={participant("7")}
        discoveryRefreshKey={0}
        lockActionBusy={false}
        monitoringAvailable
      />,
    );

    await waitFor(() => expect(mocks.requestToken).toHaveBeenCalledOnce());
    await new Promise((resolve) => window.setTimeout(resolve, 1100));

    expect(mocks.requestToken).toHaveBeenCalledOnce();
  });

  it("keeps a playing source connected while refreshing its discovery state", async () => {
    const view = render(
      <MinimalLiveStage
        contestId="contest-1"
        participant={participant("7")}
        discoveryRefreshKey={0}
        lockActionBusy={false}
        monitoringAvailable
      />,
    );

    await waitFor(() => expect(view.getByText("Screen")).toBeInTheDocument());
    await waitFor(() => expect(mocks.getTargets).toHaveBeenCalledTimes(2));
    const video = view.container.querySelector("video");
    expect(video).not.toBeNull();

    fireEvent.playing(video as HTMLVideoElement);
    expect(view.getByText("已連線")).toBeInTheDocument();

    view.rerender(
      <MinimalLiveStage
        contestId="contest-1"
        participant={participant("7")}
        discoveryRefreshKey={1}
        lockActionBusy={false}
        monitoringAvailable
      />,
    );

    await waitFor(() => expect(mocks.getTargets).toHaveBeenCalledTimes(3));
    expect(view.getByText("已連線")).toBeInTheDocument();
  });

  it("does not rebind video elements when discovery refresh rerenders the stage", async () => {
    const view = render(
      <MinimalLiveStage
        contestId="contest-1"
        participant={participant("7")}
        discoveryRefreshKey={0}
        lockActionBusy={false}
        monitoringAvailable
      />,
    );

    await waitFor(() => expect(view.getByText("Screen")).toBeInTheDocument());
    await waitFor(() => expect(mocks.getTargets).toHaveBeenCalledTimes(2));
    const transport = mocks.createTransport.mock.results[0].value;
    await waitFor(() => expect(transport.connect).toHaveBeenCalledOnce());
    transport.bindVideo.mockClear();

    view.rerender(
      <MinimalLiveStage
        contestId="contest-1"
        participant={participant("7")}
        discoveryRefreshKey={1}
        lockActionBusy={false}
        monitoringAvailable
      />,
    );

    await waitFor(() => expect(mocks.getTargets).toHaveBeenCalledTimes(3));
    expect(transport.bindVideo).not.toHaveBeenCalled();
  });

  it("subscribes only to the selected participant's reported sources", async () => {
    const view = render(
      <MinimalLiveStage
        contestId="contest-1"
        participant={participant("7")}
        discoveryRefreshKey={0}
        lockActionBusy={false}
        monitoringAvailable
      />,
    );

    await waitFor(() => expect(view.getByText("Screen")).toBeInTheDocument());
    expect(view.queryByText("Webcam")).not.toBeInTheDocument();
    expect(mocks.createTransport.mock.results[0].value.selectTarget)
      .toHaveBeenCalledWith("qj-student-a");

    view.rerender(
      <MinimalLiveStage
        contestId="contest-1"
        participant={participant("8")}
        discoveryRefreshKey={1}
        lockActionBusy={false}
        monitoringAvailable
      />,
    );

    await waitFor(() => expect(view.getByText("Webcam")).toBeInTheDocument());
    expect(view.queryByText("Screen")).not.toBeInTheDocument();
    expect(mocks.createTransport.mock.results[0].value.selectTarget)
      .toHaveBeenLastCalledWith("qj-student-b");
  });
});
