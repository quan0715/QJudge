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
const AI_GRADING_MODEL_ID = "deepseek-r1";
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
  if (idxAnswerId < 0 || idxScore < 0) return results;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowAnswerId = toString(row[idxAnswerId]);
    if (!rowAnswerId || !expectedAnswerIds.has(rowAnswerId)) continue;
    const score = toNumberOrNull(row[idxScore]);
    const reason = idxReason >= 0 ? toString(row[idxReason]) : "";
    if (score == null && !reason) continue;
    results[rowAnswerId] = { score, reason };
  }
  return results;
}

async function getRunStatus(runId: string): Promise<AiRunStatusDto> {
  return requestJson<AiRunStatusDto>(
    httpClient.get(`/api/v1/ai/runs/${runId}/`),
    "Failed to fetch AI run status",
  );
}

function buildPrompt(contestId: string, questionId: string): string {
  return [
    "請使用 `qjudge-exam-grading-sop` 技能執行申論/短答題的 AI 批改，依 SOP 各 stage 逐步執行。",
    "",
    "Stage 1 context：",
    `- contest_id: ${contestId}`,
    `- grading_question_id: ${questionId}`,
    "",
    "題目與 rubric 請依 SOP 自行透過 qjudge_grading 等工具抓取；學生作答資料已由前端預先整理進 artifact。",
    "注意：前端已先在 artifact 內建立 `grade/grade.csv`，內含本題所有作答與空白 score/reason 欄位；請先 artifact_read(step=\"grade\", filename=\"grade.csv\")，沿用這份 CSV，不要重建或刪減列。",
    "",
    "grade.csv 產出規範（對齊 SOP）：",
    "- 透過 artifact_csv_patch 維護既有 `grade/grade.csv`，檔名固定為 `grade.csv`，content_type 為 text/csv。",
    "- 欄位順序固定（9 欄）：index, exam_answer_id, username, answer_text, original_score, original_feedback, score, reason, synced。",
    "- key_column: exam_answer_id。",
    "- score 為數值（整數或浮點，且落在題目滿分範圍內）；reason 為簡短中文，依 SOP reason 政策填寫（滿分可留空，非滿分必填）。",
    "- CSV 遵循 RFC 4180：欄位若含逗號、雙引號或換行，必須用雙引號包住，內部雙引號以 \"\" 轉義。",
    "- Stage 4 halt 時等我回覆「確認寫回」再進入 Stage 5。",
  ].join("\n");
}

function buildTaskContext(contestId: string, questionId: string): Record<string, string> {
  return { contest_id: contestId, question_id: questionId };
}

function isActiveTaskStatus(status: AiTaskStatus | "idle"): boolean {
  return status === "running";
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
    expectedAnswerIdsRef.current = new Set(params.rows.map((row) => row.id));
    pollMsRef.current = POLL_MS;
  }, []);

  const loadSuggestionsOnce = useCallback(async (sessionId: string, _runId: string) => {
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
      const prevVersion = artifactVersionsRef.current.get(artifact.id);
      if (prevVersion === artifact.updated_at) continue;
      artifactVersionsRef.current.set(artifact.id, artifact.updated_at);
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

  const start = useCallback(async (
    contestId: string,
    questionId: string,
    rows: GradingAnswerRow[],
  ): Promise<string | null> => {
    if (!contestId || !questionId) return null;
    if (!rows.length) return null;
    if (state.running || startInFlightRef.current) return null;
    startInFlightRef.current = true;

    const prompt = buildPrompt(contestId, questionId);
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
    expectedAnswerIdsRef.current = new Set(rows.map((row) => row.id));
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

      if (manifest.status === "running" && manifest.active_run_id) {
        prepareTracking({ sessionId, runId: manifest.active_run_id, contestId, questionId, rows });
        await loadSuggestionsOnce(sessionId, manifest.active_run_id);
        setState((prev) => ({
          ...prev,
          sessionId,
          trackedQuestionId: questionId,
          taskStatus: manifest.status,
        }));
        return sessionId;
      }

      const run = await withRetry(() =>
        chatbotRepository.startRun(sessionId, prompt, {
          modelOverride: AI_GRADING_MODEL_ID,
        }),
      );
      prepareTracking({ sessionId, runId: run.id, contestId, questionId, rows });
      await patchTaskManifest(sessionId, (prev) => ({
        ...appendTaskHistory(prev, "run_started", run.id),
        status: "running",
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
              status: runStatus.status === "cancelled" ? "paused" : "failed",
              active_run_id: null,
            }));
            shouldStop = true;
          } else if (runStatus.status === "completed") {
            await patchTaskManifest(activeRun.sessionId, (prev) => ({
              ...appendTaskHistory(prev, "run_completed", activeRun.runId),
              status: "review",
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
        setState((prev) => ({
          ...prev,
          running: isActiveTaskStatus(manifest.status),
          error: undefined,
          sessionId,
          trackedQuestionId: questionId,
          taskStatus: manifest.status,
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
        setState((prev) => ({
          ...prev,
          error: undefined,
          sessionId,
          trackedQuestionId: questionId,
          taskStatus: manifest.status,
          running: isActiveTaskStatus(manifest.status),
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
      const bound = await bindSession(sessionId, contestId, questionId, rows);
      return bound ? sessionId : null;
    },
    [bindSession],
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
      bindSession,
      loadSessionTask,
      restore,
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
      bindSession,
      loadSessionTask,
      restore,
      clear,
    ],
  );
}
