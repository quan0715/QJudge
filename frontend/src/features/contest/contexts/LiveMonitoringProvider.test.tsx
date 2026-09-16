import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ExamRuntimeState } from "@/core/entities/contest.entity";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  requestToken: vi.fn(),
  createTransport: vi.fn(),
  transports: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    publishSources: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onState: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@/infrastructure/api/repositories/liveMonitoring.repository", () => ({
  getLiveMonitoringConfig: mocks.getConfig,
  requestLiveMonitoringToken: mocks.requestToken,
}));

vi.mock("@/infrastructure/realtime/livekitTransport", () => ({
  createLiveKitTransport: mocks.createTransport,
}));

import {
  LiveMonitoringProvider,
  useLiveMonitoring,
} from "./LiveMonitoringProvider";

const activeRuntime = (): ExamRuntimeState => ({
  server_now: "2026-09-16T12:00:00Z",
  start_time: "2026-09-16T11:00:00Z",
  end_time: "2026-09-16T13:00:00Z",
  schedule_revision: 1,
  exam_status: "in_progress",
  participant_id: 7,
  integrity_run: {
    id: "run-1",
    session_state: "active",
    schedule_revision: 1,
    health: "healthy",
    accept_until: null,
  },
  session_identity: {
    active_device_matches: true,
    device_id: "device-1",
    attempt_id: "attempt-1",
    next_sequence: 1,
  },
  integrity_upload: null,
});

const grant = {
  serverUrl: "wss://livekit.test",
  token: "token",
  roomName: "room-1",
  identity: "qj-student",
  runId: "run-1",
  role: "publisher" as const,
  allowedSources: ["screen_share", "webcam"] as const,
  expiresAt: "2026-09-16T12:01:00Z",
};

function Consumer({ stream }: { stream?: MediaStream }) {
  const { setSources, state } = useLiveMonitoring();
  return (
    <button
      type="button"
      data-testid="state"
      onClick={() => setSources({ screen_share: stream ?? null })}
    >
      {state}
    </button>
  );
}

function wrapper(runtime: ExamRuntimeState | null, children: ReactNode) {
  return (
    <LiveMonitoringProvider contestId="contest-1" runtimeState={runtime}>
      {children}
    </LiveMonitoringProvider>
  );
}

beforeEach(() => {
  mocks.getConfig.mockReset().mockResolvedValue({
    enabled: true,
    configured: true,
    provider: "livekit",
  });
  mocks.requestToken.mockReset().mockResolvedValue(grant);
  mocks.createTransport.mockReset();
  mocks.transports.length = 0;
  mocks.createTransport.mockImplementation(() => {
    const listeners = new Set<(state: string) => void>();
    const transport = {
      connect: vi.fn(async () => {
        for (const listener of listeners) listener("connected");
      }),
      publishSources: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      onState: vi.fn((listener: (state: string) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    };
    mocks.transports.push(transport);
    return transport;
  });
});

describe("LiveMonitoringProvider", () => {
  it("uses the current integrity scope and publishes existing capture streams", async () => {
    const track = { kind: "video", readyState: "live" } as MediaStreamTrack;
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    const view = render(wrapper(activeRuntime(), <Consumer stream={stream} />));

    await waitFor(() => expect(mocks.requestToken).toHaveBeenCalledOnce());
    expect(mocks.requestToken).toHaveBeenCalledWith(
      "contest-1",
      expect.objectContaining({
        role: "publisher",
        uploadScope: {
          runId: "run-1",
          participantId: 7,
          attemptId: "attempt-1",
          deviceId: "device-1",
        },
      }),
    );
    await act(async () => {
      view.getByTestId("state").click();
    });
    await waitFor(() => expect(mocks.transports[0].publishSources).toHaveBeenCalled());
    expect(mocks.transports[0].publishSources).toHaveBeenLastCalledWith({
      screen_share: stream,
      webcam: null,
    });
    expect(view.getByTestId("state")).toHaveTextContent("connected");
  });

  it("reports unavailable without minting when the self-hosted provider is disabled", async () => {
    mocks.getConfig.mockResolvedValue({
      enabled: false,
      configured: false,
      provider: "disabled",
    });
    const view = render(wrapper(activeRuntime(), <Consumer />));

    await waitFor(() => expect(view.getByTestId("state")).toHaveTextContent("unavailable"));
    expect(mocks.requestToken).not.toHaveBeenCalled();
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("closes the transport when the attempt is submitted", async () => {
    const view = render(wrapper(activeRuntime(), <Consumer />));
    await waitFor(() => expect(mocks.transports).toHaveLength(1));

    const submitted = { ...activeRuntime(), exam_status: "submitted" as const };
    await act(async () => {
      view.rerender(wrapper(submitted, <Consumer />));
    });

    await waitFor(() => expect(mocks.transports[0].close).toHaveBeenCalledOnce());
    expect(view.getByTestId("state")).toHaveTextContent("idle");
  });
});
