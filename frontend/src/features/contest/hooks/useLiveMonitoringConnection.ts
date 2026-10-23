import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveRole, LiveState } from "@/core/entities/liveMonitoring.entity";
import {
  getLiveMonitoringConfig,
  requestLiveMonitoringToken,
} from "@/infrastructure/api/repositories/liveMonitoring.repository";
import { createLiveKitTransport, type LiveTransport } from "@/infrastructure/realtime/livekitTransport";

type UploadScope = NonNullable<Parameters<typeof requestLiveMonitoringToken>[1]["uploadScope"]>;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000];

export function useLiveMonitoringConnection({
  contestId, enabled, role, uploadScope, onConnected,
}: {
  contestId: string;
  enabled: boolean;
  role: LiveRole;
  uploadScope?: UploadScope;
  onConnected?: (transport: LiveTransport) => Promise<void> | void;
}) {
  const transportRef = useRef<LiveTransport | null>(null);
  const [transport, setTransport] = useState<LiveTransport | null>(null);
  const [state, setState] = useState<LiveState>("idle");
  const [revision, setRevision] = useState(0);
  const reconnect = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    setTransport(null);
    if (!contestId || !enabled) {
      setState("idle");
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    let current: LiveTransport | null = null;
    let unsubscribe: (() => void) | undefined;
    let wake: (() => void) | undefined;
    const onAbort = () => wake?.();
    signal.addEventListener("abort", onAbort);
    const close = async () => {
      const previous = current;
      current = null;
      if (transportRef.current === previous) transportRef.current = null;
      if (!signal.aborted) setTransport(null);
      unsubscribe?.();
      unsubscribe = undefined;
      try {
        await previous?.close();
      } catch {
        // Best effort after a lost connection.
      }
    };

    void (async () => {
      let attempt = 0;
      while (!signal.aborted) {
        setState("connecting");
        try {
          const config = await getLiveMonitoringConfig(contestId, signal);
          if (signal.aborted) return;
          if (!config.enabled || !config.configured || config.provider !== "livekit") {
            setState("unavailable");
            return;
          }
          const grant = await requestLiveMonitoringToken(contestId, { role, uploadScope, signal });
          if (signal.aborted) return;
          current = createLiveKitTransport();
          const lost = new Promise<void>((resolve) => { wake = resolve; });
          unsubscribe = current.onState((next) => {
            if (signal.aborted) return;
            setState(next);
            if (next === "unavailable") wake?.();
          });
          await current.connect(grant);
          if (signal.aborted) return;
          transportRef.current = current;
          setTransport(current);
          await onConnected?.(current);
          if (signal.aborted) return;
          setState("connected");
          await lost;
        } catch (error) {
          if (signal.aborted) return;
          const status = (error as { status?: number } | null)?.status;
          if (status && status < 500 && status !== 408 && status !== 429) {
            setState("unavailable");
            return;
          }
        } finally {
          await close();
        }
        if (signal.aborted) return;
        setState("reconnecting");
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, RETRY_DELAYS[Math.min(attempt++, RETRY_DELAYS.length - 1)]);
          wake = () => { window.clearTimeout(timer); resolve(); };
        });
      }
    })();
    return () => {
      controller.abort();
      signal.removeEventListener("abort", onAbort);
      void close();
    };
  }, [contestId, enabled, role, uploadScope, onConnected, revision]);

  return { transportRef, transport, state, reconnect };
}
