import {
  exitFullscreen,
  isFullscreen,
  requestFullscreen,
} from "@/core/usecases/exam";

const DEFAULT_COOLDOWN_MS = 600;

export interface FullscreenAdapter {
  isActive: () => boolean;
  request: () => Promise<boolean>;
  exit: () => Promise<boolean>;
}

export const createFullscreenAdapter = (
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): FullscreenAdapter => {
  let lastRequestAt = 0;
  let lastExitAt = 0;

  const withinCooldown = (ts: number) => Date.now() - ts < cooldownMs;

  return {
    isActive: () => isFullscreen(),
    request: async () => {
      if (isFullscreen()) return true;
      if (withinCooldown(lastRequestAt)) return false;
      lastRequestAt = Date.now();
      try {
        await requestFullscreen();
        return true;
      } catch {
        return false;
      }
    },
    exit: async () => {
      if (!isFullscreen()) return true;
      if (withinCooldown(lastExitAt)) return false;
      lastExitAt = Date.now();
      try {
        await exitFullscreen();
        return true;
      } catch {
        return false;
      }
    },
  };
};

export default createFullscreenAdapter;
