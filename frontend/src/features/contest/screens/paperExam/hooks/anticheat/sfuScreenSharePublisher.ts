import {
  addRealtimeSfuTracks,
  createRealtimeSfuSession,
  getRealtimeSfuConfig,
  heartbeatRealtimeSfuPublisher,
  stopRealtimeSfuPublisher,
  type RealtimeSfuConfigDto,
  type RealtimeSfuPublisherDto,
  type RealtimeSfuSourceModule,
} from "@/infrastructure/api/repositories/exam.repository";
import {
  createSfuPeerConnection,
  toSfuSessionDescription,
  waitForSfuIceGatheringComplete,
} from "@/features/contest/anticheat/sfuRealtimeClient";

const HEARTBEAT_INTERVAL_MS = 25_000;
const configRequestsByContest = new Map<string, Promise<RealtimeSfuConfigDto>>();

const loadRealtimeSfuConfig = (contestId: string): Promise<RealtimeSfuConfigDto> => {
  const existing = configRequestsByContest.get(contestId);
  if (existing) return existing;
  const request = getRealtimeSfuConfig(contestId);
  configRequestsByContest.set(contestId, request);
  void request.catch(() => {
    if (configRequestsByContest.get(contestId) === request) {
      configRequestsByContest.delete(contestId);
    }
  });
  return request;
};

export type LiveSourceModule = RealtimeSfuSourceModule;

export interface SfuVideoPublisherState {
  sessionId: string;
  trackName: string;
  roomId: string;
  publisher?: RealtimeSfuPublisherDto;
}

export type SfuScreenSharePublisherState = SfuVideoPublisherState;

export class SfuVideoPublisher {
  private peer: RTCPeerConnection | null = null;
  private heartbeatTimer: number | null = null;
  private activeState: SfuVideoPublisherState | null = null;
  private stopRequest: Promise<void> | null = null;
  private readonly sourceModule: LiveSourceModule;

  constructor(sourceModule: LiveSourceModule = "screen_share") {
    this.sourceModule = sourceModule;
  }

  get state() {
    return this.activeState;
  }

  async start(contestId: string, stream: MediaStream): Promise<SfuVideoPublisherState | null> {
    if (this.activeState) return this.activeState;
    if (this.stopRequest) await this.stopRequest;
    this.stopRequest = null;

    const config = await loadRealtimeSfuConfig(contestId);
    if (!config.enabled || !config.configured) return null;

    const track = stream.getVideoTracks()[0];
    if (!track) return null;

    const session = await createRealtimeSfuSession(contestId, { role: "publisher" });
    const peer = createSfuPeerConnection(config);
    this.peer = peer;

    const transceiver = peer.addTransceiver(track, {
      direction: "sendonly",
      streams: [stream],
    });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForSfuIceGatheringComplete(peer);

    const trackName = `${this.sourceModule}-${contestId}-${Date.now()}`;
    const response = await addRealtimeSfuTracks(contestId, session.sessionId, {
      role: "publisher",
      payload: {
        sessionDescription: toSfuSessionDescription(peer.localDescription),
        tracks: [
          {
            location: "local",
            mid: transceiver.mid || "0",
            trackName,
          },
        ],
      },
    });

    if (response.sessionDescription) {
      await peer.setRemoteDescription(response.sessionDescription);
    }

    this.activeState = {
      sessionId: session.sessionId,
      trackName,
      roomId: session.room_id,
      publisher: response.publisher,
    };
    this.startHeartbeat(contestId);
    return this.activeState;
  }

  async stop(contestId: string): Promise<void> {
    if (this.stopRequest) return this.stopRequest;
    const sessionId = this.activeState?.sessionId;
    this.stopHeartbeat();
    this.peer?.close();
    this.peer = null;
    this.activeState = null;
    if (!sessionId) return;
    const stopRequest: Promise<void> = stopRealtimeSfuPublisher(
      contestId,
      sessionId,
      this.sourceModule,
    ).then(() => undefined).catch(() => undefined);
    this.stopRequest = stopRequest;
    await stopRequest;
    if (this.stopRequest === stopRequest) this.stopRequest = null;
  }

  private startHeartbeat(contestId: string) {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      heartbeatRealtimeSfuPublisher(contestId, this.sourceModule).catch(() => {
        // Heartbeat is best effort; cache TTL expires stale publisher state.
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

export class SfuScreenSharePublisher extends SfuVideoPublisher {
  constructor() {
    super("screen_share");
  }
}

export const createSfuVideoPublisher = (sourceModule: LiveSourceModule) =>
  new SfuVideoPublisher(sourceModule);

export const createSfuScreenSharePublisher = () => new SfuScreenSharePublisher();
