import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getTargets: vi.fn(),
  requestToken: vi.fn(),
  createTransport: vi.fn(),
}));
const translate = vi.hoisted(() => (_key: string, fallback: string, values?: Record<string, unknown>) => fallback.replace(/{{(\w+)}}/g, (_, key) => String(values?.[key] ?? key)));

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
    selectTargets: vi.fn(),
    bindTargetVideo: vi.fn(),
    bindVideo: vi.fn(),
    onState: vi.fn(() => () => undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }));
});

describe("MinimalLiveStage", () => {
  it.each([4, 9] as const)("filters non-sharing students and displays webcam in the same tile in %i-person mode", async (layout) => {
    const rows = Array.from({ length: 9 }, (_, index) => participant(String(index + 1)));
    mocks.getTargets.mockResolvedValue({ stale: false, observedAt: null, targets: [
      { userId: "8", identity: "screen-and-camera", sources: ["screen_share", "webcam"] },
      { userId: "9", identity: "camera-only", sources: ["webcam"] },
    ] });
    const props = { contestId: "contest-1", participant: rows[0], participants: rows,
      lockActionBusy: false, monitoringAvailable: true, layout };
    const view = render(<MinimalLiveStage {...props} discoveryRefreshKey={0} />);
    await waitFor(() => expect(view.getByRole("button", { name: "放大 Student 8" })).toBeInTheDocument());
    expect(view.queryAllByRole("button", { name: /^放大/ })).toHaveLength(1);
    expect(view.getByText("第 1／1 頁・1 人")).toBeInTheDocument();
    const tile = view.getByRole("button", { name: "放大 Student 8" });
    expect(tile.querySelectorAll("video")).toHaveLength(2);
    const transport = mocks.createTransport.mock.results[0].value;
    await waitFor(() => expect(transport.selectTargets).toHaveBeenLastCalledWith([
      { identity: "screen-and-camera", sources: ["screen_share", "webcam"] },
    ]));
    expect(transport.bindTargetVideo).toHaveBeenCalledWith("screen-and-camera", "webcam", expect.any(HTMLVideoElement));

    mocks.getTargets.mockResolvedValue({ stale: false, observedAt: null, targets: [
      { userId: "8", identity: "screen-and-camera", sources: ["screen_share"] },
    ] });
    view.rerender(<MinimalLiveStage {...props} discoveryRefreshKey={1} />);
    await waitFor(() => expect(tile.querySelectorAll("video")).toHaveLength(1));
    expect(transport.bindTargetVideo).toHaveBeenCalledWith("screen-and-camera", "webcam", null);
    expect(transport.selectTargets).toHaveBeenLastCalledWith([
      { identity: "screen-and-camera", sources: ["screen_share"] },
    ]);

    mocks.getTargets.mockResolvedValue({ stale: false, observedAt: null, targets: [] });
    view.rerender(<MinimalLiveStage {...props} discoveryRefreshKey={2} />);
    await waitFor(() => expect(view.queryAllByRole("button", { name: /^放大/ })).toHaveLength(0));
    expect(transport.selectTargets).toHaveBeenLastCalledWith([]);
    expect(transport.bindTargetVideo).toHaveBeenCalledWith("screen-and-camera", "webcam", null);
    expect(view.getByText("第 1／1 頁・0 人")).toBeInTheDocument();
  });

  it("shows a screen grid, focuses a student and returns without reconnecting", async () => {
    const onSelect = vi.fn();
    const onLayout = vi.fn();
    const rows = [participant("7"), participant("8")];
    const props = { contestId: "contest-1", participant: rows[0], participants: rows,
      discoveryRefreshKey: 0, lockActionBusy: false, monitoringAvailable: true,
      onSelectParticipant: onSelect, onLayoutChange: onLayout };
    const view = render(<MinimalLiveStage {...props} layout={4} />);
    await waitFor(() => expect(view.getByRole("button", { name: "放大 Student 7" })).toBeInTheDocument());
    await waitFor(() => expect(mocks.createTransport).toHaveBeenCalledOnce());
    const transport = mocks.createTransport.mock.results[0].value;
    await waitFor(() => expect(transport.selectTargets).toHaveBeenCalledWith([
      { identity: "qj-student-a", sources: ["screen_share"] },
    ]));
    fireEvent.click(view.getByRole("button", { name: "放大 Student 7" }));
    expect(onSelect).toHaveBeenCalledWith("7");
    expect(onLayout).toHaveBeenCalledWith(1);
    view.rerender(<MinimalLiveStage {...props} layout={1} />);
    await waitFor(() => expect(transport.selectTarget).toHaveBeenLastCalledWith("qj-student-a"));
    fireEvent.click(view.getByRole("button", { name: "4 人" }));
    expect(onLayout).toHaveBeenCalledWith(4);
    view.rerender(<MinimalLiveStage {...props} layout={4} />);
    expect(mocks.createTransport).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("keeps the last grid subscriptions when discovery returns a stale empty snapshot", async () => {
    const props = { contestId: "contest-1", participant: participant("7"), participants: [participant("7")],
      lockActionBusy: false, monitoringAvailable: true, layout: 4 as const };
    const view = render(<MinimalLiveStage {...props} discoveryRefreshKey={0} />);
    await waitFor(() => expect(mocks.createTransport).toHaveBeenCalledOnce());
    const transport = mocks.createTransport.mock.results[0].value;
    await waitFor(() => expect(transport.selectTargets).toHaveBeenLastCalledWith([
      { identity: "qj-student-a", sources: ["screen_share"] },
    ]));
    mocks.getTargets.mockResolvedValue({ stale: true, targets: [], observedAt: null });
    view.rerender(<MinimalLiveStage {...props} discoveryRefreshKey={1} />);
    await waitFor(() => expect(view.getByText("來源狀態暫時無法確認，保留目前畫面。")).toBeInTheDocument());
    expect(transport.selectTargets).toHaveBeenLastCalledWith([{ identity: "qj-student-a", sources: ["screen_share"] }]);
  });

  it("ignores discovery responses for a previously selected student", async () => {
    const pending: Array<(value: unknown) => void> = [];
    mocks.getTargets.mockImplementationOnce(() => new Promise(resolve => pending.push(resolve)))
      .mockImplementationOnce(() => new Promise(resolve => pending.push(resolve)));
    const props = { contestId: "contest-1", discoveryRefreshKey: 0, lockActionBusy: false, monitoringAvailable: true };
    const view = render(<MinimalLiveStage {...props} participant={participant("7")} />);
    await waitFor(() => expect(pending).toHaveLength(2));
    view.rerender(<MinimalLiveStage {...props} participant={participant("8")} />);
    await waitFor(() => expect(view.getByText("Webcam")).toBeInTheDocument());
    await act(async () => pending.forEach(resolve => resolve({ stale: false, targets: [
      { userId: "7", identity: "qj-student-a", sources: ["screen_share"] },
    ] })));
    expect(view.getByText("Webcam")).toBeInTheDocument();
    expect(view.queryByText("Screen")).not.toBeInTheDocument();
  });

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

  it("reconnects with a fresh token after an established connection is lost", async () => {
    const view = render(<MinimalLiveStage contestId="contest-1" participant={participant("7")}
      discoveryRefreshKey={0} lockActionBusy={false} monitoringAvailable />);
    await waitFor(() => expect(mocks.createTransport).toHaveBeenCalledOnce());
    const first = mocks.createTransport.mock.results[0].value;
    await waitFor(() => expect(first.connect).toHaveBeenCalledOnce());
    await act(async () => first.onState.mock.calls[0][0]("unavailable"));
    await waitFor(() => expect(mocks.requestToken).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(first.close).toHaveBeenCalledOnce();
    view.unmount();
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
    await waitFor(() => expect(mocks.createTransport.mock.results[0].value.selectTarget)
      .toHaveBeenCalledWith("qj-student-a"));

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
    await waitFor(() => expect(mocks.createTransport.mock.results[0].value.selectTarget)
      .toHaveBeenLastCalledWith("qj-student-b"));
  });
});
