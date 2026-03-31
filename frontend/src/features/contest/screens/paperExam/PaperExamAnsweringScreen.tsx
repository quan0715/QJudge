import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Tag,
  Loading,
  Modal,
  InlineNotification,
} from "@carbon/react";
import {
  ChevronLeft,
  SendFilled,
  CheckmarkFilled,
  FlagFilled,
} from "@carbon/icons-react";
import ExamStatusBadge from "@/features/contest/components/exam/ExamStatusBadge";
import { usePaperExamFlow } from "./usePaperExamFlow";
import { useInterval } from "@/shared/hooks/useInterval";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { PaperExamCore } from "../../components/exam/PaperExamCore";
import {
  useCountdownTo,
  usePaperExamAutoSave,
  usePaperExamQuestions,
  usePaperExamSaveOnLeave,
  hasExamPrecheckPassed,
  syncExamPrecheckGateByStatus,
} from "./hooks";
import { useExamCapture } from "@/features/contest/contexts/ExamCaptureContext";
import type { ExamItem } from "../../types/exam.types";
import styles from "./PaperExamAnswering.module.scss";
import useExamSubmissionProgress from "@/features/contest/hooks/useExamSubmissionProgress";
import ExamSubmissionProgressModal from "@/features/contest/components/exam/ExamSubmissionProgressModal";
import {
  getClassroomContestDashboardPath,
  getClassroomContestPrecheckPath,
  getContestDashboardPath,
  shouldRouteToPrecheck,
  getContestPrecheckPath,
} from "@/features/contest/domain/contestRoutePolicy";
import {
  getClassroomLabDashboardPath,
  isClassroomLabRouteContext,
} from "@/features/classroom/domain/labRoutePolicy";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import { exitFullscreen, isFullscreen } from "@/core/usecases/exam";
import { clearExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";
import { stopCaptureForContest } from "@/features/contest/anticheat/captureLifecycle";
import {
  buildExamEntryDeviceMetadata,
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "@/features/contest/domain/anticheatModulePolicy";
import type { ExamQuestionType } from "@/core/entities/contest.entity";

const PaperExamAnsweringScreen: React.FC = () => {
  const { t } = useTranslation(["contest", "common"]);
  const navigate = useNavigate();
  const { classroomId, contestId: routeContestId, labId } = useParams<{
    classroomId?: string;
    contestId?: string;
    labId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const { contestId, contest, submitExam, refreshContest, loading } = usePaperExamFlow();
  const labContext = isClassroomLabRouteContext({ classroomId, labId })
    ? { classroomId, labId }
    : null;
  const classroomContestContext =
    !labContext && classroomId && routeContestId
      ? { classroomId, contestId: routeContestId }
      : null;
  const dashboardPath =
    labContext
      ? getClassroomLabDashboardPath(labContext.classroomId!, labContext.labId!)
      : classroomContestContext
        ? getClassroomContestDashboardPath(
            classroomContestContext.classroomId!,
            classroomContestContext.contestId!,
          )
      : contestId
        ? getContestDashboardPath(contestId)
        : "";
  const precheckPath =
    !contestId
      ? ""
      : labContext
        ? dashboardPath
        : classroomContestContext
          ? getClassroomContestPrecheckPath(
              classroomContestContext.classroomId!,
              classroomContestContext.contestId!,
            )
        : getContestPrecheckPath(contestId);
  const shouldRequirePrecheck =
    !labContext && contest?.deliveryMode !== "practice";
  const capability = useMemo(() => detectAnticheatCapability(), []);
  const monitoringPlan = useMemo(
    () => resolveDeviceMonitoringPlan(capability, contest?.anticheatDevicePolicy),
    [capability, contest?.anticheatDevicePolicy]
  );
  const examEntryDeviceMetadata = useMemo(
    () => buildExamEntryDeviceMetadata(capability, monitoringPlan),
    [capability, monitoringPlan]
  );
  const submitProgress = useExamSubmissionProgress();

  const { items, answers, setAnswers, answeredIds, loadingQuestions } =
    usePaperExamQuestions(contestId);
  const questionIds = useMemo(
    () => items.filter((item) => item.kind === "question").map((item) => item.data.id),
    [items]
  );
  const autoSave = usePaperExamAutoSave({
    contestId,
    questionIds,
    setAnswers,
  });

  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const toggleMark = useCallback((id: string) => {
    setMarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const isInProgress = contest?.examStatus === "in_progress";
  const isSubmitted = contest?.examStatus === "submitted";
  const countdown = useCountdownTo(contest?.endTime);
  const precheckPassed = contestId ? hasExamPrecheckPassed(contestId) : false;
  const {
    uploadSessionId: anticheatUploadSessionId,
    flushPendingUploads,
    forceStopCapture,
  } = useExamCapture();

  const { markDirty, saveIfDirty, flushAll, saveStatus: saveOnLeaveStatus } = usePaperExamSaveOnLeave({
    contestId,
    answers,
    items,
  });
  const saveStatus = autoSave.saveStatus !== "idle" ? autoSave.saveStatus : saveOnLeaveStatus;

  const saveStatusLabel = useMemo(() => {
    if (saveStatus === "idle") return "";
    return t(`answering.status.${saveStatus}`);
  }, [saveStatus, t]);
  const withButtonTestId = (testId: string, label: React.ReactNode) => (
    <span data-testid={testId}>{label}</span>
  );

  const handleAnswerChange = useCallback(
    (questionId: string, value: unknown, questionType?: ExamQuestionType) => {
      autoSave.handleAnswerChange(questionId, value, questionType);
      markDirty(questionId);
    },
    [autoSave, markDirty],
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

  const runSubmitWithProgress = useCallback(async () => {
    const success = await submitProgress.run({
      handlers: {
        checking: async () => {
          await flushAll();
        },
        uploading: async () => {
          await flushPendingUploads();
        },
        finalizing: async () => {
          const ok = await submitExam(anticheatUploadSessionId || undefined);
          if (!ok) {
            throw new Error(t("answering.error.submitFailed", "交卷失敗"));
          }
          if (contestId) {
            clearExamCaptureSessionId(contestId);
          }
          const stopResult = contestId
            ? stopCaptureForContest(contestId, "submitted")
            : null;
          if (!stopResult) {
            forceStopCapture("submitted");
          }
          if (isFullscreen()) {
            await exitFullscreen().catch(() => {});
          }
        },
      },
    });
    return success;
  }, [
    anticheatUploadSessionId,
    contestId,
    flushAll,
    flushPendingUploads,
    forceStopCapture,
    submitExam,
    submitProgress,
    t,
  ]);

  useEffect(() => {
    if (countdown.remaining !== null && countdown.remaining === 0 && isInProgress && contestId) {
      void runSubmitWithProgress().then((success) => {
        if (!success) return;
        setAutoSubmitted(true);
      });
    }
  }, [
    countdown.remaining,
    isInProgress,
    contestId,
    runSubmitWithProgress,
  ]);

  useEffect(() => {
    if (!contestId || !contest || contest.contestType !== "paper_exam") return;
    syncExamPrecheckGateByStatus(contestId, contest.examStatus);

    if (
      shouldRequirePrecheck && shouldRouteToPrecheck({
        contest,
        precheckPassed,
      })
    ) {
      navigate(precheckPath, { replace: true });
      return;
    }

    if (contest.examStatus === "submitted") {
      clearExamCaptureSessionId(contestId);
      const stopResult = stopCaptureForContest(contestId, "submitted");
      if (!stopResult) {
        forceStopCapture("submitted");
      }
      if (isFullscreen()) exitFullscreen().catch(() => {});
    }
  }, [contest, contestId, forceStopCapture, navigate, precheckPassed, precheckPath, shouldRequirePrecheck]);

  useEffect(() => {
    if (
      !contestId ||
      !contest ||
      contest.contestType !== "paper_exam" ||
      !contest.cheatDetectionEnabled ||
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
        ...examEntryDeviceMetadata,
      },
    }).catch(() => null);
  }, [
    anticheatUploadSessionId,
    contest,
    contestId,
    examEntryDeviceMetadata,
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
          isMarked={markedIds.has(item.data.id)}
          onToggleMark={toggleMark}
        />
      );
    },
    [answers, handleAnswerChange, handleBlur, markedIds, toggleMark]
  );

  const totalCount = items.length;
  const answeredCount = answeredIds.size;
  const unansweredCount = Math.max(0, totalCount - answeredCount);
  const markedCount = markedIds.size;

  const openSubmitReview = useCallback(async () => {
    await flushAll();
    setShowSubmitReview(true);
  }, [flushAll]);

  const handleSubmitExam = useCallback(async () => {
    if (!contestId || isSubmittingExam) return;
    setIsSubmittingExam(true);
    const success = await runSubmitWithProgress();
    setIsSubmittingExam(false);
    if (!success) return;
    setShowSubmitReview(false);
    navigate(dashboardPath);
  }, [
    contestId,
    dashboardPath,
    isSubmittingExam,
    navigate,
    runSubmitWithProgress,
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
          onClick={() => dashboardPath && navigate(dashboardPath)}
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
        markedIds={markedIds}
        styles={styles}
        syncIndex={syncIndex}
        renderItem={renderItem}
        onActiveIndexChange={handleActiveIndexChange}
        toolbarLeft={(
          <>
            <Button
              kind="ghost"
              data-testid="paper-exam-back-dashboard-btn"
              hasIconOnly
              renderIcon={ChevronLeft}
              iconDescription={t("answering.finish.backToDashboard")}
              onClick={() => dashboardPath && navigate(dashboardPath)}
            />
            <span className={styles.title}>{contest?.name ?? t("common:page.contests")}</span>
          </>
        )}
        toolbarCenter={(
          <>
            {saveStatus !== "idle" && (
              <span className={`${styles.saveStatus} ${saveStatus === "error" ? styles.saveStatusError : ""}`}>
                {saveStatusLabel}
              </span>
            )}
            <ExamStatusBadge
              examStatus={contest?.examStatus}
              cheatDetectionEnabled={contest?.cheatDetectionEnabled}
              timeLeft={countdown.display}
              lockReason={contest?.lockReason}
              autoUnlockAt={contest?.autoUnlockAt}
            />
            <Button
              kind="primary"
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
            {markedCount > 0 && (
              <Tag type="warm-gray">
                <FlagFilled size={12} style={{ marginRight: "4px", verticalAlign: "middle", color: "var(--cds-support-warning)" }} />
                {t("answering.submit.markedCount", { count: markedCount })}
              </Tag>
            )}
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
              const marked = markedIds.has(item.data.id);
              const prompt = item.data.prompt || "";
              const preview = prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt;
              return (
                <div
                  key={item.data.id}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderBottom: "1px solid var(--cds-border-subtle-00)",
                    color: done ? "var(--cds-text-primary)" : "var(--cds-support-error)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {marked && <FlagFilled size={14} style={{ color: "var(--cds-support-warning)", flexShrink: 0 }} />}
                  <span>{t("answering.submit.questionPreview", { index: index + 1 })} {preview ? `— ${preview}` : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
      <ExamSubmissionProgressModal
        state={submitProgress.state}
        onRequestClose={submitProgress.close}
      />
    </>
  );
};

export default PaperExamAnsweringScreen;
