import { useCallback, useEffect, useMemo, useState } from "react";
import { ScaleTypes } from "@carbon/charts";
import { LollipopChart } from "@carbon/charts-react";
import "@carbon/charts-react/styles.css";
import {
  Button,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  SkeletonPlaceholder,
  Tag,
} from "@carbon/react";
import {
  Checkmark,
  Document,
  Flag,
  Launch,
  Login,
  Play,
  Renew,
  Time,
  WarningAlt,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

import type {
  ContestAnnouncement,
  ContestDetail,
  ExamQuestion,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import { downloadMyReport } from "@/infrastructure/api/repositories";
import { getContestAnnouncements } from "@/infrastructure/api/repositories/contestAnnouncements.repository";
import {
  getExamDashboardSummary,
  type ExamDashboardSummaryDto,
} from "@/infrastructure/api/repositories/exam.repository";
import { mapContestAnnouncementDto } from "@/infrastructure/mappers/contest.mapper";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import {
  getExamResults,
  getMyExamAnswers,
  type ExamAnswer,
  type ExamAnswerDetail,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { formatDate } from "@/shared/utils/format";
import { useInterval } from "@/shared/hooks/useInterval";
import {
  BlockHeader,
  DashboardBlock,
  DashboardContainer,
  DashboardPage,
  DashboardTabBar,
  DashboardTabPanel,
  DashboardTabs,
  KPIBlock,
  MetricBlock,
} from "@/shared/components/dashboard";
import { CountdownProgress } from "@/features/contest/components/CountdownProgress";
import { ContestRegistrationModal } from "@/features/contest/components/modals/ContestRegistrationModal";
import PaperQuestionReportCard from "@/features/contest/components/exam/PaperQuestionReportCard";
import { getMarkedQuestionIds } from "@/features/contest/screens/paperExam/hooks";
import {
  buildCodingProgressSummary,
  formatCompactDuration,
  resolveStudentContestPhase,
} from "./studentDashboardState";
import styles from "./StudentContestDashboard.module.scss";

const ATTENDANCE_READY_STATUSES = new Set(["photo_confirmed", "teacher_assisted"]);

interface StudentContestDashboardProps {
  contest: ContestDetail;
  onJoin?: () => void;
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
  results: ExamAnswerDetail[];
}

const EMPTY_PAPER_DATA: PaperExamDashboardData = {
  loading: false,
  error: null,
  questions: [],
  answers: [],
  results: [],
};

const isParticipant = (contest: ContestDetail): boolean =>
  contest.hasJoined;

const QUESTION_TYPE_LABEL: Record<string, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "申論題",
};

const PASSING_SCORE_THRESHOLD_PERCENT = 60;

// 公告 block 暫時隱藏（資料拉取與渲染邏輯保留，flip 為 true 即可恢復）
const SHOW_ANNOUNCEMENTS = false;

const resolveCarbonChartTheme = (
  theme: string,
): "white" | "g10" | "g90" | "g100" => {
  switch (theme) {
    case "g10":
    case "g90":
    case "g100":
    case "white":
      return theme;
    default:
      return "white";
  }
};

const getBucketUpperPercent = (label: string): number | null => {
  const values = label.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length === 0) return null;
  return Math.max(...values);
};

const isFailingScoreBucket = (label: string) => {
  const upperPercent = getBucketUpperPercent(label);
  return (
    upperPercent !== null && upperPercent < PASSING_SCORE_THRESHOLD_PERCENT
  );
};

const buildPaperProgressSummary = (
  questions: ExamQuestion[],
  answers: Array<Pick<ExamAnswer, "questionId"> & Partial<Pick<ExamAnswerDetail, "score">>>,
  resultsPublished: boolean,
) => {
  const resultQuestionIds = new Set(answers.map((answer) => answer.questionId));
  const completedItems = questions.filter((question) =>
    resultQuestionIds.has(String(question.id)),
  ).length;
  const totalScore = resultsPublished
    ? answers.reduce((sum, answer) => sum + (answer.score ?? 0), 0)
    : null;
  const maxScore = questions.reduce(
    (sum, question) => sum + (question.score ?? 0),
    0,
  );
  return {
    totalItems: questions.length,
    completedItems,
    attemptedItems: completedItems,
    totalScore,
    maxScore,
  };
};

export default function StudentContestDashboard({
  contest,
  onJoin,
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
  const { theme } = useTheme();
  const tr = useCallback(
    (
      key: string,
      defaultValue: string,
      values?: Record<string, string | number>,
    ) => {
      const translated = values
        ? t(key, { defaultValue, ...values })
        : t(key, defaultValue);
      if (typeof translated === "string") return translated;
      return defaultValue.replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name] ?? ""),
      );
    },
    [t],
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [infoTab, setInfoTab] = useState<"rules" | "records">("rules");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLanguage, setReportLanguage] = useState("zh-TW");
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [paperData, setPaperData] =
    useState<PaperExamDashboardData>(EMPTY_PAPER_DATA);
  const [scoreSummary, setScoreSummary] =
    useState<ExamDashboardSummaryDto | null>(null);
  const [scoreSummaryLoading, setScoreSummaryLoading] = useState(false);
  const [scoreSummaryError, setScoreSummaryError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<ContestAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const [paperReloadKey, setPaperReloadKey] = useState(0);
  const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<string>>(
    () => getMarkedQuestionIds(contest.id),
  );

  const phase = resolveStudentContestPhase(contest, nowMs);
  const participant = isParticipant(contest);
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
    !!contest.submittedAt ||
    contest.problems.some((problem) => !!problem.userStatus);
  const shouldLoadPaperData =
    contest.contestType === "paper_exam" &&
    participant &&
    hasAnswerRecord &&
    phase !== "before";

  useInterval(() => setNowMs(Date.now()), phase !== "after" ? 1000 : null);

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
          ? answersResult.value as ExamAnswerDetail[]
          : [];

      setPaperData({
        loading: false,
        error:
          questionsResult.status === "rejected"
            ? tr(
                "studentDashboard.errors.questionsLoadFailed",
                "題目資料暫時無法載入",
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
    if (!contest.id) {
      setAnnouncements([]);
      return;
    }

    let cancelled = false;
    setAnnouncementsLoading(true);
    setAnnouncementsError(null);
    void (async () => {
      try {
        const data = await getContestAnnouncements(contest.id);
        if (cancelled) return;
        setAnnouncements(data.map(mapContestAnnouncementDto));
      } catch (error) {
        if (cancelled) return;
        setAnnouncements([]);
        setAnnouncementsError(
          error instanceof Error
            ? error.message
            : tr(
                "studentDashboard.errors.announcementsLoadFailed",
                "公告暫時無法載入",
              ),
        );
      } finally {
        if (!cancelled) setAnnouncementsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contest.id, paperReloadKey]);

  useEffect(() => {
    if (
      contest.contestType !== "paper_exam" ||
      !participant ||
      !contest.resultsPublished
    ) {
      setScoreSummary(null);
      setScoreSummaryLoading(false);
      setScoreSummaryError(null);
      return;
    }

    let cancelled = false;
    setScoreSummaryLoading(true);
    setScoreSummaryError(null);
    void (async () => {
      try {
        const summary = await getExamDashboardSummary(contest.id);
        if (cancelled) return;
        setScoreSummary(summary);
      } catch (error) {
        if (cancelled) return;
        setScoreSummary(null);
        setScoreSummaryError(
          error instanceof Error
            ? error.message
            : tr(
                "studentDashboard.errors.scoreDistributionLoadFailed",
                "成績分布暫時無法載入",
              ),
        );
      } finally {
        if (!cancelled) setScoreSummaryLoading(false);
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
        contest.resultsPublished ? paperData.results : paperData.answers,
        contest.resultsPublished,
      );
    }
    return buildCodingProgressSummary(contest);
  }, [contest, paperData]);

  const progressPercent =
    progressSummary.totalItems > 0
      ? Math.round(
          (progressSummary.completedItems / progressSummary.totalItems) * 100,
        )
      : 0;

  const canRegister = contest.status === "published" && contestState !== "ended";
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
  const canOpenAttendanceScanner = !!(
    contest.attendanceStatus?.canCheckOut ||
    (contest.attendanceStatus?.canCheckIn && !canStartExam)
  );
  const checkInCompleted = ATTENDANCE_READY_STATUSES.has(
    contest.attendanceStatus?.checkInStatus ?? "",
  );
  const checkOutCompleted = ATTENDANCE_READY_STATUSES.has(
    contest.attendanceStatus?.checkOutStatus ?? "",
  );
  const scoreDisplay = contest.resultsPublished
    ? progressSummary.totalScore === null
      ? t("studentDashboard.results.published", "成績已發布")
      : `${progressSummary.totalScore} / ${progressSummary.maxScore}`
    : t("studentDashboard.results.unpublished", "尚未發布");
  const afterPhaseValue =
    contest.contestType === "paper_exam" && paperData.loading
      ? t("studentDashboard.loading", "載入中...")
      : scoreDisplay;
  const reportDownloadLabel = contest.resultsPublished
    ? t("studentDashboard.actions.downloadReport", "下載成績單")
    : t("studentDashboard.actions.downloadProof", "下載作答證明");
  const startMs = Date.parse(contest.startTime);
  const endMs = Date.parse(contest.endTime);
  const durationDisplay =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? formatCompactDuration(endMs - startMs)
      : "-";
  const chartTheme = resolveCarbonChartTheme(theme);
  const scoreDistributionData = useMemo(
    () =>
      scoreSummary
        ? scoreSummary.score_distribution.map((bucket) => ({
            group: bucket.range_label,
            value: bucket.count,
          }))
        : [],
    [scoreSummary],
  );
  const hasScoreDistributionData = scoreDistributionData.some(
    (item) => item.value > 0,
  );
  const scoreDistributionOptions = useMemo(
    () => ({
      title: "",
      height: "180px",
      theme: chartTheme,
      toolbar: { enabled: false },
      legend: { enabled: false },
      axes: {
        left: {
          mapsTo: "group",
          scaleType: ScaleTypes.LABELS,
          visible: false,
        },
        bottom: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          visible: false,
        },
      },
      grid: {
        x: { enabled: false },
        y: { enabled: false },
      },
      color: {
        scale: (scoreSummary?.score_distribution ?? []).reduce<
          Record<string, string>
        >((acc, bucket) => {
          acc[bucket.range_label] = isFailingScoreBucket(bucket.range_label)
            ? "var(--cds-support-error)"
            : "var(--cds-link-primary)";
          return acc;
        }, {}),
      },
    }),
    [chartTheme, scoreSummary?.score_distribution],
  );

  const handleRegisterSubmit = () => {
    setShowRegisterModal(false);
    onJoin?.();
  };

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

    const attendanceActionLabel = contest.attendanceStatus?.canCheckOut
      ? checkOutCompleted
        ? "重新簽退"
        : "前往簽退"
      : checkInCompleted
        ? "重新簽到"
        : "前往簽到";

    return (
      <Button
        kind={examStatus === "submitted" ? "secondary" : "primary"}
        renderIcon={Login}
        onClick={() => navigate(`/classrooms/${classroomId}/contest/${contest.id}/attendance/scan`)}
      >
        {attendanceActionLabel}
      </Button>
    );
  };

  const renderPrimaryAction = () => {
    if (!participant && phase !== "after") {
      return (
        <Button
          renderIcon={Login}
          disabled={!canRegister}
          onClick={() => setShowRegisterModal(true)}
        >
          {canRegister
            ? t("studentDashboard.actions.join", "加入競賽")
            : t("studentDashboard.actions.joinUnavailable", "目前不可加入")}
        </Button>
      );
    }
    if (examStatus !== "submitted") {
      const attendanceAction = renderAttendanceAction();
      if (attendanceAction) {
        return attendanceAction;
      }
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
          {t("studentDashboard.actions.backToAnswering", "回到作答")}
        </Button>
      );
    }
    if (examStatus === "submitted") {
      return (
        <>
          <Button
            kind="tertiary"
            renderIcon={Document}
            onClick={() => setShowReportModal(true)}
          >
            {reportDownloadLabel}
          </Button>
          {canRestartSubmittedExam ? (
            <Button renderIcon={Play} onClick={onStartExam}>
              {t("studentDashboard.actions.rejoin", "重新加入")}
            </Button>
          ) : null}
        </>
      );
    }
    return (
      <Button kind="secondary" disabled renderIcon={Time}>
        {phase === "before"
          ? t("studentDashboard.actions.waitingStart", "等待開始")
          : t("studentDashboard.actions.unavailable", "不可作答")}
      </Button>
    );
  };

  const renderCodingRecords = () => {
    if (!hasAnswerRecord) {
      return (
        <p className={styles.emptyText}>
          {t("studentDashboard.empty.noAnswerRecords", "尚無作答紀錄。")}
        </p>
      );
    }

    const problems = contest.problems.map((problem, index) => ({
      id: problem.id,
      label: problem.label || String(index + 1),
      problemId: problem.problemId,
      title: problem.title,
      order: problem.order ?? index,
      score: problem.maxScore ?? problem.score ?? 0,
      userStatus: problem.userStatus,
    }));

    if (!problems.length) {
      return (
        <p className={styles.emptyText}>
          {t("studentDashboard.empty.noQuestions", "尚無題目資料。")}
        </p>
      );
    }

    return (
      <div className={styles.problemReportList}>
        {problems.map((problem) => {
          const statusText =
            problem.userStatus ??
            t("studentDashboard.records.notSubmitted", "尚未提交");
          return (
            <div className={styles.problemReportItem} key={problem.id}>
              <div>
                <div className={styles.recordTitle}>
                  {problem.label}. {problem.title || "Untitled"}
                </div>
                <div className={styles.recordMeta}>
                  {tr("studentDashboard.records.fullScore", "滿分 {{score}}", {
                    score: problem.score ?? 0,
                  })}
                </div>
              </div>
              <div className={styles.problemReportMeta}>
                <Tag type={problem.userStatus === "AC" ? "green" : "cool-gray"}>
                  {statusText}
                </Tag>
                <span className={styles.recordScore}>
                  {contest.resultsPublished
                    ? t("studentDashboard.results.published", "成績已發布")
                    : t("studentDashboard.results.pendingPublish", "待發布")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
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

    const resultMap = new Map(
      paperData.results.map((result) => [String(result.questionId), result]),
    );
    const answerMap = new Map(
      paperData.answers.map((answer) => [String(answer.questionId), answer]),
    );

    return (
      <div className={styles.questionList}>
        {paperData.questions.map((question, index) => {
          const result = resultMap.get(String(question.id));
          const answer = answerMap.get(String(question.id));
          const marked = markedQuestionIds.has(String(question.id));
          const answerPayload = result?.answer ?? answer?.answer;
          const answered = !!answerPayload;
          const questionType = (
            result?.questionType ??
            result?.questionSnapshot?.questionType ??
            question.questionType
          ) as ExamQuestionType;
          const maxScore =
            question.score ?? result?.maxScore ?? result?.questionSnapshot?.score ?? 0;
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
                        label: result?.gradedAt
                          ? t("studentDashboard.answerStatus.graded", "已批改")
                          : t("studentDashboard.answerStatus.pendingGrading", "待批改"),
                        tone: "warm-gray" as const,
                      };
          const prompt =
            result?.questionPrompt ??
            result?.questionSnapshot?.prompt ??
            question.prompt;

          return (
            <PaperQuestionReportCard
              key={question.id}
              questionId={String(question.id)}
              index={index + 1}
              questionType={questionType}
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
              score={result?.score}
              maxScore={maxScore}
              gradedByUsername={result?.gradedByUsername}
              feedback={result?.feedback}
              correctAnswer={
                result?.questionSnapshot?.correctAnswer ?? question.correctAnswer
              }
              explanation={
                result?.questionExplanation ??
                result?.questionSnapshot?.explanation ??
                question.explanation
              }
            />
          );
        })}
      </div>
    );
  };

  const renderAnnouncements = () => {
    if (announcementsLoading) {
      return (
        <p className={styles.emptyText}>
          {t("studentDashboard.announcements.loading", "載入公告中...")}
        </p>
      );
    }
    if (announcementsError) {
      return <p className={styles.errorText}>{announcementsError}</p>;
    }
    if (!announcements.length) {
      return (
        <p className={styles.emptyText}>
          {t("studentDashboard.announcements.empty", "目前沒有公告。")}
        </p>
      );
    }

    return (
      <div className={styles.announcementList}>
        {announcements.map((announcement) => (
          <article className={styles.announcementItem} key={announcement.id}>
            <BlockHeader
              title={announcement.title}
              actions={
                announcement.createdAt ? (
                  <span className={styles.announcementMeta}>
                    {formatDate(announcement.createdAt, { includeSeconds: false })}
                  </span>
                ) : null
              }
            />
            <div className={styles.announcementContent}>
              <MarkdownRenderer>{announcement.content}</MarkdownRenderer>
            </div>
          </article>
        ))}
      </div>
    );
  };

  const tagRow = (
    <div className={styles.tagRow}>
      <Tag type={getContestStateColor(contestState)}>
        {t(
          `studentDashboard.contestState.${contestState}`,
          getContestStateLabel(contestState),
        )}
      </Tag>
      <Tag type={participant ? "green" : "gray"}>
        {participant
          ? t("studentDashboard.joinStatus.joined", "已加入")
          : t("studentDashboard.joinStatus.notJoined", "未加入")}
      </Tag>
      {contest.cheatDetectionEnabled ? (
        <Tag type="red">
          {t("studentDashboard.monitoring.enabled", "監控中")}
        </Tag>
      ) : null}
    </div>
  );

  return (
    <DashboardPage
      ariaLabel={t("studentDashboard.ariaLabel", "學生競賽首頁")}
      fullBleed
    >
      <DashboardContainer
        layout="split"
        proportions="main-aside"
        dividers="auto"
      >
        <DashboardContainer
          layout="stack"
          dividers="auto"
          ariaLabel={t("studentDashboard.mainContent", "競賽主要內容")}
        >
          <DashboardBlock>
            <BlockHeader
              titleSize="page"
              title={contest.name}
              description={tagRow}
              actions={
                <Button
                  kind="ghost"
                  renderIcon={Renew}
                  onClick={() => {
                    setPaperReloadKey((value) => value + 1);
                    void onRefreshContest?.();
                  }}
                >
                  {t("studentDashboard.actions.refresh", "重新整理")}
                </Button>
              }
            />
          </DashboardBlock>

          <DashboardContainer
            layout="grid"
            columns={3}
            dividers="auto"
            ariaLabel={t("studentDashboard.infoLabel", "競賽資訊")}
          >
            <DashboardBlock>
              <MetricBlock
                label={t("studentDashboard.metrics.startTime", "開始時間")}
                value={formatDate(contest.startTime, { includeSeconds: false })}
              />
            </DashboardBlock>
            <DashboardBlock>
              <MetricBlock
                label={t("studentDashboard.metrics.endTime", "截止時間")}
                value={formatDate(contest.endTime, { includeSeconds: false })}
              />
            </DashboardBlock>
            <DashboardBlock>
              <MetricBlock
                label={t("studentDashboard.metrics.duration", "總時長")}
                value={durationDisplay}
              />
            </DashboardBlock>
          </DashboardContainer>

          {SHOW_ANNOUNCEMENTS ? (
            <DashboardBlock>
              <BlockHeader
                title={t("studentDashboard.announcements.title", "公告")}
              />
              {renderAnnouncements()}
            </DashboardBlock>
          ) : null}

          <DashboardBlock padding="flush">
            <DashboardTabs
              activeId={infoTab}
              onChange={(id) => setInfoTab(id as "rules" | "records")}
            >
              <DashboardTabBar
                ariaLabel={t("studentDashboard.tabs.ariaLabel", "競賽資訊切換")}
                tabs={[
                  {
                    id: "rules",
                    label: t("studentDashboard.tabs.rules", "規則說明"),
                  },
                  {
                    id: "records",
                    label: t("studentDashboard.tabs.records", "作答紀錄"),
                  },
                ]}
              />
              <DashboardTabPanel tabId="rules">
                <div className={styles.tabContent}>
                  <BlockHeader
                    titleAs="h3"
                    title={t("studentDashboard.rules.title", "規則說明")}
                    description={
                      contest.attendanceCheckEnabled
                        ? "本考試需要完成 QR 簽到後才能開始作答。"
                        : "請依照教師公告與考試規則完成作答。"
                    }
                    actions={
                      contest.cheatDetectionEnabled ? (
                        <WarningAlt size={20} className={styles.warningIcon} />
                      ) : (
                        <Checkmark size={20} className={styles.successIcon} />
                      )
                    }
                  />
                  {contest.cheatDetectionEnabled ? (
                    <InlineNotification
                      kind="warning"
                      lowContrast
                      hideCloseButton
                      title={t(
                        "studentDashboard.monitoring.title",
                        "已啟用監控",
                      )}
                      subtitle={t(
                        "studentDashboard.monitoring.subtitle",
                        "進入作答後會啟用全螢幕、分頁切換與裝置監控。",
                      )}
                    />
                  ) : null}
                  {contest.description ? (
                    <div className={styles.rulesContent}>
                      <MarkdownRenderer>{contest.description}</MarkdownRenderer>
                    </div>
                  ) : null}
                  {contest.rules ? (
                    <div className={styles.rulesContent}>
                      <MarkdownRenderer>{contest.rules}</MarkdownRenderer>
                    </div>
                  ) : (
                    <p className={styles.emptyText}>
                      {t("studentDashboard.rules.empty", "沒有額外規則。")}
                    </p>
                  )}
                </div>
              </DashboardTabPanel>
              <DashboardTabPanel tabId="records">
                <div className={styles.tabContent}>
                  <BlockHeader
                    titleAs="h3"
                    title={
                      phase === "during"
                        ? t("studentDashboard.records.currentStatus", "目前作答狀況")
                        : phase === "after" && contest.resultsPublished
                          ? t(
                              "studentDashboard.records.withResults",
                              "作答紀錄與成績",
                            )
                          : t("studentDashboard.records.title", "作答紀錄")
                    }
                  />
                  {contest.contestType === "paper_exam"
                    ? renderPaperRecords()
                    : renderCodingRecords()}
                </div>
              </DashboardTabPanel>
            </DashboardTabs>
          </DashboardBlock>
        </DashboardContainer>

        <DashboardContainer
          layout="stack"
          dividers="auto"
          ariaLabel={t("studentDashboard.summary.ariaLabel", "競賽摘要")}
        >
          <DashboardBlock>
            <CountdownProgress
              startTime={contest.startTime}
              endTime={contest.endTime}
              afterPhase={
                contest.resultsPublished
                  ? {
                      label: t("studentDashboard.summary.examResult", "考試成績"),
                      value: afterPhaseValue,
                    }
                  : {
                      label: t("studentDashboard.summary.examStatus", "考試狀態"),
                      value: t(
                        "studentDashboard.results.waitingPublish",
                        "等待成績發布",
                      ),
                    }
              }
            />
          </DashboardBlock>

          <KPIBlock
            title={t("studentDashboard.summary.completionRate", "完成率")}
            value={`${progressPercent}%`}
          >
            <div className={styles.progressTrack} aria-hidden="true">
              <div
                className={styles.progressFill}
                style={{ inlineSize: `${progressPercent}%` }}
              />
            </div>
          </KPIBlock>

          {contest.resultsPublished && contest.contestType === "paper_exam" ? (
            <KPIBlock
              title={t("studentDashboard.summary.scoreDistribution", "成績分布")}
              value={
                scoreSummary
                  ? tr(
                      "studentDashboard.summary.averageScore",
                      "平均 {{average}} / {{max}}",
                      {
                        average: scoreSummary.summary.average_score.toFixed(1),
                        max: scoreSummary.summary.max_total_score,
                      },
                    )
                  : "—"
              }
            >
              <div className={styles.scoreDistributionChart}>
                {scoreSummaryLoading ? (
                  <SkeletonPlaceholder className={styles.chartSkeleton} />
                ) : scoreSummaryError ? (
                  <p className={styles.emptyText}>{scoreSummaryError}</p>
                ) : hasScoreDistributionData ? (
                  <LollipopChart
                    data={scoreDistributionData}
                    options={scoreDistributionOptions}
                  />
                ) : (
                  <p className={styles.emptyText}>
                    {t(
                      "studentDashboard.empty.noScoreDistribution",
                      "尚無成績分布資料。",
                    )}
                  </p>
                )}
              </div>
            </KPIBlock>
          ) : null}

          <DashboardBlock>
            <div className={styles.actionStack}>
              {renderPrimaryAction()}
              {examStatus === "submitted" ? renderAttendanceAction() : null}
              {canSubmitExam ? (
                <Button
                  kind="danger--tertiary"
                  renderIcon={Flag}
                  onClick={() => setShowEndConfirm(true)}
                >
                  {t("studentDashboard.actions.submit", "交卷")}
                </Button>
              ) : null}
              {isAdmin && onOpenAdminPanel ? (
                <Button kind="ghost" renderIcon={Launch} onClick={onOpenAdminPanel}>
                  {t("studentDashboard.actions.adminPanel", "管理後台")}
                </Button>
              ) : null}
            </div>
          </DashboardBlock>
        </DashboardContainer>
      </DashboardContainer>

      <ContestRegistrationModal
        open={showRegisterModal}
        contest={contest}
        onClose={() => setShowRegisterModal(false)}
        onSubmit={handleRegisterSubmit}
      />

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
        <p>
          {t(
            "studentDashboard.submitConfirm.body",
            "交卷後將無法繼續修改答案。",
          )}
        </p>
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
    </DashboardPage>
  );
}
