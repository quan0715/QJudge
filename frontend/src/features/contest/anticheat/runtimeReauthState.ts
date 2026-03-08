import { useSyncExternalStore } from "react";

let runtimeReauthInProgress = false;
let runtimeReauthGraceUntil = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const beginRuntimeScreenShareReauth = () => {
  runtimeReauthInProgress = true;
  runtimeReauthGraceUntil = 0;
  emit();
};

export const endRuntimeScreenShareReauth = (graceMs = 1500) => {
  runtimeReauthInProgress = false;
  runtimeReauthGraceUntil = Date.now() + Math.max(0, graceMs);
  emit();
};

export const isRuntimeScreenShareReauthActive = () =>
  runtimeReauthInProgress || Date.now() < runtimeReauthGraceUntil;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => isRuntimeScreenShareReauthActive();

export const useRuntimeScreenShareReauth = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

