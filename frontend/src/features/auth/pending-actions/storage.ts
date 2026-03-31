import type { PendingActionConfig } from "./types";
import { PENDING_ACTIONS } from "./registry";

const isBrowser = typeof window !== "undefined";

export const storePendingAction = (storageKey: string, value: string): void => {
  if (!isBrowser) return;
  const normalized = value.trim();
  if (!normalized) return;
  window.sessionStorage.setItem(storageKey, normalized);
};

export const getPendingAction = (storageKey: string): string | null => {
  if (!isBrowser) return null;
  return window.sessionStorage.getItem(storageKey);
};

export const clearPendingAction = (storageKey: string): void => {
  if (!isBrowser) return;
  window.sessionStorage.removeItem(storageKey);
};

/**
 * Returns the highest-priority pending action that has a stored value,
 * or null if none are active.
 */
export const getActivePendingAction = (): {
  config: PendingActionConfig;
  value: string;
} | null => {
  const sorted = [...PENDING_ACTIONS].sort((a, b) => a.priority - b.priority);
  for (const config of sorted) {
    const value = getPendingAction(config.storageKey);
    if (value) return { config, value };
  }
  return null;
};
