import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState = "requesting" | "ready" | "unavailable";

type Options = {
  active: boolean;
  facingMode: VideoFacingModeEnum;
  messages?: {
    unsupported?: string;
    unavailable?: string;
  };
};

export type UseCameraStreamResult = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  setVideoElement: (node: HTMLVideoElement | null) => void;
  streamRef: React.MutableRefObject<MediaStream | null>;
  cameraState: CameraState;
  cameraError: string | null;
  stopStream: () => void;
};

function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream) {
  if (video.srcObject !== stream) {
    if (video.srcObject) video.srcObject = null;
    video.srcObject = stream;
  }
  video.muted = true;
  video.playsInline = true;
  void video.play().catch(() => undefined);
}

async function requestCameraStream(facingMode: VideoFacingModeEnum): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { exact: facingMode } }, audio: false },
    { video: { facingMode: { ideal: facingMode } }, audio: false },
    { video: true, audio: false },
  ];
  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Camera unavailable");
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useCameraStream({ active, facingMode, messages }: Options): UseCameraStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("requesting");
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ownedStream: MediaStream | null = null;

    const start = async () => {
      if (!active) {
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
      }
      try {
        setCameraState("requesting");
        if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
          throw new Error(
            messages?.unsupported ??
              "此瀏覽器不支援相機存取，請改由教師協助簽到。",
          );
        }
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        const stream = await requestCameraStream(facingMode);
        ownedStream = stream;
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) attachStreamToVideo(videoRef.current, stream);
        setCameraState("ready");
        setCameraError(null);
      } catch (err) {
        setCameraState("unavailable");
        setCameraError(
          err instanceof Error
            ? err.message
            : messages?.unavailable ?? "Camera is not available",
        );
      }
    };

    const video = videoRef.current;
    void start();
    return () => {
      cancelled = true;
      stopMediaStream(ownedStream);
      if (video && video.srcObject === ownedStream) video.srcObject = null;
      if (streamRef.current === ownedStream) streamRef.current = null;
    };
  }, [active, facingMode, messages?.unavailable, messages?.unsupported]);

  const setVideoElement = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) attachStreamToVideo(node, streamRef.current);
  }, []);

  return {
    videoRef,
    setVideoElement,
    streamRef,
    cameraState,
    cameraError,
    stopStream: () => {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    },
  };
}
