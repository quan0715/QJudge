import {
  addRealtimeSfuTracks,
  createRealtimeSfuSession,
  getRealtimeSfuConfig,
  heartbeatRealtimeSfuPublisher,
  stopRealtimeSfuPublisher,
  type RealtimeSfuPublisherDto,
} from "@/infrastructure/api/repositories/exam.repository";
import {
  createSfuPeerConnection,
  toSfuSessionDescription,
  waitForSfuIceGatheringComplete,
} from "@/features/contest/anticheat/sfuRealtimeClient";

const HEARTBEAT_INTERVAL_MS = 25_000;

export interface SfuScreenSharePublisherState {
  sessionId: string;
  trackName: string;
  roomId: string;
  publisher?: RealtimeSfuPublisherDto;
}

export class SfuScreenSharePublisher {
  private peer: RTCPeerConnection | null = null;
  private heartbeatTimer: number | null = null;
  private activeState: SfuScreenSharePublisherState | null = null;

  get state() {
    return this.activeState;
  }

  async start(contestId: string, stream: MediaStream): Promise<SfuScreenSharePublisherState | null> {
    if (this.activeState) return this.activeState;

    const config = await getRealtimeSfuConfig(contestId);
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

    const trackName = `screen-${contestId}-${Date.now()}`;
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
    const sessionId = this.activeState?.sessionId;
    this.stopHeartbeat();
    this.peer?.close();
    this.peer = null;
    this.activeState = null;
    try {
      await stopRealtimeSfuPublisher(contestId, sessionId);
    } catch {
      // Best effort cleanup only. Cache TTL also expires stale publisher state.
    }
  }

  private startHeartbeat(contestId: string) {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      heartbeatRealtimeSfuPublisher(contestId).catch(() => {
        // Heartbeat is best effort during spike phase.
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

export const createSfuScreenSharePublisher = () => new SfuScreenSharePublisher();
