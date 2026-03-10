import { useSyncExternalStore } from "react";

interface RuntimeReauthEntry {
  inProgress: boolean;
  graceUntil: number;
  recoveryDeadline: number;
}

const entries = new Map<string, RuntimeReauthEntry>();
const snapshotCache = new Map<string, RuntimeScreenShareReauthSnapshot>();
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

const DEFAULT_KEY = "__global__";

const resolveKey = (contestId?: string) => contestId || DEFAULT_KEY;

const getEntry = (contestId?: string): RuntimeReauthEntry | undefined => {
  const key = resolveKey(contestId);
  return entries.get(key);
};

const ensureEntry = (contestId?: string): RuntimeReauthEntry => {
  const key = resolveKey(contestId);
  const existing = entries.get(key);
  if (existing) return existing;
  const next: RuntimeReauthEntry = {
    inProgress: false,
    graceUntil: 0,
    recoveryDeadline: 0,
  };
  entries.set(key, next);
  return next;
};

const hasLiveRecoveryCountdown = (now = Date.now()) => {
  for (const entry of entries.values()) {
    if (entry.inProgress && entry.recoveryDeadline > now) {
      return true;
    }
  }
  return false;
};

const ensureTicker = () => {
  if (ticker || !hasLiveRecoveryCountdown()) return;
  ticker = setInterval(() => {
    emit();
    if (!hasLiveRecoveryCountdown()) {
      if (ticker) {
        clearInterval(ticker);
      }
      ticker = null;
    }
  }, 300);
};

const stopTicker = () => {
  if (!ticker) return;
  clearInterval(ticker);
  ticker = null;
};

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const beginRuntimeScreenShareReauth = (
  contestIdOrRecoveryMs?: string | number,
  recoveryMs = 0
) => {
  const contestId = typeof contestIdOrRecoveryMs === "string" ? contestIdOrRecoveryMs : undefined;
  const duration =
    typeof contestIdOrRecoveryMs === "number"
      ? Math.max(0, contestIdOrRecoveryMs)
      : Math.max(0, recoveryMs);
  const entry = ensureEntry(contestId);
  entry.inProgress = true;
  entry.graceUntil = 0;
  entry.recoveryDeadline = duration > 0 ? Date.now() + duration : 0;
  ensureTicker();
  emit();
};

export const endRuntimeScreenShareReauth = (
  contestIdOrGraceMs?: string | number,
  graceMs = 1500
) => {
  const contestId = typeof contestIdOrGraceMs === "string" ? contestIdOrGraceMs : undefined;
  const duration =
    typeof contestIdOrGraceMs === "number"
      ? Math.max(0, contestIdOrGraceMs)
      : Math.max(0, graceMs);
  const entry = ensureEntry(contestId);
  entry.inProgress = false;
  entry.graceUntil = Date.now() + duration;
  entry.recoveryDeadline = 0;
  if (!hasLiveRecoveryCountdown()) {
    stopTicker();
  }
  emit();
};

export const clearRuntimeScreenShareReauth = (contestId?: string) => {
  const key = resolveKey(contestId);
  entries.delete(key);
  snapshotCache.delete(key);
  if (!hasLiveRecoveryCountdown()) {
    stopTicker();
  }
  emit();
};

export const isRuntimeScreenShareReauthActive = (contestId?: string) => {
  const now = Date.now();
  if (contestId) {
    const entry = getEntry(contestId);
    if (!entry) return false;
    return entry.inProgress || now < entry.graceUntil;
  }
  for (const entry of entries.values()) {
    if (entry.inProgress || now < entry.graceUntil) {
      return true;
    }
  }
  return false;
};

const getRemainingSeconds = (entry: RuntimeReauthEntry, now: number) => {
  if (!entry.inProgress || entry.recoveryDeadline <= 0) return null;
  return Math.max(0, Math.ceil((entry.recoveryDeadline - now) / 1000));
};

export interface RuntimeScreenShareReauthSnapshot {
  active: boolean;
  inProgress: boolean;
  remainingSeconds: number | null;
}

const getSnapshot = (contestId?: string): RuntimeScreenShareReauthSnapshot => {
  const key = resolveKey(contestId);
  const entry = getEntry(contestId);
  const now = Date.now();
  const next: RuntimeScreenShareReauthSnapshot = {
    active: entry ? entry.inProgress || now < entry.graceUntil : false,
    inProgress: entry ? entry.inProgress : false,
    remainingSeconds: entry ? getRemainingSeconds(entry, now) : null,
  };
  const prev = snapshotCache.get(key);
  if (
    prev &&
    prev.active === next.active &&
    prev.inProgress === next.inProgress &&
    prev.remainingSeconds === next.remainingSeconds
  ) {
    return prev;
  }
  snapshotCache.set(key, next);
  return next;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useRuntimeScreenShareReauth = (contestId?: string) =>
  useSyncExternalStore(
    subscribe,
    () => getSnapshot(contestId),
    () => getSnapshot(contestId)
  );
