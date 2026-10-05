import { useCallback, useEffect, useRef, useState } from "react";
import type { ContestDetail, ExamRuntimeState, ExamStatusType } from "@/core/entities/contest.entity";
import { getRuntimeState, EXAM_STARTED_EVENT, EXAM_SUBMITTED_EVENT } from "@/infrastructure/api/repositories/exam.repository";

export const mergeExamRuntimeState = (contest: ContestDetail | null, state: ExamRuntimeState | null, confirmedStatus?: ExamStatusType | null): ContestDetail | null => {
  if (!contest) return contest;
  if (!state) return confirmedStatus ? { ...contest, examStatus: confirmedStatus } : contest;
  return { ...contest, startTime: state.start_time ?? contest.startTime,
    endTime: state.end_time ?? contest.endTime, scheduleRevision: state.schedule_revision,
    examStatus: confirmedStatus ?? state.exam_status, serverTimeOffsetMs: state.serverOffsetMs };
};

/** One owner at the contest route. Abort plus generation protects same-revision
 * status/grant changes; revision separately prevents server snapshot rollback. */
export function useExamRuntimeState(contestId?: string) {
  const [{ state, confirmedStatus }, setSnapshot] = useState<{
    state: ExamRuntimeState | null; confirmedStatus: ExamStatusType | null;
  }>({ state: null, confirmedStatus: null });
  // Clearing a previous attempt's grants must not lower the schedule watermark.
  const acceptedRevision = useRef(-1);
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
      if (!Number.isFinite(serverNow) || !Number.isSafeInteger(next.schedule_revision) ||
        !["not_started", "in_progress", "paused", "locked", "submitted"].includes(next.exam_status)) return;
      const receivedAt = Date.now();
      if (next.schedule_revision < acceptedRevision.current) return;
      acceptedRevision.current = next.schedule_revision;
      setSnapshot({ state: { ...next, serverOffsetMs: serverNow - receivedAt }, confirmedStatus: null });
    } catch { /* Monitoring/schedule connectivity never changes answer permissions. */ }
  }, [contestId]);
  useEffect(() => {
    setSnapshot({ state: null, confirmedStatus: null });
    acceptedRevision.current = -1;
    if (!contestId) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    const online = () => { void refresh(); };
    const visible = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const confirm = (event: Event, status: ExamStatusType) => {
      if ((event as CustomEvent).detail?.contestId !== contestId) return;
      // Admission/submission already succeeded. Drop pre-transition reads and
      // keep that status while optional polling fails or is superseded. A new
      // admission must not reuse the previous attempt's identity/upload grant.
      generation.current += 1;
      request.current?.abort();
      setSnapshot(previous => ({
        state: status === "in_progress" ? null : previous.state,
        confirmedStatus: status,
      }));
      void refresh();
    };
    const started = (event: Event) => confirm(event, "in_progress");
    const submitted = (event: Event) => confirm(event, "submitted");
    window.addEventListener("online", online);
    window.addEventListener(EXAM_STARTED_EVENT, started);
    window.addEventListener(EXAM_SUBMITTED_EVENT, submitted);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current += 1;
      request.current?.abort();
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener(EXAM_STARTED_EVENT, started);
      window.removeEventListener(EXAM_SUBMITTED_EVENT, submitted);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [contestId, refresh]);
  return { state, confirmedStatus, refresh };
}
