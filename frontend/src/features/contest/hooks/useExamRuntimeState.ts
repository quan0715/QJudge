import { useCallback, useEffect, useRef, useState } from "react";
import type { ContestDetail, ExamRuntimeState } from "@/core/entities/contest.entity";
import { getRuntimeState, EXAM_SUBMITTED_EVENT } from "@/infrastructure/api/repositories/exam.repository";

export const mergeExamRuntimeState = (contest: ContestDetail | null, state: ExamRuntimeState | null): ContestDetail | null => {
  if (!contest || !state) return contest;
  return { ...contest, startTime: state.start_time ?? contest.startTime,
    endTime: state.end_time ?? contest.endTime, scheduleRevision: state.schedule_revision,
    examStatus: state.exam_status, serverTimeOffsetMs: state.serverOffsetMs };
};

/** One owner at the contest route. Abort plus generation protects same-revision
 * status/grant changes; revision separately prevents server snapshot rollback. */
export function useExamRuntimeState(contestId?: string) {
  const [state, setState] = useState<ExamRuntimeState | null>(null);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!contestId) return;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const next = await getRuntimeState(contestId, controller.signal);
      if (current !== generation.current || controller.signal.aborted) return;
      const serverNow = Date.parse(next.server_now);
      if (!Number.isFinite(serverNow) || !Number.isSafeInteger(next.schedule_revision)) return;
      const receivedAt = Date.now();
      setState((previous) => previous && previous.schedule_revision > next.schedule_revision
        ? previous : { ...next, serverOffsetMs: serverNow - receivedAt });
    } catch { /* Monitoring/schedule connectivity never changes answer permissions. */ }
  }, [contestId]);
  useEffect(() => {
    setState(null);
    if (!contestId) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    const online = () => { void refresh(); };
    const visible = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const submitted = (event: Event) => {
      if ((event as CustomEvent).detail?.contestId === contestId) void refresh();
    };
    window.addEventListener("online", online);
    window.addEventListener(EXAM_SUBMITTED_EVENT, submitted);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current += 1;
      request.current?.abort();
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener(EXAM_SUBMITTED_EVENT, submitted);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [contestId, refresh]);
  return { state, refresh };
}
