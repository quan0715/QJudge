import {
  addRealtimeSfuTracks,
  createRealtimeSfuSession,
  getRealtimeSfuConfig,
  getRealtimeSfuPublisher,
  renegotiateRealtimeSfuSession,
  type RealtimeSfuPublisherDto,
  type RealtimeSfuSessionDto,
} from "@/infrastructure/api/repositories/exam.repository";
import {
  createSfuPeerConnection,
  toSfuSessionDescription,
  waitForSfuIceGatheringComplete,
} from "@/features/contest/anticheat/sfuRealtimeClient";

export interface SfuLiveSubscriberState {
  subscriberSession: RealtimeSfuSessionDto;
  publisher: RealtimeSfuPublisherDto;
}

export class SfuLiveSubscriber {
  private peer: RTCPeerConnection | null = null;

  async subscribe(
    contestId: string,
    targetUserId: string,
    onRemoteStream: (stream: MediaStream) => void
  ): Promise<SfuLiveSubscriberState> {
    this.stop();

    const config = await getRealtimeSfuConfig(contestId);
    if (!config.enabled || !config.configured) {
      throw new Error("Realtime SFU 尚未啟用或尚未設定");
    }

    const publisherResult = await getRealtimeSfuPublisher(contestId, targetUserId);
    if (!publisherResult.active || !publisherResult.publisher) {
      throw new Error("找不到該學生目前的 live publisher，請確認學生已進入考試並完成螢幕分享");
    }

    const subscriberSession = await createRealtimeSfuSession(contestId, {
      role: "subscriber",
      target_user_id: targetUserId,
    });
    const peer = createSfuPeerConnection(config);
    this.peer = peer;

    peer.ontrack = (event) => {
      onRemoteStream(event.streams[0] || new MediaStream([event.track]));
    };

    const response = await addRealtimeSfuTracks(
      contestId,
      subscriberSession.sessionId,
      {
        role: "subscriber",
        payload: {
          tracks: [
            {
              location: "remote",
              sessionId: publisherResult.publisher.session_id,
              trackName: publisherResult.publisher.track_name,
            },
          ],
        },
      }
    );

    if (response.sessionDescription?.type === "offer") {
      await peer.setRemoteDescription(response.sessionDescription);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForSfuIceGatheringComplete(peer);
      await renegotiateRealtimeSfuSession(contestId, subscriberSession.sessionId, {
        payload: {
          sessionDescription: toSfuSessionDescription(peer.localDescription),
        },
      });
    } else if (response.sessionDescription?.type === "answer") {
      await peer.setRemoteDescription(response.sessionDescription);
    }

    return {
      subscriberSession,
      publisher: publisherResult.publisher,
    };
  }

  stop() {
    this.peer?.close();
    this.peer = null;
  }
}

export const createSfuLiveSubscriber = () => new SfuLiveSubscriber();
