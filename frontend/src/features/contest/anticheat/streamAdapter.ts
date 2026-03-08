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
      const track = stream.getVideoTracks?.()[0];
      const settings = (track?.getSettings?.() || {}) as MediaTrackSettings & {
        displaySurface?: string;
      };
      if (settings.displaySurface !== "monitor") {
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

  const isLive = (stream: MediaStream | null | undefined) => {
    const track = stream?.getVideoTracks?.()[0];
    return !!track && track.readyState === "live";
  };

  return {
    acquireMonitorStream,
    stopStream,
    isLive,
  };
};

export default createStreamAdapter;
