import { getPrimaryVideoTrack, isStreamLive } from "./mediaStreamHealth";

export interface StreamAdapter {
  acquireMonitorStream: () => Promise<MediaStream | null>;
  stopStream: (stream: MediaStream | null | undefined) => void;
  isLive: (stream: MediaStream | null | undefined) => boolean;
}

export const createStreamAdapter = (): StreamAdapter => {
  const acquireMonitorStream = async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getDisplayMedia) return null;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = getPrimaryVideoTrack(stream);
      const settings = (track?.getSettings?.() || {}) as MediaTrackSettings & {
        displaySurface?: string;
      };
      // Some browsers do not expose displaySurface on re-share.
      // Treat explicit non-monitor as invalid; unknown falls back to allow.
      if (settings.displaySurface && settings.displaySurface !== "monitor") {
        for (const t of stream.getTracks()) t.stop();
        return null;
      }
      return stream;
    } catch {
      return null;
    }
  };

  const stopStream = (stream: MediaStream | null | undefined) => {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      track.stop();
    }
  };

  return {
    acquireMonitorStream,
    stopStream,
    isLive: isStreamLive,
  };
};

export default createStreamAdapter;
