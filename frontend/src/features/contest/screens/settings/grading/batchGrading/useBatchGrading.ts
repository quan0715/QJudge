import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopilotSessions } from "@copilot";
import type { ChatMessage } from "@/core/types/chatbot.types";
import { useRequestCopilot } from "@/features/chatbot/contexts/CopilotDemandContext";
import {
  createTaskSession,
  findLatestTaskSession,
} from "@/features/ai-tasks/lib/aiTaskRuntime";
import chatbotRepository from "@/infrastructure/api/repositories/chatbot.repository";
import {
  fetchArtifactContent,
  listArtifacts,
  uploadUserArtifact,
  type ArtifactRecord,
} from "@/infrastructure/api/repositories/artifact.repository";
import { ungradeExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { GradingAnswerRow } from "../gradingTypes";
import { buildSeedGradeCsv, serializeCsvRows } from "../gradeCsv";
import {
  BATCH_ACTIVE_STATUSES,
  BATCH_ARTIFACT_STEP,
  BATCH_GRADING_TASK_TYPE,
  BATCH_JSON_FILENAME,
  BATCH_RESUMABLE_STATUSES,
  PROGRESS_CSV_FILENAME,
  buildBatchRunPrompt,
  deriveBatchState,
  gradeCsvFilename,
  parseWrittenCsv,
  selectBatchQuestions,
  selectRevertableAnswers,
  writtenCsvFilename,
  type BatchActiveRun,
  type BatchQuestion,
  type BatchQuestionState,
} from "./batchGradingModel";

const POLL_INTERVAL_MS = 5000;
const WRITTEN_PREFIX = "written_";

interface BatchSnapshot {
  messages: ChatMessage[];
  activeRuns: BatchActiveRun[];
  progressCsv: string | null;
  writtenCsv: Record<string, string>;
}

const EMPTY_SNAPSHOT: BatchSnapshot = {
  messages: [],
  activeRuns: [],
  progressCsv: null,
  writtenCsv: {},
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
  start(modelId?: string): Promise<void>;
  stop(): Promise<void>;
  resume(): Promise<void>;
  revertQuestion(questionId: string): Promise<string[]>;
  regradeQuestion(questionId: string, note?: string): Promise<void>;
  error?: string;
}

function latestByFilename(artifacts: readonly ArtifactRecord[]): Map<string, ArtifactRecord> {
  const latest = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    const current = latest.get(artifact.filename);
    if (!current || new Date(artifact.updated_at) > new Date(current.updated_at)) {
      latest.set(artifact.filename, artifact);
    }
  }
  return latest;
}

async function readBatchFile(sessionId: string, filename: string): Promise<string | null> {
  const artifact = latestByFilename(
    await listArtifacts({ sessionId, step: BATCH_ARTIFACT_STEP }),
  ).get(filename);
  return artifact ? (await fetchArtifactContent(artifact.artifact_id)).content : null;
}

async function uploadBatchFile(sessionId: string, filename: string, content: string, type: string) {
  await uploadUserArtifact(sessionId, new File([content], filename, { type }), {
    step: BATCH_ARTIFACT_STEP,
  });
}

async function loadSnapshot(sessionId: string): Promise<BatchSnapshot> {
  const [session, activeRuns, artifacts] = await Promise.all([
    chatbotRepository.getSession(sessionId),
    chatbotRepository.getActiveRuns(),
    listArtifacts({ sessionId, step: BATCH_ARTIFACT_STEP }),
  ]);
  const latest = latestByFilename(artifacts);
  const read = async (artifact: ArtifactRecord | undefined) =>
    artifact ? (await fetchArtifactContent(artifact.artifact_id)).content : null;
  const writtenEntries = await Promise.all(
    [...latest.entries()]
      .filter(([filename]) => filename.startsWith(WRITTEN_PREFIX))
      .map(async ([filename, artifact]) => [
        filename.slice(WRITTEN_PREFIX.length, -".csv".length),
        (await read(artifact)) ?? "",
      ] as const),
  );
  return {
    messages: session.messages,
    activeRuns: activeRuns
      .filter((run) => run.sessionId === sessionId)
      .map((run) => ({ id: run.id, status: run.status })),
    progressCsv: await read(latest.get(PROGRESS_CSV_FILENAME)),
    writtenCsv: Object.fromEntries(writtenEntries),
  };
}

export function useBatchGrading(
  contestId: string,
  rows: readonly GradingAnswerRow[],
  options: { resultsPublished: boolean; refreshGrades: () => Promise<void> },
): UseBatchGradingResult {
  useRequestCopilot();
  const { sessions, select, refresh: refreshSessions } = useCopilotSessions();
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BatchSnapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState<string>();
  const modelRef = useRef<string | undefined>(undefined);
  const writtenTotalRef = useRef(0);
  const { refreshGrades, resultsPublished } = options;

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

  const sessionId = createdSessionId ?? existingSessionId;
  const boundSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || boundSessionRef.current === sessionId) return;
    boundSessionRef.current = sessionId;
    void select(sessionId);
  }, [select, sessionId]);

  const refreshSnapshot = useCallback(
    async (id: string) => {
      const next = await loadSnapshot(id);
      setSnapshot(next);
      const writtenTotal = Object.values(next.writtenCsv).reduce(
        (sum, csv) => sum + parseWrittenCsv(csv).length,
        0,
      );
      if (writtenTotal !== writtenTotalRef.current) {
        writtenTotalRef.current = writtenTotal;
        await refreshGrades();
      }
    },
    [refreshGrades],
  );

  useEffect(() => {
    if (!sessionId) return undefined;
    const tick = () =>
      refreshSnapshot(sessionId).catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    void tick();
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot, sessionId]);

  const questionStates = useMemo(
    () =>
      deriveBatchState({
        questions,
        messages: snapshot.messages,
        activeRuns: snapshot.activeRuns,
        progressCsv: snapshot.progressCsv,
        writtenCounts: Object.fromEntries(
          Object.entries(snapshot.writtenCsv).map(([qid, csv]) => [qid, parseWrittenCsv(csv).length]),
        ),
      }),
    [questions, snapshot],
  );

  const overall = useMemo<BatchGradingOverall>(() => {
    const tracked = questionStates.filter((q) => q.status !== "skipped");
    return {
      total: tracked.length,
      done: tracked.filter((q) => q.status === "completed").length,
      writtenCount: tracked.reduce((sum, q) => sum + q.writtenCount, 0),
      ungradedTotal: tracked.reduce((sum, q) => sum + q.ungradedCount, 0),
      running: tracked.some((q) => BATCH_ACTIVE_STATUSES.includes(q.status)),
    };
  }, [questionStates]);

  const enqueue = useCallback(
    async (id: string, question: BatchQuestion, answers: GradingAnswerRow[], note?: string) => {
      await uploadBatchFile(id, gradeCsvFilename(question.questionId), buildSeedGradeCsv(answers), "text/csv");
      await chatbotRepository.startRun(
        id,
        buildBatchRunPrompt({
          contestId,
          questionId: question.questionId,
          label: question.label,
          maxScore: question.maxScore,
          regradeNote: note,
        }),
        { modelOverride: modelRef.current },
      );
    },
    [contestId],
  );

  const guard = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setError(undefined);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  const start = useCallback(
    (modelId?: string) =>
      guard(async () => {
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
        setCreatedSessionId(id);
        await refreshSessions();
      }),
    [contestId, enqueue, guard, questions, refreshSessions, resultsPublished],
  );

  const stop = useCallback(
    () =>
      guard(async () => {
        if (!sessionId) return;
        const runs = (await chatbotRepository.getActiveRuns()).filter(
          (run) => run.sessionId === sessionId,
        );
        // Cancel queued runs first; cancelling the running one dispatches the next queued run.
        const ordered = [
          ...runs.filter((run) => run.status === "queued"),
          ...runs.filter((run) => run.status !== "queued"),
        ];
        for (const run of ordered) await chatbotRepository.cancelRun(run.id);
        await refreshSnapshot(sessionId);
      }),
    [guard, refreshSnapshot, sessionId],
  );

  const resume = useCallback(
    () =>
      guard(async () => {
        if (!sessionId) return;
        for (const state of questionStates) {
          const question = questions.find((q) => q.questionId === state.questionId);
          if (
            question &&
            question.ungradedRows.length > 0 &&
            BATCH_RESUMABLE_STATUSES.includes(state.status)
          ) {
            await enqueue(sessionId, question, question.ungradedRows);
          }
        }
        await refreshSnapshot(sessionId);
      }),
    [enqueue, guard, questionStates, questions, refreshSnapshot, sessionId],
  );

  const revertQuestion = useCallback(
    (questionId: string) =>
      guard(async () => {
        if (!sessionId) return [];
        const state = questionStates.find((q) => q.questionId === questionId);
        if (state && BATCH_ACTIVE_STATUSES.includes(state.status)) {
          throw new Error("這題 AI 仍在執行，請等它完成後再撤回");
        }
        const filename = writtenCsvFilename(questionId);
        const written = parseWrittenCsv(await readBatchFile(sessionId, filename));
        const reverted = selectRevertableAnswers(written, rows);
        for (const answerId of reverted) await ungradeExamAnswer(contestId, answerId);
        const remaining = written.filter((record) => !reverted.includes(record.examAnswerId));
        await uploadBatchFile(
          sessionId,
          filename,
          serializeCsvRows([
            ["exam_answer_id", "score", "feedback"],
            ...remaining.map((r) => [r.examAnswerId, String(r.score), r.feedback]),
          ]),
          "text/csv",
        );
        await refreshGrades();
        return reverted;
      }),
    [contestId, guard, questionStates, refreshGrades, rows, sessionId],
  );

  const regradeQuestion = useCallback(
    async (questionId: string, note?: string) => {
      const reverted = await revertQuestion(questionId);
      await guard(async () => {
        const question = questions.find((q) => q.questionId === questionId);
        if (!sessionId || !question) return;
        const ids = new Set([...question.ungradedRows.map((r) => r.id), ...reverted]);
        const answers = rows
          .filter((r) => ids.has(r.id))
          .map((r) => (reverted.includes(r.id) ? { ...r, score: null, feedback: "" } : r));
        if (answers.length > 0) await enqueue(sessionId, question, answers, note);
        await refreshSnapshot(sessionId);
      });
    },
    [enqueue, guard, questions, refreshSnapshot, revertQuestion, rows, sessionId],
  );

  return {
    sessionId,
    questions: questionStates,
    overall,
    canStart: !sessionId && !resultsPublished && overall.ungradedTotal > 0,
    start,
    stop,
    resume,
    revertQuestion,
    regradeQuestion,
    error,
  };
}
