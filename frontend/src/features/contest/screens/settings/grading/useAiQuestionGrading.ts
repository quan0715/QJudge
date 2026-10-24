import { useCallback, useMemo, useRef, useState } from "react";
import chatbotRepository from "@/infrastructure/api/repositories/chatbot.repository";
import { aiErrorCode } from "@/shared/ai/modelAvailabilityNotice";
import {
  fetchArtifactContent,
  listArtifacts,
  uploadUserArtifact,
} from "@/infrastructure/api/repositories/artifact.repository";
import {
  bindExistingTaskSession,
  createTaskSession,
} from "@/features/ai-tasks/lib/aiTaskRuntime";
import type { GradingAnswerRow } from "./gradingTypes";
import {
  buildSeedGradeCsv,
  parseCsvContent,
  serializeCsvRows,
} from "./gradeCsv";

export interface AiSuggestion {
  score: number | null;
  reason: string;
  synced: boolean;
}

interface AiState {
  byAnswerId: Record<string, AiSuggestion>;
  rubricMarkdown?: string;
  hasGradeArtifact?: boolean;
  error?: string;
  runErrorCode?: string;
  sessionId?: string;
  trackedQuestionId?: string;
}

const MAX_RETRY = 4;
export const AI_GRADING_TASK_TYPE = "grading.question";
const toNumberOrNull = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const normalizeAnswerId = (value: unknown): string => String(value ?? "").trim();

function parseSynced(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "synced", "submitted"].includes(normalized);
}

async function seedGradeCsvArtifact(sessionId: string, rows: GradingAnswerRow[]): Promise<void> {
  const csv = buildSeedGradeCsv(rows);
  const file = new File([csv], "grade.csv", { type: "text/csv" });
  await uploadUserArtifact(sessionId, file, { step: "grade" });
}

function parseSuggestions(
  content: string,
  expectedAnswerIds: Set<string>,
): Record<string, AiSuggestion> {
  const results: Record<string, AiSuggestion> = {};
  const rows = parseCsvContent(content);
  if (rows.length < 2) return results;

  const header = rows[0].map((c) => c.trim().toLowerCase());
  const idxAnswerId = header.findIndex(
    (c) => c === "exam_answer_id" || c === "answer_id" || c === "id",
  );
  const idxScore = header.findIndex(
    (c) => c === "score" || c === "suggested_score",
  );
  const idxReason = header.findIndex(
    (c) => c === "reason" || c === "feedback" || c === "comment" || c === "explanation",
  );
  const idxSynced = header.findIndex((c) => c === "synced");
  if (idxAnswerId < 0 || idxScore < 0) return results;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowAnswerId = normalizeAnswerId(row[idxAnswerId]);
    if (!rowAnswerId || !expectedAnswerIds.has(rowAnswerId)) continue;
    const score = toNumberOrNull(row[idxScore]);
    const reason = idxReason >= 0 ? toString(row[idxReason]) : "";
    if (score == null && !reason) continue;
    results[rowAnswerId] = {
      score,
      reason,
      synced: idxSynced >= 0 ? parseSynced(row[idxSynced]) : false,
    };
  }
  return results;
}


export function buildDefaultGradingPrompt(contestId: string, questionId: string): string {
  return buildPrompt(contestId, questionId);
}

function buildPrompt(contestId: string, questionId: string): string {
  return [
    `依 qjudge-exam-grading-sop 批改這題。contest_id: ${contestId}，question_id: ${questionId}。`,
    "學生作答已在 `grade.csv`，rubric 用 `rubric.md`；開始時建立 TODO 讓老師看到進度。",
    "填完 `grade.csv` 就停止，不要寫回或發布成績。",
  ].join("\n");
}

function buildRetryPrompt(
  contestId: string,
  questionId: string,
  answerIds: string[],
  note?: string,
): string {
  return [
    `依 qjudge-exam-grading-sop 重新批改這題的指定作答。contest_id: ${contestId}，question_id: ${questionId}。`,
    `只改 \`grade.csv\` 中這些 exam_answer_id：${answerIds.join(", ")}；rubric 用 \`rubric.md\`。`,
    "填完就停止，不要寫回或發布成績。",
    note?.trim() ? `老師註記：${note.trim()}` : "",
  ].filter(Boolean).join("\n");
}

function buildTaskContext(contestId: string, questionId: string): Record<string, string> {
  return { contest_id: contestId, question_id: questionId };
}

function patchSuggestionCsv(
  content: string,
  answerIds: string[],
  patch: { score?: string; reason?: string; synced?: string },
): string {
  const rows = parseCsvContent(content);
  if (rows.length === 0) return content;
  const answerIdSet = new Set(answerIds.map(normalizeAnswerId));
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const idxAnswerId = header.findIndex(
    (c) => c === "exam_answer_id" || c === "answer_id" || c === "id",
  );
  if (idxAnswerId < 0) return content;

  const idxScore = header.findIndex((c) => c === "score" || c === "suggested_score");
  const idxReason = header.findIndex(
    (c) => c === "reason" || c === "feedback" || c === "comment" || c === "explanation",
  );
  const idxSynced = header.findIndex((c) => c === "synced");

  const nextRows = rows.map((row) => [...row]);
  let didPatch = false;
  for (let i = 1; i < nextRows.length; i += 1) {
    if (!answerIdSet.has(normalizeAnswerId(nextRows[i][idxAnswerId]))) continue;
    if (idxScore >= 0 && patch.score !== undefined) nextRows[i][idxScore] = patch.score;
    if (idxReason >= 0 && patch.reason !== undefined) nextRows[i][idxReason] = patch.reason;
    if (idxSynced >= 0 && patch.synced !== undefined) nextRows[i][idxSynced] = patch.synced;
    didPatch = true;
  }
  return didPatch ? serializeCsvRows(nextRows) : content;
}

async function patchGradeCsvArtifact(
  sessionId: string,
  answerIds: string[],
  patch: { score?: string; reason?: string; synced?: string },
): Promise<void> {
  const artifacts = await listArtifacts({ sessionId, step: "grade" });
  const gradeCsv = artifacts
    .filter((artifact) => artifact.filename.toLowerCase() === "grade.csv")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  if (!gradeCsv) return;
  const content = await fetchArtifactContent(gradeCsv.artifact_id);
  const nextContent = patchSuggestionCsv(content.content, answerIds, patch);
  if (nextContent === content.content) return;
  const file = new File([nextContent], "grade.csv", { type: "text/csv" });
  await uploadUserArtifact(sessionId, file, { step: "grade" });
}

export function useAiQuestionGrading() {
  const [state, setState] = useState<AiState>({
    byAnswerId: {},
  });
  // 用 updated_at 當版本戳，artifact 原地更新時能重抓（SOP 的 grade.csv 會被 artifact_csv_patch 持續改寫）。
  const artifactVersionsRef = useRef<Map<string, string>>(new Map());
  const expectedAnswerIdsRef = useRef<Set<string>>(new Set());
  const startInFlightRef = useRef(false);

  const withRetry = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < MAX_RETRY) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number })?.status;
        if (status !== 429) {
          throw error;
        }
        const delayMs = Math.min(500 * 2 ** attempt, 4000);
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        attempt += 1;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("AI request failed");
  }, []);

  const loadSuggestionsOnce = useCallback(async (
    sessionId: string,
    options?: { force?: boolean },
  ) => {
    const artifacts = await listArtifacts({
      sessionId,
    });
    const latest = [...artifacts].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    let merged: Record<string, AiSuggestion> = {};
    let rubricMarkdown: string | undefined;
    let hasGradeArtifact = false;
    for (const artifact of latest) {
      const version = artifact.checksum || artifact.updated_at;
      const prevVersion = artifactVersionsRef.current.get(artifact.artifact_id);
      if (!options?.force && prevVersion === version) continue;
      artifactVersionsRef.current.set(artifact.artifact_id, version);
      const content = await fetchArtifactContent(artifact.artifact_id);
      const filename = artifact.filename.toLowerCase();
      if (filename === "rubric.md") {
        rubricMarkdown = content.content;
        continue;
      }
      if (filename === "grade.csv" || artifact.content_type.toLowerCase().includes("csv")) {
        hasGradeArtifact = true;
        const suggestions = parseSuggestions(content.content, expectedAnswerIdsRef.current);
        merged = { ...merged, ...suggestions };
      }
    }
    if (Object.keys(merged).length > 0 || rubricMarkdown !== undefined || hasGradeArtifact) {
      setState((prev) => ({
        ...prev,
        byAnswerId: { ...prev.byAnswerId, ...merged },
        rubricMarkdown: rubricMarkdown ?? prev.rubricMarkdown,
        hasGradeArtifact: prev.hasGradeArtifact || hasGradeArtifact,
      }));
    }
    return merged;
  }, []);

  // 只把 rows 綁進 refs + artifact 版本戳清空，後續 loadSuggestionsOnce 會就地 setState。
  const primeRows = useCallback((rows: GradingAnswerRow[]) => {
    artifactVersionsRef.current.clear();
    expectedAnswerIdsRef.current = new Set(rows.map((row) => normalizeAnswerId(row.id)));
  }, []);

  const refreshSuggestions = useCallback(async (
    sessionId: string,
    questionId: string,
    rows: GradingAnswerRow[],
  ): Promise<void> => {
    if (!sessionId || !questionId || rows.length === 0) return;
    expectedAnswerIdsRef.current = new Set(rows.map((row) => normalizeAnswerId(row.id)));
    await loadSuggestionsOnce(sessionId, { force: true });
  }, [loadSuggestionsOnce]);

  const start = useCallback(async (
    contestId: string,
    questionId: string,
    rows: GradingAnswerRow[],
    options?: { prompt?: string; modelId?: string; title?: string },
  ): Promise<string | null> => {
    if (!contestId || !questionId) return null;
    if (!rows.length) return null;
    if (startInFlightRef.current) return null;
    startInFlightRef.current = true;

    const prompt = options?.prompt?.trim() || buildPrompt(contestId, questionId);
    const modelId = options?.modelId;
    const context = buildTaskContext(contestId, questionId);

    setState({
      byAnswerId: {},
      rubricMarkdown: undefined,
      hasGradeArtifact: true, // grade.csv 由下方 seed 寫入
      error: undefined,
      runErrorCode: undefined,
      trackedQuestionId: questionId,
    });
    primeRows(rows);

    try {
      const { sessionId } = await withRetry(() =>
        createTaskSession({
          taskType: AI_GRADING_TASK_TYPE,
          context,
          prompt,
          title: options?.title,
        }),
      );

      await withRetry(() => seedGradeCsvArtifact(sessionId, rows));

      await withRetry(() =>
        chatbotRepository.startRun(sessionId, prompt, {
          modelOverride: modelId,
        }),
      );
      setState((prev) => ({ ...prev, sessionId, trackedQuestionId: questionId }));
      return sessionId;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "AI 批改啟動失敗",
        runErrorCode: aiErrorCode(error),
      }));
      return null;
    } finally {
      startInFlightRef.current = false;
    }
  }, [primeRows, withRetry]);

  const clear = useCallback(() => {
    artifactVersionsRef.current.clear();
    expectedAnswerIdsRef.current.clear();
    setState({
      byAnswerId: {},
      rubricMarkdown: undefined,
      hasGradeArtifact: false,
    });
  }, []);

  const retryAnswers = useCallback(async (
    contestId: string,
    questionId: string,
    rows: GradingAnswerRow[],
    options?: { modelId?: string; note?: string },
  ): Promise<boolean> => {
    const sessionId = state.sessionId;
    if (!sessionId || !contestId || !questionId || rows.length === 0) return false;
    if (startInFlightRef.current) return false;

    const answerIds = rows.map((row) => normalizeAnswerId(row.id)).filter(Boolean);
    if (answerIds.length === 0) return false;

    startInFlightRef.current = true;
    try {
      await withRetry(() =>
        patchGradeCsvArtifact(sessionId, answerIds, { score: "", reason: "", synced: "" }),
      );
      setState((prev) => {
        const nextByAnswerId = { ...prev.byAnswerId };
        for (const answerId of answerIds) {
          delete nextByAnswerId[answerId];
        }
        return {
          ...prev,
          byAnswerId: nextByAnswerId,
          error: undefined,
          runErrorCode: undefined,
          sessionId,
          trackedQuestionId: questionId,
        };
      });

      artifactVersionsRef.current.clear();
      expectedAnswerIdsRef.current = new Set(answerIds);

      const prompt = buildRetryPrompt(contestId, questionId, answerIds, options?.note);
      await withRetry(() =>
        chatbotRepository.startRun(sessionId, prompt, {
          modelOverride: options?.modelId,
        }),
      );
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "AI 重新批改啟動失敗",
        runErrorCode: aiErrorCode(error),
      }));
      return false;
    } finally {
      startInFlightRef.current = false;
    }
  }, [state.sessionId, withRetry]);

  const markAnswersSynced = useCallback(async (answerIds: string[]): Promise<boolean> => {
    const sessionId = state.sessionId;
    const normalizedAnswerIds = answerIds.map(normalizeAnswerId).filter(Boolean);
    if (!sessionId || normalizedAnswerIds.length === 0) return false;

    try {
      await withRetry(() => patchGradeCsvArtifact(sessionId, normalizedAnswerIds, { synced: "true" }));
      setState((prev) => {
        const nextByAnswerId = { ...prev.byAnswerId };
        for (const answerId of normalizedAnswerIds) {
          const existing = nextByAnswerId[answerId];
          if (existing) {
            nextByAnswerId[answerId] = { ...existing, synced: true };
          }
        }
        return { ...prev, byAnswerId: nextByAnswerId, error: undefined };
      });
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "AI 批改送出狀態更新失敗",
      }));
      return false;
    }
  }, [state.sessionId, withRetry]);

  const markAnswersUnsynced = useCallback(async (answerIds: string[]): Promise<boolean> => {
    const sessionId = state.sessionId;
    const normalizedAnswerIds = answerIds.map(normalizeAnswerId).filter(Boolean);
    if (!sessionId || normalizedAnswerIds.length === 0) return false;

    try {
      await withRetry(() => patchGradeCsvArtifact(sessionId, normalizedAnswerIds, { synced: "" }));
      setState((prev) => {
        const nextByAnswerId = { ...prev.byAnswerId };
        for (const answerId of normalizedAnswerIds) {
          const existing = nextByAnswerId[answerId];
          if (existing) {
            nextByAnswerId[answerId] = { ...existing, synced: false };
          }
        }
        return { ...prev, byAnswerId: nextByAnswerId, error: undefined };
      });
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "AI 批改送出狀態 revert 失敗",
      }));
      return false;
    }
  }, [state.sessionId, withRetry]);

  /**
   * 外部綁定已存在的 session（例如頁面刷新後重新接回正在跑的批改）。
   * 綁定前會驗證 manifest task_type/context，避免把其他頁面或其他題目的 session 接進來。
   * run 狀態由 CopilotProvider 的公開 runtime 反映；這裡只做 session binding 與 artifact 初載。
   */
  const bindSession = useCallback(
    async (
      sessionId: string,
      contestId: string,
      questionId: string,
      rows: GradingAnswerRow[],
    ): Promise<boolean> => {
      if (!sessionId || !contestId || !questionId || !rows.length) return false;
      try {
        const result = await bindExistingTaskSession({
          sessionId,
          taskType: AI_GRADING_TASK_TYPE,
          context: buildTaskContext(contestId, questionId),
        });
        if (!result.ok) {
          setState((prev) => ({ ...prev, error: result.message }));
          return false;
        }
        primeRows(rows);
        await loadSuggestionsOnce(sessionId);
        setState((prev) => ({
          ...prev,
          error: undefined,
          sessionId,
          trackedQuestionId: questionId,
        }));
        return true;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "AI 批改綁定失敗",
        }));
        return false;
      }
    },
    [loadSuggestionsOnce, primeRows],
  );

  const restore = useCallback(
    async (
      sessionId: string,
      contestId: string,
      questionId: string,
      rows: GradingAnswerRow[],
    ): Promise<string | null> => {
      if (!sessionId || !contestId || !questionId || rows.length === 0) return null;
      try {
        const result = await bindExistingTaskSession({
          sessionId,
          taskType: AI_GRADING_TASK_TYPE,
          context: buildTaskContext(contestId, questionId),
        });
        if (!result.ok) {
          // Context mismatch = 這個 session 是綁在別的題目上，切題目時靜默視為「沒有匹配的 session」。
          if (result.reason === "context_mismatch") {
            clear();
            return null;
          }
          setState((prev) => ({ ...prev, error: result.message }));
          return null;
        }
        primeRows(rows);
        await loadSuggestionsOnce(sessionId, { force: true });
        setState((prev) => ({
          ...prev,
          error: undefined,
          sessionId,
          trackedQuestionId: questionId,
        }));
        return sessionId;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "AI 批改 session 還原失敗",
        }));
        return null;
      }
    },
    [clear, loadSuggestionsOnce, primeRows],
  );

  return useMemo(
    () => ({
      resultsByAnswerId: state.byAnswerId,
      rubricMarkdown: state.rubricMarkdown,
      hasGradeArtifact: state.hasGradeArtifact,
      error: state.error,
      runErrorCode: state.runErrorCode,
      sessionId: state.sessionId,
      trackedQuestionId: state.trackedQuestionId,
      start,
      retryAnswers,
      markAnswersSynced,
      markAnswersUnsynced,
      bindSession,
      restore,
      refreshSuggestions,
      clear,
    }),
    [
      state.byAnswerId,
      state.rubricMarkdown,
      state.hasGradeArtifact,
      state.error,
      state.runErrorCode,
      state.sessionId,
      state.trackedQuestionId,
      start,
      retryAnswers,
      markAnswersSynced,
      markAnswersUnsynced,
      bindSession,
      restore,
      refreshSuggestions,
      clear,
    ],
  );
}
