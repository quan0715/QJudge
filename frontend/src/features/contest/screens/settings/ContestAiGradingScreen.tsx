import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, FluidDropdown, Loading, Modal, TextArea } from "@carbon/react";
import {
  CheckboxCheckedFilled,
  CheckboxIndeterminate,
  Checkbox as CheckboxIcon,
  Document,
  List,
  Pause,
  Renew,
  Return,
  Send,
  Undo,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useAiGradingScreenData } from "./grading/useAiGradingScreenData";
import { EmptyState } from "@/shared/ui/EmptyState";
import GradingCardViewOnly from "./grading/GradingCardViewOnly";
import type { GradingAnswerRow } from "./grading";
import ExamQuestionEditCard from "@/features/contest/components/admin/examEditor/ExamQuestionEditCard";
import {
  useAiQuestionGrading,
  buildDefaultGradingPrompt,
  AI_GRADING_DEFAULT_MODEL_ID,
} from "./grading/useAiQuestionGrading";
import { useChatSessionContext } from "@/features/chatbot/contexts/ChatSessionContext";
import { useChatbotContext } from "@/features/chatbot/contexts/ChatbotProvider";
import { useArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { pickLatestTodos } from "@/features/chatbot/components/chat-ui/TodoList";
import { AITaskShell } from "@/features/ai-tasks/shell/AITaskShell";
import type { TaskShellSessionOption, TaskStatus } from "@/features/ai-tasks/shell/types";
import {
  gradeExamAnswer,
  ungradeExamAnswer,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { FilterPopover } from "@/shared/ui/filter/FilterPopover";
import styles from "./ContestAiGradingScreen.module.scss";

const EXCLUDED_MODEL_IDS = new Set(["openai-nano", "deepseek-v3"]);

interface ScoreFilterOption {
  id: string;
  label: string;
  score: number | null;
}

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
  const { t } = useTranslation("contest");
  const { contest } = useContest();
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const {
    loading,
    isQuestionLoading,
    questionProgress,
    answersByQuestion,
    selectedQuestionError,
  } = useAiGradingScreenData(selectedQuestionId);
  const {
    running,
    resultsByAnswerId,
    error,
    sessionId,
    trackedQuestionId,
    start,
    pause,
    retryAnswers,
    markAnswersSynced,
    markAnswersUnsynced,
    bindSession,
    loadSessionTask,
    restore,
    refreshSuggestions,
    clear,
  } = useAiQuestionGrading();
  const { sessions, requestActiveSession } = useChatSessionContext();
  const { availableModels, currentSession, refreshSessions } = useChatbotContext();
  const artifactPanel = useArtifactPanel();
  const { right } = useWorkspace();

  const [promptDraft, setPromptDraft] = useState("");
  const [modelId, setModelId] = useState<string>(AI_GRADING_DEFAULT_MODEL_ID);
  const [pendingBindSessionId, setPendingBindSessionId] = useState("");
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<Set<string>>(new Set());
  const [submittingAnswerIds, setSubmittingAnswerIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryModalRows, setRetryModalRows] = useState<GradingAnswerRow[]>([]);
  const [retryNote, setRetryNote] = useState("");
  const [submitModalRows, setSubmitModalRows] = useState<GradingAnswerRow[]>([]);
  const [revertModalRows, setRevertModalRows] = useState<GradingAnswerRow[]>([]);
  const [scoreFilterId, setScoreFilterId] = useState("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const taskSessionId = searchParams.get("session") || "";

  // Grading panel follows the chat panel's current session as single source of truth.
  // Writing back to ?session= lets the existing load/restore cascade below re-run on switch,
  // and keeps deep links accurate for reload / copy-URL.
  useEffect(() => {
    const chatSessionId = currentSession?.id;
    if (!chatSessionId || chatSessionId.startsWith("temp-")) return;
    if (chatSessionId === taskSessionId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("session", chatSessionId);
        return next;
      },
      { replace: true },
    );
  }, [currentSession?.id, taskSessionId, setSearchParams]);

  // Filter down to models the grading task supports.
  const gradingModels = useMemo(
    () => availableModels.filter((m) => !EXCLUDED_MODEL_IDS.has(m.model_id)),
    [availableModels],
  );

  // Keep pending session select in sync with the currently bound session.
  // 只依賴 sessionId；把 pendingBindSessionId 放進 deps 會在 user 改 dropdown 時把值硬拉回綁定 id。
  useEffect(() => {
    if (sessionId) setPendingBindSessionId(sessionId);
  }, [sessionId]);

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
    setSelectedQuestionId(questionProgress[0].questionId);
  }, [questionProgress, selectedQuestion]);

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

  useEffect(() => {
    if (!taskSessionId || !contest?.id) return;
    if (sessionId === taskSessionId) return;

    void loadSessionTask(taskSessionId).then((task) => {
      if (!task) return;
      if (task.contestId !== contest.id) return;
      setSelectedQuestionId(task.questionId);
      setPendingBindSessionId(taskSessionId);
    });
  }, [contest?.id, loadSessionTask, sessionId, taskSessionId]);

  useEffect(() => {
    if (!taskSessionId || !contest?.id || !selectedQuestion || rows.length === 0) return;
    if (sessionId === taskSessionId && trackedQuestionId === selectedQuestion.questionId) return;
    void restore(taskSessionId, contest.id, selectedQuestion.questionId, rows).then(
      (restoredSessionId) => {
        if (restoredSessionId) {
          setPendingBindSessionId(restoredSessionId);
          requestActiveSession(restoredSessionId);
        }
      },
    );
  }, [
    contest?.id,
    requestActiveSession,
    restore,
    rows,
    selectedQuestion,
    sessionId,
    taskSessionId,
    trackedQuestionId,
  ]);

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

  const updateSessionUrl = useCallback(
    (nextSessionId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("panel", "ai-grading");
          if (nextSessionId) {
            next.set("session", nextSessionId);
          } else {
            next.delete("session");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleStartAiGrading = useCallback(async () => {
    if (!contest?.id || !selectedQuestion || rows.length === 0) return;
    const effectivePrompt = promptDraft.trim() || defaultPrompt;
    const newSessionId = await start(contest.id, selectedQuestion.questionId, rows, {
      prompt: effectivePrompt,
      modelId,
    });
    if (newSessionId) {
      setPendingBindSessionId(newSessionId);
      updateSessionUrl(newSessionId);
      right.open();
      requestActiveSession(newSessionId);
      // Grading hook calls startRun directly on the repository, bypassing useChatbot's
      // activeRuns state. Refresh so the chat panel subscribes to the new run and streams.
      void refreshSessions();
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
    start,
    updateSessionUrl,
  ]);

  // Running 改以 session 實際狀態為主（後端 getActiveRuns 決定），避免 hook 內部 state 與
  // 後端漂移的問題。只有當該 session 真的有一個 active run（queued/running/awaiting_approval）
  // 才視為「正在跑」。
  const sessionActiveRunStatus =
    currentSession && currentSession.id === sessionId
      ? currentSession.metadata?.active_run_status
      : undefined;
  const sessionRunning =
    sessionActiveRunStatus === "running" ||
    sessionActiveRunStatus === "queued" ||
    sessionActiveRunStatus === "awaiting_approval";

  const handlePrimaryAction = useCallback(() => {
    if (sessionRunning) {
      void pause();
      return;
    }
    void handleStartAiGrading();
  }, [handleStartAiGrading, pause, sessionRunning]);

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
      updateSessionUrl(sid);
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
    updateSessionUrl,
  ]);

  const handleClearSession = useCallback(() => {
    clear();
    setPendingBindSessionId("");
    setPromptDraft(defaultPrompt);
    updateSessionUrl(null);
  }, [clear, defaultPrompt, updateSessionUrl]);

  const handleSelectQuestion = useCallback(
    (questionId: string | null) => {
      if (taskSessionId) {
        clear();
        setPendingBindSessionId("");
        updateSessionUrl(null);
      }
      setSelectedQuestionId(questionId);
    },
    [clear, taskSessionId, updateSessionUrl],
  );

  // 卡片狀態完全看 grade.csv：沒有「這是哪個 run 在跑」的概念，
  // 只看該題有沒有開始批改（任何一筆有 AI 分數）以及本筆是否已評。
  const hasAnyAiResult = useMemo(
    () => rows.some((row) => !!resultsByAnswerId[row.id]),
    [rows, resultsByAnswerId],
  );

  const getCardStatus = useCallback(
    (rowId: string): "idle" | "pending" | "reviewable" | "submitted" | "missing" => {
      const suggestion = resultsByAnswerId[rowId];
      if (suggestion?.synced) return "submitted";
      if (suggestion) return "reviewable";
      return hasAnyAiResult ? "pending" : "idle";
    },
    [resultsByAnswerId, hasAnyAiResult],
  );

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
              <div className={styles.bulkBar}>
                <FilterPopover
                  hasActiveFilters={scoreFilterId !== "all"}
                  triggerLabel={t("grading.scoreFilterLabel", "建議分數篩選")}
                  onReset={() => setScoreFilterId("all")}
                  align="bottom-left"
                >
                  <FluidDropdown
                    id="ai-grading-score-filter"
                    titleText={t("grading.scoreFilterLabel", "建議分數篩選")}
                    label={t("grading.scoreFilterAll", "全部建議分數")}
                    items={scoreFilterOptions}
                    selectedItem={selectedScoreFilter}
                    itemToString={(item) => (item as ScoreFilterOption | null)?.label ?? ""}
                    onChange={({ selectedItem }) => {
                      setScoreFilterId((selectedItem as ScoreFilterOption | null)?.id ?? "all");
                    }}
                  />
                </FilterPopover>
                <Button
                  kind="ghost"
                  size="md"
                  hasIconOnly
                  renderIcon={
                    allFilteredSelected
                      ? CheckboxCheckedFilled
                      : someFilteredSelected
                      ? CheckboxIndeterminate
                      : CheckboxIcon
                  }
                  iconDescription={
                    allFilteredSelected
                      ? t("grading.bulkDeselectAll", "取消全選（目前篩選）")
                      : t("grading.bulkSelectAll", "全選（目前篩選）")
                  }
                  disabled={filteredRows.length === 0}
                  onClick={handleToggleSelectAllFiltered}
                />
                <span className={styles.bulkCount}>
                  {t("grading.selectedCount", "已選取 {{count}} 筆", {
                    count: selectedRows.length,
                  })}
                </span>
                <Button
                  kind="ghost"
                  size="md"
                  hasIconOnly
                  renderIcon={Undo}
                  iconDescription={t("grading.bulkRevertPublish", "撤回已送出評分")}
                  disabled={
                    !hasBoundSession ||
                    submittingAnswerIds.size > 0 ||
                    selectedRowsRevertable.length === 0
                  }
                  onClick={() => openRevertModal(selectedRows)}
                />
                <Button
                  kind="ghost"
                  size="md"
                  hasIconOnly
                  renderIcon={Renew}
                  iconDescription={t("grading.bulkRetryAiGrading", "批量重新批改")}
                  disabled={!hasBoundSession || selectedRows.length === 0}
                  onClick={() => openRetryModal(selectedRows)}
                />
                <Button
                  kind="primary"
                  size="md"
                  hasIconOnly
                  renderIcon={Send}
                  iconDescription={t("grading.bulkPublish", "批量送出")}
                  disabled={
                    !hasBoundSession ||
                    submittingAnswerIds.size > 0 ||
                    selectedRowsReadyToSubmit.length === 0
                  }
                  onClick={() => openSubmitModal(selectedRows)}
                />
              </div>
              <div className={styles.cardList}>
                {filteredRows.map((row) => (
                  <GradingCardViewOnly
                    key={row.id}
                    row={row}
                    aiScore={resultsByAnswerId[row.id]?.score ?? null}
                    aiReason={resultsByAnswerId[row.id]?.reason ?? ""}
                    pending={getCardStatus(row.id) === "pending"}
                    status={getCardStatus(row.id)}
                    selected={selectedAnswerIds.has(row.id)}
                    onToggleSelected={() => toggleSelectedAnswer(row.id)}
                  />
                ))}
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
        models={gradingModels}
        selectedModelId={modelId}
        onModelChange={setModelId}
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
          label: sessionRunning
            ? t("grading.pauseAiGrading", "暫停批改")
            : t("grading.startAiGradingShort", "開始批改"),
          onClick: handlePrimaryAction,
          disabled: !sessionRunning && (rows.length === 0 || hasBoundSession),
          kind: sessionRunning ? "secondary" : "primary",
          renderIcon: sessionRunning ? Pause : Return,
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
      <Modal
        open={revertModalRows.length > 0}
        modalHeading={t("grading.bulkRevertHeading", "撤回已送出評分")}
        primaryButtonText={t("grading.bulkRevertConfirm", "確認撤回")}
        secondaryButtonText={t("common.cancel", "取消")}
        onRequestClose={closeRevertModal}
        onRequestSubmit={() => void handleConfirmRevert()}
        primaryButtonDisabled={submittingAnswerIds.size > 0 || revertModalRows.length === 0}
        danger
      >
        <p>
          {t(
            "grading.bulkRevertSummary",
            "將撤回 {{count}} 筆已送出的評分，學生端會回到未評分狀態，AI 建議會保留可再次編輯或送出。",
            { count: revertModalRows.length },
          )}
        </p>
      </Modal>
      <Modal
        open={submitModalRows.length > 0}
        modalHeading={t("grading.bulkSubmitHeading", "批量送出 AI 建議")}
        primaryButtonText={t("grading.bulkSubmitConfirm", "確認送出")}
        secondaryButtonText={t("common.cancel", "取消")}
        onRequestClose={closeSubmitModal}
        onRequestSubmit={() => void handleConfirmSubmit()}
        primaryButtonDisabled={submittingAnswerIds.size > 0 || submitModalRows.length === 0}
      >
        <p>
          {t("grading.bulkSubmitSummary", "將把 {{count}} 筆 AI 建議送出為正式評分，送出後可於學生端查看。", {
            count: submitModalRows.length,
          })}
        </p>
      </Modal>
      <Modal
        open={retryModalRows.length > 0}
        modalHeading={t("grading.retryAiGrading", "重新批改")}
        primaryButtonText={t("grading.startRetryAiGrading", "送出重新批改")}
        secondaryButtonText={t("common.cancel", "取消")}
        onRequestClose={closeRetryModal}
        onRequestSubmit={() => void handleConfirmRetry()}
        primaryButtonDisabled={running || retryModalRows.length === 0}
      >
        <div className={styles.retryModalBody}>
          <p className={styles.retryModalSummary}>
            {t("grading.retryModalSummary", "將重新批改 {{count}} 筆作答。", {
              count: retryModalRows.length,
            })}
          </p>
          <TextArea
            id="ai-grading-retry-note"
            labelText={t("grading.retryNoteLabel", "重新批改建議")}
            placeholder={t(
              "grading.retryNotePlaceholder",
              "例如：請更嚴格檢查是否提到關鍵概念，或針對第 2 點重新評估。",
            )}
            rows={5}
            value={retryNote}
            onChange={(event) => setRetryNote(event.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ContestAiGradingScreen;
