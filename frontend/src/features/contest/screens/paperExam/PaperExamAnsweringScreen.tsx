import React, { useEffect, useMemo, useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Tag,
  Loading,
  Tooltip,
  Modal,
  InlineNotification,
} from "@carbon/react";
import {
  ChevronLeft,
  Time,
  SendFilled,
  Recording,
  CheckmarkFilled,
} from "@carbon/icons-react";
import { usePaperExamFlow } from "./usePaperExamFlow";
import { useInterval } from "@/shared/hooks/useInterval";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { PaperExamCore } from "../../components/exam/PaperExamCore";
import {
  useCountdownTo,
  usePaperExamQuestions,
  usePaperExamSaveOnLeave,
  hasExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./hooks";
import { useExamCapture } from "@/features/contest/contexts/ExamCaptureContext";
import type { ExamItem } from "../../types/exam.types";
import styles from "./PaperExamAnswering.module.scss";
import {
  getContestDashboardPath,
  shouldRouteToPrecheck,
  getContestPrecheckPath,
} from "@/features/contest/domain/contestRoutePolicy";
import { exitFullscreen, isFullscreen } from "@/core/usecases/exam";
import { clearExamCaptureSessionId } from "./hooks/examCaptureSession";

const SAVE_STATUS_LABEL: Record<string, string> = {
  idle: "",
  saving: "儲存中…",
  saved: "已儲存",
  error: "儲存失敗",
};

const PaperExamAnsweringScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { contestId, contest, submitExam, refreshContest, loading } = usePaperExamFlow();

  const { items, answers, setAnswers, answeredIds, loadingQuestions } =
    usePaperExamQuestions(contestId);

  const isInProgress = contest?.examStatus === "in_progress";
  const isSubmitted = contest?.examStatus === "submitted";
  const countdown = useCountdownTo(contest?.endTime);
  const precheckPassed = contestId ? hasExamPrecheckPassed(contestId) : false;
  const {
    uploadSessionId: anticheatUploadSessionId,
    flushPendingUploads,
    forceStopCapture,
  } = useExamCapture();

  const { markDirty, saveIfDirty, flushAll, saveStatus } = usePaperExamSaveOnLeave({
    contestId,
    answers,
    items,
  });

  const handleAnswerChange = useCallback(
    (questionId: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      markDirty(questionId);
    },
    [setAnswers, markDirty],
  );

  const handleBlur = useCallback(
    (questionId: string) => {
      void saveIfDirty(questionId);
    },
    [saveIfDirty],
  );

  const handleActiveIndexChange = useCallback(
    (prevIndex: number) => {
      const prevItem = items[prevIndex];
      if (prevItem?.kind === "question") {
        void saveIfDirty(prevItem.data.id);
      }
    },
    [items, saveIfDirty],
  );

  useInterval(() => {
    refreshContest().catch(() => {});
  }, isInProgress ? 30000 : null);

  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    if (countdown.remaining !== null && countdown.remaining === 0 && isInProgress && contestId) {
      flushAll()
        .then(async () => {
          await flushPendingUploads();
          return submitExam(anticheatUploadSessionId || undefined);
        })
        .finally(() => {
          if (contestId) clearExamCaptureSessionId(contestId);
          forceStopCapture();
          setAutoSubmitted(true);
          if (isFullscreen()) exitFullscreen().catch(() => {});
        });
    }
  }, [
    anticheatUploadSessionId,
    countdown.remaining,
    flushPendingUploads,
    isInProgress,
    contestId,
    submitExam,
    flushAll,
    forceStopCapture,
  ]);

  useEffect(() => {
    if (!contestId || !contest || contest.contestType !== "paper_exam") return;
    syncExamPrecheckGateByStatus(contestId, contest.examStatus);

    if (
      shouldRouteToPrecheck({
        contest,
        precheckPassed,
      })
    ) {
      navigate(getContestPrecheckPath(contestId), { replace: true });
      return;
    }

    if (contest.examStatus === "submitted") {
      clearExamCaptureSessionId(contestId);
      forceStopCapture();
      if (isFullscreen()) exitFullscreen().catch(() => {});
    }
  }, [contest, contestId, forceStopCapture, navigate, precheckPassed]);

  const requestedQuestionId = searchParams.get("q");
  const reviewRequested = searchParams.get("review") === "1";
  const [showSubmitReview, setShowSubmitReview] = useState(reviewRequested);
  const [isSubmittingExam, setIsSubmittingExam] = useState(false);
  const syncIndex = useMemo(() => {
    if (!requestedQuestionId || items.length === 0) return null;
    const index = items.findIndex(
      (item) => item.kind === "question" && item.data.id === requestedQuestionId
    );
    return index >= 0 ? index : null;
  }, [requestedQuestionId, items]);

  const renderItem = useCallback(
    (item: ExamItem, index: number) => {
      if (item.kind !== "question") return null;
      return (
        <ExamQuestionCard
          question={item.data}
          index={index}
          answer={answers[item.data.id]}
          onAnswerChange={handleAnswerChange}
          onBlur={handleBlur}
        />
      );
    },
    [answers, handleAnswerChange, handleBlur]
  );

  const totalCount = items.length;
  const answeredCount = answeredIds.size;
  const unansweredCount = Math.max(0, totalCount - answeredCount);

  const openSubmitReview = useCallback(async () => {
    await flushAll();
    setShowSubmitReview(true);
  }, [flushAll]);

  const handleSubmitExam = useCallback(async () => {
    if (!contestId || isSubmittingExam) return;
    setIsSubmittingExam(true);
    await flushAll();
    await flushPendingUploads();
    const success = await submitExam(anticheatUploadSessionId || undefined);
    setIsSubmittingExam(false);
    if (!success) return;
    clearExamCaptureSessionId(contestId);
    forceStopCapture();
    setShowSubmitReview(false);
    navigate(getContestDashboardPath(contestId));
  }, [
    anticheatUploadSessionId,
    contestId,
    flushAll,
    flushPendingUploads,
    forceStopCapture,
    isSubmittingExam,
    navigate,
    submitExam,
  ]);

  if (autoSubmitted || isSubmitted) {
    return (
      <div className={styles.centered}>
        <CheckmarkFilled size={48} style={{ color: "var(--cds-support-success)" }} />
        <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          {autoSubmitted ? "考試已結束，系統已自動交卷" : "考試已結束，試卷已送出"}
        </span>
        <Button
          kind="primary"
          onClick={() => contestId && navigate(getContestDashboardPath(contestId))}
          style={{ marginTop: "1rem" }}
        >
          回到競賽主頁
        </Button>
      </div>
    );
  }

  if (loadingQuestions) {
    return (
      <div className={styles.centered}>
        <Loading withOverlay={false} small />
        <span>載入考試題目中...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.centered}>
        <span>此考試尚未設定任何題目</span>
      </div>
    );
  }

  return (
    <>
      <PaperExamCore
        items={items}
        answeredIds={answeredIds}
        styles={styles}
        syncIndex={syncIndex}
        renderItem={renderItem}
        onActiveIndexChange={handleActiveIndexChange}
        toolbarLeft={(
          <>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={ChevronLeft}
              iconDescription="返回競賽主頁"
              onClick={() => contestId && navigate(getContestDashboardPath(contestId))}
            />
            <span className={styles.title}>{contest?.name ?? "考試"}</span>
            {contest?.cheatDetectionEnabled && (
              <Tooltip label="系統正在監測焦點、全螢幕與分頁切換行為" align="bottom" autoAlign>
                <Tag size="sm" type="red" renderIcon={Recording}>
                  監測中
                </Tag>
              </Tooltip>
            )}
            {!isInProgress && (
              <Tag size="sm" type="red">考試未開始</Tag>
            )}
          </>
        )}
        toolbarCenter={(
          <>
            {saveStatus !== "idle" && (
              <span className={`${styles.saveStatus} ${saveStatus === "error" ? styles.saveStatusError : ""}`}>
                {SAVE_STATUS_LABEL[saveStatus]}
              </span>
            )}
            <div className={styles.timer}>
              <Time size={16} />
              <span className={styles.timerText}>{countdown.display}</span>
            </div>
            <Button
              kind="primary"
              size="sm"
              renderIcon={SendFilled}
              onClick={openSubmitReview}
            >
              交卷
            </Button>
          </>
        )}
      />
      <Modal
        open={showSubmitReview}
        modalHeading="交卷前確認"
        primaryButtonText={isSubmittingExam ? "交卷中..." : "確認交卷"}
        secondaryButtonText="回作答頁"
        primaryButtonDisabled={isSubmittingExam || loading || !isInProgress}
        onRequestSubmit={() => {
          void handleSubmitExam();
        }}
        onRequestClose={() => setShowSubmitReview(false)}
        onSecondarySubmit={() => setShowSubmitReview(false)}
        danger
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type={unansweredCount === 0 ? "green" : "red"}>
              {`已作答 ${answeredCount} / ${totalCount} 題`}
            </Tag>
            <Tag type="teal">
              {contest?.endTime
                ? `截止：${new Date(contest.endTime).toLocaleString("zh-TW")}`
                : "未設定截止時間"}
            </Tag>
          </div>

          {unansweredCount > 0 && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={`尚有 ${unansweredCount} 題未作答`}
              subtitle="建議先返回作答頁補完答案，再進行交卷。"
            />
          )}

          <div
            style={{
              maxHeight: "42vh",
              overflow: "auto",
              border: "1px solid var(--cds-border-subtle-01)",
              borderRadius: "4px",
            }}
          >
            {items.map((item, index) => {
              if (item.kind !== "question") return null;
              const done = answeredIds.has(item.data.id);
              const prompt = item.data.prompt || "";
              const preview = prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt;
              return (
                <div
                  key={item.data.id}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderBottom: "1px solid var(--cds-border-subtle-00)",
                    color: done ? "var(--cds-text-primary)" : "var(--cds-support-error)",
                  }}
                >
                  第 {index + 1} 題 {preview ? `— ${preview}` : ""}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default PaperExamAnsweringScreen;
