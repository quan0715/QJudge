import { useCallback, useEffect, useRef, useState } from "react";
import { createSfuVideoPublisher } from "./anticheat/sfuScreenSharePublisher";
import {
  getExamCaptureSessionId,
  setExamCaptureSessionId,
} from "@/shared/state/examCaptureSessionStore";
import { getAnticheatPhase } from "@/features/contest/anticheat/orchestrator";
import {
  clearPrecheckWebcamHandoff,
  clearRuntimeWebcamHandoff,
  consumePrecheckWebcamHandoff,
  consumeRuntimeWebcamHandoff,
  setRuntimeWebcamHandoff,
} from "@/features/contest/anticheat/webcamHandoffStore";
import {
  requestUserMediaVideo,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";
import {
  getPrimaryVideoTrack,
  isStreamHealthy,
} from "@/features/contest/anticheat/mediaStreamHealth";

interface Options {
  contestId: string;
  enabled?: boolean;
  monitorStream?: boolean;
  preserveStreamOnUnmount?: boolean;
  expectInitialStream?: boolean;
  autoAcquireOnStart?: boolean;
  publishLiveStream?: boolean;
  onWebcamLost?: () => void;
}

export const useAnticheatWebcamCapture = ({
  contestId,
  enabled = false,
  monitorStream = false,
  preserveStreamOnUnmount = false,
  expectInitialStream = false,
  autoAcquireOnStart = false,
  publishLiveStream = false,
  onWebcamLost,
}: Options) => {
  const [uploadSessionId] = useState(() => {
    const existing = getExamCaptureSessionId(contestId);
    if (existing) return existing;
    const created = crypto.randomUUID().replace(/-/g, "").substring(0, 13);
    setExamCaptureSessionId(contestId, created);
    return created;
  });
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const sfuPublisherRef = useRef(createSfuVideoPublisher("webcam"));
  const lastSfuPublisherAttemptAtRef = useRef(0);
  const streamWasLiveRef = useRef(false);
  const initialExpectationCheckedRef = useRef(false);
  const prevMonitorRef = useRef(monitorStream);
  const [streamActive, setStreamActive] = useState(false);
  const onWebcamLostRef = useRef(onWebcamLost);

  useEffect(() => {
    onWebcamLostRef.current = onWebcamLost;
  }, [onWebcamLost]);

  const updateStream = useCallback((nextStream: MediaStream | null) => {
    streamRef.current = nextStream;
    setStream(nextStream);
  }, []);

  const ensureSfuPublisher = useCallback(
    (stream: MediaStream) => {
      if (!publishLiveStream || !monitorStream || sfuPublisherRef.current.state) return;
      const now = Date.now();
      if (now - lastSfuPublisherAttemptAtRef.current < 30_000) return;
      lastSfuPublisherAttemptAtRef.current = now;
      sfuPublisherRef.current.start(contestId, stream).catch(() => {
        // Live monitoring is best effort; evidence capture must continue.
      });
    },
    [contestId, monitorStream, publishLiveStream],
  );

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    updateStream(null);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    return !!stream;
  }, [updateStream]);

  const handleDetectedWebcamLoss = useCallback(() => {
    streamWasLiveRef.current = false;
    lastSfuPublisherAttemptAtRef.current = 0;
    void sfuPublisherRef.current.stop(contestId);
    setStreamActive(false);
    onWebcamLostRef.current?.();
  }, [contestId]);

  const acceptOrRejectStream = useCallback((stream: MediaStream): MediaStream | null => {
    const track = getPrimaryVideoTrack(stream);
    track?.addEventListener("ended", () => {
      if (streamRef.current === stream) {
        updateStream(null);
        handleDetectedWebcamLoss();
      }
    });
    if (isStreamHealthy(stream)) {
      updateStream(stream);
      streamWasLiveRef.current = true;
      setStreamActive(true);
      ensureSfuPublisher(stream);
      return stream;
    }
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }, [ensureSfuPublisher, handleDetectedWebcamLoss, updateStream]);

  const acquireStream = useCallback(async (): Promise<MediaStream | null> => {
    const currentStream = streamRef.current;
    if (currentStream && isStreamHealthy(currentStream)) {
      ensureSfuPublisher(currentStream);
      return currentStream;
    }
    stopStream();

    const handoff = consumePrecheckWebcamHandoff() ?? consumeRuntimeWebcamHandoff();
    if (handoff?.active) {
      return acceptOrRejectStream(handoff);
    }

    if (!autoAcquireOnStart) return null;
    if (!supportsUserMediaApi()) return null;
    try {
      const stream = await requestUserMediaVideo();
      return acceptOrRejectStream(stream);
    } catch {
      return null;
    }
  }, [autoAcquireOnStart, acceptOrRejectStream, ensureSfuPublisher, stopStream]);

  const forceStopCapture = useCallback(() => {
    void sfuPublisherRef.current.stop(contestId);
    lastSfuPublisherAttemptAtRef.current = 0;
    stopStream();
    streamWasLiveRef.current = false;
    setStreamActive(false);
    clearPrecheckWebcamHandoff(true);
    clearRuntimeWebcamHandoff(true);
  }, [contestId, stopStream]);

  useEffect(() => {
    const wasMonitoring = prevMonitorRef.current;
    if (wasMonitoring && !monitorStream && !preserveStreamOnUnmount) {
      forceStopCapture();
    }
    prevMonitorRef.current = monitorStream;
  }, [forceStopCapture, monitorStream, preserveStreamOnUnmount]);

  useEffect(() => {
    if (!monitorStream) return;
    const timer = setInterval(() => {
      const alive = isStreamHealthy(streamRef.current);
      if (streamWasLiveRef.current && !alive) {
        handleDetectedWebcamLoss();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [enabled, handleDetectedWebcamLoss, monitorStream]);

  useEffect(() => {
    if (!monitorStream) {
      initialExpectationCheckedRef.current = false;
      return;
    }
    if (initialExpectationCheckedRef.current) return;
    initialExpectationCheckedRef.current = true;
    let alive = true;
    void (async () => {
      const stream = await acquireStream();
      if (!alive) return;
      if (!stream && expectInitialStream && !streamWasLiveRef.current) {
        handleDetectedWebcamLoss();
      }
    })();
    return () => {
      alive = false;
    };
  }, [acquireStream, expectInitialStream, handleDetectedWebcamLoss, monitorStream]);

  useEffect(
    () => () => {
      const phase = getAnticheatPhase(contestId);
      const shouldPreserveStream =
        preserveStreamOnUnmount && phase !== "TERMINATING" && phase !== "TERMINAL";
      if (shouldPreserveStream) {
        const stream = streamRef.current;
        if (stream?.active) {
          updateStream(null);
          setStreamActive(false);
          setRuntimeWebcamHandoff(stream);
          clearPrecheckWebcamHandoff(true);
          return;
        }
      }
      forceStopCapture();
    },
    [contestId, forceStopCapture, preserveStreamOnUnmount, updateStream]
  );

  return {
    uploadSessionId,
    streamActive,
    forceStopCapture,
    stream,
  };
};

export default useAnticheatWebcamCapture;
