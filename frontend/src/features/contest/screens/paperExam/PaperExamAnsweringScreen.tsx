import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import { exitFullscreen, isFullscreen } from "@/core/usecases/exam";
import { clearExamCaptureSessionId } from "./hooks/examCaptureSession";

const PaperExamAnsweringScreen: React.FC = () => {
  const { t } = useTranslation(["contest", "common"]);
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

  const saveStatusLabel = useMemo(() => {
    if (saveStatus === "idle") return "";
    return t(`answering.status.${saveStatus}`);
  }, [saveStatus, t]);
  const withButtonTestId = (testId: string, label: React.ReactNode) => (
    <span data-testid={testId}>{label}</span>
  );

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
  const hasLoggedExamEntryRef = useRef(false);

  useEffect(() => {
    if (countdown.remaining !== null && countdown.remaining === 0 && isInProgress && contestId) {
      flushAll()
        .then(async () => {
          await flushPendingUploads();
          return submitExam(anticheatUploadSessionId || undefined);
        })
        .finally(() => {
          if (contestId) clearExamCaptureSessionId(contestId);
          forceStopCapture("submitted");
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
      forceStopCapture("submitted");
      if (isFullscreen()) exitFullscreen().catch(() => {});
    }
  }, [contest, contestId, forceStopCapture, navigate, precheckPassed]);

  useEffect(() => {
    if (
      !contestId ||
      !contest ||
      contest.contestType !== "paper_exam" ||
      contest.examStatus !== "in_progress" ||
      !precheckPassed ||
      hasLoggedExamEntryRef.current
    ) {
      return;
    }

    hasLoggedExamEntryRef.current = true;
    void recordExamEventWithForcedCapture(contestId, "exam_entered", {
      reason: "Student entered paper exam answering screen",
      source: "paper_exam:answering_screen",
      forceCaptureReason: "exam_entered:paper_exam_answering",
      metadata: {
        upload_session_id: anticheatUploadSessionId || undefined,
      },
    }).catch(() => null);
  }, [
    anticheatUploadSessionId,
    contest,
    contestId,
    precheckPassed,
  ]);

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
    forceStopCapture("submitted");
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
          {autoSubmitted ? t("answering.finish.autoSubmitted") : t("answering.finish.submitted")}
        </span>
        <Button
          kind="primary"
          data-testid="paper-exam-finish-back-dashboard-btn"
          onClick={() => contestId && navigate(getContestDashboardPath(contestId))}
          style={{ marginTop: "1rem" }}
        >
          {t("answering.finish.backToDashboard")}
        </Button>
      </div>
    );
  }

  if (loadingQuestions) {
    return (
      <div className={styles.centered}>
        <Loading withOverlay={false} small />
        <span>{t("answering.loading")}</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.centered}>
        <span>{t("answering.noQuestions")}</span>
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
              data-testid="paper-exam-back-dashboard-btn"
              hasIconOnly
              renderIcon={ChevronLeft}
              iconDescription={t("answering.finish.backToDashboard")}
              onClick={() => contestId && navigate(getContestDashboardPath(contestId))}
            />
            <span className={styles.title}>{contest?.name ?? t("common:page.contests")}</span>
            {contest?.cheatDetectionEnabled && (
              <Tooltip label={t("answering.status.monitoringTooltip")} align="bottom" autoAlign>
                <Tag size="sm" type="red" renderIcon={Recording}>
                  {t("answering.status.monitoring")}
                </Tag>
              </Tooltip>
            )}
            {!isInProgress && (
              <Tag size="sm" type="red">{t("answering.status.notStarted")}</Tag>
            )}
          </>
        )}
        toolbarCenter={(
          <>
            {saveStatus !== "idle" && (
              <span className={`${styles.saveStatus} ${saveStatus === "error" ? styles.saveStatusError : ""}`}>
                {saveStatusLabel}
              </span>
            )}
            <div className={styles.timer}>
              <Time size={16} />
              <span className={styles.timerText}>{countdown.display}</span>
            </div>
            <Button
              kind="primary"
              size="sm"
              data-testid="paper-exam-open-submit-review-btn"
              renderIcon={SendFilled}
              onClick={openSubmitReview}
            >
              {t("answering.submit.button")}
            </Button>
          </>
        )}
      />
      <Modal
        data-testid="paper-exam-submit-review-modal"
        open={showSubmitReview}
        modalHeading={t("answering.submit.confirmTitle")}
        primaryButtonText={withButtonTestId(
          "paper-exam-submit-confirm-btn",
          isSubmittingExam ? t("answering.submit.submitting") : t("answering.submit.confirmButton")
        )}
        secondaryButtonText={withButtonTestId(
          "paper-exam-submit-cancel-btn",
          t("answering.submit.backToExam")
        )}
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
              {t("answering.submit.stats", { answered: answeredCount, total: totalCount })}
            </Tag>
            <Tag type="teal">
              {contest?.endTime
                ? t("answering.submit.deadline", { time: new Date(contest.endTime).toLocaleString() })
                : t("answering.submit.noDeadline")}
            </Tag>
          </div>

          {unansweredCount > 0 && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={t("answering.submit.unansweredWarning", { count: unansweredCount })}
              subtitle={t("answering.submit.unansweredSubtitle")}
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
                  {t("answering.submit.questionPreview", { index: index + 1 })} {preview ? `— ${preview}` : ""}
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
