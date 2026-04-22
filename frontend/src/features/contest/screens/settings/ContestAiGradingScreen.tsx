import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Loading, Modal, Tag, TextInput, ProgressBar } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useAiGradingScreenData } from "./grading/useAiGradingScreenData";
import { EmptyState } from "@/shared/ui/EmptyState";
import MarkdownContent from "@/shared/ui/markdown/MarkdownContent";
import GradingCardViewOnly from "./grading/GradingCardViewOnly";
import type { GradingAnswerRow } from "./grading";
import { useAiQuestionGrading } from "./grading/useAiQuestionGrading";
import { useChatSessionContext } from "@/features/chatbot/contexts/ChatSessionContext";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import styles from "./ContestAiGradingScreen.module.scss";

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
    rubricMarkdown,
    hasGradeArtifact,
    error,
    sessionId,
    trackedQuestionId,
    taskStatus,
    start,
    bindSession,
    loadSessionTask,
    restore,
    clear,
  } = useAiQuestionGrading();
  const { requestActiveSession } = useChatSessionContext();
  const { right } = useWorkspace();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const taskSessionId = searchParams.get("session") || "";
  const loadedTaskSessionRef = useRef<string | null>(null);
  const restoredSessionRef = useRef<string | null>(null);

  const selectedQuestion = useMemo(
    () => questionProgress.find((question) => question.questionId === selectedQuestionId) ?? null,
    [questionProgress, selectedQuestionId],
  );

  const rows = useMemo<GradingAnswerRow[]>(
    () => (selectedQuestion ? answersByQuestion.get(selectedQuestion.questionId) ?? [] : []),
    [answersByQuestion, selectedQuestion],
  );

  useEffect(() => {
    if (!taskSessionId || !contest?.id) return;
    if (loadedTaskSessionRef.current === taskSessionId) return;
    loadedTaskSessionRef.current = taskSessionId;

    void loadSessionTask(taskSessionId).then((task) => {
      if (!task) return;
      if (task.contestId !== contest.id) return;
      setSelectedQuestionId(task.questionId);
      setSessionIdInput(taskSessionId);
    });
  }, [contest?.id, loadSessionTask, taskSessionId]);

  useEffect(() => {
    if (!taskSessionId || !contest?.id || !selectedQuestion || rows.length === 0) return;
    if (restoredSessionRef.current === taskSessionId) return;
    void restore(taskSessionId, contest.id, selectedQuestion.questionId, rows).then((restoredSessionId) => {
      if (restoredSessionId) {
        restoredSessionRef.current = restoredSessionId;
        setSessionIdInput(restoredSessionId);
      }
    });
  }, [contest?.id, restore, rows, selectedQuestion, taskSessionId]);

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

  const handleStartAiGrading = async () => {
    if (!contest?.id || !selectedQuestion || rows.length === 0) return;
    setConfirmOpen(false);
    const sessionId = await start(contest.id, selectedQuestion.questionId, rows);
    if (sessionId) {
      setSessionIdInput(sessionId);
      restoredSessionRef.current = sessionId;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("panel", "ai-grading");
        next.set("session", sessionId);
        return next;
      }, { replace: true });
      right.open();
      requestActiveSession(sessionId);
    }
  };

  const handleBindSession = () => {
    const sid = sessionIdInput.trim();
    if (!contest?.id || !selectedQuestion || !sid || rows.length === 0) return;
    void bindSession(sid, contest.id, selectedQuestion.questionId, rows).then((bound) => {
      if (!bound) return;
      restoredSessionRef.current = sid;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("panel", "ai-grading");
        next.set("session", sid);
        return next;
      }, { replace: true });
      right.open();
      requestActiveSession(sid);
    });
  };

  const handleClearSession = () => {
    clear();
    restoredSessionRef.current = null;
    loadedTaskSessionRef.current = null;
    setSessionIdInput("");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("session");
      return next;
    }, { replace: true });
  };

  const handleSelectQuestion = (questionId: string | null) => {
    if (taskSessionId) {
      clear();
      restoredSessionRef.current = null;
      loadedTaskSessionRef.current = null;
      setSessionIdInput("");
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("session");
        return next;
      }, { replace: true });
    }
    setSelectedQuestionId(questionId);
  };

  const getCardStatus = useCallback(
    (rowId: string): "idle" | "pending" | "reviewable" | "missing" => {
      const hasResult = !!resultsByAnswerId[rowId];
      if (hasResult) return "reviewable";
      if (!selectedQuestion || trackedQuestionId !== selectedQuestion.questionId) return "idle";
      if (running) return "pending";
      if (taskStatus === "review" || taskStatus === "completed") return "missing";
      return "idle";
    },
    [resultsByAnswerId, running, selectedQuestion, taskStatus, trackedQuestionId],
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
        description={t("grading.noAnswersDescCoding", "目前還沒有學生提交程式碼，請確認考試已開始且學生已送出 submission。")}
      />
    );
  }

  if (questionProgress.length === 0) {
    return (
      <EmptyState
        title={t("grading.noAnswers", "尚無作答資料")}
        description={t("grading.noAnswersDesc", "目前還沒有學生提交作答，請確認考試已開始且學生已完成作答後再進入批改。")}
      />
    );
  }

  const renderQuestionList = () => (
    <aside className={styles.leftPane}>
      <div className={styles.paneTitle}>{t("grading.questionList", "題目列表")}</div>
      <div className={styles.questionList}>
        {questionProgress.map((question) => (
          <button
            key={question.questionId}
            type="button"
            className={`${styles.questionItem} ${question.questionId === selectedQuestion?.questionId ? styles.questionItemActive : ""}`}
            onClick={() => handleSelectQuestion(question.questionId)}
          >
            <span className={styles.questionItemTitle}>Q{question.questionIndex}</span>
            <span className={styles.questionItemMeta}>
              {question.gradedCount}/{question.totalAnswers}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );

  const renderQuestionDetail = () => {
    if (!selectedQuestion) return null;

    const isCurrentQuestionTask = trackedQuestionId === selectedQuestion.questionId;
    const aiCompletedCount = isCurrentQuestionTask
      ? rows.filter((row) => resultsByAnswerId[row.id]).length
      : 0;
    const aiGradingProgress = isCurrentQuestionTask && hasGradeArtifact && rows.length > 0
      ? Math.round((aiCompletedCount / rows.length) * 100)
      : 0;
    const showAiProgress = isCurrentQuestionTask && hasGradeArtifact;
    const showRubric = isCurrentQuestionTask && rubricMarkdown;

    return (
      <aside className={styles.leftPane}>
        <div className={styles.detailHeader}>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ArrowLeft}
            iconDescription={t("common.back", "返回")}
            onClick={() => handleSelectQuestion(null)}
          />
          <div className={styles.detailHeaderTitle}>
            {t("grading.question", "題目")} Q{selectedQuestion.questionIndex}
          </div>
        </div>

        <section className={styles.questionDetailCard}>
          <div className={styles.infoSection}>
            <div className={styles.infoLabel}>{t("grading.questionPrompt", "題目")}</div>
            <div className={styles.infoValue}>
              <MarkdownContent.Problem>{selectedQuestion.prompt || ""}</MarkdownContent.Problem>
            </div>
          </div>

          <div className={styles.infoSection}>
            <div className={styles.infoLabel}>{t("grading.questionExplanation", "解答")}</div>
            <div className={styles.infoValue}>
              <MarkdownContent.Problem>{selectedQuestion.explanation || t("grading.noExplanation", "尚無解答")}</MarkdownContent.Problem>
            </div>
          </div>

          <div className={styles.infoSection}>
            <div className={styles.infoLabel}>{t("grading.correctAnswer", "正解")}</div>
            <div className={styles.infoValue}>
              {typeof selectedQuestion.correctAnswer === "string" ? (
                <MarkdownContent.Problem>{selectedQuestion.correctAnswer}</MarkdownContent.Problem>
              ) : (
                JSON.stringify(selectedQuestion.correctAnswer) || t("grading.noCorrectAnswer", "尚無正解")
              )}
            </div>
          </div>

          {showRubric ? (
            <div className={styles.infoSection}>
              <div className={styles.infoLabel}>{t("grading.aiRubric", "AI Rubric (rubric.md)")}</div>
              <div className={styles.infoValue}>
                <MarkdownContent.Problem>{rubricMarkdown}</MarkdownContent.Problem>
              </div>
            </div>
          ) : null}
        </section>

        {showAiProgress ? (
          <section className={styles.progressCard}>
            <ProgressBar
              label={t("grading.currentAiGradingProgress", "此輪 AI 批改進度")}
              value={aiGradingProgress}
              max={100}
              status={running ? "active" : "finished"}
              helperText={`${aiCompletedCount}/${rows.length} ${t("grading.aiSuggestionsReady", "已產生建議")}`}
            />
            <Tag type="cool-gray" size="sm">{taskStatus}</Tag>
          </section>
        ) : null}

        <section className={styles.actionRow}>
          <Button
            kind="primary"
            size="sm"
            disabled={running || rows.length === 0}
            onClick={() => setConfirmOpen(true)}
          >
            {t("grading.startAiGrading", "開始 AI 批改")}
          </Button>
          {error ? <span className={styles.errorText}>{error}</span> : null}
          <TextInput
            id="ai-grading-session-id"
            labelText={t("grading.bindSessionLabel", "綁定既有批改 session ID")}
            placeholder={t("grading.bindSessionPlaceholder", "貼上 session UUID")}
            size="sm"
            value={sessionIdInput}
            onChange={(e) => setSessionIdInput(e.target.value)}
          />
          <div className={styles.actionButtons}>
            <Button
              kind="tertiary"
              size="sm"
              disabled={!sessionIdInput.trim() || rows.length === 0}
              onClick={handleBindSession}
            >
              {t("grading.bindSession", "綁定")}
            </Button>
            {sessionId && isCurrentQuestionTask ? (
              <Button kind="ghost" size="sm" onClick={handleClearSession}>
                {t("grading.unbindSession", "解除綁定")}
              </Button>
            ) : null}
          </div>
        </section>
      </aside>
    );
  };

  const renderGradingList = () => (
    <main className={styles.rightPane}>
      <div className={styles.gradingListHeader}>
        <div>
          <div className={styles.paneTitle}>{t("grading.gradingList", "批改列表")}</div>
        </div>
      </div>

      {!selectedQuestion ? (
        <EmptyState
          title={t("grading.selectQuestion", "選擇題目")}
          description={t("grading.selectQuestionDesc", "點擊左側題目後，這裡會顯示該題的批改卡片列表。")}
          compact
        />
      ) : isQuestionLoading ? (
        <div className={styles.loadingWrap}>
          <Loading
            withOverlay={false}
            description={t("grading.loadingQuestion", "載入此題答卷...")}
          />
        </div>
      ) : selectedQuestionError ? (
        <EmptyState
          title={t("grading.loadQuestionFailed", "載入答卷失敗")}
          description={selectedQuestionError}
          compact
        />
      ) : rows.length === 0 ? (
        <EmptyState title={t("grading.noAnswersForQuestion", "此題目尚無學生作答")} compact />
      ) : (
        <div className={styles.cardList}>
          {rows.map((row) => (
            <GradingCardViewOnly
              key={row.id}
              row={row}
              aiScore={resultsByAnswerId[row.id]?.score ?? null}
              aiReason={resultsByAnswerId[row.id]?.reason ?? ""}
              pending={getCardStatus(row.id) === "pending"}
              status={getCardStatus(row.id)}
              selected={selectedAnswerIds.has(row.id)}
              onToggleSelected={() => toggleSelectedAnswer(row.id)}
              actionsDisabled
            />
          ))}
        </div>
      )}
    </main>
  );

  return (
    <div className={styles.root}>
      {selectedQuestionId ? renderQuestionDetail() : renderQuestionList()}
      {renderGradingList()}
      <Modal
        open={confirmOpen}
        modalHeading={t("grading.startAiGrading", "開始 AI 批改")}
        primaryButtonText={t("common.confirm", "確認")}
        secondaryButtonText={t("common.cancel", "取消")}
        onRequestClose={() => setConfirmOpen(false)}
        onRequestSubmit={() => {
          void handleStartAiGrading();
        }}
      >
        <p>
          {t(
            "grading.aiGradingConfirmBody",
            "將對目前選中題目的所有作答啟動 AI 批改，確認要開始嗎？",
          )}
        </p>
      </Modal>
    </div>
  );
};

export default ContestAiGradingScreen;
