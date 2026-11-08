import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Loading,
  Modal,
} from "@carbon/react";
import {
  ChevronLeft,
  SendFilled,
  CheckmarkFilled,
} from "@carbon/icons-react";
import { useExamSessionFlow } from "@/features/contest/hooks/useExamSessionFlow";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { PaperExamCore } from "../../components/exam/PaperExamCore";
import { HandInCheck } from "../../components/exam/HandInCheck";
import type { ExamResultTile } from "../../components/exam/ExamAnswerTiles";
import {
  usePaperExamAutoSave,
  usePaperExamQuestions,
  usePaperExamSaveOnLeave,
  getMarkedQuestionIds,
  saveMarkedQuestionIds,
} from "./hooks";
import { hasExamPrecheckPassed } from "@/features/contest/anticheat/examPrecheckGate";
import { useExamCapture } from "@/features/contest/contexts/ExamCaptureContext";
import type { ExamItem } from "../../types/exam.types";
import { buildPaperQuestionLabels } from "../../domain/paperQuestionLabels";
import { buildQuestionPresentationById } from "../../components/exam/questionPresentation";
import styles from "./PaperExamAnswering.module.scss";
import useExamSubmissionProgress from "@/features/contest/hooks/useExamSubmissionProgress";
import ExamSubmissionProgressModal from "@/features/contest/components/exam/ExamSubmissionProgressModal";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import {
  exitFullscreen,
  isFullscreen,
} from "@/infrastructure/browser/fullscreen";
import { clearExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";
import { stopCaptureForContest } from "@/features/contest/anticheat/captureLifecycle";
import { flushUploadsForSubmit } from "@/features/contest/anticheat/integrity/flushUploadsForSubmit";
import { usePageHeaderActions } from "@/features/app/contexts/PageHeaderActionsContext";
import { useContestRuntimeMode } from "@/features/contest/hooks";
import { useIntegrityUploadOwner } from "@/features/contest/contexts/IntegrityUploadProvider";
import type {
  ExamQuestionAnswerFormat,
  ExamQuestionType,
} from "@/core/entities/contest.entity";

const PaperExamAnsweringScreen: React.FC = () => {
  const { t } = useTranslation(["contest", "common"]);
  const navigate = useNavigate();
  const { classroomId, contestId: routeContestId } = useParams<{
    classroomId?: string;
    contestId?: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contestId, contest, submitExam, loading } = useExamSessionFlow();
  const effectiveClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const classroomContestContext =
    classroomId && routeContestId
      ? { classroomId, contestId: routeContestId }
      : null;
  const dashboardPath =
    classroomContestContext
      ? getClassroomContestDashboardPath(
          classroomContestContext.classroomId!,
          classroomContestContext.contestId!,
        )
      : effectiveClassroomId && contestId
        ? getClassroomContestDashboardPath(effectiveClassroomId, contestId)
        : "";
  const integrityOwner = useIntegrityUploadOwner();
  const submitProgress = useExamSubmissionProgress();
  const setPageHeaderActions = usePageHeaderActions();
  const { isRuntime } = useContestRuntimeMode();

  const { items, sections, answers, setAnswers, answeredIds, loadingQuestions } =
    usePaperExamQuestions(contestId);
  const questionLabels = useMemo(
    () => buildPaperQuestionLabels(items.flatMap((item) => item.kind === "question" ? [item.data] : [])),
    [items],
  );
  const questionIds = useMemo(
    () => items.filter((item) => item.kind === "question").map((item) => item.data.id),
    [items]
  );
  const singleModePresentationById = useMemo(
    () => buildQuestionPresentationById(sections, "single"),
    [sections],
  );
  const allModePresentationById = useMemo(
    () => buildQuestionPresentationById(sections, "all"),
    [sections],
  );
  const autoSave = usePaperExamAutoSave({
    contestId,
    questionIds,
    setAnswers,
  });

  const [markedIds, setMarkedIds] = useState<Set<string>>(() =>
    getMarkedQuestionIds(contestId),
  );
  useEffect(() => {
    setMarkedIds(getMarkedQuestionIds(contestId));
  }, [contestId]);
  const toggleMark = useCallback((id: string) => {
    setMarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveMarkedQuestionIds(contestId, next);
      return next;
    });
  }, [contestId]);

  const isInProgress = contest?.examStatus === "in_progress";
  const isSubmitted = contest?.examStatus === "submitted";
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
    (
      questionId: string,
      value: unknown,
      questionType?: ExamQuestionType,
      answerFormat?: ExamQuestionAnswerFormat,
    ) => {
      autoSave.handleAnswerChange(questionId, value, questionType, answerFormat);
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

  const hasLoggedExamEntryRef = useRef(false);
  const isLoggingExamEntryRef = useRef(false);

  const runSubmitWithProgress = useCallback(async () => {
    const success = await submitProgress.run({
      handlers: {
        checking: async () => {
          await autoSave.flushAll();
          await flushAll();
        },
        uploading: () => flushUploadsForSubmit(flushPendingUploads),
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
    autoSave.flushAll,
    contestId,
    flushAll,
    flushPendingUploads,
    forceStopCapture,
    submitExam,
    submitProgress,
    t,
  ]);

  // Precheck gating lives in RuntimeRouteWrapper — the single owner for every
  // contest type. This screen only cleans up after its own submission.
  useEffect(() => {
    if (!contestId || !contest || contest.contestType !== "paper_exam") return;
    if (contest.examStatus !== "submitted") return;

    clearExamCaptureSessionId(contestId);
    const stopResult = stopCaptureForContest(contestId, "submitted");
    if (!stopResult) {
      forceStopCapture("submitted");
    }
    if (isFullscreen()) exitFullscreen().catch(() => {});
  }, [contest, contestId, forceStopCapture]);

  useEffect(() => {
    if (
      !contestId ||
      !contest ||
      contest.contestType !== "paper_exam" ||
      !contest.cheatDetectionEnabled ||
      contest.examStatus !== "in_progress" ||
      !precheckPassed ||
      !integrityOwner?.captureReady ||
      hasLoggedExamEntryRef.current ||
      isLoggingExamEntryRef.current
    ) {
      return;
    }

    isLoggingExamEntryRef.current = true;
    const clientOccurredAtMs = Date.now();
    // Contest data can arrive before runtime admission. Wait only for event
    // ownership, never gate answering on monitoring readiness or delivery.
    void integrityOwner.emitter.emit({
      eventType: "exam_entered",
      clientOccurredAtMs,
      payload: {
        source: "paper_exam:answering_screen",
        ...(anticheatUploadSessionId
          ? { upload_session_id: anticheatUploadSessionId }
          : {}),
      },
    }).then(
      () => {
        hasLoggedExamEntryRef.current = true;
      },
      () => {
        isLoggingExamEntryRef.current = false;
      },
    );
  }, [
    anticheatUploadSessionId,
    contest,
    contestId,
    integrityOwner,
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

  // The hand-in check uses the overview's tiles; marked questions carry the folded corner.
  const handInTiles = useMemo<ExamResultTile[]>(() => items.flatMap((item) => {
    if (item.kind !== "question") return [];
    const answered = answeredIds.has(item.data.id);
    return [{
      key: item.data.id,
      label: questionLabels.get(item.data.id)?.label ?? String(item.data.order + 1),
      state: answered ? "answered" as const : "unanswered" as const,
      detail: answered ? t("workspace.report.answered", "已作答") : t("workspace.report.unanswered", "未作答"),
      marked: markedIds.has(item.data.id),
    }];
  }), [items, answeredIds, markedIds, questionLabels, t]);
  const openQuestionFromHandIn = useCallback((id: string) => {
    setShowSubmitReview(false);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set("q", id);
      next.delete("review");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const renderItem = useCallback(
    (item: ExamItem, _index: number, mode: "single" | "all", footer?: React.ReactNode) => {
      if (item.kind !== "question") return null;
      const presentation =
        mode === "single"
          ? singleModePresentationById.get(item.data.id)
          : allModePresentationById.get(item.data.id);
      return (
        <ExamQuestionCard
          layout="workspace"
          footer={footer}
          question={item.data}
          group={presentation?.group}
          showGroupStem={presentation?.showGroupStem ?? false}
          index={item.data.order}
          displayLabel={questionLabels.get(item.data.id)?.label}
          groupLabel={questionLabels.get(item.data.id)?.groupLabel}
          answer={answers[item.data.id]}
          onAnswerChange={handleAnswerChange}
          onBlur={handleBlur}
          isMarked={markedIds.has(item.data.id)}
          onToggleMark={toggleMark}
        />
      );
    },
    [
      answers,
      dashboardPath,
      navigate,
      allModePresentationById,
      handleAnswerChange,
      handleBlur,
      markedIds,
      singleModePresentationById,
      questionLabels,
      toggleMark,
    ],
  );


  const openSubmitReview = useCallback(async () => {
    await flushAll();
    setShowSubmitReview(true);
  }, [flushAll]);

  const shouldUseHeaderActions =
    isRuntime && !isSubmitted && !loadingQuestions && items.length > 0;

  useEffect(() => {
    if (!shouldUseHeaderActions) {
      setPageHeaderActions(null);
      return;
    }

    setPageHeaderActions(
      <div className={styles.headerActions}>
        {saveStatus !== "idle" ? (
          <span
            className={`${styles.headerSaveStatus} ${
              saveStatus === "error" ? styles.saveStatusError : ""
            }`}
          >
            {saveStatusLabel}
          </span>
        ) : null}
        {/* Same chip shape as the countdown beside it, filled so it still reads as the main action. */}
        <button
          type="button"
          className={styles.headerSubmitButton}
          data-testid="paper-exam-open-submit-review-btn"
          onClick={openSubmitReview}
          disabled={!isInProgress}
        >
          {t("answering.submit.button")}
          <SendFilled size={14} aria-hidden="true" />
        </button>
      </div>,
    );

    return () => {
      setPageHeaderActions(null);
    };
  }, [
    saveStatus,
    saveStatusLabel,
    isInProgress,
    openSubmitReview,
    setPageHeaderActions,
    shouldUseHeaderActions,
    t,
  ]);

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

  if (isSubmitted) {
    return (
      <div className={styles.centered}>
        <CheckmarkFilled size={48} style={{ color: "var(--cds-support-success)" }} />
        <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          {t("answering.finish.submitted")}
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
        <Loading
          withOverlay={false}
          small
          description={t("answering.loading")}
        />
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
        workbench
        items={items}
        answeredIds={answeredIds}
        markedIds={markedIds}
        styles={styles}
        syncIndex={syncIndex}
        renderItem={renderItem}
        onActiveIndexChange={handleActiveIndexChange}
        showToolbar={!isRuntime}
        externalNavigator={isRuntime}
        overviewLabel={t("contestShell.backToContestHome", "返回競賽主頁")}
        onSelectOverview={() => dashboardPath && navigate(dashboardPath)}
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
        <HandInCheck tiles={handInTiles} onSelect={openQuestionFromHandIn} />
      </Modal>
      <ExamSubmissionProgressModal
        state={submitProgress.state}
        onRequestClose={submitProgress.close}
      />
    </>
  );
};

export default PaperExamAnsweringScreen;
