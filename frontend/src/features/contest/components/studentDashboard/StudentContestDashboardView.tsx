import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";
import GradeAppealDialog from "@/features/contest/components/GradeAppealDialog";
import { useGradeAppeals } from "@/features/contest/hooks/useGradeAppeals";
import { useQueryClient } from "@tanstack/react-query";
import refreshStyles from "@/shared/ui/RefreshAnimation.module.scss";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QRCodeSVG } from "@rc-component/qrcode";
import {
  Button,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
} from "@carbon/react";
import {
  ArrowRight,
  Download,
  Flag,
  Launch,
  Play,
  QrCode,
  Renew,
  Time,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";

import type {
  ContestDetail,
  ExamQuestion,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import { getContestState } from "@/core/entities/contest.entity";
import { downloadMyReport } from "@/infrastructure/api/repositories";
import {
  getExamDashboardSummary,
  type ExamDashboardSummaryDto,
} from "@/infrastructure/api/repositories/exam.repository";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import {
  getExamResults,
  getMyExamAnswers,
  type ExamAnswer,
  type ExamResults,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { formatScore, formatScoreCompact } from "@/features/contest/utils/scoreFormat";
import { MobileActionFooter } from "@/shared/ui/MobileActionFooter";
import { useInterval } from "@/shared/hooks/useInterval";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { usePageHeaderActions } from "@/features/app/contexts/PageHeaderActionsContext";
import {
  BlockHeader,
} from "@/shared/components/dashboard";
import { buildStudentLocatorQrValue } from "@/features/contest/attendance/attendanceQr";
import { isContestParticipant } from "@/features/contest/domain/contestRuntimePolicy";
import PaperQuestionReportCard from "@/features/contest/components/exam/PaperQuestionReportCard";
import { getMarkedQuestionIds } from "@/features/contest/screens/paperExam/hooks";
import { formatContestCompactDuration } from "@/features/contest/utils/contestTimeFormat";
import {
  buildCodingProgressSummary,
  buildCodingResultItems,
  buildPaperProgressSummary,
  resolveResultTileState,
  resolveStudentContestPhase,
  type StudentResultItem,
} from "./studentDashboardState";
import styles from "./StudentContestDashboard.module.scss";
import { ExamOverviewLayout } from "../layout/ExamOverviewLayout";
import { HandInCheck } from "../exam/HandInCheck";
import { isSubjectiveType } from "../../screens/settings/grading/gradingTypes";
import { ExamResultReport, type ExamClassStanding, type ExamResultTile, type ExamResultTileState } from "./ExamResultReport";
import { useExamReviewSlot } from "@/features/contest/contexts/ExamReviewSlotContext";
import CodingAnswerRecords from "./CodingAnswerRecords";
import PaperAnswerRecordsTable from "./PaperAnswerRecordsTable";

const ATTENDANCE_READY_STATUSES = new Set(["photo_confirmed", "teacher_assisted"]);

interface StudentContestDashboardProps {
  contest: ContestDetail;
  onStartExam?: () => void;
  onEndExam?: () => void;
  onGoToAnswering?: () => void;
  onOpenAdminPanel?: () => void;
  onRefreshContest?: () => Promise<void>;
  isAdmin?: boolean;
}

interface PaperExamDashboardData {
  loading: boolean;
  error: string | null;
  questions: ExamQuestion[];
  answers: ExamAnswer[];
  results: ExamResults | null;
}

const EMPTY_PAPER_DATA: PaperExamDashboardData = {
  loading: false,
  error: null,
  questions: [],
  answers: [],
  results: null,
};

const QUESTION_TYPE_LABEL: Record<string, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "申論題",
};

const CONTEST_STATE_REFRESH_INTERVAL_MS = 30_000;



export default function StudentContestDashboard({
  contest,
  onStartExam,
  onEndExam,
  onGoToAnswering,
  onOpenAdminPanel,
  onRefreshContest,
  isAdmin = false,
}: StudentContestDashboardProps) {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { classroomId } = useParams();
  const { user } = useAuth();
  const appealEnabled = contest.contestType === "paper_exam" && contest.resultsPublished;
  const { appeals, refresh: refreshAppeals } = useGradeAppeals(contest.id, !!appealEnabled);
  const [appealTarget, setAppealTarget] = useState<{ answerId: number; appealId?: number; prompt: string; label?: string } | null>(null);
  const tr = useCallback(
    (
      key: string,
      defaultValue: string,
      values?: Record<string, string | number>,
    ) => {
      const translated = values
        ? t(key, { defaultValue, ...values })
        : t(key, defaultValue);
      const template = typeof translated === "string" ? translated : defaultValue;
      return template.replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name] ?? ""),
      );
    },
    [t],
  );
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const reviewSlot = useExamReviewSlot();
  const setHasRecords = reviewSlot?.setHasRecords;
  useEffect(() => {
    if (!setHasRecords) return;
    setHasRecords(true);
    return () => setHasRecords(false);
  }, [setHasRecords]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showStudentQrModal, setShowStudentQrModal] = useState(false);
  const [reportLanguage, setReportLanguage] = useState("zh-TW");
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [paperData, setPaperData] =
    useState<PaperExamDashboardData>(EMPTY_PAPER_DATA);
  const [scoreSummary, setScoreSummary] =
    useState<ExamDashboardSummaryDto | null>(null);
  const [paperReloadKey, setPaperReloadKey] = useState(0);
  const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<string>>(
    () => getMarkedQuestionIds(contest.id),
  );
  const contestRefreshInFlight = useRef(false);
  const showMobileActionFooter = useMediaQuery("(max-width: 672px)");
  const setPageHeaderActions = usePageHeaderActions();

  const phase = resolveStudentContestPhase(contest, nowMs);
  const participant = isContestParticipant(contest);
  const contestState = getContestState({
    status: contest.status,
    startTime: contest.startTime,
    endTime: contest.endTime,
  });
  const examStatus = contest.examStatus ?? "not_started";
  const hasAnswerRecord =
    contest.resultsPublished ||
    examStatus !== "not_started" ||
    !!contest.hasStarted ||
    !!contest.startedAt ||
    contest.problems.some((problem) => !!problem.userStatus);
  const shouldLoadPaperData =
    contest.contestType === "paper_exam" &&
    participant &&
    hasAnswerRecord &&
    phase !== "before";

  useInterval(() => setNowMs(Date.now()), phase !== "after" ? 1000 : null);

  const handleManualRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.allSettled([
        onRefreshContest?.(),
        queryClient.invalidateQueries({ queryKey: ["contestStandings", contest.id] }),
        queryClient.invalidateQueries({ queryKey: ["contestClarifications", contest.id] }),
        queryClient.invalidateQueries({ queryKey: ["contestSubmissions", contest.id] }),
      ]);
      setPaperReloadKey((value) => value + 1);
    } finally {
      setRefreshing(false);
    }
  }, [onRefreshContest, queryClient, contest.id, refreshing]);

  // 重新整理放在 workspace top bar，讓所有競賽狀態共用同一個入口。
  useEffect(() => {
    setPageHeaderActions(
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        renderIcon={Renew}
        className={refreshing ? refreshStyles.refreshing : undefined}
        aria-busy={refreshing}
        disabled={refreshing}
        iconDescription={refreshing ? t("adminOverview.screen.actions.refreshing", "重新整理中") : t("studentDashboard.actions.refresh", "重新整理")}
        onClick={handleManualRefresh}
      />,
    );
    return () => setPageHeaderActions(null);
  }, [handleManualRefresh, refreshing, setPageHeaderActions, t]);

  const refreshContestState = useCallback(async () => {
    if (
      !onRefreshContest ||
      document.visibilityState === "hidden" ||
      contestRefreshInFlight.current
    ) {
      return;
    }

    contestRefreshInFlight.current = true;
    try {
      await onRefreshContest();
    } catch {
      // Keep the current dashboard usable when a background refresh fails.
    } finally {
      contestRefreshInFlight.current = false;
    }
  }, [onRefreshContest]);

  useInterval(
    () => {
      void refreshContestState();
    },
    participant && phase !== "before" && onRefreshContest
      ? CONTEST_STATE_REFRESH_INTERVAL_MS
      : null,
  );

  useEffect(() => {
    if (!participant || phase === "before" || !onRefreshContest) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshContestState();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onRefreshContest, participant, phase, refreshContestState]);

  useEffect(() => {
    if (!shouldLoadPaperData) {
      setPaperData(EMPTY_PAPER_DATA);
      setMarkedQuestionIds(getMarkedQuestionIds(contest.id));
      return;
    }

    let cancelled = false;
    setPaperData((previous) => ({ ...previous, loading: true, error: null }));
    setMarkedQuestionIds(getMarkedQuestionIds(contest.id));
    const load = async () => {
      const [questionsResult, answersResult] =
        await Promise.allSettled([
          getExamQuestions(contest.id),
          contest.resultsPublished
            ? getExamResults(contest.id)
            : getMyExamAnswers(contest.id),
        ]);
      if (cancelled) return;

      const questions =
        questionsResult.status === "fulfilled"
          ? questionsResult.value.slice().sort((a, b) => a.order - b.order)
          : [];
      const answers =
        answersResult.status === "fulfilled" && !contest.resultsPublished
          ? answersResult.value as ExamAnswer[]
          : [];
      const results =
        answersResult.status === "fulfilled" && contest.resultsPublished
          ? answersResult.value as ExamResults
          : null;

      setPaperData({
        loading: false,
        // A failed answer load must not read as "every question unanswered".
        error:
          questionsResult.status === "rejected"
            ? tr(
                "studentDashboard.errors.questionsLoadFailed",
                "題目資料暫時無法載入",
              )
            : answersResult.status === "rejected"
              ? tr(
                  "studentDashboard.errors.answersLoadFailed",
                  "作答紀錄暫時無法載入",
                )
              : null,
        questions,
        answers,
        results,
      });
      setMarkedQuestionIds(getMarkedQuestionIds(contest.id));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    contest.contestType,
    contest.id,
    contest.resultsPublished,
    paperReloadKey,
    shouldLoadPaperData,
  ]);

  useEffect(() => {
    if (
      // The class summary has the same shape for paper and coding exams.
      !participant ||
      !contest.resultsPublished
    ) {
      setScoreSummary(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const summary = await getExamDashboardSummary(contest.id);
        if (!cancelled) setScoreSummary(summary);
      } catch {
        // Without the summary the overview simply leaves out the class standing.
        if (!cancelled) setScoreSummary(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    contest.contestType,
    contest.id,
    contest.resultsPublished,
    participant,
    paperReloadKey,
  ]);

  const progressSummary = useMemo(() => {
    if (contest.contestType === "paper_exam") {
      return buildPaperProgressSummary(
        paperData.questions,
        paperData.results?.answers ?? paperData.answers,
        paperData.results,
      );
    }
    return buildCodingProgressSummary(contest);
  }, [contest, paperData]);

  // After submission the overview reads like a report card: one tile per question.
  const reportMode =
    participant &&
    hasAnswerRecord &&
    (phase === "after" || examStatus === "submitted") &&
    // A failed answer load must not paint every question as unanswered.
    !(contest.contestType === "paper_exam" && (paperData.loading || paperData.error));
  // Both exam types reduce to the same items, so the report reads one way for either.
  const resultItems = useMemo<StudentResultItem[]>(() => {
    if (contest.contestType !== "paper_exam") return buildCodingResultItems(contest);
    const labels = buildPaperQuestionLabels(paperData.questions);
    const results = new Map((paperData.results?.answers ?? []).map((result) => [String(result.questionId), result]));
    const answers = new Map(paperData.answers.map((answer) => [String(answer.questionId), answer]));
    return paperData.questions.map((question, index) => {
      const id = String(question.id);
      const result = results.get(id);
      return {
        key: id,
        label: labels.get(question.id)?.label ?? String(index + 1),
        answered: !!(result?.answer ?? answers.get(id)?.answer),
        // Only the policy-adjusted score counts; an excluded question's raw grade must not show.
        score: contest.resultsPublished ? result?.effectiveScore ?? null : null,
        maxScore: result?.effectiveMaxScore ?? question.score,
      };
    });
  }, [contest, paperData]);
  const resultTiles = useMemo<ExamResultTile[]>(() => {
    const stateLabel: Record<ExamResultTileState, string> = {
      full: t("workspace.report.full", "滿分"),
      partial: t("workspace.report.partial", "部分得分"),
      zero: t("workspace.report.zero", "未得分"),
      answered: t("workspace.report.answered", "已作答"),
      unanswered: t("workspace.report.unanswered", "未作答"),
      accepted: t("workspace.report.accepted", "已通過"),
      attempted: t("workspace.report.attempted", "未通過"),
    };
    return resultItems.map((item) => {
      const state = resolveResultTileState(item);
      return {
        key: item.key,
        label: item.label,
        state,
        detail: item.answered && item.score !== null
          ? t("workspace.report.points", `${formatScoreCompact(item.score)} / ${formatScoreCompact(item.maxScore)} 分`, {
              score: formatScoreCompact(item.score),
              max: formatScoreCompact(item.maxScore),
            })
          : stateLabel[state],
      };
    });
  }, [resultItems, t]);

  const canStartExam =
    participant &&
    contest.status === "published" &&
    phase === "during" &&
    examStatus === "not_started" &&
    (contest.attendanceStatus?.canStartExam ?? true);
  const canResumeExam = participant && examStatus === "paused";
  const canGoToAnswering = participant && examStatus === "in_progress";
  const canSubmitExam = participant && examStatus === "in_progress";
  const canRestartSubmittedExam =
    participant &&
    contest.status === "published" &&
    contestState !== "ended" &&
    examStatus === "submitted" &&
    contest.allowMultipleJoins;
  const checkInCompleted = ATTENDANCE_READY_STATUSES.has(
    contest.attendanceStatus?.checkInStatus ?? "",
  );
  const checkOutCompleted = ATTENDANCE_READY_STATUSES.has(
    contest.attendanceStatus?.checkOutStatus ?? "",
  );
  const canOpenAttendanceScanner = !!(
    (contest.attendanceStatus?.canCheckOut && !checkOutCompleted) ||
    (contest.attendanceStatus?.canCheckIn && !checkInCompleted)
  );
  const studentLocatorQrValue =
    participant && contest.attendanceCheckEnabled && user?.id
      ? buildStudentLocatorQrValue(contest.id, user.id)
      : "";
  const scoreDisplay = contest.resultsPublished
    ? progressSummary.totalScore === null
      ? t("studentDashboard.results.published", "成績已發布")
      : `${formatScore(progressSummary.totalScore)} / ${formatScore(progressSummary.maxScore)}`
    : t("studentDashboard.results.unpublished", "尚未發布");
  const afterPhaseValue =
    contest.contestType === "paper_exam" && paperData.loading
      ? t("studentDashboard.loading", "載入中...")
      : scoreDisplay;
  const gradeMark =
    phase === "after" &&
    contest.resultsPublished &&
    progressSummary.totalScore !== null &&
    !(contest.contestType === "paper_exam" && paperData.loading)
      ? {
          score: formatScoreCompact(progressSummary.totalScore),
          max: formatScoreCompact(progressSummary.maxScore),
          label: t("studentDashboard.summary.examResult", "考試成績"),
        }
      : undefined;
  // Placeholder for the teacher's "share class average" setting; the report is laid out for both cases.
  const showClassAverage = true;
  const classStanding: ExamClassStanding | undefined =
    showClassAverage && contest.resultsPublished && scoreSummary
      ? {
          average: scoreSummary.summary.average_score,
          max: scoreSummary.summary.max_total_score,
          score: progressSummary.totalScore,
          distribution: scoreSummary.score_distribution.map((bucket) => bucket.count),
        }
      : undefined;
  const reportDownloadLabel = contest.resultsPublished
    ? t("studentDashboard.actions.downloadReport", "下載成績單")
    : t("studentDashboard.actions.downloadProof", "下載作答證明");
  const startMs = Date.parse(contest.startTime);
  const endMs = Date.parse(contest.endTime);
  const durationDisplay =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? formatContestCompactDuration(endMs - startMs)
      : "-";

  const handleDownloadReport = async () => {
    setReportError(null);
    setReportDownloading(true);
    try {
      await downloadMyReport(contest.id, reportLanguage);
      setShowReportModal(false);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : t("report.failed"));
    } finally {
      setReportDownloading(false);
    }
  };

  const renderAttendanceAction = () => {
    if (!canOpenAttendanceScanner || !classroomId) {
      return null;
    }

    const attendancePurpose = contest.attendanceStatus?.canCheckOut ? "check_out" : "check_in";
    const attendanceActionLabel = contest.attendanceStatus?.canCheckOut
      ? t("studentDashboard.attendance.checkOut", "前往簽退")
      : t("studentDashboard.attendance.checkIn", "前往簽到");
    const attendanceActionKind =
      contest.attendanceStatus?.canCheckOut || examStatus !== "submitted"
        ? "primary"
        : "secondary";

    return (
      <Button
        kind={attendanceActionKind}
        renderIcon={ArrowRight}
        onClick={() => navigate(
          `/classrooms/${classroomId}/contest/${contest.id}/attendance/scan?purpose=${attendancePurpose}`,
        )}
      >
        {attendanceActionLabel}
      </Button>
    );
  };

  const renderEntryAction = () => {
    // Eligibility is classroom membership, so there is nothing to join: a
    // student either can start (the attempt record is created then) or is
    // not part of this contest at all.
    if (!participant) {
      return null;
    }
    if (canStartExam || canResumeExam) {
      return (
        <Button renderIcon={Play} onClick={onStartExam}>
          {canResumeExam
            ? t("studentDashboard.actions.resume", "恢復作答")
            : t("studentDashboard.actions.start", "開始作答")}
        </Button>
      );
    }
    if (canGoToAnswering) {
      return (
        <Button renderIcon={Launch} onClick={onGoToAnswering}>
          {t("studentDashboard.actions.backToAnswering", "前往作答區")}
        </Button>
      );
    }
    if (examStatus === "submitted") {
      return canRestartSubmittedExam ? (
        <Button renderIcon={Play} onClick={onStartExam}>
          {t("studentDashboard.actions.rejoin", "重新加入")}
        </Button>
      ) : null;
    }
    return (
      <Button kind="secondary" disabled renderIcon={Time}>
        {phase === "before"
          ? t("studentDashboard.actions.waitingStart", "等待開始")
          : t("studentDashboard.actions.unavailable", "不可作答")}
      </Button>
    );
  };

  const renderReportAction = () => {
    if (examStatus !== "submitted") return null;
    return (
      <Button
        kind="ghost"
        renderIcon={Download}
        onClick={() => setShowReportModal(true)}
      >
        {reportDownloadLabel}
      </Button>
    );
  };

  const renderStudentQrNavbarAction = () => {
    if (!studentLocatorQrValue) return null;
    return (
      <Button
        kind="ghost"
        hasIconOnly
        renderIcon={QrCode}
        iconDescription={t("studentDashboard.studentQr.heading", "我的考生 QR")}
        onClick={() => setShowStudentQrModal(true)}
      />
    );
  };

  const renderSubmitAction = () => {
    if (!canSubmitExam) return null;
    return (
      <Button
        kind="danger"
        renderIcon={Flag}
        onClick={() => setShowEndConfirm(true)}
      >
        {t("studentDashboard.actions.submit", "交卷")}
      </Button>
    );
  };

  const renderAdminPanelAction = () => {
    if (!isAdmin || !onOpenAdminPanel) return null;
    return (
      <Button kind="ghost" renderIcon={Launch} onClick={onOpenAdminPanel}>
        {t("studentDashboard.actions.adminPanel", "管理後台")}
      </Button>
    );
  };

  const buildActionSetItems = (): Array<{ key: string; node: ReactNode }> => {
    const entryAction = renderEntryAction();
    const attendanceAction = renderAttendanceAction();
    const reportAction = renderReportAction();
    const submitAction = renderSubmitAction();
    const adminAction = renderAdminPanelAction();

    const candidates: Array<{ key: string; node: ReactNode }> = canSubmitExam
      ? [
          { key: "entry", node: entryAction },
          { key: "submit", node: submitAction },
        ]
      : examStatus === "submitted"
        ? [
            { key: "admin", node: adminAction },
            { key: "report", node: reportAction },
            { key: "attendance", node: attendanceAction },
            { key: "entry", node: entryAction },
          ]
        : [
            { key: "admin", node: adminAction },
            { key: "entry", node: entryAction },
            { key: "attendance", node: attendanceAction },
            { key: "report", node: reportAction },
          ];

    const actions: Array<{ key: string; node: ReactNode }> = [];
    for (const item of candidates) {
      if (item.node === null) continue;
      actions.push(item);
      if (actions.length === 2) break;
    }
    return actions;
  };

  const renderCodingRecords = () => {
    if (!hasAnswerRecord) {
      return (
        <p className={styles.emptyText}>
          {t("studentDashboard.empty.noAnswerRecords", "尚無作答紀錄。")}
        </p>
      );
    }

    return <CodingAnswerRecords contestId={contest.id} problems={contest.problems} />;
  };

  const renderPaperRecords = () => {
    if (!hasAnswerRecord || phase === "before") {
      return (
        <p className={styles.emptyText}>
          {t("studentDashboard.empty.noAnswerRecords", "尚無作答紀錄。")}
        </p>
      );
    }
    if (paperData.loading) {
      return (
        <p className={styles.emptyText}>
          {t("studentDashboard.loadingAnswers", "載入作答資料中...")}
        </p>
      );
    }
    if (paperData.error) return <p className={styles.errorText}>{paperData.error}</p>;
    if (!paperData.questions.length) {
      return (
        <p className={styles.emptyText}>
          {t("studentDashboard.empty.noQuestions", "尚無題目資料。")}
        </p>
      );
    }

    const questionLabels = buildPaperQuestionLabels(paperData.questions);
    const resultMap = new Map(
      (paperData.results?.answers ?? []).map((result) => [
        String(result.questionId),
        result,
      ]),
    );
    const answerMap = new Map(
      paperData.answers.map((answer) => [String(answer.questionId), answer]),
    );

    return (
      <PaperAnswerRecordsTable layout={reviewSlot ? "document" : "table"} key={contest.id} showGrading={contest.resultsPublished} rows={paperData.questions.map((question, index) => {
          const result = resultMap.get(String(question.id));
          const answer = answerMap.get(String(question.id));
          const marked = markedQuestionIds.has(String(question.id));
          const answerPayload = result?.answer ?? answer?.answer;
          const answered = !!answerPayload;
          const questionType = (
            result?.questionType ??
            question.questionType
          ) as ExamQuestionType;
          const maxScore =
            result?.effectiveMaxScore ?? question.score;
          const status =
            marked
              ? {
                  label: t("studentDashboard.answerStatus.marked", "已標記"),
                  tone: "warm-gray" as const,
                  emphasis: "warning" as const,
                }
              : !answered
              ? {
                  label: t("studentDashboard.answerStatus.unanswered", "未作答"),
                  tone: "warm-gray" as const,
                }
              : !contest.resultsPublished
                ? {
                    label: t("studentDashboard.answerStatus.answered", "已作答"),
                    tone: "cool-gray" as const,
                  }
                : result?.isCorrect === true
                  ? {
                      label: t("studentDashboard.answerStatus.correct", "正確"),
                      tone: "green" as const,
                    }
                  : result?.isCorrect === false
                    ? (result?.score ?? 0) > 0
                      ? {
                          label: t(
                            "studentDashboard.answerStatus.partial",
                            "部分得分",
                          ),
                          tone: "cyan" as const,
                        }
                      : {
                          label: t(
                            "studentDashboard.answerStatus.noScore",
                            "未得分",
                          ),
                          tone: "red" as const,
                        }
                    : {
                        label: result?.score != null || result?.gradedAt
                          ? t("studentDashboard.answerStatus.graded", "已批改")
                          : t("studentDashboard.answerStatus.pendingGrading", "待批改"),
                        tone: "warm-gray" as const,
                      };
          const prompt =
            result?.questionPrompt ??
            question.prompt;

          const label = questionLabels.get(question.id)?.label ?? String(index + 1);
          const scoreText = question.scorePolicy === "redistribute" ? "— / —"
            : `${question.scorePolicy === "excluded" ? "—" : formatScore(result?.effectiveScore)} / ${formatScore(maxScore)}`;
          return {
            id: String(question.id), label,
            typeLabel: t(`common:questionType.label.${questionType}`, QUESTION_TYPE_LABEL[questionType] ?? questionType) + (question.scorePolicy === "excluded" ? " · 不計分" : question.scorePolicy === "full_marks" ? " · 送分" : question.scorePolicy === "redistribute" ? " · 配分重分配" : ""),
            score: scoreText, status: status.label, tone: status.tone,
            detail: <PaperQuestionReportCard
              hideHeader
              key={question.id}
              questionId={String(question.id)}
              index={index + 1}
              questionLabel={questionLabels.get(question.id)?.label}
              questionType={questionType}
              answerFormat={question.answerFormat}
              typeLabel={t(
                `common:questionType.label.${questionType}`,
                QUESTION_TYPE_LABEL[questionType] ?? questionType,
              )}
              prompt={prompt}
              options={question.options}
              answer={answerPayload ?? {}}
              statusLabel={status.label}
              statusTone={status.tone}
              statusEmphasis={status.emphasis}
              showGrading={contest.resultsPublished}
              score={result?.effectiveScore}
              maxScore={maxScore}
              gradedByUsername={result?.gradedByUsername}
              feedback={result?.feedback}
              // Students see the question, their answer and the grading only: the correct option
              // marks choice answers, but reference answers and explanations stay with teachers.
              correctAnswer={isSubjectiveType(questionType) ? undefined : question.correctAnswer}
              scorePolicy={question.scorePolicy}
              actions={contest.resultsPublished && result?.score != null ? <Button kind="tertiary" size="sm" onClick={() => setAppealTarget({ answerId: Number(result.id), appealId: appeals.find(a => a.exam_answer === Number(result.id))?.id, prompt, label: questionLabels.get(question.id)?.label })}>{appeals.some(a => a.exam_answer === Number(result.id)) ? "查看申訴" : "提出申訴"}</Button> : undefined}
            />,
          };
        })} />
    );
  };


  // Records and results live on the workspace review page; standalone renders keep them inline.
  const recordsSection = (
    <section className={styles.records} aria-label={t("studentDashboard.tabs.records", "作答紀錄")}>
      {reviewSlot && <div className={styles.recordActions}>{renderReportAction()}</div>}
      {reviewSlot && <dl className={styles.recordSummary}>
        <div><dt>{t("workspace.report.title", "作答情況")}</dt><dd>{resultItems.filter(item => item.answered).length} / {resultItems.length}</dd></div>
        <div><dt>{t("workspace.standings.score", "分數")}</dt><dd>{contest.resultsPublished ? scoreDisplay : t("workspace.review.unpublished", "成績未公布")}</dd></div>
      </dl>}
      {!reviewSlot && <BlockHeader
        titleAs="h3"
        title={
          phase === "during"
            ? t("studentDashboard.records.currentStatus", "目前作答狀況")
            : phase === "after" && contest.resultsPublished
              ? t("studentDashboard.records.withResults", "作答紀錄與成績")
              : t("studentDashboard.records.title", "作答紀錄")
        }
      />}
      {contest.contestType === "paper_exam" ? renderPaperRecords() : renderCodingRecords()}
    </section>
  );

  return (
    <>
    {appealEnabled && appealTarget && <GradeAppealDialog key={appealTarget.answerId} contestId={contest.id} answerId={appealTarget.answerId} appealId={appealTarget.appealId} questionPrompt={appealTarget.prompt} questionLabel={appealTarget.label} managing={false} onClose={() => { setAppealTarget(null); setPaperReloadKey(k => k + 1); }} onChanged={() => void refreshAppeals()} />}
    <ExamOverviewLayout
      ariaLabel={t("studentDashboard.ariaLabel", "學生競賽首頁")}
      title={contest.name}
      description={contest.description || t("workspace.overview.defaultDescription", "請閱讀考試資訊，準備好後即可進入作答。")}
      rules={contest.rules?.trim() ? { title: t("workspace.overview.rules", "應試規則"), body: contest.rules } : null}
      schedule={{
        startTime: contest.startTime,
        endTime: contest.endTime,
        duration: durationDisplay,
        serverTimeOffsetMs: contest.serverTimeOffsetMs,
      }}
      // The question count stays hidden until the student has started.
      progress={!reportMode && hasAnswerRecord && progressSummary.totalItems > 0 ? {
        done: progressSummary.completedItems,
        total: progressSummary.totalItems,
        label: contest.contestType === "coding"
          ? t("workspace.status.accepted", "已通過")
          : t("workspace.status.answered", "已作答"),
      } : undefined}
      grade={gradeMark}
      report={reportMode ? (
        <ExamResultReport
          tiles={resultTiles}
          classStanding={classStanding}
          onOpenDetails={reviewSlot?.openReview}
          formatScore={formatScoreCompact}
        />
      ) : undefined}
      facts={phase === "after" ? [
        // The red-pen grade replaces this figure once there is a score to mark.
        ...(gradeMark ? [] : [{
          key: "result",
          label: contest.resultsPublished ? t("studentDashboard.summary.examResult", "考試成績") : t("studentDashboard.summary.examStatus", "考試狀態"),
          value: contest.resultsPublished ? afterPhaseValue : t("studentDashboard.results.waitingPublish", "等待成績發布"),
        }]),
      ] : []}
      actions={!showMobileActionFooter ? (
        <>
          {renderStudentQrNavbarAction()}
          {buildActionSetItems().map((item) => <Fragment key={item.key}>{item.node}</Fragment>)}
        </>
      ) : null}
      details={reviewSlot ? undefined : recordsSection}
    />
    {reviewSlot?.target ? createPortal(recordsSection, reviewSlot.target) : null}

      <MobileActionFooter>
        {buildActionSetItems().map((item) => (
          <Fragment key={item.key}>{item.node}</Fragment>
        ))}
      </MobileActionFooter>

      <Modal
        open={showEndConfirm}
        modalHeading={t("studentDashboard.submitConfirm.heading", "確認交卷")}
        primaryButtonText={t("studentDashboard.submitConfirm.confirm", "確認交卷")}
        secondaryButtonText={tc("button.cancel")}
        danger
        onRequestSubmit={() => {
          setShowEndConfirm(false);
          onEndExam?.();
        }}
        onRequestClose={() => setShowEndConfirm(false)}
      >
        <HandInCheck tiles={resultTiles} />
      </Modal>

      <Modal
        open={showReportModal}
        modalHeading={reportDownloadLabel}
        primaryButtonText={
          reportDownloading
            ? t("studentDashboard.report.preparing", "準備中")
            : t("studentDashboard.report.download", "下載")
        }
        secondaryButtonText={tc("button.cancel")}
        primaryButtonDisabled={reportDownloading}
        onRequestSubmit={handleDownloadReport}
        onRequestClose={() => {
          if (!reportDownloading) setShowReportModal(false);
        }}
        size="xs"
      >
        <div className={styles.modalStack}>
          <Select
            id="student-contest-report-language"
            labelText={t("studentDashboard.report.language", "報告語言")}
            value={reportLanguage}
            onChange={(event) => setReportLanguage(event.target.value)}
          >
            <SelectItem
              value="zh-TW"
              text={t("studentDashboard.report.languages.zhTW", "繁體中文")}
            />
            <SelectItem
              value="en"
              text={t("studentDashboard.report.languages.en", "English")}
            />
            <SelectItem
              value="ja"
              text={t("studentDashboard.report.languages.ja", "日本語")}
            />
            <SelectItem
              value="ko"
              text={t("studentDashboard.report.languages.ko", "한국어")}
            />
          </Select>
          {reportError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t("studentDashboard.report.failedTitle", "下載失敗")}
              subtitle={reportError}
            />
          ) : null}
        </div>
      </Modal>

      <Modal
        open={showStudentQrModal}
        passiveModal
        modalHeading={t("studentDashboard.studentQr.heading", "我的考生 QR")}
        onRequestClose={() => setShowStudentQrModal(false)}
        size="xs"
      >
        <div className={styles.studentQrModal}>
          <div className={styles.studentQrFrame}>
            {studentLocatorQrValue ? (
              <QRCodeSVG value={studentLocatorQrValue} size={220} />
            ) : null}
          </div>
          <p>
            {t(
              "studentDashboard.studentQr.description",
              "請讓助教掃描此 QR，以快速找到你的考試資料。",
            )}
          </p>
        </div>
      </Modal>
    </>
  );
}
