import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopilotRun, useCopilotSessions } from "@copilot";
import { useRequestCopilot } from "@/features/chatbot/contexts/CopilotDemandContext";
import {
  createTaskSession,
  findLatestTaskSession,
} from "@/features/ai-tasks/lib/aiTaskRuntime";
import { ungradeExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { GradingAnswerRow } from "../gradingTypes";
import { serializeCsvRows } from "../gradeCsv";
import {
  readBatchQuestions,
  readBatchFile,
  cancelBatchRun,
  fetchBatchRemoteState,
  listQuestionFiles,
  listSessionActiveRuns,
  readBatchModelId,
  readBatchWritten,
  defaultBatchModelId,
  startBatchRun,
  uploadBatchFile,
  type BatchQuestionFiles,
  type BatchRemoteState,
} from "./batchGradingApi";
import {
  BATCH_ACTIVE_STATUSES,
  BATCH_GRADING_TASK_TYPE,
  BATCH_JSON_FILENAME,
  NOTES_JSON_FILENAME,
  applyFinalizeTimeout,
  deriveBatchState,
  gradeCsvFilename,
  groupForRuns,
  isUnfinished,
  parseWrittenCsv,
  selectBatchQuestions,
  selectRevertableAnswers,
  writtenCsvFilename,
  type BatchQuestion,
  type BatchQuestionState,
} from "./batchGradingModel";

import {
  buildBatchRunPrompt,
  buildGradingUnits,
  buildUnitGradeCsv,
  prepareGradingUnit,
  sha256,
  type BatchUnitManifest,
} from "./batchGradingUnits";

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
  draftCounts: {},
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
  /** Answers the AI has scored so far per question while a run is active. */
  draftCounts: Record<string, number>;
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
  regradeQuestion(questionId: string, note?: string): Promise<void>;
  /** The AI's rubric and grade CSV for one question (read-only viewer). */
  loadQuestionFiles(questionId: string): Promise<BatchQuestionFiles>;
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
  contestId: string,
  sessionId: string,
  questions: readonly BatchQuestion[],
  previous: BatchSnapshot,
): Promise<BatchSnapshot> {
  const next: BatchSnapshot = {
    ...(await fetchBatchRemoteState(
      contestId,
      sessionId,
      previous.sessionId === sessionId ? previous : undefined,
    )),
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
  const { state: copilotRun } = useCopilotRun();
  // Keyed by contest: the screen can stay mounted while the route switches contests.
  const [created, setCreated] = useState<{ contestId: string; sessionId: string } | null>(null);
  const [snapshot, setSnapshot] = useState<BatchSnapshot>(EMPTY_SNAPSHOT);
  const [actionError, setActionError] = useState<string>();
  const [pollError, setPollError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** Question being reverted and re-queued; its old run must not read as unfinished meanwhile. */
  const [regradingId, setRegradingId] = useState<string | null>(null);
  const modelRef = useRef<{ sessionId: string; modelId: string } | null>(null);
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
      const next = await loadSnapshot(contestId, id, questionsRef.current, snapshotRef.current);
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
    [contestId, reloadAnswers],
  );

  // The copilot streams this session's run: reload as soon as the run starts, changes state or ends.
  const runKey =
    copilotRun.run && copilotRun.run.sessionId === sessionId ? `${copilotRun.run.id}:${copilotRun.status}` : "";
  const lastRunKeyRef = useRef("");
  useEffect(() => {
    const previous = lastRunKeyRef.current;
    lastRunKeyRef.current = runKey;
    if (!sessionId || runKey === previous) return;
    refreshSnapshot(sessionId).catch((err) => setPollError(messageOf(err)));
  }, [refreshSnapshot, runKey, sessionId]);

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

  const batchModelId = useCallback(async (id: string): Promise<string> => {
    if (modelRef.current?.sessionId === id) return modelRef.current.modelId;
    const modelId = await readBatchModelId(id);
    modelRef.current = { sessionId: id, modelId };
    return modelId;
  }, []);

  /** Queue the questions' ungraded answers, a few questions per run so they grade in parallel. */
  const enqueue = useCallback(
    async (id: string, toGrade: readonly BatchQuestion[], note?: string) => {
      const modelId = await batchModelId(id);
      const definitions = await readBatchQuestions(contestId);
      const allRows = await reloadAnswers();
      const requested = new Set(toGrade.map((q) => q.questionId));
      const units = buildGradingUnits(selectBatchQuestions(allRows).filter((q) => requested.has(q.questionId)), definitions);
      const notes: Record<string, string> = JSON.parse((await readBatchFile(id, NOTES_JSON_FILENAME)) ?? "{}");
      const runs: BatchUnitManifest[][] = [];
      for (const group of groupForRuns(units)) {
        const manifests = [];
        for (const unit of group) {
          const teacherNote = note ?? notes[unit.id] ?? "";
          notes[unit.id] = teacherNote;
          const { content, manifest } = await prepareGradingUnit(unit, allRows, teacherNote);
          const existingRubric = await readBatchFile(id, `accepted_${manifest.rubric_file}`);
          if (existingRubric) {
            manifest.rubric_sha256 = await sha256(existingRubric);
            await uploadBatchFile(id, manifest.rubric_file, existingRubric, "application/json");
          }
          await uploadBatchFile(id, manifest.context_file, content, "application/json");
          for (const question of unit.targets) {
            await uploadBatchFile(id, gradeCsvFilename(question.questionId),
              buildUnitGradeCsv(question.ungradedRows), "text/csv");
          }
          manifests.push(manifest);
        }
        runs.push(manifests);
      }
      await uploadBatchFile(id, NOTES_JSON_FILENAME, JSON.stringify(notes), "application/json");
      for (const manifests of runs) {
        await startBatchRun(id, buildBatchRunPrompt({ contestId, units: manifests }), modelId);
      }
      // The copilot only attaches to a session's run when the session is selected.
      await select(id);
    },
    [batchModelId, contestId, reloadAnswers, select],
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

  const createBatchSession = useCallback(
    async (modelId?: string): Promise<string> => {
      const selectedModelId = modelId ?? await defaultBatchModelId();
      const { sessionId: id } = await createTaskSession({
        taskType: BATCH_GRADING_TASK_TYPE,
        context: { contest_id: contestId },
        title: "AI 整批批改",
      });
      modelRef.current = { sessionId: id, modelId: selectedModelId };
      await uploadBatchFile(
        id,
        BATCH_JSON_FILENAME,
        JSON.stringify({
          schema_version: 2,
          contest_id: contestId,
          model_id: selectedModelId,
          questions: questions.map((q) => ({
            question_id: q.questionId,
            group_id: q.groupId,
            label: q.label,
            index: q.index,
            max_score: q.maxScore,
          })),
        }),
        "application/json",
      );
      return id;
    },
    [contestId, questions],
  );

  const start = useCallback(
    async (modelId?: string) => {
      await guard(async () => {
        if (resultsPublished) throw new Error("成績已公布，無法啟動整批批改");
        const id = await createBatchSession(modelId);
        await enqueue(id, questions);
        setCreated({ contestId, sessionId: id });
        await refreshSessions();
      }, true);
    },
    [contestId, createBatchSession, enqueue, guard, questions, refreshSessions, resultsPublished],
  );

  const startQuestion = useCallback(
    async (questionIds: readonly string[], modelId?: string, options?: { newSession?: boolean }) => {
      await guard(async () => {
        if (resultsPublished) throw new Error("成績已公布，無法啟動整批批改");
        const reuse = sessionId && !options?.newSession ? sessionId : null;
        const id = reuse ?? await createBatchSession(modelId);
        await enqueue(id, questions.filter((q) => questionIds.includes(q.questionId)));
        if (!reuse) {
          setCreated({ contestId, sessionId: id });
          await refreshSessions();
        } else {
          await refreshSnapshot(id);
        }
      }, true);
    },
    [contestId, createBatchSession, enqueue, guard, questions, refreshSessions, refreshSnapshot, resultsPublished, sessionId],
  );

  const aiWrittenAnswerIds = useMemo(
    () =>
      new Set(
        selectRevertableAnswers(
          Object.values(currentSnapshot.writtenCsv).flatMap((csv) => parseWrittenCsv(csv)),
          rows,
        ),
      ),
    [currentSnapshot.writtenCsv, rows],
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
      const unfinished = new Set(questionStates.filter(isUnfinished).map((q) => q.questionId));
      await enqueue(sessionId, questions.filter((q) => unfinished.has(q.questionId)));
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
      const written = parseWrittenCsv(await readBatchWritten(contestId, id, questionId));
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
          await batchModelId(sessionId);
          const definitions = await readBatchQuestions(contestId);
          const target = definitions.find((q) => q.id === questionId);
          const ids = new Set(definitions.filter((q) => target?.groupId
            ? q.groupId === target.groupId : q.id === questionId).map((q) => q.id));
          if (questionStates.some((q) => ids.has(q.questionId) && BATCH_ACTIVE_STATUSES.includes(q.status))) {
            throw new Error("題組仍在批改，請等整組完成後再重改");
          }
          for (const id of ids) await revertAnswers(sessionId, id);
          const reloaded = selectBatchQuestions(await reloadAnswers());
          await enqueue(sessionId, reloaded.filter((q) => ids.has(q.questionId)), note);
          await refreshSnapshot(sessionId);
        } finally {
          setRegradingId(null);
        }
      }, true);
    },
    [batchModelId, contestId, enqueue, guard, questionStates, refreshSnapshot, reloadAnswers, revertAnswers, sessionId],
  );

  const loadQuestionFiles = useCallback(
    async (questionId: string): Promise<BatchQuestionFiles> => {
      if (!sessionId) return { rubric: null, grade: null };
      return listQuestionFiles(sessionId, questionId, questionStates.find((q) => q.questionId === questionId)?.groupId ?? undefined);
    },
    [questionStates, sessionId],
  );

  return {
    sessionId,
    questions: questionStates,
    draftCounts: currentSnapshot.draftCounts,
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
