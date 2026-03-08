const HANDOFF_TTL_MS = 5 * 60_000;
const RUNTIME_HANDOFF_TTL_MS = 2 * 60_000;

let handoffStream: MediaStream | null = null;
let handoffExpireAt = 0;
let handoffTimer: ReturnType<typeof setTimeout> | null = null;
let runtimeHandoffStream: MediaStream | null = null;
let runtimeHandoffExpireAt = 0;
let runtimeHandoffTimer: ReturnType<typeof setTimeout> | null = null;
let runtimeKeeperVideo: HTMLVideoElement | null = null;

const clearTimer = () => {
  if (!handoffTimer) return;
  clearTimeout(handoffTimer);
  handoffTimer = null;
};

const clearRuntimeTimer = () => {
  if (!runtimeHandoffTimer) return;
  clearTimeout(runtimeHandoffTimer);
  runtimeHandoffTimer = null;
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

const attachRuntimeKeeper = (stream: MediaStream) => {
  if (typeof document === "undefined") return;
  if (!runtimeKeeperVideo) {
    runtimeKeeperVideo = document.createElement("video");
    runtimeKeeperVideo.autoplay = true;
    runtimeKeeperVideo.muted = true;
    runtimeKeeperVideo.playsInline = true;
  }
  runtimeKeeperVideo.srcObject = stream;
  try {
    const playResult = runtimeKeeperVideo.play();
    if (playResult && typeof playResult.catch === "function") {
      void playResult.catch(() => {
        // Keep-alive best effort only.
      });
    }
  } catch {
    // Keep-alive best effort only.
  }
};

const detachRuntimeKeeper = () => {
  if (!runtimeKeeperVideo) return;
  try {
    runtimeKeeperVideo.pause();
  } catch {
    // ignore
  }
  runtimeKeeperVideo.srcObject = null;
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

export const peekPrecheckScreenShareHandoff = (): MediaStream | null => {
  if (!handoffStream) return null;
  if (Date.now() > handoffExpireAt) {
    clearPrecheckScreenShareHandoff(true);
    return null;
  }
  return handoffStream;
};

export const clearRuntimeScreenShareHandoff = (stopTracks = true): void => {
  clearRuntimeTimer();
  detachRuntimeKeeper();
  if (stopTracks) stopStreamTracks(runtimeHandoffStream);
  runtimeHandoffStream = null;
  runtimeHandoffExpireAt = 0;
};

export const setRuntimeScreenShareHandoff = (stream: MediaStream): void => {
  clearRuntimeScreenShareHandoff(true);
  runtimeHandoffStream = stream;
  runtimeHandoffExpireAt = Date.now() + RUNTIME_HANDOFF_TTL_MS;
  attachRuntimeKeeper(stream);
  runtimeHandoffTimer = setTimeout(() => {
    clearRuntimeScreenShareHandoff(true);
  }, RUNTIME_HANDOFF_TTL_MS);
};

export const consumeRuntimeScreenShareHandoff = (): MediaStream | null => {
  if (!runtimeHandoffStream) return null;
  if (Date.now() > runtimeHandoffExpireAt) {
    clearRuntimeScreenShareHandoff(true);
    return null;
  }
  const stream = runtimeHandoffStream;
  clearRuntimeTimer();
  detachRuntimeKeeper();
  runtimeHandoffStream = null;
  runtimeHandoffExpireAt = 0;
  return stream;
};
