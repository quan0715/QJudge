import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  const state = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    publishTrack: vi.fn(),
    unpublishTrack: vi.fn(),
    rooms: [] as Array<FakeRoom>,
  };

  class FakeRoom {
    listeners = new Map<string, Array<(...args: any[]) => void>>();
    remoteParticipants = new Map<string, any>();
    localParticipant = {
      publishTrack: state.publishTrack,
      unpublishTrack: state.unpublishTrack,
    };

    constructor() {
      state.rooms.push(this);
    }

    on(event: string, listener: (...args: any[]) => void) {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    emit(event: string, ...args: any[]) {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    connect(...args: any[]) {
      return state.connect(...args);
    }

    disconnect(...args: any[]) {
      return state.disconnect(...args);
    }
  }

  return { ...state, FakeRoom };
});

vi.mock("livekit-client", () => ({
  Room: sdk.FakeRoom,
  RoomEvent: {
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
    Disconnected: "disconnected",
    TrackPublished: "trackPublished",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TrackUnpublished: "trackUnpublished",
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
  },
  Track: {
    Source: {
      Camera: "camera",
      ScreenShare: "screen_share",
    },
  },
}));

import { createLiveKitTransport } from "./livekitTransport";
import type { LiveGrant } from "@/core/entities/liveMonitoring.entity";

const grant: LiveGrant = {
  serverUrl: "wss://livekit.example.test",
  token: "token",
  roomName: "room-1",
  identity: "qj-publisher",
  runId: "run-1",
  role: "publisher",
  allowedSources: ["screen_share", "webcam"],
  expiresAt: "2026-09-16T12:00:00Z",
};

function sourceTrack(id: string) {
  const clone = { kind: "video", readyState: "live", id: `${id}-clone`, stop: vi.fn() } as unknown as MediaStreamTrack;
  const original = {
    kind: "video",
    readyState: "live",
    id,
    clone: vi.fn(() => clone),
  } as unknown as MediaStreamTrack;
  return { original, clone, stream: { getVideoTracks: () => [original] } as unknown as MediaStream };
}

beforeEach(() => {
  sdk.connect.mockReset().mockResolvedValue(undefined);
  sdk.disconnect.mockReset().mockResolvedValue(undefined);
  sdk.publishTrack.mockReset().mockResolvedValue({ track: {} });
  sdk.unpublishTrack.mockReset().mockResolvedValue(undefined);
  sdk.rooms.length = 0;
});

describe("createLiveKitTransport", () => {
  it("connects once, publishes clones, and releases only owned tracks", async () => {
    const transport = createLiveKitTransport();
    const states: string[] = [];
    transport.onState((state) => states.push(state));
    const { original, clone, stream } = sourceTrack("screen");

    await Promise.all([transport.connect(grant), transport.connect(grant)]);
    await transport.publishSources({ screen_share: stream });
    await transport.publishSources({ screen_share: stream });

    expect(sdk.connect).toHaveBeenCalledOnce();
    expect(sdk.connect).toHaveBeenCalledWith(
      grant.serverUrl,
      grant.token,
      { autoSubscribe: false },
    );
    expect(sdk.publishTrack).toHaveBeenCalledOnce();
    expect(sdk.publishTrack.mock.calls[0][0]).toBe(clone);
    expect(sdk.publishTrack.mock.calls[0][0]).not.toBe(original);
    expect(sdk.publishTrack.mock.calls[0][1]).toMatchObject({ source: "screen_share" });

    await transport.publishSources({ screen_share: null });
    expect(sdk.unpublishTrack).toHaveBeenCalledOnce();
    expect(sdk.unpublishTrack.mock.calls[0][0]).toBe(clone);
    expect(clone.stop).toHaveBeenCalledOnce();
    expect(original.stop).toBeUndefined();
    expect(states).toContain("connected");

    await transport.close();
    await transport.close();
    expect(sdk.disconnect).toHaveBeenCalledOnce();
    expect(states.at(-1)).toBe("closed");
  });

  it("republishes the current sources after LiveKit reconnects", async () => {
    const transport = createLiveKitTransport();
    const firstClone = { kind: "video", readyState: "live", id: "screen-clone-1", stop: vi.fn() } as unknown as MediaStreamTrack;
    const secondClone = { kind: "video", readyState: "live", id: "screen-clone-2", stop: vi.fn() } as unknown as MediaStreamTrack;
    const original = {
      kind: "video",
      readyState: "live",
      id: "screen",
      clone: vi.fn().mockReturnValueOnce(firstClone).mockReturnValueOnce(secondClone),
    } as unknown as MediaStreamTrack;
    const stream = { getVideoTracks: () => [original] } as unknown as MediaStream;

    await transport.connect(grant);
    await transport.publishSources({ screen_share: stream });
    sdk.rooms[0].emit("reconnected");
    await vi.waitFor(() => expect(sdk.publishTrack).toHaveBeenCalledTimes(2));

    expect(sdk.publishTrack.mock.calls[1][0]).toBe(secondClone);
    expect(sdk.publishTrack.mock.calls[1][0]).not.toBe(original);
    expect(sdk.unpublishTrack).toHaveBeenCalledWith(firstClone, false);
    expect(firstClone.stop).toHaveBeenCalledOnce();
    expect(secondClone.stop).not.toHaveBeenCalled();

    await transport.close();
  });

  it("does not publish empty, non-video, or ended sources", async () => {
    const transport = createLiveKitTransport();
    await transport.connect(grant);

    await transport.publishSources({
      screen_share: { getVideoTracks: () => [] } as unknown as MediaStream,
    });
    await transport.publishSources({
      webcam: {
        getVideoTracks: () => [{
          kind: "audio",
          id: "audio",
          readyState: "live",
          clone: vi.fn(),
        }],
      } as unknown as MediaStream,
    });
    await transport.publishSources({
      screen_share: {
        getVideoTracks: () => [{
          kind: "video",
          id: "ended",
          readyState: "ended",
          clone: vi.fn(),
        }],
      } as unknown as MediaStream,
    });

    expect(sdk.publishTrack).not.toHaveBeenCalled();
    await transport.close();
  });

  it("selects one remote identity and attaches its two video sources", async () => {
    const transport = createLiveKitTransport();
    await transport.connect({ ...grant, role: "subscriber", allowedSources: [] });
    const room = sdk.rooms[0];
    const screenPublication = {
      source: "screen_share",
      setSubscribed: vi.fn(),
    };
    const webcamPublication = {
      source: "camera",
      setSubscribed: vi.fn(),
    };
    const otherPublication = {
      source: "screen_share",
      setSubscribed: vi.fn(),
    };
    const selected = { identity: "student-a", videoTrackPublications: new Map([
      ["screen", screenPublication],
      ["webcam", webcamPublication],
    ]) };
    const other = { identity: "student-b", videoTrackPublications: new Map([["screen", otherPublication]]) };
    room.remoteParticipants.set(selected.identity, selected);
    room.remoteParticipants.set(other.identity, other);

    const screenVideo = document.createElement("video");
    const webcamVideo = document.createElement("video");
    transport.bindVideo("screen_share", screenVideo);
    transport.bindVideo("webcam", webcamVideo);
    transport.selectTarget("student-a");

    expect(screenPublication.setSubscribed).toHaveBeenCalledWith(true);
    expect(webcamPublication.setSubscribed).toHaveBeenCalledWith(true);
    expect(otherPublication.setSubscribed).toHaveBeenCalledWith(false);

    const remoteScreenTrack = { attach: vi.fn(), detach: vi.fn() };
    const remoteWebcamTrack = { attach: vi.fn(), detach: vi.fn() };
    room.emit("trackSubscribed", remoteScreenTrack, screenPublication, selected);
    room.emit("trackSubscribed", remoteWebcamTrack, webcamPublication, selected);
    expect(remoteScreenTrack.attach).toHaveBeenCalledWith(screenVideo);
    expect(remoteWebcamTrack.attach).toHaveBeenCalledWith(webcamVideo);

    transport.selectTarget("student-b");
    expect(remoteScreenTrack.detach).toHaveBeenCalledWith(screenVideo);
    expect(remoteWebcamTrack.detach).toHaveBeenCalledWith(webcamVideo);

    await transport.close();
  });

  it("does not turn a stale connection promise into connected after close", async () => {
    let resolveConnect!: () => void;
    sdk.connect.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveConnect = resolve;
    }));
    const transport = createLiveKitTransport();
    const states: string[] = [];
    transport.onState((state) => states.push(state));
    const connecting = transport.connect(grant);

    await transport.close();
    resolveConnect();
    await connecting;

    expect(states).not.toContain("connected");
    expect(states.at(-1)).toBe("closed");
  });
});
