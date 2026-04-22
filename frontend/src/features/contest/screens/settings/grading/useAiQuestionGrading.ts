import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import chatbotRepository from "@/infrastructure/api/repositories/chatbot.repository";
import {
  fetchArtifactContent,
  listArtifacts,
  uploadUserArtifact,
} from "@/infrastructure/api/repositories/artifact.repository";
import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import {
  appendTaskHistory,
  bindExistingTaskSession,
  createTaskSession,
  patchTaskManifest,
} from "./aiTaskRuntime";
import type { AiTaskStatus } from "./aiTaskManifest";
import type { GradingAnswerRow } from "./gradingTypes";

interface AiRunStatusDto {
  id: string;
  status: "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";
  error?: string;
}

interface AiSuggestion {
  score: number | null;
  reason: string;
  synced: boolean;
}

interface ActiveRunRecord {
  sessionId: string;
  /** 外部綁定時可能沒有 runId，這種狀況下不查 run status，只輪詢 artifact。 */
  runId: string;
}

interface AiState {
  running: boolean;
  byAnswerId: Record<string, AiSuggestion>;
  rubricMarkdown?: string;
  hasGradeArtifact?: boolean;
  error?: string;
  sessionId?: string;
  trackedQuestionId?: string;
  taskStatus: AiTaskStatus | "idle";
}

const POLL_MS = 2000;
const MAX_POLL_MS = 10000;
const MAX_RETRY = 4;
const AI_GRADING_TASK_TYPE = "grading.question";
const GRADE_CSV_COLUMNS = [
  "index",
  "exam_answer_id",
  "username",
  "answer_text",
  "original_score",
  "original_feedback",
  "score",
  "reason",
  "synced",
] as const;

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

function stringifyAnswer(answer: Record<string, unknown>): string {
  const text = answer?.text;
  if (typeof text === "string" && text.trim()) return text;
  const selected = answer?.selected;
  if (typeof selected === "string" || typeof selected === "number") return String(selected);
  if (Array.isArray(selected)) return selected.join(", ");
  const code = answer?.code;
  if (typeof code === "string" && code.trim()) return code;

  try {
    return JSON.stringify(answer, null, 2);
  } catch {
    return "";
  }
}

function encodeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildSeedGradeCsv(rows: GradingAnswerRow[]): string {
  const lines = [
    GRADE_CSV_COLUMNS.map(encodeCsvCell).join(","),
    ...rows.map((row, index) =>
      GRADE_CSV_COLUMNS.map((column) => {
        switch (column) {
          case "index":
            return encodeCsvCell(index + 1);
          case "exam_answer_id":
            return encodeCsvCell(row.id);
          case "username":
            return encodeCsvCell(row.studentUsername);
          case "answer_text":
            return encodeCsvCell(stringifyAnswer(row.answerContent));
          case "original_score":
            return encodeCsvCell(row.score ?? "");
          case "original_feedback":
            return encodeCsvCell(row.feedback ?? "");
          case "score":
          case "reason":
          case "synced":
            return encodeCsvCell("");
          default:
            return encodeCsvCell("");
        }
      }).join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function seedGradeCsvArtifact(sessionId: string, rows: GradingAnswerRow[]): Promise<void> {
  const csv = buildSeedGradeCsv(rows);
  const file = new File([csv], "grade.csv", { type: "text/csv" });
  await uploadUserArtifact(sessionId, file, { step: "grade" });
}

function parseCsvContent(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let fieldStarted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === ',') {
      row.push(cur);
      cur = "";
      fieldStarted = false;
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      fieldStarted = false;
    } else if (ch === '\r') {
      // handled by \n or trailing
    } else if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else {
      cur += ch;
      fieldStarted = true;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
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

async function getRunStatus(runId: string): Promise<AiRunStatusDto> {
  return requestJson<AiRunStatusDto>(
    httpClient.get(`/api/v1/ai/runs/${runId}/`),
    "Failed to fetch AI run status",
  );
}

export const AI_GRADING_DEFAULT_MODEL_ID = "deepseek-r1";

export function buildDefaultGradingPrompt(contestId: string, questionId: string): string {
  return buildPrompt(contestId, questionId);
}

function buildPrompt(contestId: string, questionId: string): string {
  return [
    "請使用 `qjudge-exam-grading-sop` 技能協助申論/短答題批改，但本輪先進行「準備階段」，**不要真的批改任何作答**。",
    "",
    "Stage 1 context：",
    `- contest_id: ${contestId}`,
    `- grading_question_id: ${questionId}`,
    "",
    "準備階段要做的事（請先用 todo 工具建立以下兩個 todo，依序完成）：",
    "1. **確認資料**：artifact_read(filename=\"grade.csv\") 檢視前端預先準備的作答列（9 欄：index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced），並透過 qjudge_grading 等工具抓取題目與原始 rubric，向使用者摘要：本題共幾筆作答、滿分、題目重點、學生作答分布觀察。",
    "2. **建立評分規則**：根據題目與樣本作答，草擬這次 AI 批改要沿用的細部評分準則（rubric checklist、分數切分、reason 撰寫規範）。完成後條列給使用者確認。",
    "",
    "兩個 todo 都完成後，**必須停下來等待使用者確認『OK，可以開始批改』**，這階段禁止：",
    "- 呼叫 artifact_csv_patch 寫入任何 score / reason",
    "- 呼叫 qjudge_grading 寫回分數或觸發後續階段",
    "- 自行決定跳過確認繼續批改",
    "",
    "只有在使用者明確回覆同意後，才依 `qjudge-exam-grading-sop` 各 stage 逐步執行實際批改，並遵守下列 grade.csv 規範：",
    "- 透過 artifact_csv_patch 維護既有 `grade.csv`，檔名固定為 `grade.csv`，content_type 為 text/csv。",
    "- 欄位順序固定（9 欄）：index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced。",
    "- key_column: exam_answer_id。",
    "- score 為數值（整數或浮點，且落在題目滿分範圍內）；reason 為簡短中文，依 SOP reason 政策填寫（滿分可留空，非滿分必填）。",
    "- CSV 遵循 RFC 4180：欄位若含逗號、雙引號或換行，必須用雙引號包住，內部雙引號以 \"\" 轉義。",
    "- 更新完 `grade.csv` 後即可停止；不要進入寫回/發布成績階段，也不要呼叫 qjudge_grading 寫回分數。",
  ].join("\n");
}

function buildRetryPrompt(
  contestId: string,
  questionId: string,
  answerIds: string[],
  note?: string,
): string {
  return [
    "請使用 `qjudge-exam-grading-sop` 技能重新批改指定作答，依既有 rubric 與題目脈絡處理。",
    "",
    "Stage 1 context：",
    `- contest_id: ${contestId}`,
    `- grading_question_id: ${questionId}`,
    `- exam_answer_ids: ${answerIds.join(", ")}`,
    note?.trim() ? `- regrade_note: ${note.trim()}` : "",
    "",
    "請先 artifact_read(filename=\"grade.csv\")，只重新批改上述 exam_answer_ids 對應列。",
    "透過 artifact_csv_patch 維護既有 `grade.csv`，key_column 固定為 exam_answer_id，只更新指定列的 score 與 reason。",
    note?.trim() ? "重新批改時請優先考量 regrade_note，但仍需維持 rubric 一致性。" : "",
    "更新完 `grade.csv`（Excel 表格）後即可停止；不要進入寫回/發布成績階段，也不要呼叫 qjudge_grading 寫回分數。",
  ].filter(Boolean).join("\n");
}

function buildTaskContext(contestId: string, questionId: string): Record<string, string> {
  return { contest_id: contestId, question_id: questionId };
}

function serializeCsvRows(rows: string[][]): string {
  return `${rows.map((row) => row.map(encodeCsvCell).join(",")).join("\n")}\n`;
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
  const content = await fetchArtifactContent(gradeCsv.id);
  const nextContent = patchSuggestionCsv(content.content, answerIds, patch);
  if (nextContent === content.content) return;
  const file = new File([nextContent], "grade.csv", { type: "text/csv" });
  await uploadUserArtifact(sessionId, file, { step: "grade" });
}

export function useAiQuestionGrading() {
  const [state, setState] = useState<AiState>({
    running: false,
    byAnswerId: {},
    taskStatus: "idle",
  });
  const activeRunRef = useRef<ActiveRunRecord | null>(null);
  // 用 updated_at 當版本戳，artifact 原地更新時能重抓（SOP 的 grade.csv 會被 artifact_csv_patch 持續改寫）。
  const artifactVersionsRef = useRef<Map<string, string>>(new Map());
  const expectedAnswerIdsRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const startInFlightRef = useRef(false);
  const pollMsRef = useRef(POLL_MS);

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

  const prepareTracking = useCallback((params: {
    sessionId: string;
    runId: string;
    contestId: string;
    questionId: string;
    rows: GradingAnswerRow[];
  }) => {
    activeRunRef.current = { sessionId: params.sessionId, runId: params.runId };
    artifactVersionsRef.current.clear();
    expectedAnswerIdsRef.current = new Set(params.rows.map((row) => normalizeAnswerId(row.id)));
    pollMsRef.current = POLL_MS;
  }, []);

  const loadSuggestionsOnce = useCallback(async (
    sessionId: string,
    _runId: string,
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
      const prevVersion = artifactVersionsRef.current.get(artifact.id);
      if (!options?.force && prevVersion === version) continue;
      artifactVersionsRef.current.set(artifact.id, version);
      const content = await fetchArtifactContent(artifact.id);
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

  const refreshSuggestions = useCallback(async (
    sessionId: string,
    questionId: string,
    rows: GradingAnswerRow[],
  ): Promise<void> => {
    if (!sessionId || !questionId || rows.length === 0) return;
    expectedAnswerIdsRef.current = new Set(rows.map((row) => normalizeAnswerId(row.id)));
    await loadSuggestionsOnce(sessionId, "", { force: true });
    setState((prev) => ({
      ...prev,
      sessionId,
      trackedQuestionId: questionId,
      error: undefined,
    }));
  }, [loadSuggestionsOnce]);

  const start = useCallback(async (
    contestId: string,
    questionId: string,
    rows: GradingAnswerRow[],
    options?: { prompt?: string; modelId?: string },
  ): Promise<string | null> => {
    if (!contestId || !questionId) return null;
    if (!rows.length) return null;
    if (state.running || startInFlightRef.current) return null;
    startInFlightRef.current = true;

    const prompt = options?.prompt?.trim() || buildPrompt(contestId, questionId);
    const modelId = options?.modelId || AI_GRADING_DEFAULT_MODEL_ID;
    const context = buildTaskContext(contestId, questionId);

    setState({
      running: true,
      byAnswerId: {},
      rubricMarkdown: undefined,
      hasGradeArtifact: false,
      error: undefined,
      trackedQuestionId: questionId,
      taskStatus: "running",
    });
    activeRunRef.current = null;
    artifactVersionsRef.current.clear();
    expectedAnswerIdsRef.current = new Set(rows.map((row) => normalizeAnswerId(row.id)));
    pollMsRef.current = POLL_MS;

    try {
      const { sessionId, manifest } = await withRetry(() =>
        createTaskSession({
          taskType: AI_GRADING_TASK_TYPE,
          context,
          prompt,
        }),
      );

      await withRetry(() => seedGradeCsvArtifact(sessionId, rows));
      await loadSuggestionsOnce(sessionId, "");

      if (manifest.active_run_id) {
        prepareTracking({ sessionId, runId: manifest.active_run_id, contestId, questionId, rows });
        await loadSuggestionsOnce(sessionId, manifest.active_run_id);
        setState((prev) => ({
          ...prev,
          sessionId,
          trackedQuestionId: questionId,
          taskStatus: "running",
        }));
        return sessionId;
      }

      const run = await withRetry(() =>
        chatbotRepository.startRun(sessionId, prompt, {
          modelOverride: modelId,
        }),
      );
      prepareTracking({ sessionId, runId: run.id, contestId, questionId, rows });
      await patchTaskManifest(sessionId, (prev) => ({
        ...appendTaskHistory(prev, "run_started", run.id),
        prompt,
        active_run_id: run.id,
      }));
      setState((prev) => ({ ...prev, sessionId, taskStatus: "running" }));
      return sessionId;
    } catch (error) {
      activeRunRef.current = null;
      setState((prev) => ({
        ...prev,
        running: false,
        taskStatus: "failed",
        error: error instanceof Error ? error.message : "AI 批改啟動失敗",
      }));
      return null;
    } finally {
      startInFlightRef.current = false;
    }
  }, [loadSuggestionsOnce, prepareTracking, state.running, withRetry]);

  useEffect(() => {
    let timer = 0;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const activeRun = activeRunRef.current;
      if (!activeRun || inFlightRef.current) {
        timer = window.setTimeout(tick, pollMsRef.current);
        return;
      }

      inFlightRef.current = true;
      try {
        const suggestions = await withRetry(() =>
          loadSuggestionsOnce(activeRun.sessionId, activeRun.runId),
        );

        let shouldStop = false;
        if (Object.keys(suggestions).length > 0) {
          setState((prev) => {
            const nextMap = { ...prev.byAnswerId, ...suggestions };
            const allDone = Array.from(expectedAnswerIdsRef.current).every(
              (id) => !!nextMap[id],
            );
            if (allDone) shouldStop = true;
            return { ...prev, byAnswerId: nextMap };
          });
        }

        if (!shouldStop && activeRun.runId) {
          const runStatus = await withRetry(() => getRunStatus(activeRun.runId));
          if (runStatus.status === "failed" || runStatus.status === "cancelled") {
            setState((prev) => ({
              ...prev,
              error: runStatus.error || "AI 批改失敗",
              taskStatus: runStatus.status === "cancelled" ? "paused" : "failed",
            }));
            await patchTaskManifest(activeRun.sessionId, (prev) => ({
              ...appendTaskHistory(prev, runStatus.status, runStatus.error),
              active_run_id: null,
            }));
            shouldStop = true;
          } else if (runStatus.status === "completed") {
            await loadSuggestionsOnce(activeRun.sessionId, activeRun.runId, { force: true });
            await patchTaskManifest(activeRun.sessionId, (prev) => ({
              ...appendTaskHistory(prev, "run_completed", activeRun.runId),
              active_run_id: null,
            }));
            setState((prev) => ({ ...prev, taskStatus: "review" }));
            shouldStop = true;
          }
        }

        if (shouldStop) {
          activeRunRef.current = null;
          setState((prev) => ({ ...prev, running: false }));
        }
        pollMsRef.current = POLL_MS;
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 429) {
          pollMsRef.current = Math.min(pollMsRef.current + 1000, MAX_POLL_MS);
        } else {
          activeRunRef.current = null;
          setState((prev) => ({
            ...prev,
            running: false,
            taskStatus: "failed",
            error: error instanceof Error ? error.message : "AI 批改輪詢失敗",
          }));
        }
      } finally {
        inFlightRef.current = false;
        if (!cancelled) {
          timer = window.setTimeout(tick, pollMsRef.current);
        }
      }
    };

    timer = window.setTimeout(tick, pollMsRef.current);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadSuggestionsOnce, withRetry]);

  const clear = useCallback(() => {
    activeRunRef.current = null;
    artifactVersionsRef.current.clear();
    expectedAnswerIdsRef.current.clear();
    pollMsRef.current = POLL_MS;
    setState({
      running: false,
      byAnswerId: {},
      rubricMarkdown: undefined,
      hasGradeArtifact: false,
      taskStatus: "idle",
    });
  }, []);

  const pause = useCallback(async (): Promise<boolean> => {
    const activeRun = activeRunRef.current;
    if (!activeRun) {
      setState((prev) => ({ ...prev, running: false, taskStatus: "paused" }));
      return true;
    }

    try {
      if (activeRun.runId) {
        await withRetry(() => chatbotRepository.cancelRun(activeRun.runId));
      }
      activeRunRef.current = null;
      await patchTaskManifest(activeRun.sessionId, (prev) => ({
        ...appendTaskHistory(prev, "cancelled", activeRun.runId || "manual_pause"),
        active_run_id: null,
      }));
      setState((prev) => ({
        ...prev,
        running: false,
        taskStatus: "paused",
        error: undefined,
      }));
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "AI 批改暫停失敗",
      }));
      return false;
    }
  }, [withRetry]);

  const retryAnswers = useCallback(async (
    contestId: string,
    questionId: string,
    rows: GradingAnswerRow[],
    options?: { modelId?: string; note?: string },
  ): Promise<boolean> => {
    const sessionId = state.sessionId;
    if (!sessionId || !contestId || !questionId || rows.length === 0) return false;
    if (state.running || startInFlightRef.current) return false;

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
          running: true,
          byAnswerId: nextByAnswerId,
          error: undefined,
          sessionId,
          trackedQuestionId: questionId,
          taskStatus: "running",
        };
      });

      activeRunRef.current = null;
      artifactVersionsRef.current.clear();
      expectedAnswerIdsRef.current = new Set(answerIds);
      pollMsRef.current = POLL_MS;

      const prompt = buildRetryPrompt(contestId, questionId, answerIds, options?.note);
      const run = await withRetry(() =>
        chatbotRepository.startRun(sessionId, prompt, {
          modelOverride: options?.modelId || AI_GRADING_DEFAULT_MODEL_ID,
        }),
      );
      activeRunRef.current = { sessionId, runId: run.id };
      await patchTaskManifest(sessionId, (prev) => ({
        ...appendTaskHistory(prev, "run_started", run.id),
        prompt,
        active_run_id: run.id,
      }));
      return true;
    } catch (error) {
      activeRunRef.current = null;
      setState((prev) => ({
        ...prev,
        running: false,
        taskStatus: "failed",
        error: error instanceof Error ? error.message : "AI 重新批改啟動失敗",
      }));
      return false;
    } finally {
      startInFlightRef.current = false;
    }
  }, [state.running, state.sessionId, withRetry]);

  const retryAnswer = useCallback(async (
    contestId: string,
    questionId: string,
    row: GradingAnswerRow,
    options?: { modelId?: string; note?: string },
  ): Promise<boolean> => retryAnswers(contestId, questionId, [row], options), [retryAnswers]);

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
   * 若 manifest 仍有 active_run_id，hook 會接回輪詢；若已進 review，則只載入現有 artifact。
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
        const manifest = await bindExistingTaskSession({
          sessionId,
          taskType: AI_GRADING_TASK_TYPE,
          context: buildTaskContext(contestId, questionId),
        });
        prepareTracking({
          sessionId,
          runId: manifest.active_run_id ?? "",
          contestId,
          questionId,
          rows,
        });
        await loadSuggestionsOnce(sessionId, manifest.active_run_id ?? "");
        const hasActiveRun = !!manifest.active_run_id;
        setState((prev) => ({
          ...prev,
          running: hasActiveRun,
          error: undefined,
          sessionId,
          trackedQuestionId: questionId,
          taskStatus: hasActiveRun ? "running" : "idle",
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
    [loadSuggestionsOnce, prepareTracking],
  );

  const loadSessionTask = useCallback(
    async (sessionId: string): Promise<{ contestId: string; questionId: string } | null> => {
      if (!sessionId) return null;
      try {
        const manifest = await bindExistingTaskSession({
          sessionId,
          taskType: AI_GRADING_TASK_TYPE,
        });
        const contestId = manifest.context.contest_id;
        const questionId = manifest.context.question_id;
        if (!contestId || !questionId) {
          throw new Error("task context 缺少 contest_id 或 question_id");
        }
        const hasActiveRun = !!manifest.active_run_id;
        setState((prev) => ({
          ...prev,
          error: undefined,
          sessionId,
          trackedQuestionId: questionId,
          taskStatus: hasActiveRun ? "running" : "idle",
          running: hasActiveRun,
        }));
        return { contestId, questionId };
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "AI 批改 session 載入失敗",
        }));
        return null;
      }
    },
    [],
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
        const manifest = await bindExistingTaskSession({
          sessionId,
          taskType: AI_GRADING_TASK_TYPE,
          context: buildTaskContext(contestId, questionId),
        });
        prepareTracking({
          sessionId,
          runId: manifest.active_run_id ?? "",
          contestId,
          questionId,
          rows,
        });
        artifactVersionsRef.current.clear();
        expectedAnswerIdsRef.current = new Set(rows.map((row) => normalizeAnswerId(row.id)));
        const merged = await loadSuggestionsOnce(sessionId, manifest.active_run_id ?? "", {
          force: true,
        });
        // rebind 時：running 只看 manifest.active_run_id 有沒有實體 run；
        // grade.csv 全填滿代表已進 review；兩者都沒有 → idle。
        // manifest.status 已棄用（避免兩份事實漂移）。
        const allDone =
          expectedAnswerIdsRef.current.size > 0 &&
          Array.from(expectedAnswerIdsRef.current).every((id) => !!merged[id]);
        const hasActiveRun = !!manifest.active_run_id && !allDone;
        if (!hasActiveRun) {
          activeRunRef.current = null;
        }
        setState((prev) => ({
          ...prev,
          running: hasActiveRun,
          error: undefined,
          sessionId,
          trackedQuestionId: questionId,
          taskStatus: hasActiveRun ? "running" : allDone ? "review" : "idle",
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
    [loadSuggestionsOnce, prepareTracking],
  );

  return useMemo(
    () => ({
      running: state.running,
      resultsByAnswerId: state.byAnswerId,
      rubricMarkdown: state.rubricMarkdown,
      hasGradeArtifact: state.hasGradeArtifact,
      error: state.error,
      sessionId: state.sessionId,
      trackedQuestionId: state.trackedQuestionId,
      taskStatus: state.taskStatus,
      start,
      pause,
      retryAnswer,
      retryAnswers,
      markAnswersSynced,
      markAnswersUnsynced,
      bindSession,
      loadSessionTask,
      restore,
      refreshSuggestions,
      clear,
    }),
    [
      state.running,
      state.byAnswerId,
      state.rubricMarkdown,
      state.hasGradeArtifact,
      state.error,
      state.sessionId,
      state.trackedQuestionId,
      state.taskStatus,
      start,
      pause,
      retryAnswer,
      retryAnswers,
      markAnswersSynced,
      markAnswersUnsynced,
      bindSession,
      loadSessionTask,
      restore,
      refreshSuggestions,
      clear,
    ],
  );
}
