import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Button,
  InlineNotification,
  Stack,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  addRealtimeSfuTracks,
  createRealtimeSfuSession,
  getRealtimeSfuConfig,
  renegotiateRealtimeSfuSession,
  type RealtimeSfuConfigDto,
  type RealtimeSfuSessionDto,
} from "@/infrastructure/api/repositories/exam.repository";
import styles from "./ContestSfuSpikeScreen.module.scss";

const toSessionDescription = (
  description: RTCSessionDescription | RTCSessionDescriptionInit | null
) => {
  if (!description?.type || !description.sdp) {
    throw new Error("WebRTC session description is empty");
  }
  return {
    type: description.type as "offer" | "answer",
    sdp: description.sdp,
  };
};

const createPeerConnection = (config: RealtimeSfuConfigDto | null) =>
  new RTCPeerConnection({
    iceServers: (config?.stun_urls || []).map((url) => ({ urls: url })),
  });

const waitForIceGatheringComplete = (peer: RTCPeerConnection) => {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", handleStateChange);
      resolve();
    }, 5000);

    function handleStateChange() {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", handleStateChange);
      resolve();
    }

    peer.addEventListener("icegatheringstatechange", handleStateChange);
  });
};

const ContestSfuSpikeScreen = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const publisherPeerRef = useRef<RTCPeerConnection | null>(null);
  const subscriberPeerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [config, setConfig] = useState<RealtimeSfuConfigDto | null>(null);
  const [publisherSession, setPublisherSession] =
    useState<RealtimeSfuSessionDto | null>(null);
  const [subscriberSession, setSubscriberSession] =
    useState<RealtimeSfuSessionDto | null>(null);
  const [publishedTrackName, setPublishedTrackName] = useState("");
  const [publisherSessionInput, setPublisherSessionInput] = useState("");
  const [trackNameInput, setTrackNameInput] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [statusText, setStatusText] = useState("尚未連線");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const stopAll = useCallback(() => {
    publisherPeerRef.current?.close();
    subscriberPeerRef.current?.close();
    publisherPeerRef.current = null;
    subscriberPeerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setSubscriberSession(null);
    setStatusText("已停止本頁 WebRTC 連線");
  }, []);

  useEffect(() => {
    if (!contestId) return;
    let mounted = true;
    getRealtimeSfuConfig(contestId)
      .then((nextConfig) => {
        if (!mounted) return;
        setConfig(nextConfig);
        setStatusText(
          nextConfig.enabled && nextConfig.configured
            ? "Realtime SFU spike 已啟用"
            : "Realtime SFU spike 尚未啟用或未設定"
        );
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "讀取 SFU 設定失敗");
      });
    return () => {
      mounted = false;
      stopAll();
    };
  }, [contestId, stopAll]);

  const startPublisher = async () => {
    if (!contestId) return;
    setBusy(true);
    setError("");
    try {
      stopAll();
      const session = await createRealtimeSfuSession(contestId, {
        role: "publisher",
      });
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 5, max: 10 },
        },
        audio: false,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("沒有可發佈的螢幕分享 video track");

      const peer = createPeerConnection(config);
      publisherPeerRef.current = peer;
      const transceiver = peer.addTransceiver(track, {
        direction: "sendonly",
        streams: [stream],
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGatheringComplete(peer);
      const trackName = `screen-${contestId}-${Date.now()}`;
      const mid = transceiver.mid || "0";
      const response = await addRealtimeSfuTracks(contestId, session.sessionId, {
        role: "publisher",
        payload: {
          sessionDescription: toSessionDescription(peer.localDescription),
          tracks: [
            {
              location: "local",
              mid,
              trackName,
            },
          ],
        },
      });
      if (response.sessionDescription) {
        await peer.setRemoteDescription(response.sessionDescription);
      }
      setPublisherSession(session);
      setPublisherSessionInput(session.sessionId);
      setPublishedTrackName(trackName);
      setTrackNameInput(trackName);
      setStatusText("Publisher 已連線，TA 可用下方 sessionId + trackName 訂閱");
    } catch (err) {
      setError(err instanceof Error ? err.message : "啟動 publisher 失敗");
    } finally {
      setBusy(false);
    }
  };

  const startSubscriber = async () => {
    if (!contestId) return;
    if (!publisherSessionInput || !trackNameInput) {
      setError("請填入 publisher sessionId 與 trackName");
      return;
    }
    setBusy(true);
    setError("");
    try {
      subscriberPeerRef.current?.close();
      const session = await createRealtimeSfuSession(contestId, {
        role: "subscriber",
        target_user_id: targetUserId || undefined,
      });
      const peer = createPeerConnection(config);
      subscriberPeerRef.current = peer;
      peer.ontrack = (event) => {
        if (!remoteVideoRef.current) return;
        remoteVideoRef.current.srcObject =
          event.streams[0] || new MediaStream([event.track]);
      };

      const response = await addRealtimeSfuTracks(contestId, session.sessionId, {
        role: "subscriber",
        payload: {
          tracks: [
            {
              location: "remote",
              sessionId: publisherSessionInput,
              trackName: trackNameInput,
            },
          ],
        },
      });

      if (response.sessionDescription?.type === "offer") {
        await peer.setRemoteDescription(response.sessionDescription);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await waitForIceGatheringComplete(peer);
        await renegotiateRealtimeSfuSession(contestId, session.sessionId, {
          payload: {
            sessionDescription: toSessionDescription(peer.localDescription),
          },
        });
      } else if (response.sessionDescription?.type === "answer") {
        await peer.setRemoteDescription(response.sessionDescription);
      }

      setSubscriberSession(session);
      setStatusText("Subscriber 已連線，若 publisher 還在分享，右側應看到畫面");
    } catch (err) {
      setError(err instanceof Error ? err.message : "啟動 subscriber 失敗");
    } finally {
      setBusy(false);
    }
  };

  const canUseSpike = Boolean(config?.enabled && config?.configured);

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <h1 className={styles.title}>Cloudflare Realtime SFU Spike</h1>
        <p className={styles.description}>
          這是手動驗證頁，只測試 Cloudflare SFU publisher / subscriber 流程，不會改變正式作答監考路徑。
        </p>
        {error ? (
          <InlineNotification
            kind="error"
            title="SFU 錯誤"
            subtitle={error}
            lowContrast
            onCloseButtonClick={() => setError("")}
          />
        ) : null}
        {config && !canUseSpike ? (
          <InlineNotification
            kind="warning"
            title="尚未啟用"
            subtitle="請確認後端 LIVE_MONITORING_SPIKE_ENABLED、CLOUDFLARE_REALTIME_APP_ID、CLOUDFLARE_REALTIME_APP_SECRET。"
            hideCloseButton
            lowContrast
          />
        ) : null}
        <div className={styles.statusLine}>{statusText}</div>
      </section>

      <section className={styles.grid}>
        <Tile className={styles.panel}>
          <h2 className={styles.panelTitle}>學生 Publisher</h2>
          <div className={styles.actions}>
            <Button onClick={startPublisher} disabled={!canUseSpike || busy}>
              分享螢幕並 publish
            </Button>
            <Button kind="secondary" onClick={stopAll} disabled={busy}>
              停止
            </Button>
          </div>
          <video
            ref={localVideoRef}
            className={styles.video}
            autoPlay
            muted
            playsInline
          />
          <div className={styles.details}>
            <span>sessionId: {publisherSession?.sessionId || "-"}</span>
            <span>trackName: {publishedTrackName || "-"}</span>
            <span>roomId: {publisherSession?.room_id || "-"}</span>
          </div>
        </Tile>

        <Tile className={styles.panel}>
          <h2 className={styles.panelTitle}>TA Subscriber</h2>
          <Stack gap={5}>
            <TextInput
              id="sfu-publisher-session-id"
              labelText="Publisher sessionId"
              value={publisherSessionInput}
              onChange={(event) => setPublisherSessionInput(event.target.value)}
            />
            <TextInput
              id="sfu-track-name"
              labelText="Track name"
              value={trackNameInput}
              onChange={(event) => setTrackNameInput(event.target.value)}
            />
            <TextInput
              id="sfu-target-user-id"
              labelText="Target user id（可選）"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
            />
          </Stack>
          <div className={styles.actions}>
            <Button onClick={startSubscriber} disabled={!canUseSpike || busy}>
              Subscribe live view
            </Button>
          </div>
          <video
            ref={remoteVideoRef}
            className={styles.video}
            autoPlay
            playsInline
          />
          <div className={styles.details}>
            <span>subscriberSessionId: {subscriberSession?.sessionId || "-"}</span>
            <span>appId: {config?.app_id || "-"}</span>
          </div>
        </Tile>
      </section>
    </main>
  );
};

export default ContestSfuSpikeScreen;
