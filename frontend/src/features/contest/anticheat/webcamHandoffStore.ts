const HANDOFF_TTL_MS = 5 * 60_000;
const RUNTIME_HANDOFF_TTL_MS = 2 * 60_000;

let handoffStream: MediaStream | null = null;
let handoffExpireAt = 0;
let handoffTimer: ReturnType<typeof setTimeout> | null = null;
let precheckKeeperVideo: HTMLVideoElement | null = null;

let runtimeHandoffStream: MediaStream | null = null;
let runtimeHandoffExpireAt = 0;
let runtimeHandoffTimer: ReturnType<typeof setTimeout> | null = null;
let runtimeKeeperVideo: HTMLVideoElement | null = null;

const stopStreamTracks = (stream: MediaStream | null) => {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // keep best-effort
    }
  }
};

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

const attachKeeper = (target: "precheck" | "runtime", stream: MediaStream) => {
  if (typeof document === "undefined") return;
  let keeper = target === "precheck" ? precheckKeeperVideo : runtimeKeeperVideo;
  if (!keeper) {
    keeper = document.createElement("video");
    keeper.autoplay = true;
    keeper.muted = true;
    keeper.playsInline = true;
    if (target === "precheck") {
      precheckKeeperVideo = keeper;
    } else {
      runtimeKeeperVideo = keeper;
    }
  }
  try {
    keeper.srcObject = stream;
  } catch {
    return;
  }
  try {
    const playResult = keeper.play();
    if (playResult && typeof playResult.catch === "function") {
      void playResult.catch(() => {
        // keep best-effort
      });
    }
  } catch {
    // keep best-effort
  }
};

const detachKeeper = (target: "precheck" | "runtime") => {
  const keeper = target === "precheck" ? precheckKeeperVideo : runtimeKeeperVideo;
  if (!keeper) return;
  try {
    keeper.pause();
  } catch {
    // ignore
  }
  keeper.srcObject = null;
};

export const clearPrecheckWebcamHandoff = (stopTracks = true): void => {
  clearTimer();
  detachKeeper("precheck");
  if (stopTracks) stopStreamTracks(handoffStream);
  handoffStream = null;
  handoffExpireAt = 0;
};

export const setPrecheckWebcamHandoff = (stream: MediaStream): void => {
  clearPrecheckWebcamHandoff(true);
  handoffStream = stream;
  handoffExpireAt = Date.now() + HANDOFF_TTL_MS;
  attachKeeper("precheck", stream);
  handoffTimer = setTimeout(() => {
    clearPrecheckWebcamHandoff(true);
  }, HANDOFF_TTL_MS);
};

export const consumePrecheckWebcamHandoff = (): MediaStream | null => {
  if (!handoffStream) return null;
  if (Date.now() > handoffExpireAt) {
    clearPrecheckWebcamHandoff(true);
    return null;
  }
  const stream = handoffStream;
  clearTimer();
  detachKeeper("precheck");
  handoffStream = null;
  handoffExpireAt = 0;
  return stream;
};

export const peekPrecheckWebcamHandoff = (): MediaStream | null => {
  if (!handoffStream) return null;
  if (Date.now() > handoffExpireAt) {
    clearPrecheckWebcamHandoff(true);
    return null;
  }
  return handoffStream;
};

export const clearRuntimeWebcamHandoff = (stopTracks = true): void => {
  clearRuntimeTimer();
  detachKeeper("runtime");
  if (stopTracks) stopStreamTracks(runtimeHandoffStream);
  runtimeHandoffStream = null;
  runtimeHandoffExpireAt = 0;
};

export const setRuntimeWebcamHandoff = (stream: MediaStream): void => {
  clearRuntimeWebcamHandoff(true);
  runtimeHandoffStream = stream;
  runtimeHandoffExpireAt = Date.now() + RUNTIME_HANDOFF_TTL_MS;
  attachKeeper("runtime", stream);
  runtimeHandoffTimer = setTimeout(() => {
    clearRuntimeWebcamHandoff(true);
  }, RUNTIME_HANDOFF_TTL_MS);
};

export const consumeRuntimeWebcamHandoff = (): MediaStream | null => {
  if (!runtimeHandoffStream) return null;
  if (Date.now() > runtimeHandoffExpireAt) {
    clearRuntimeWebcamHandoff(true);
    return null;
  }
  const stream = runtimeHandoffStream;
  clearRuntimeTimer();
  detachKeeper("runtime");
  runtimeHandoffStream = null;
  runtimeHandoffExpireAt = 0;
  return stream;
};

export const peekRuntimeWebcamHandoff = (): MediaStream | null => {
  if (!runtimeHandoffStream) return null;
  if (Date.now() > runtimeHandoffExpireAt) {
    clearRuntimeWebcamHandoff(true);
    return null;
  }
  return runtimeHandoffStream;
};
