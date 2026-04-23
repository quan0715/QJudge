import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "react-router-dom";
import { Loading } from "@carbon/react";
import { Document, List, Pause, Renew, Return } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useAiGradingScreenData } from "./grading/useAiGradingScreenData";
import { EmptyState } from "@/shared/ui/EmptyState";
import GradingCardViewOnly from "./grading/GradingCardViewOnly";
import type { GradingAnswerRow } from "./grading";
import ExamQuestionEditCard from "@/features/contest/components/admin/examEditor/ExamQuestionEditCard";
import {
  AI_GRADING_DEFAULT_MODEL_ID,
  AI_GRADING_TASK_TYPE,
  buildDefaultGradingPrompt,
  useAiQuestionGrading,
} from "./grading/useAiQuestionGrading";
import { useTaskSession } from "@/features/ai-tasks/hooks/useTaskSession";
import { useChatSessionContext } from "@/features/chatbot/contexts/ChatSessionContext";
import { useChatbotContext } from "@/features/chatbot/contexts/ChatbotProvider";
import { useArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { pickLatestTodos } from "@/shared/ai/TodoList";
import { AITaskShell } from "@/features/ai-tasks/shell/AITaskShell";
import type { TaskShellSessionOption, TaskStatus } from "@/features/ai-tasks/shell/types";
import {
  gradeExamAnswer,
  ungradeExamAnswer,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { GradingBulkToolbar, type ScoreFilterOption } from "./grading/components/GradingBulkToolbar";
import {
  BulkRevertModal,
  BulkSubmitModal,
  RegradeChoiceModal,
  RetryGradingModal,
} from "./grading/components/GradingModals";
import styles from "./ContestAiGradingScreen.module.scss";

const EXCLUDED_MODEL_IDS = new Set(["openai-nano", "deepseek-v3"]);
const AI_GRADING_QUESTION_PARAM = "ai_grading_question";

function toSingleLineLabel(value: string | undefined): string {
  return (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateLabel(value: string, maxLength = 56): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

const ContestAiGradingScreen: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const { t } = useTranslation("contest");
  const { contest } = useContest();
  const selectedQuestionId = searchParams.get(AI_GRADING_QUESTION_PARAM);
  const {
    loading,
    isQuestionLoading,
    questionProgress,
    answersByQuestion,
    selectedQuestionError,
  } = useAiGradingScreenData(selectedQuestionId);
  const {
    resultsByAnswerId,
    error,
    sessionId,
    trackedQuestionId,
    start,
    retryAnswers,
    markAnswersSynced,
    markAnswersUnsynced,
    bindSession,
    restore,
    refreshSuggestions,
    clear,
  } = useAiQuestionGrading();
  const { sessions, isLoadingSessions, requestActiveSession } = useChatSessionContext();
  const {
    availableModels,
    currentSession,
    activeRuns,
    createSession,
    refreshSessions,
    setSelectedModelId,
  } = useChatbotContext();
  const artifactPanel = useArtifactPanel();
  const { right } = useWorkspace();

  const [promptDraft, setPromptDraft] = useState("");
  const [modelId, setModelId] = useState<string>(AI_GRADING_DEFAULT_MODEL_ID);
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<Set<string>>(new Set());
  const [submittingAnswerIds, setSubmittingAnswerIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryModalRows, setRetryModalRows] = useState<GradingAnswerRow[]>([]);
  const [retryNote, setRetryNote] = useState("");
  const [regradeChoiceOpen, setRegradeChoiceOpen] = useState(false);
  const [submitModalRows, setSubmitModalRows] = useState<GradingAnswerRow[]>([]);
  const [revertModalRows, setRevertModalRows] = useState<GradingAnswerRow[]>([]);
  const [scoreFilterId, setScoreFilterId] = useState("all");
  const [preparingSessionId, setPreparingSessionId] = useState<string | null>(null);
  const [startingAiGrading, setStartingAiGrading] = useState(false);
  const pendingCardRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledPendingRef = useRef<string | null>(null);

  const updateAiGradingParams = useCallback((updates: Record<string, string | null>) => {
    startTransition(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        let hasChanges = false;

        Object.entries(updates).forEach(([key, value]) => {
          const current = next.get(key);
          if (!value) {
            if (current !== null) {
              next.delete(key);
              hasChanges = true;
            }
            return;
          }
          if (current !== value) {
            next.set(key, value);
            hasChanges = true;
          }
        });

        return hasChanges ? next : prev;
      }, { replace: true });
    });
  }, [setSearchParams, startTransition]);

  // Filter down to models the grading task supports.
  const gradingModels = useMemo(
    () => availableModels.filter((m) => !EXCLUDED_MODEL_IDS.has(m.model_id)),
    [availableModels],
  );

  // Ensure model state defaults to the first supported grading model once available.
  useEffect(() => {
    if (gradingModels.length === 0) return;
    setModelId((prev) =>
      gradingModels.some((m) => m.model_id === prev) ? prev : gradingModels[0].model_id,
    );
  }, [gradingModels]);

  const selectedQuestion = useMemo(
    () => questionProgress.find((question) => question.questionId === selectedQuestionId) ?? null,
    [questionProgress, selectedQuestionId],
  );

  useEffect(() => {
    if (questionProgress.length === 0) return;
    if (selectedQuestion) return;
    updateAiGradingParams({ [AI_GRADING_QUESTION_PARAM]: questionProgress[0].questionId });
  }, [questionProgress, selectedQuestion, updateAiGradingParams]);

  // 切題目時先把 hook state 清乾淨。下一輪 auto-bind effect 會再去找 match session。
  useEffect(() => {
    if (!selectedQuestion) return;
    if (!sessionId) return;
    if (trackedQuestionId === selectedQuestion.questionId) return;
    clear();
  }, [clear, selectedQuestion, sessionId, trackedQuestionId]);

  const rows = useMemo<GradingAnswerRow[]>(
    () => (selectedQuestion ? answersByQuestion.get(selectedQuestion.questionId) ?? [] : []),
    [answersByQuestion, selectedQuestion],
  );

  const defaultPrompt = useMemo(() => {
    if (!contest?.id || !selectedQuestion) return "";
    return buildDefaultGradingPrompt(contest.id, selectedQuestion.questionId);
  }, [contest?.id, selectedQuestion]);

  // When switching question, reset prompt draft to that question's default.
  useEffect(() => {
    if (!sessionId) setPromptDraft(defaultPrompt);
  }, [defaultPrompt, sessionId]);

  // 自動綁定：找 sessions 裡時間最近 && task_type=grading && context 吻合的 session。
  // 邏輯全部封裝在 useTaskSession；此處只提供 match / empty 的 task-specific callbacks。
  const taskContext = useMemo<Record<string, string> | null>(
    () =>
      contest?.id && selectedQuestion
        ? { contest_id: contest.id, question_id: selectedQuestion.questionId }
        : null,
    [contest?.id, selectedQuestion],
  );
  const resolveKey = useMemo(
    () =>
      contest?.id && selectedQuestion
        ? `${contest.id}:${selectedQuestion.questionId}:${rows.length}`
        : null,
    [contest?.id, rows.length, selectedQuestion],
  );
  const handleMatchedSession = useCallback(
    async (matchedId: string) => {
      if (!contest?.id || !selectedQuestion) return null;
      return restore(matchedId, contest.id, selectedQuestion.questionId, rows);
    },
    [contest?.id, restore, rows, selectedQuestion],
  );
  const handleEmptySession = useCallback(async () => createSession(), [createSession]);
  const {
    pendingBindSessionId,
    setPendingBindSessionId,
    resolving: resolvingSessionKey,
  } = useTaskSession({
    taskType: AI_GRADING_TASK_TYPE,
    taskContext,
    sessions,
    isLoadingSessions,
    boundSessionId: sessionId,
    isBoundForCurrentContext:
      !!sessionId && !!selectedQuestion && trackedQuestionId === selectedQuestion.questionId,
    enabled: !!contest?.id && !!selectedQuestion && rows.length > 0,
    resolveKey,
    onMatch: handleMatchedSession,
    onEmpty: handleEmptySession,
    onSessionResolved: requestActiveSession,
  });

  useEffect(() => {
    setSelectedAnswerIds(new Set());
  }, [selectedQuestionId]);

  const toggleSelectedAnswer = useCallback((answerId: string) => {
    setSelectedAnswerIds((prev) => {
      const next = new Set(prev);
      if (next.has(answerId)) {
        next.delete(answerId);
      } else {
        next.add(answerId);
      }
      return next;
    });
  }, []);

  const handleStartAiGrading = useCallback(async () => {
    if (!contest?.id || !selectedQuestion || rows.length === 0) return;
    setStartingAiGrading(true);
    const effectivePrompt = promptDraft.trim() || defaultPrompt;
    const sessionTitle = `${t("grading.taskTypeLabel", "AI 批改")} · Q${selectedQuestion.questionIndex}`;
    setSelectedModelId(modelId);
    try {
      const newSessionId = await start(contest.id, selectedQuestion.questionId, rows, {
        prompt: effectivePrompt,
        modelId,
        title: sessionTitle,
      });
      if (newSessionId) {
        setPreparingSessionId(newSessionId);
        setPendingBindSessionId(newSessionId);
        right.open();
        requestActiveSession(newSessionId);
        // Grading hook calls startRun directly on the repository, bypassing useChatbot's
        // activeRuns state. Refresh so the chat panel subscribes to the new run and streams.
        void refreshSessions();
      }
    } finally {
      setStartingAiGrading(false);
    }
  }, [
    contest?.id,
    defaultPrompt,
    modelId,
    promptDraft,
    refreshSessions,
    requestActiveSession,
    right,
    rows,
    selectedQuestion,
    setPendingBindSessionId,
    setSelectedModelId,
    start,
    t,
  ]);

  // Subscribe task detail to ChatbotProvider's active run state. This keeps
  // model/running UI aligned with the right chat panel after a task session is
  // injected from this screen.
  const taskActiveRun = useMemo(() => {
    if (!sessionId) return null;
    return (
      activeRuns.find(
        (run) =>
          run.sessionId === sessionId &&
          ["queued", "running", "awaiting_approval"].includes(run.status),
      ) ?? null
    );
  }, [activeRuns, sessionId]);
  const sessionRunning = Boolean(taskActiveRun);
  const effectiveModelId = taskActiveRun?.modelId ?? modelId;

  useEffect(() => {
    if (!preparingSessionId) return;
    if (currentSession?.id !== preparingSessionId) return;
    setPreparingSessionId(null);
  }, [currentSession?.id, preparingSessionId]);

  const handlePrimaryAction = useCallback(() => {
    if (sessionRunning || startingAiGrading) return; // button is disabled; belt-and-braces
    if (sessionId) {
      // 已有匹配的 session → 先問要沿用舊 session 還是開新 session
      if (rows.length === 0) return;
      setRegradeChoiceOpen(true);
      return;
    }
    void handleStartAiGrading();
  }, [handleStartAiGrading, rows, sessionId, sessionRunning, startingAiGrading]);

  const handleRegradeReuseSession = useCallback(() => {
    if (rows.length === 0) return;
    setRegradeChoiceOpen(false);
    setRetryModalRows(rows);
    setRetryNote("");
  }, [rows]);

  const handleRegradeNewSession = useCallback(() => {
    setRegradeChoiceOpen(false);
    void handleStartAiGrading();
  }, [handleStartAiGrading]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedAnswerIds.has(row.id)),
    [rows, selectedAnswerIds],
  );

  const selectedRowsReadyToSubmit = useMemo(
    () =>
      selectedRows.filter((row) => {
        const suggestion = resultsByAnswerId[row.id];
        return suggestion?.score != null && !suggestion.synced;
      }),
    [resultsByAnswerId, selectedRows],
  );

  const selectedRowsRevertable = useMemo(
    () => selectedRows.filter((row) => resultsByAnswerId[row.id]?.synced),
    [resultsByAnswerId, selectedRows],
  );

  const scoreFilterOptions = useMemo<ScoreFilterOption[]>(() => {
    const scores = Array.from(
      new Set(
        rows
          .map((row) => resultsByAnswerId[row.id]?.score)
          .filter((score): score is number => score != null),
      ),
    ).sort((a, b) => a - b);
    return [
      {
        id: "all",
        label: t("grading.scoreFilterAll", "全部建議分數"),
        score: null,
      },
      {
        id: "missing",
        label: t("grading.scoreFilterMissing", "未產生建議"),
        score: null,
      },
      {
        id: "differs",
        label: t("grading.scoreFilterDiffers", "與原評分有出入"),
        score: null,
      },
      {
        id: "unsynced",
        label: t("grading.scoreFilterUnsynced", "尚未送出"),
        score: null,
      },
      ...scores.map((score) => ({
        id: `score:${score}`,
        label: t("grading.scoreFilterValue", "建議分數 {{score}}", { score }),
        score,
      })),
    ];
  }, [resultsByAnswerId, rows, t]);

  const selectedScoreFilter =
    scoreFilterOptions.find((option) => option.id === scoreFilterId) ?? scoreFilterOptions[0];

  const filteredRows = useMemo(() => {
    if (scoreFilterId === "all") return rows;
    if (scoreFilterId === "missing") {
      return rows.filter((row) => resultsByAnswerId[row.id]?.score == null);
    }
    if (scoreFilterId === "differs") {
      return rows.filter((row) => {
        const aiScore = resultsByAnswerId[row.id]?.score;
        return aiScore != null && row.score != null && aiScore !== row.score;
      });
    }
    if (scoreFilterId === "unsynced") {
      return rows.filter((row) => {
        const suggestion = resultsByAnswerId[row.id];
        return suggestion?.score != null && !suggestion.synced;
      });
    }
    const score = selectedScoreFilter?.score;
    return rows.filter((row) => resultsByAnswerId[row.id]?.score === score);
  }, [resultsByAnswerId, rows, scoreFilterId, selectedScoreFilter?.score]);

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedAnswerIds.has(row.id));
  const someFilteredSelected =
    !allFilteredSelected && filteredRows.some((row) => selectedAnswerIds.has(row.id));

  const handleToggleSelectAllFiltered = useCallback(() => {
    setSelectedAnswerIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const row of filteredRows) next.delete(row.id);
      } else {
        for (const row of filteredRows) next.add(row.id);
      }
      return next;
    });
  }, [allFilteredSelected, filteredRows]);

  const openRetryModal = useCallback((nextRows: GradingAnswerRow[]) => {
    if (nextRows.length === 0) return;
    setRetryModalRows(nextRows);
    setRetryNote("");
  }, []);

  const closeRetryModal = useCallback(() => {
    setRetryModalRows([]);
    setRetryNote("");
  }, []);

  const handleConfirmRetry = useCallback(
    async () => {
      if (!contest?.id || !selectedQuestion || !sessionId || retryModalRows.length === 0) return;
      setActionError(null);
      const started = await retryAnswers(contest.id, selectedQuestion.questionId, retryModalRows, {
        modelId,
        note: retryNote,
      });
      if (started) {
        setSelectedModelId(modelId);
        closeRetryModal();
        setSelectedAnswerIds(new Set());
        right.open();
        requestActiveSession(sessionId);
        void refreshSessions();
      }
    },
    [
      closeRetryModal,
      contest?.id,
      modelId,
      refreshSessions,
      requestActiveSession,
      retryAnswers,
      retryModalRows,
      retryNote,
      right,
      selectedQuestion,
      setSelectedModelId,
      sessionId,
    ],
  );

  const openSubmitModal = useCallback((nextRows: GradingAnswerRow[]) => {
    const writableRows = nextRows.filter((row) => {
      const suggestion = resultsByAnswerId[row.id];
      return suggestion?.score != null && !suggestion.synced;
    });
    if (writableRows.length === 0) return;
    setSubmitModalRows(writableRows);
  }, [resultsByAnswerId]);

  const closeSubmitModal = useCallback(() => {
    setSubmitModalRows([]);
  }, []);

  const handleSubmitSuggestions = useCallback(
    async (targetRows: GradingAnswerRow[]) => {
      if (!contest?.id || !sessionId || targetRows.length === 0) return;
      const writableRows = targetRows.filter((row) => {
        const suggestion = resultsByAnswerId[row.id];
        return suggestion?.score != null && !suggestion.synced;
      });
      if (writableRows.length === 0) return;
      setActionError(null);
      setSubmittingAnswerIds((prev) => {
        const next = new Set(prev);
        for (const row of writableRows) next.add(row.id);
        return next;
      });
      try {
        await Promise.all(
          writableRows.map((row) => {
            const suggestion = resultsByAnswerId[row.id];
            return gradeExamAnswer(contest.id, row.id, {
              score: suggestion?.score ?? 0,
              feedback: suggestion?.reason || undefined,
            });
          }),
        );
        await markAnswersSynced(writableRows.map((row) => row.id));
        setSelectedAnswerIds((prev) => {
          const next = new Set(prev);
          for (const row of writableRows) next.delete(row.id);
          return next;
        });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "批量送出 AI 建議失敗");
      } finally {
        setSubmittingAnswerIds((prev) => {
          const next = new Set(prev);
          for (const row of writableRows) next.delete(row.id);
          return next;
        });
      }
    },
    [contest?.id, markAnswersSynced, resultsByAnswerId, sessionId],
  );

  const openRevertModal = useCallback(
    (nextRows: GradingAnswerRow[]) => {
      const revertableRows = nextRows.filter((row) => resultsByAnswerId[row.id]?.synced);
      if (revertableRows.length === 0) return;
      setRevertModalRows(revertableRows);
    },
    [resultsByAnswerId],
  );

  const closeRevertModal = useCallback(() => {
    setRevertModalRows([]);
  }, []);

  const handleRevertSubmissions = useCallback(
    async (targetRows: GradingAnswerRow[]) => {
      if (!contest?.id || !sessionId || targetRows.length === 0) return;
      const revertableRows = targetRows.filter((row) => resultsByAnswerId[row.id]?.synced);
      if (revertableRows.length === 0) return;
      setActionError(null);
      setSubmittingAnswerIds((prev) => {
        const next = new Set(prev);
        for (const row of revertableRows) next.add(row.id);
        return next;
      });
      try {
        await Promise.all(
          revertableRows.map((row) => ungradeExamAnswer(contest.id, row.id)),
        );
        await markAnswersUnsynced(revertableRows.map((row) => row.id));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Revert AI 批改送出失敗");
      } finally {
        setSubmittingAnswerIds((prev) => {
          const next = new Set(prev);
          for (const row of revertableRows) next.delete(row.id);
          return next;
        });
      }
    },
    [contest?.id, markAnswersUnsynced, resultsByAnswerId, sessionId],
  );

  const handleConfirmRevert = useCallback(async () => {
    if (revertModalRows.length === 0) return;
    const rowsToRevert = revertModalRows;
    closeRevertModal();
    await handleRevertSubmissions(rowsToRevert);
  }, [closeRevertModal, handleRevertSubmissions, revertModalRows]);

  const handleConfirmSubmit = useCallback(async () => {
    if (submitModalRows.length === 0) return;
    const rowsToSubmit = submitModalRows;
    closeSubmitModal();
    await handleSubmitSuggestions(rowsToSubmit);
  }, [closeSubmitModal, handleSubmitSuggestions, submitModalRows]);

  const handleBindSession = useCallback(() => {
    const sid = pendingBindSessionId.trim();
    if (!contest?.id || !selectedQuestion || !sid || rows.length === 0) return;
    void bindSession(sid, contest.id, selectedQuestion.questionId, rows).then((bound) => {
      if (!bound) return;
      right.open();
      requestActiveSession(sid);
    });
  }, [
    bindSession,
    contest?.id,
    pendingBindSessionId,
    requestActiveSession,
    right,
    rows,
    selectedQuestion,
  ]);

  const handleClearSession = useCallback(() => {
    clear();
    setPendingBindSessionId("");
    setPromptDraft(defaultPrompt);
  }, [clear, defaultPrompt, setPendingBindSessionId]);

  const handleSelectQuestion = useCallback(
    (questionId: string | null) => {
      if (sessionId) {
        clear();
        setPendingBindSessionId("");
      }
      updateAiGradingParams({ [AI_GRADING_QUESTION_PARAM]: questionId });
    },
    [clear, sessionId, setPendingBindSessionId, updateAiGradingParams],
  );

  // 卡片狀態以 chat provider 的 active run + grade.csv 結果共同判斷：
  // run 正在跑且該列尚未產生建議時，保留 AI 批改中的動態狀態。
  const hasAnyAiResult = useMemo(
    () => rows.some((row) => !!resultsByAnswerId[row.id]),
    [rows, resultsByAnswerId],
  );

  const getCardStatus = useCallback(
    (rowId: string): "idle" | "pending" | "reviewable" | "submitted" | "missing" => {
      const suggestion = resultsByAnswerId[rowId];
      if (suggestion?.synced) return "submitted";
      if (suggestion) return "reviewable";
      if (sessionRunning) return "pending";
      return hasAnyAiResult ? "pending" : "idle";
    },
    [resultsByAnswerId, sessionRunning, hasAnyAiResult],
  );

  const firstPendingAnswerId = useMemo(
    () => filteredRows.find((row) => getCardStatus(row.id) === "pending")?.id ?? null,
    [filteredRows, getCardStatus],
  );

  const shouldAutoScrollToPending = useMemo(
    () =>
      sessionRunning ||
      (hasAnyAiResult && rows.some((row) => !resultsByAnswerId[row.id])),
    [hasAnyAiResult, resultsByAnswerId, rows, sessionRunning],
  );

  useEffect(() => {
    if (!firstPendingAnswerId || !shouldAutoScrollToPending) return;
    const node = pendingCardRef.current;
    if (!node) return;
    const scrollKey = `${sessionId ?? "new"}:${selectedQuestion?.questionId ?? "none"}:${firstPendingAnswerId}:${sessionRunning ? "running" : "partial"}`;
    if (lastAutoScrolledPendingRef.current === scrollKey) return;
    lastAutoScrolledPendingRef.current = scrollKey;

    window.requestAnimationFrame(() => {
      node.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
        inline: "nearest",
      });
    });
  }, [
    firstPendingAnswerId,
    selectedQuestion?.questionId,
    sessionId,
    sessionRunning,
    shouldAutoScrollToPending,
  ]);

  // Todos: derive from chatbot's current session (only when chatbot is on our bound session).
  const todoItems = useMemo(() => {
    if (!sessionId) return undefined;
    if (currentSession?.id !== sessionId) return undefined;
    return pickLatestTodos(currentSession?.messages ?? []);
  }, [currentSession?.id, currentSession?.messages, sessionId]);

  const artifactProgressSignature = useMemo(
    () =>
      artifactPanel.artifacts
        .filter((artifact) => artifact.filename.toLowerCase() === "grade.csv")
        .map((artifact) => `${artifact.id}:${artifact.checksum || artifact.updated_at}`)
        .join("|"),
    [artifactPanel.artifacts],
  );

  useEffect(() => {
    if (!sessionId || !selectedQuestion || rows.length === 0) return;
    if (trackedQuestionId && trackedQuestionId !== selectedQuestion.questionId) return;
    void refreshSuggestions(sessionId, selectedQuestion.questionId, rows);
  }, [
    artifactProgressSignature,
    refreshSuggestions,
    rows,
    selectedQuestion,
    sessionId,
    trackedQuestionId,
  ]);

  const sessionDropdownItems = useMemo<TaskShellSessionOption[]>(() => {
    const list = sessions.map((session) => ({
      id: session.id,
      label: `${session.title || t("grading.untitledSession", "(未命名 session)")} · ${session.id.slice(0, 8)}`,
    }));
    const pinnedId = (sessionId || pendingBindSessionId).trim();
    if (pinnedId && !list.some((item) => item.id === pinnedId)) {
      list.unshift({
        id: pinnedId,
        label: `${t("grading.boundSessionFallback", "已綁定 session")} · ${pinnedId.slice(0, 8)}`,
      });
    }
    return list;
  }, [sessions, sessionId, pendingBindSessionId, t]);

  const questionDropdownItems = useMemo(
    () =>
      questionProgress.map((question) => ({
        id: question.questionId,
        label: truncateLabel(
          `Q${question.questionIndex} · ${
            toSingleLineLabel((question as { title?: string }).title) ||
            toSingleLineLabel(question.prompt) ||
            t("grading.question", "題目")
          }`,
        ),
      })),
    [questionProgress, t],
  );

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <Loading withOverlay={false} description={t("grading.loading", "載入批改資料...")} />
      </div>
    );
  }

  if (contest?.contestType === "coding") {
    return (
      <EmptyState
        title={t("grading.leaderboardOverview", "排行榜")}
        description={t(
          "grading.noAnswersDescCoding",
          "目前還沒有學生提交程式碼，請確認考試已開始且學生已送出 submission。",
        )}
      />
    );
  }

  if (questionProgress.length === 0) {
    return (
      <EmptyState
        title={t("grading.noAnswers", "尚無作答資料")}
        description={t(
          "grading.noAnswersDesc",
          "目前還沒有學生提交作答，請確認考試已開始且學生已完成作答後再進入批改。",
        )}
      />
    );
  }

  if (!selectedQuestion) {
    return (
      <div className={styles.loadingWrap}>
        <Loading withOverlay={false} description={t("grading.loading", "載入批改資料...")} />
      </div>
    );
  }

  if (resolvingSessionKey) {
    return (
      <div className={styles.loadingWrap}>
        <Loading
          withOverlay={false}
          description={t("grading.resolvingTaskSession", "尋找對應 AI session...")}
        />
      </div>
    );
  }

  if (preparingSessionId && currentSession?.id !== preparingSessionId) {
    return (
      <div className={styles.loadingWrap}>
        <Loading
          withOverlay={false}
          description={t("grading.preparingSession", "建立 AI session...")}
        />
      </div>
    );
  }

  const isCurrentQuestionTask = trackedQuestionId === selectedQuestion.questionId;
  const hasBoundSession = !!sessionId && isCurrentQuestionTask;

  // Task 三態以 grade.csv 為準，跟 run state 解耦：
  //   未完成（idle）   = 還沒有任何一筆 AI 評分
  //   進行中（running）= 有評到但沒評完
  //   已完成（completed）= 每筆都有 AI 評分
  const aiCompletedCount = rows.filter((row) => !!resultsByAnswerId[row.id]).length;
  const totalAnswerCount = rows.length;
  const syncedCount = rows.filter((row) => !!resultsByAnswerId[row.id]?.synced).length;
  const effectiveTaskStatus: TaskStatus =
    totalAnswerCount === 0 || aiCompletedCount === 0
      ? "idle"
      : aiCompletedCount < totalAnswerCount
        ? "running"
        : "completed";

  const firstRow = rows[0];
  const selectedExamQuestion: ExamQuestion = {
    id: selectedQuestion.questionId,
    contestId: contest?.id ?? "",
    questionType: selectedQuestion.questionType,
    prompt: selectedQuestion.prompt,
    options: firstRow?.questionOptions ?? [],
    correctAnswer: selectedQuestion.correctAnswer,
    explanation: selectedQuestion.explanation ?? firstRow?.questionExplanation ?? "",
    score: selectedQuestion.maxScore,
    order: selectedQuestion.questionIndex - 1,
    createdAt: "",
    updatedAt: "",
  };

  const noopQuestionMutation = async () => {};

  const problemInfoTab = () => (
    <div className={styles.problemInfoTab}>
      <ExamQuestionEditCard
        question={selectedExamQuestion}
        index={selectedQuestion.questionIndex - 1}
        frozen
        showScoreField
        onAutoSave={noopQuestionMutation}
        onDelete={noopQuestionMutation}
        onDuplicate={noopQuestionMutation}
      />
    </div>
  );

  const gradingMainTab = () => {
    if (isQuestionLoading) {
      return (
        <div className={styles.loadingWrap}>
          <Loading
            withOverlay={false}
            description={t("grading.loadingQuestion", "載入此題答卷...")}
          />
        </div>
      );
    }
    if (selectedQuestionError) {
      return (
        <EmptyState
          title={t("grading.loadQuestionFailed", "載入答卷失敗")}
          description={selectedQuestionError}
          compact
        />
      );
    }
    return (
      <div className={styles.mainScroll}>
        <section className={styles.cardListSection}>
          {rows.length === 0 ? (
            <EmptyState title={t("grading.noAnswersForQuestion", "此題目尚無學生作答")} compact />
          ) : (
            <>
              <GradingBulkToolbar
                scoreFilterOptions={scoreFilterOptions}
                selectedScoreFilter={selectedScoreFilter}
                scoreFilterId={scoreFilterId}
                onScoreFilterChange={setScoreFilterId}
                selectedCount={selectedRows.length}
                filteredCount={filteredRows.length}
                allFilteredSelected={allFilteredSelected}
                someFilteredSelected={someFilteredSelected}
                onToggleSelectAllFiltered={handleToggleSelectAllFiltered}
                canBulkAct={hasBoundSession}
                submitting={submittingAnswerIds.size > 0}
                revertableCount={selectedRowsRevertable.length}
                submittableCount={selectedRowsReadyToSubmit.length}
                onRequestRevert={() => openRevertModal(selectedRows)}
                onRequestRetry={() => openRetryModal(selectedRows)}
                onRequestSubmit={() => openSubmitModal(selectedRows)}
              />
              <div className={styles.cardList}>
                {filteredRows.map((row) => {
                  const cardStatus = getCardStatus(row.id);
                  return (
                    <div
                      key={row.id}
                      ref={row.id === firstPendingAnswerId ? pendingCardRef : null}
                      className={styles.cardAnchor}
                    >
                      <GradingCardViewOnly
                        row={row}
                        aiScore={resultsByAnswerId[row.id]?.score ?? null}
                        aiReason={resultsByAnswerId[row.id]?.reason ?? ""}
                        pending={cardStatus === "pending"}
                        status={cardStatus}
                        selected={selectedAnswerIds.has(row.id)}
                        onToggleSelected={() => toggleSelectedAnswer(row.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    );
  };

  return (
    <div className={styles.shellRoot}>
      <AITaskShell
        taskTypeLabel={t("grading.taskTypeLabel", "AI 批改")}
        title={`${t("grading.question", "題目")} Q${selectedQuestion.questionIndex}`}
        subtitle={contest?.name}
        status={effectiveTaskStatus}
        running={sessionRunning}
        // 進度 & 三態都以 grade.csv 為主（aiCompletedCount / totalAnswerCount）
        progress={
          totalAnswerCount > 0
            ? { completed: aiCompletedCount, total: totalAnswerCount }
            : undefined
        }
        secondaryProgress={
          totalAnswerCount > 0
            ? {
                label: t("grading.syncProgressLabel", "送出進度"),
                completed: syncedCount,
                total: totalAnswerCount,
              }
            : undefined
        }
        initPrompt={{
          value: promptDraft,
          defaultValue: defaultPrompt,
          onChange: setPromptDraft,
          locked: hasBoundSession,
          onUnlock: hasBoundSession ? handleClearSession : undefined,
        }}
        showInitPrompt={false}
        showSessionBinding={false}
        models={gradingModels}
        selectedModelId={effectiveModelId}
        onModelChange={(nextModelId) => {
          setModelId(nextModelId);
          setSelectedModelId(nextModelId);
        }}
        selectBlock={{
          label: t("grading.selectQuestion", "選擇題目"),
          placeholder: t("grading.selectQuestion", "選擇題目"),
          options: questionDropdownItems,
          selectedId: selectedQuestion.questionId,
          onChange: handleSelectQuestion,
        }}
        todoItems={todoItems}
        artifacts={artifactPanel.artifacts}
        sessionId={hasBoundSession ? sessionId : null}
        bindableSessions={sessionDropdownItems}
        pendingBindSessionId={pendingBindSessionId}
        onBindSessionChange={setPendingBindSessionId}
        onBind={handleBindSession}
        onUnbind={handleClearSession}
        primaryAction={{
          // 三態：進行中(disabled) / 已有 match session(重新批改) / 無 match(開始批改)。
          label: startingAiGrading
            ? t("grading.primaryStarting", "準備批改")
            : sessionRunning
            ? t("grading.primaryRunning", "批改中")
            : sessionId
              ? t("grading.primaryRetry", "重新批改")
              : t("grading.primaryStart", "開始批改"),
          onClick: handlePrimaryAction,
          disabled: startingAiGrading || sessionRunning || rows.length === 0,
          pending: startingAiGrading,
          kind: "primary",
          renderIcon: sessionRunning ? Pause : sessionId ? Renew : Return,
        }}
        errorText={error || actionError}
        mainTabs={[
          {
            id: "grading",
            title: t("grading.gradingList", "批改列表"),
            icon: <List size={16} />,
            render: gradingMainTab,
          },
          {
            id: "problem",
            title: t("grading.question", "題目"),
            icon: <Document size={16} />,
            render: problemInfoTab,
          },
        ]}
      />
      <BulkRevertModal
        open={revertModalRows.length > 0}
        onClose={closeRevertModal}
        count={revertModalRows.length}
        submitting={submittingAnswerIds.size > 0}
        onConfirm={() => void handleConfirmRevert()}
      />
      <BulkSubmitModal
        open={submitModalRows.length > 0}
        onClose={closeSubmitModal}
        count={submitModalRows.length}
        submitting={submittingAnswerIds.size > 0}
        onConfirm={() => void handleConfirmSubmit()}
      />
      <RegradeChoiceModal
        open={regradeChoiceOpen}
        onClose={() => setRegradeChoiceOpen(false)}
        onReuseSession={handleRegradeReuseSession}
        onNewSession={handleRegradeNewSession}
      />
      <RetryGradingModal
        open={retryModalRows.length > 0}
        onClose={closeRetryModal}
        count={retryModalRows.length}
        running={sessionRunning}
        note={retryNote}
        onNoteChange={setRetryNote}
        onConfirm={() => void handleConfirmRetry()}
      />
    </div>
  );
};

export default ContestAiGradingScreen;
