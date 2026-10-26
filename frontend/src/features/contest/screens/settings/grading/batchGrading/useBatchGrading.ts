import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopilotRun, useCopilotSessions } from "@copilot";
import { useRequestCopilot } from "@/features/chatbot/contexts/CopilotDemandContext";
import { createTaskSession, findLatestTaskSession } from "@/features/ai-tasks/lib/aiTaskRuntime";
import { ungradeExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { GradingAnswerRow } from "../gradingTypes";
import {
  cancelBatchRun,
  defaultBatchModelId,
  fetchBatchRemoteState,
  listSessionActiveRuns,
  readBatchQuestions,
  readGradingUnit,
  readWrites,
  startBatchRun,
  type BatchQuestionFiles,
  type BatchRemoteState,
} from "./batchGradingApi";
import {
  BATCH_ACTIVE_STATUSES,
  BATCH_GRADING_TASK_TYPE,
  deriveBatchState,
  isUnfinished,
  selectBatchQuestions,
  selectRevertableAnswers,
  type BatchQuestion,
  type BatchQuestionState,
} from "./batchGradingModel";
import { buildBatchRunPrompt, buildGradingUnits } from "./batchGradingUnits";

const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 30_000;

interface BatchSnapshot extends BatchRemoteState {
  sessionId: string | null;
}

const EMPTY_SNAPSHOT: BatchSnapshot = { sessionId: null, messages: [], activeRuns: [], units: [], written: [] };

export interface BatchGradingOverall {
  total: number;
  done: number;
  writtenCount: number;
  ungradedTotal: number;
  running: boolean;
}

export interface UseBatchGradingResult {
  sessionId: string | null;
  questions: BatchQuestionState[];
  units: BatchRemoteState["units"];
  overall: BatchGradingOverall;
  canStart: boolean;
  /** An action (start, stop, resume, revert, regrade) is in flight. */
  busy: boolean;
  start(modelId?: string): Promise<void>;
  /** Grade only these questions (a whole group for a group), reusing the batch session unless `newSession`. */
  startQuestion(questionIds: readonly string[], modelId?: string, options?: { newSession?: boolean }): Promise<void>;
  /** Answers whose current grade is still this session's unchanged AI write. */
  aiWrittenAnswerIds: ReadonlySet<string>;
  /** Never throws; failures surface through `error`. */
  stop(): Promise<void>;
  /** Never throws; failures surface through `error`. */
  resume(): Promise<void>;
  revertQuestion(questionId: string): Promise<string[]>;
  regradeQuestion(questionId: string, note?: string, modelId?: string): Promise<void>;
  /** The AI's rubric and draft grades for the unit holding this question. */
  loadQuestionFiles(questionId: string): Promise<BatchQuestionFiles>;
  error?: string;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useBatchGrading(
  contestId: string,
  rows: readonly GradingAnswerRow[],
  options: {
    resultsPublished: boolean;
    /** Background refresh of the page's answers; must not show a loading screen. */
    reloadAnswers: () => Promise<GradingAnswerRow[]>;
  },
): UseBatchGradingResult {
  useRequestCopilot();
  const { sessions, select, refresh: refreshSessions } = useCopilotSessions();
  const { state: copilotRun } = useCopilotRun();
  const { reloadAnswers, resultsPublished } = options;
  // Keyed by contest: the screen can stay mounted while the route switches contests.
  const [created, setCreated] = useState<{ contestId: string; sessionId: string } | null>(null);
  const [snapshot, setSnapshot] = useState<BatchSnapshot>(EMPTY_SNAPSHOT);
  const [actionError, setActionError] = useState<string>();
  const [pollError, setPollError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const snapshotRef = useRef(snapshot);
  const questions = useMemo(() => selectBatchQuestions(rows), [rows]);

  const existingSessionId = useMemo(
    () =>
      contestId
        ? findLatestTaskSession({
            sessions: sessions.map((session) => ({ id: session.id, context: session.metadata })),
            taskType: BATCH_GRADING_TASK_TYPE,
            context: { contest_id: contestId },
          })
        : null,
    [contestId, sessions],
  );
  const sessionId = (created?.contestId === contestId ? created.sessionId : null) ?? existingSessionId;
  const currentSnapshot = snapshot.sessionId === sessionId ? snapshot : EMPTY_SNAPSHOT;

  // Selecting again would restart the copilot's stream, so each session is selected once.
  const selectedRef = useRef<string | null>(null);
  const selectOnce = useCallback(
    async (id: string, force = false) => {
      if (!force && selectedRef.current === id) return;
      selectedRef.current = id;
      await select(id);
    },
    [select],
  );
  useEffect(() => {
    if (sessionId) void selectOnce(sessionId);
  }, [selectOnce, sessionId]);

  /** Load the batch state; returns whether a run is still active. */
  const refresh = useCallback(
    async (id: string): Promise<boolean> => {
      const previous = snapshotRef.current.sessionId === id ? snapshotRef.current : undefined;
      const next = { ...(await fetchBatchRemoteState(contestId, id, previous)), sessionId: id };
      if (next.written.length !== (previous?.written.length ?? 0)) await reloadAnswers();
      snapshotRef.current = next;
      setSnapshot(next);
      setPollError(undefined);
      return next.activeRuns.length > 0;
    },
    [contestId, reloadAnswers],
  );

  // The copilot streams the session's run: reload as soon as it starts, changes state or ends.
  const runKey = copilotRun.run?.sessionId === sessionId ? `${copilotRun.run?.id}:${copilotRun.status}` : "";
  useEffect(() => {
    if (sessionId && runKey) refresh(sessionId).catch((err) => setPollError(messageOf(err)));
  }, [refresh, runKey, sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      let running = false;
      try {
        running = await refresh(sessionId);
      } catch (err) {
        if (!cancelled) setPollError(messageOf(err));
      }
      if (!cancelled) timer = window.setTimeout(tick, running ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refresh, sessionId]);

  const questionStates = useMemo(
    () => deriveBatchState({ questions, ...currentSnapshot }),
    [questions, currentSnapshot],
  );

  const overall = useMemo<BatchGradingOverall>(() => {
    const tracked = questionStates.filter((q) => q.status !== "skipped");
    return {
      total: tracked.length,
      done: tracked.filter((q) => q.status === "completed").length,
      writtenCount: tracked.reduce((sum, q) => sum + q.writtenCount, 0),
      ungradedTotal: tracked.reduce((sum, q) => sum + q.ungradedCount, 0),
      running: currentSnapshot.activeRuns.length > 0,
    };
  }, [questionStates, currentSnapshot.activeRuns]);

  /** Ask one run to grade these questions; the agent decides how. */
  const enqueue = useCallback(
    async (id: string, toGrade: readonly BatchQuestion[], modelId?: string, note?: string) => {
      const allRows = await reloadAnswers();
      const requested = new Set(toGrade.map((q) => q.questionId));
      const units = buildGradingUnits(
        selectBatchQuestions(allRows).filter((q) => requested.has(q.questionId)),
        await readBatchQuestions(contestId),
        note,
      );
      if (units.length) await startBatchRun(id, buildBatchRunPrompt(units), modelId ?? await defaultBatchModelId());
      // The copilot attaches to a run only when its session is selected.
      await selectOnce(id, true);
    },
    [contestId, reloadAnswers, selectOnce],
  );

  /** Run one action at a time; record its error and optionally rethrow. */
  const guard = useCallback(async <T,>(action: () => Promise<T>, rethrow: boolean): Promise<T | undefined> => {
    setActionError(undefined);
    setBusy(true);
    try {
      return await action();
    } catch (err) {
      setActionError(messageOf(err));
      if (rethrow) throw err;
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const newSession = useCallback(async () => {
    const { sessionId: id } = await createTaskSession({
      taskType: BATCH_GRADING_TASK_TYPE,
      context: { contest_id: contestId },
      title: "AI 整批批改",
    });
    return id;
  }, [contestId]);

  const startQuestion = useCallback(
    async (questionIds: readonly string[], modelId?: string, opts?: { newSession?: boolean }) => {
      await guard(async () => {
        if (resultsPublished) throw new Error("成績已公布，無法啟動整批批改");
        const reuse = opts?.newSession ? null : sessionId;
        const id = reuse ?? await newSession();
        await enqueue(id, questions.filter((q) => questionIds.includes(q.questionId)), modelId);
        if (reuse) {
          await refresh(id);
        } else {
          setCreated({ contestId, sessionId: id });
          await refreshSessions();
        }
      }, true);
    },
    [contestId, enqueue, guard, newSession, questions, refresh, refreshSessions, resultsPublished, sessionId],
  );

  const start = useCallback(
    (modelId?: string) => startQuestion(questions.map((q) => q.questionId), modelId, { newSession: true }),
    [questions, startQuestion],
  );

  const aiWrittenAnswerIds = useMemo(
    () => new Set(selectRevertableAnswers(currentSnapshot.written, rows)),
    [currentSnapshot.written, rows],
  );

  const stop = useCallback(async () => {
    await guard(async () => {
      if (!sessionId) return;
      for (const run of await listSessionActiveRuns(sessionId)) await cancelBatchRun(run.id);
      await refresh(sessionId);
    }, false);
  }, [guard, refresh, sessionId]);

  const resume = useCallback(async () => {
    await guard(async () => {
      if (!sessionId) return;
      const unfinished = new Set(questionStates.filter(isUnfinished).map((q) => q.questionId));
      await enqueue(sessionId, questions.filter((q) => unfinished.has(q.questionId)));
      await refresh(sessionId);
    }, false);
  }, [enqueue, guard, questionStates, questions, refresh, sessionId]);

  /** Clear the AI's grades on these questions that nobody changed since. */
  const revertAnswers = useCallback(
    async (id: string, questionIds: ReadonlySet<string>): Promise<string[]> => {
      if (questionStates.some((q) => questionIds.has(q.questionId) && BATCH_ACTIVE_STATUSES.includes(q.status))) {
        throw new Error("這題 AI 仍在執行，請等它完成後再撤回");
      }
      const written = (await readWrites(contestId, id)).filter((record) => questionIds.has(record.questionId));
      const candidates = new Set(selectRevertableAnswers(written, await reloadAnswers()));
      const reverted: string[] = [];
      for (const record of written.filter((r) => candidates.has(r.examAnswerId))) {
        try {
          // The server re-checks the grade, covering changes made after the reload above.
          await ungradeExamAnswer(contestId, record.examAnswerId, {
            score: record.score,
            feedback: record.feedback,
            batchSessionId: id,
          });
          reverted.push(record.examAnswerId);
        } catch (err) {
          if ((err as { status?: number }).status !== 409) throw err;
        }
      }
      return reverted;
    },
    [contestId, questionStates, reloadAnswers],
  );

  const revertQuestion = useCallback(
    async (questionId: string): Promise<string[]> =>
      (await guard(async () => {
        if (!sessionId) return [];
        const reverted = await revertAnswers(sessionId, new Set([questionId]));
        await reloadAnswers();
        return reverted;
      }, true)) ?? [],
    [guard, reloadAnswers, revertAnswers, sessionId],
  );

  const regradeQuestion = useCallback(
    async (questionId: string, note?: string, modelId?: string) => {
      await guard(async () => {
        if (!sessionId) return;
        const target = questions.find((q) => q.questionId === questionId);
        const ids = new Set(
          questions.filter((q) => (target?.groupId ? q.groupId === target.groupId : q.questionId === questionId))
            .map((q) => q.questionId),
        );
        await revertAnswers(sessionId, ids);
        const reloaded = selectBatchQuestions(await reloadAnswers());
        await enqueue(sessionId, reloaded.filter((q) => ids.has(q.questionId)), modelId, note);
        await refresh(sessionId);
      }, true);
    },
    [enqueue, guard, questions, refresh, reloadAnswers, revertAnswers, sessionId],
  );

  const loadQuestionFiles = useCallback(
    async (questionId: string) => {
      const unit = [...currentSnapshot.units].reverse().find((item) => item.question_ids.includes(questionId));
      return sessionId && unit ? readGradingUnit(contestId, sessionId, unit.unit_id) : null;
    },
    [contestId, currentSnapshot.units, sessionId],
  );

  return {
    sessionId,
    questions: questionStates,
    units: currentSnapshot.units,
    overall,
    canStart: !sessionId && !resultsPublished && overall.ungradedTotal > 0,
    busy,
    start,
    startQuestion,
    aiWrittenAnswerIds,
    stop,
    resume,
    revertQuestion,
    regradeQuestion,
    loadQuestionFiles,
    error: actionError ?? pollError,
  };
}
