import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopilotSessions } from "@copilot";
import { useRequestCopilot } from "@/features/chatbot/contexts/CopilotDemandContext";
import {
  createTaskSession,
  findLatestTaskSession,
} from "@/features/ai-tasks/lib/aiTaskRuntime";
import { ungradeExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { GradingAnswerRow } from "../gradingTypes";
import { buildSeedGradeCsv, serializeCsvRows } from "../gradeCsv";
import {
  cancelBatchRun,
  fetchBatchRemoteState,
  listSessionActiveRuns,
  readBatchFile,
  startBatchRun,
  uploadBatchFile,
  type BatchRemoteState,
} from "./batchGradingApi";
import {
  BATCH_ACTIVE_STATUSES,
  BATCH_GRADING_TASK_TYPE,
  BATCH_JSON_FILENAME,
  applyFinalizeTimeout,
  buildBatchRunPrompt,
  deriveBatchState,
  gradeCsvFilename,
  isUnfinished,
  parseWrittenCsv,
  selectBatchQuestions,
  selectRevertableAnswers,
  writtenCsvFilename,
  type BatchQuestion,
  type BatchQuestionState,
} from "./batchGradingModel";

const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 30_000;
const FINALIZE_TIMEOUT_MS = 60_000;

interface BatchSnapshot extends BatchRemoteState {
  /** The session this state was read from. */
  sessionId: string | null;
  /** When each run was first seen finalizing (run id → ms). */
  finalizingSince: Record<string, number>;
  fetchedAt: number;
}

const EMPTY_SNAPSHOT: BatchSnapshot = {
  sessionId: null,
  messages: [],
  activeRuns: [],
  progressCsv: null,
  writtenCsv: {},
  finalizingSince: {},
  fetchedAt: 0,
};

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
  overall: BatchGradingOverall;
  canStart: boolean;
  /** An action (start, stop, resume, revert, regrade) is in flight. */
  busy: boolean;
  start(modelId?: string): Promise<void>;
  /** Never throws; failures surface through `error`. */
  stop(): Promise<void>;
  /** Never throws; failures surface through `error`. */
  resume(): Promise<void>;
  revertQuestion(questionId: string): Promise<string[]>;
  regradeQuestion(questionId: string, note?: string): Promise<void>;
  error?: string;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function deriveStates(questions: readonly BatchQuestion[], snapshot: BatchSnapshot) {
  return deriveBatchState({
    questions,
    messages: snapshot.messages,
    activeRuns: snapshot.activeRuns,
    progressCsv: snapshot.progressCsv,
    writtenCounts: Object.fromEntries(
      Object.entries(snapshot.writtenCsv).map(([qid, csv]) => [qid, parseWrittenCsv(csv).length]),
    ),
  });
}

async function loadSnapshot(
  sessionId: string,
  questions: readonly BatchQuestion[],
  previous: BatchSnapshot,
): Promise<BatchSnapshot> {
  const next: BatchSnapshot = {
    ...(await fetchBatchRemoteState(sessionId)),
    sessionId,
    finalizingSince: {},
    fetchedAt: Date.now(),
  };
  const since = new Map(
    previous.sessionId === sessionId ? Object.entries(previous.finalizingSince) : [],
  );
  applyFinalizeTimeout(deriveStates(questions, next), since, next.fetchedAt, FINALIZE_TIMEOUT_MS);
  return { ...next, finalizingSince: Object.fromEntries(since) };
}

const isBusyPolling = (states: readonly BatchQuestionState[]) =>
  states.some((q) => q.finalizing || BATCH_ACTIVE_STATUSES.includes(q.status));

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
  // Keyed by contest: the screen can stay mounted while the route switches contests.
  const [created, setCreated] = useState<{ contestId: string; sessionId: string } | null>(null);
  const [snapshot, setSnapshot] = useState<BatchSnapshot>(EMPTY_SNAPSHOT);
  const [actionError, setActionError] = useState<string>();
  const [pollError, setPollError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** Question being reverted and re-queued; its old run must not read as unfinished meanwhile. */
  const [regradingId, setRegradingId] = useState<string | null>(null);
  const modelRef = useRef<string | undefined>(undefined);
  const writtenTotalRef = useRef(0);
  const snapshotRef = useRef(snapshot);
  const { reloadAnswers, resultsPublished } = options;

  const questions = useMemo(() => selectBatchQuestions(rows), [rows]);
  const questionsRef = useRef(questions);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

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
  const createdSessionId = created?.contestId === contestId ? created.sessionId : null;
  const sessionId = createdSessionId ?? existingSessionId;
  // Ignore state still held from another session until this one is loaded.
  const currentSnapshot = snapshot.sessionId === sessionId ? snapshot : EMPTY_SNAPSHOT;
  const boundSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || boundSessionRef.current === sessionId) return;
    boundSessionRef.current = sessionId;
    void select(sessionId);
  }, [select, sessionId]);

  /** Load the batch state once; returns whether anything is still running. */
  const refreshSnapshot = useCallback(
    async (id: string): Promise<boolean> => {
      const next = await loadSnapshot(id, questionsRef.current, snapshotRef.current);
      snapshotRef.current = next;
      setSnapshot(next);
      setPollError(undefined);
      const writtenTotal = Object.values(next.writtenCsv).reduce(
        (sum, csv) => sum + parseWrittenCsv(csv).length,
        0,
      );
      if (writtenTotal !== writtenTotalRef.current) {
        writtenTotalRef.current = writtenTotal;
        await reloadAnswers();
      }
      return isBusyPolling(deriveStates(questionsRef.current, next));
    },
    [reloadAnswers],
  );

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      let running = false;
      try {
        running = await refreshSnapshot(sessionId);
      } catch (err) {
        if (!cancelled) setPollError(messageOf(err));
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, running ? ACTIVE_POLL_MS : IDLE_POLL_MS);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refreshSnapshot, sessionId]);

  const questionStates = useMemo(
    () =>
      applyFinalizeTimeout(
        deriveStates(questions, currentSnapshot),
        new Map(Object.entries(currentSnapshot.finalizingSince)),
        currentSnapshot.fetchedAt,
        FINALIZE_TIMEOUT_MS,
      ).map((state) =>
        state.questionId === regradingId
          ? { ...state, status: "queued" as const, finalizing: false, error: undefined }
          : state,
      ),
    [questions, regradingId, currentSnapshot],
  );

  const overall = useMemo<BatchGradingOverall>(() => {
    const tracked = questionStates.filter((q) => q.status !== "skipped");
    return {
      total: tracked.length,
      done: tracked.filter((q) => q.status === "completed").length,
      writtenCount: tracked.reduce((sum, q) => sum + q.writtenCount, 0),
      ungradedTotal: tracked.reduce((sum, q) => sum + q.ungradedCount, 0),
      running: isBusyPolling(tracked),
    };
  }, [questionStates]);

  const enqueue = useCallback(
    async (id: string, question: BatchQuestion, answers: GradingAnswerRow[], note?: string) => {
      await uploadBatchFile(id, gradeCsvFilename(question.questionId), buildSeedGradeCsv(answers), "text/csv");
      await startBatchRun(
        id,
        buildBatchRunPrompt({
          contestId,
          questionId: question.questionId,
          label: question.label,
          maxScore: question.maxScore,
          regradeNote: note,
        }),
        modelRef.current,
      );
    },
    [contestId],
  );

  /** Run one action at a time; record its error and optionally rethrow. */
  const guard = useCallback(
    async <T,>(action: () => Promise<T>, rethrow: boolean): Promise<T | undefined> => {
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
    },
    [],
  );

  const start = useCallback(
    async (modelId?: string) => {
      await guard(async () => {
        if (resultsPublished) throw new Error("成績已公布，無法啟動整批批改");
        modelRef.current = modelId;
        const { sessionId: id } = await createTaskSession({
          taskType: BATCH_GRADING_TASK_TYPE,
          context: { contest_id: contestId },
          title: "AI 整批批改",
        });
        await uploadBatchFile(
          id,
          BATCH_JSON_FILENAME,
          JSON.stringify({
            contest_id: contestId,
            questions: questions.map((q) => ({
              question_id: q.questionId,
              label: q.label,
              index: q.index,
              max_score: q.maxScore,
            })),
          }),
          "application/json",
        );
        for (const question of questions) {
          if (question.ungradedRows.length > 0) {
            await enqueue(id, question, question.ungradedRows);
          }
        }
        setCreated({ contestId, sessionId: id });
        await refreshSessions();
      }, true);
    },
    [contestId, enqueue, guard, questions, refreshSessions, resultsPublished],
  );

  const stop = useCallback(async () => {
    await guard(async () => {
      if (!sessionId) return;
      const runs = await listSessionActiveRuns(sessionId);
      // Cancel queued runs first; cancelling the running one dispatches the next queued run.
      const ordered = [
        ...runs.filter((run) => run.status === "queued"),
        ...runs.filter((run) => run.status !== "queued"),
      ];
      for (const run of ordered) await cancelBatchRun(run.id);
      await refreshSnapshot(sessionId);
    }, false);
  }, [guard, refreshSnapshot, sessionId]);

  const resume = useCallback(async () => {
    await guard(async () => {
      if (!sessionId) return;
      for (const state of questionStates.filter(isUnfinished)) {
        const question = questions.find((q) => q.questionId === state.questionId);
        if (question && question.ungradedRows.length > 0) {
          await enqueue(sessionId, question, question.ungradedRows);
        }
      }
      await refreshSnapshot(sessionId);
    }, false);
  }, [enqueue, guard, questionStates, questions, refreshSnapshot, sessionId]);

  /** Ungrade the AI-written answers of one question that nobody changed since. */
  const revertAnswers = useCallback(
    async (id: string, questionId: string): Promise<string[]> => {
      const state = questionStates.find((q) => q.questionId === questionId);
      if (state && BATCH_ACTIVE_STATUSES.includes(state.status)) {
        throw new Error("這題 AI 仍在執行，請等它完成後再撤回");
      }
      const filename = writtenCsvFilename(questionId);
      const written = parseWrittenCsv(await readBatchFile(id, filename));
      // Compare against the latest grades: another teacher may have changed them.
      const candidates = selectRevertableAnswers(written, await reloadAnswers());
      const reverted: string[] = [];
      for (const record of written.filter((r) => candidates.includes(r.examAnswerId))) {
        try {
          // The server re-checks the grade, covering changes made after the reload above.
          await ungradeExamAnswer(contestId, record.examAnswerId, {
            score: record.score,
            feedback: record.feedback,
          });
          reverted.push(record.examAnswerId);
        } catch (err) {
          if ((err as { status?: number }).status !== 409) throw err;
        }
      }
      if (reverted.length > 0) {
        const remaining = written.filter((record) => !reverted.includes(record.examAnswerId));
        await uploadBatchFile(
          id,
          filename,
          serializeCsvRows([
            ["exam_answer_id", "score", "feedback"],
            ...remaining.map((r) => [r.examAnswerId, String(r.score), r.feedback]),
          ]),
          "text/csv",
        );
      }
      return reverted;
    },
    [contestId, questionStates, reloadAnswers],
  );

  const revertQuestion = useCallback(
    async (questionId: string): Promise<string[]> =>
      (await guard(async () => {
        if (!sessionId) return [];
        const reverted = await revertAnswers(sessionId, questionId);
        await reloadAnswers();
        return reverted;
      }, true)) ?? [],
    [guard, reloadAnswers, revertAnswers, sessionId],
  );

  const regradeQuestion = useCallback(
    async (questionId: string, note?: string) => {
      await guard(async () => {
        if (!sessionId) return;
        setRegradingId(questionId);
        try {
          await revertAnswers(sessionId, questionId);
          const question = selectBatchQuestions(await reloadAnswers()).find(
            (q) => q.questionId === questionId,
          );
          if (question && question.ungradedRows.length > 0) {
            await enqueue(sessionId, question, question.ungradedRows, note);
          }
          await refreshSnapshot(sessionId);
        } finally {
          setRegradingId(null);
        }
      }, true);
    },
    [enqueue, guard, refreshSnapshot, reloadAnswers, revertAnswers, sessionId],
  );

  return {
    sessionId,
    questions: questionStates,
    overall,
    canStart: !sessionId && !resultsPublished && overall.ungradedTotal > 0,
    busy,
    start,
    stop,
    resume,
    revertQuestion,
    regradeQuestion,
    error: actionError ?? pollError,
  };
}
