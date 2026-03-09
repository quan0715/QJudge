import { useEffect, useRef } from "react";
import { recordExamEvent } from "@/infrastructure/api/repositories/exam.repository";

/** Heartbeat interval — must be well under the server's 60s timeout. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Sends a periodic heartbeat event to the server so it can detect
 * silent clients (disabled listeners, network loss, browser crash).
 *
 * Completely independent of the detector / event-listener system —
 * uses a plain setInterval so it keeps running even if all DOM
 * listeners are removed.
 */
export function useExamHeartbeat(
  contestId: string | undefined,
  enabled: boolean
) {
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!enabled || !contestId) return;

    const sendHeartbeat = () => {
      recordExamEvent(contestId, "heartbeat", {
        source: "heartbeat_timer",
        metadata: { ts: Date.now() },
      }).catch(() => undefined); // silent — next tick retries
    };

    // Fire immediately so the server has a baseline timestamp.
    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [contestId, enabled]);
}
