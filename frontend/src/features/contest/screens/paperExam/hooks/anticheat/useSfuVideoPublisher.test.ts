import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSfuVideoPublisher } from "./sfuScreenSharePublisher";

const mocks = vi.hoisted(() => ({
  addTracks: vi.fn(),
  createPeer: vi.fn(),
  createSession: vi.fn(),
  getConfig: vi.fn(),
  heartbeat: vi.fn(),
  stopPublisher: vi.fn(),
  toSessionDescription: vi.fn((description) => description),
  waitForIce: vi.fn(),
}));

vi.mock("@/infrastructure/api/repositories/exam.repository", () => ({
  addRealtimeSfuTracks: mocks.addTracks,
  createRealtimeSfuSession: mocks.createSession,
  getRealtimeSfuConfig: mocks.getConfig,
  heartbeatRealtimeSfuPublisher: mocks.heartbeat,
  stopRealtimeSfuPublisher: mocks.stopPublisher,
}));

vi.mock("@/features/contest/anticheat/sfuRealtimeClient", () => ({
  createSfuPeerConnection: mocks.createPeer,
  toSfuSessionDescription: mocks.toSessionDescription,
  waitForSfuIceGatheringComplete: mocks.waitForIce,
}));

const stream = () => ({
  getVideoTracks: () => [{ id: "video-track" }],
}) as unknown as MediaStream;

describe("SfuVideoPublisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue({
      enabled: true,
      configured: true,
      app_id: "realtime-app",
      stun_urls: ["stun:stun.cloudflare.com:3478"],
    });
    mocks.createSession.mockResolvedValue({ sessionId: "session-1", room_id: "room-1" });
    mocks.addTracks.mockResolvedValue({
      sessionDescription: { type: "answer", sdp: "remote-answer" },
      publisher: {
        contest_id: 1,
        user_id: 2,
        session_id: "session-1",
        track_name: "screen_share-contest-stop-1",
        room_id: "room-1",
        source_module: "screen_share",
        updated_at: "2026-07-26T00:00:00Z",
      },
    });
    mocks.stopPublisher.mockResolvedValue({ active: false, publisher: null });
    mocks.waitForIce.mockResolvedValue(undefined);
    mocks.createPeer.mockImplementation(() => ({
      addTransceiver: vi.fn(() => ({ mid: "0" })),
      close: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "local-offer" }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      localDescription: { type: "offer", sdp: "local-offer" },
    }));
  });

  it("coalesces repeated stop calls for one active publisher lifecycle", async () => {
    const publisher = createSfuVideoPublisher("screen_share");
    await publisher.start("contest-stop", stream());

    await Promise.all([
      publisher.stop("contest-stop"),
      publisher.stop("contest-stop"),
      publisher.stop("contest-stop"),
    ]);
    await publisher.stop("contest-stop");

    expect(mocks.stopPublisher).toHaveBeenCalledTimes(1);
    expect(mocks.stopPublisher).toHaveBeenCalledWith(
      "contest-stop",
      "session-1",
      "screen_share",
    );
  });

  it("does not request a stop for a publisher that never started", async () => {
    const publisher = createSfuVideoPublisher("webcam");

    await publisher.stop("contest-never-started");

    expect(mocks.stopPublisher).not.toHaveBeenCalled();
  });

  it("shares one config request across publisher sources in the same contest", async () => {
    const screenPublisher = createSfuVideoPublisher("screen_share");
    const webcamPublisher = createSfuVideoPublisher("webcam");

    await Promise.all([
      screenPublisher.start("contest-shared-config", stream()),
      webcamPublisher.start("contest-shared-config", stream()),
    ]);

    expect(mocks.getConfig).toHaveBeenCalledTimes(1);

    await Promise.all([
      screenPublisher.stop("contest-shared-config"),
      webcamPublisher.stop("contest-shared-config"),
    ]);
  });

  it("allows a later publisher to retry a rejected config request", async () => {
    mocks.getConfig
      .mockRejectedValueOnce(new Error("SFU config unavailable"))
      .mockResolvedValueOnce({
        enabled: true,
        configured: true,
        app_id: "realtime-app",
        stun_urls: ["stun:stun.cloudflare.com:3478"],
      });
    const firstPublisher = createSfuVideoPublisher("screen_share");

    await expect(firstPublisher.start("contest-config-retry", stream())).rejects.toThrow(
      "SFU config unavailable",
    );

    const retryPublisher = createSfuVideoPublisher("webcam");
    await expect(retryPublisher.start("contest-config-retry", stream())).resolves.toMatchObject({
      sessionId: "session-1",
    });

    expect(mocks.getConfig).toHaveBeenCalledTimes(2);
    await retryPublisher.stop("contest-config-retry");
  });
});
