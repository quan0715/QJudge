const HANDOFF_TTL_MS = 5 * 60_000;

let handoffStream: MediaStream | null = null;
let handoffExpireAt = 0;
let handoffTimer: ReturnType<typeof setTimeout> | null = null;

const clearTimer = () => {
  if (!handoffTimer) return;
  clearTimeout(handoffTimer);
  handoffTimer = null;
};

const stopStreamTracks = (stream: MediaStream | null) => {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
};

export const clearPrecheckScreenShareHandoff = (stopTracks = true): void => {
  clearTimer();
  if (stopTracks) stopStreamTracks(handoffStream);
  handoffStream = null;
  handoffExpireAt = 0;
};

export const setPrecheckScreenShareHandoff = (stream: MediaStream): void => {
  clearPrecheckScreenShareHandoff(true);
  handoffStream = stream;
  handoffExpireAt = Date.now() + HANDOFF_TTL_MS;
  handoffTimer = setTimeout(() => {
    clearPrecheckScreenShareHandoff(true);
  }, HANDOFF_TTL_MS);
};

export const consumePrecheckScreenShareHandoff = (): MediaStream | null => {
  if (!handoffStream) return null;
  if (Date.now() > handoffExpireAt) {
    clearPrecheckScreenShareHandoff(true);
    return null;
  }
  const stream = handoffStream;
  clearTimer();
  handoffStream = null;
  handoffExpireAt = 0;
  return stream;
};
