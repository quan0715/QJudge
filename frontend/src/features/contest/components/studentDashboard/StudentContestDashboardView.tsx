import { useEffect, useMemo, useState } from "react";
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
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
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
  MetricBlock,
  TimeDisplay,
} from "@/shared/components/dashboard";
import { ContestRegistrationModal } from "@/features/contest/components/modals/ContestRegistrationModal";
import PaperQuestionReportCard from "@/features/contest/components/exam/PaperQuestionReportCard";
import { getMarkedQuestionIds } from "@/features/contest/screens/paperExam/hooks";
import {
  buildCodingProgressSummary,
  formatCompactDuration,
  resolveStudentContestPhase,
  type StudentContestPhase,
} from "./studentDashboardState";
import styles from "./StudentContestDashboard.module.scss";

interface StudentContestDashboardProps {
  contest: ContestDetail;
  onJoin?: (data?: { password?: string }) => void;
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

const getRemainingLabel = (
  phase: StudentContestPhase,
  contest: ContestDetail,
  nowMs: number,
): { label: string; value: string } => {
  const startMs = Date.parse(contest.startTime);
  const endMs = Date.parse(contest.endTime);

  if (phase === "before") {
    return {
      label: "距離開始",
      value: Number.isFinite(startMs)
        ? formatCompactDuration(startMs - nowMs)
        : "-",
    };
  }
  if (phase === "during") {
    return {
      label: "剩餘時間",
      value: Number.isFinite(endMs) ? formatCompactDuration(endMs - nowMs) : "-",
    };
  }
  return {
    label: "考試狀態",
    value: contest.resultsPublished ? "成績已發布" : "等待成績發布",
  };
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
  const { theme } = useTheme();
  const [nowMs, setNowMs] = useState(() => Date.now());
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
  const requiresPassword =
    contest.requiresPassword ?? contest.visibility === "private";
  const contestState = getContestState({
    status: contest.status,
    startTime: contest.startTime,
    endTime: contest.endTime,
  });
  const remaining = getRemainingLabel(phase, contest, nowMs);
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
        error: questionsResult.status === "rejected" ? "題目資料暫時無法載入" : null,
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
          error instanceof Error ? error.message : "公告暫時無法載入",
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
          error instanceof Error ? error.message : "成績分布暫時無法載入",
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
    examStatus === "not_started";
  const canResumeExam = participant && examStatus === "paused";
  const canGoToAnswering = participant && examStatus === "in_progress";
  const canSubmitExam = participant && examStatus === "in_progress";
  const canRestartSubmittedExam =
    participant &&
    contest.status === "published" &&
    contestState !== "ended" &&
    examStatus === "submitted" &&
    contest.allowMultipleJoins;
  const scoreDisplay = contest.resultsPublished
    ? progressSummary.totalScore === null
      ? "成績已發布"
      : `${progressSummary.totalScore} / ${progressSummary.maxScore}`
    : "尚未發布";
  const primaryStatus = contest.resultsPublished
    ? {
        label: "考試成績",
        value:
          contest.contestType === "paper_exam" && paperData.loading
            ? "載入中..."
            : scoreDisplay,
      }
    : remaining;
  const reportDownloadLabel = contest.resultsPublished
    ? "下載成績單"
    : "下載作答證明";
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

  const handleRegisterSubmit = (data: { password?: string }) => {
    setShowRegisterModal(false);
    onJoin?.(data);
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

  const renderPrimaryAction = () => {
    if (!participant && phase !== "after") {
      return (
        <Button
          renderIcon={Login}
          disabled={!canRegister}
          onClick={() => setShowRegisterModal(true)}
        >
          {canRegister ? "加入競賽" : "目前不可加入"}
        </Button>
      );
    }
    if (canStartExam || canResumeExam) {
      return (
        <Button renderIcon={Play} onClick={onStartExam}>
          {canResumeExam ? "恢復作答" : "開始作答"}
        </Button>
      );
    }
    if (canGoToAnswering) {
      return (
        <Button renderIcon={Launch} onClick={onGoToAnswering}>
          回到作答
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
              重新加入
            </Button>
          ) : null}
        </>
      );
    }
    return (
      <Button kind="secondary" disabled renderIcon={Time}>
        {phase === "before" ? "等待開始" : "不可作答"}
      </Button>
    );
  };

  const renderCodingRecords = () => {
    if (!hasAnswerRecord) {
      return <p className={styles.emptyText}>尚無作答紀錄。</p>;
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
      return <p className={styles.emptyText}>尚無題目資料。</p>;
    }

    return (
      <div className={styles.problemReportList}>
        {problems.map((problem) => {
          const statusText = problem.userStatus ?? "尚未提交";
          return (
            <div className={styles.problemReportItem} key={problem.id}>
              <div>
                <div className={styles.recordTitle}>
                  {problem.label}. {problem.title || "Untitled"}
                </div>
                <div className={styles.recordMeta}>
                  滿分 {problem.score ?? 0}
                </div>
              </div>
              <div className={styles.problemReportMeta}>
                <Tag type={problem.userStatus === "AC" ? "green" : "cool-gray"}>
                  {statusText}
                </Tag>
                <span className={styles.recordScore}>
                  {contest.resultsPublished ? "成績已發布" : "待發布"}
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
      return <p className={styles.emptyText}>尚無作答紀錄。</p>;
    }
    if (paperData.loading) return <p className={styles.emptyText}>載入作答資料中...</p>;
    if (paperData.error) return <p className={styles.errorText}>{paperData.error}</p>;
    if (!paperData.questions.length) {
      return <p className={styles.emptyText}>尚無題目資料。</p>;
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
                  label: "已標記",
                  tone: "warm-gray" as const,
                  emphasis: "warning" as const,
                }
              : !answered
              ? { label: "未作答", tone: "warm-gray" as const }
              : !contest.resultsPublished
                ? {
                    label: "已作答",
                    tone: "cool-gray" as const,
                  }
                : result?.isCorrect === true
                  ? { label: "正確", tone: "green" as const }
                  : result?.isCorrect === false
                    ? (result?.score ?? 0) > 0
                      ? { label: "部分得分", tone: "cyan" as const }
                      : { label: "未得分", tone: "red" as const }
                    : {
                        label: result?.gradedAt ? "已批改" : "待批改",
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
      return <p className={styles.emptyText}>載入公告中...</p>;
    }
    if (announcementsError) {
      return <p className={styles.errorText}>{announcementsError}</p>;
    }
    if (!announcements.length) {
      return <p className={styles.emptyText}>目前沒有公告。</p>;
    }

    return (
      <div className={styles.announcementList}>
        {announcements.map((announcement) => (
          <article className={styles.announcementItem} key={announcement.id}>
            <div className={styles.announcementHeader}>
              <h3 className={styles.announcementTitle}>{announcement.title}</h3>
              {announcement.createdAt ? (
                <span className={styles.announcementMeta}>
                  {formatDate(announcement.createdAt, { includeSeconds: false })}
                </span>
              ) : null}
            </div>
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
        {getContestStateLabel(contestState)}
      </Tag>
      <Tag type={participant ? "green" : "gray"}>
        {participant ? "已加入" : "未加入"}
      </Tag>
      {contest.cheatDetectionEnabled ? <Tag type="red">監控中</Tag> : null}
    </div>
  );

  return (
    <DashboardPage ariaLabel="學生競賽首頁" fullBleed>
      <DashboardContainer
        layout="split"
        proportions="main-aside"
        bordered
        dividers="auto"
      >
        <DashboardContainer layout="stack" dividers="auto" ariaLabel="競賽主要內容">
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
                  重新整理
                </Button>
              }
            />
          </DashboardBlock>

          <DashboardContainer
            layout="grid"
            columns={3}
            dividers="auto"
            ariaLabel="競賽資訊"
          >
            <DashboardBlock>
              <MetricBlock
                label="開始時間"
                value={formatDate(contest.startTime, { includeSeconds: false })}
              />
            </DashboardBlock>
            <DashboardBlock>
              <MetricBlock
                label="截止時間"
                value={formatDate(contest.endTime, { includeSeconds: false })}
              />
            </DashboardBlock>
            <DashboardBlock>
              <MetricBlock label="總時長" value={durationDisplay} />
            </DashboardBlock>
          </DashboardContainer>

          <DashboardBlock>
            <BlockHeader title="公告" />
            {renderAnnouncements()}
          </DashboardBlock>

          <DashboardBlock padding="flush">
            <Tabs>
              <TabList aria-label="競賽資訊切換">
                <Tab>規則說明</Tab>
                <Tab>作答紀錄</Tab>
              </TabList>
              <TabPanels>
                <TabPanel className={styles.tabPanel}>
                  <div className={styles.tabContent}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 className={styles.inlineRecordsTitle}>規則說明</h3>
                        <p className={styles.sectionDescription}>
                          {requiresPassword
                            ? "此競賽需要密碼。"
                            : "此競賽不需要密碼。"}
                        </p>
                      </div>
                      {contest.cheatDetectionEnabled ? (
                        <WarningAlt size={20} className={styles.warningIcon} />
                      ) : (
                        <Checkmark size={20} className={styles.successIcon} />
                      )}
                    </div>
                    {contest.cheatDetectionEnabled ? (
                      <InlineNotification
                        kind="warning"
                        lowContrast
                        hideCloseButton
                        title="已啟用監控"
                        subtitle="進入作答後會啟用全螢幕、分頁切換與裝置監控。"
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
                      <p className={styles.emptyText}>沒有額外規則。</p>
                    )}
                  </div>
                </TabPanel>
                <TabPanel className={styles.tabPanel}>
                  <div className={styles.tabContent}>
                    <div className={styles.inlineRecordsHeader}>
                      <div>
                        <h3 className={styles.inlineRecordsTitle}>
                          {phase === "during"
                            ? "目前作答狀況"
                            : phase === "after" && contest.resultsPublished
                              ? "作答紀錄與成績"
                              : "作答紀錄"}
                        </h3>
                      </div>
                    </div>
                    {contest.contestType === "paper_exam"
                      ? renderPaperRecords()
                      : renderCodingRecords()}
                  </div>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </DashboardBlock>
        </DashboardContainer>

        <DashboardContainer layout="stack" dividers="auto" ariaLabel="競賽摘要">
          <DashboardBlock>
            <TimeDisplay
              variant="countdown"
              label={primaryStatus.label}
              value={primaryStatus.value}
            />
          </DashboardBlock>

          <DashboardBlock>
            <div className={styles.chartHeader}>
              <span className={styles.metricLabel}>完成率</span>
              <strong className={styles.metricValue}>{progressPercent}%</strong>
            </div>
            <div className={styles.progressTrack} aria-hidden="true">
              <div
                className={styles.progressFill}
                style={{ inlineSize: `${progressPercent}%` }}
              />
            </div>
          </DashboardBlock>

          {contest.resultsPublished && contest.contestType === "paper_exam" ? (
            <DashboardBlock ariaLabel="成績分布">
              <div className={styles.chartHeader}>
                <span className={styles.metricLabel}>成績分布</span>
                {scoreSummary ? (
                  <strong className={styles.metricValue}>
                    平均 {scoreSummary.summary.average_score.toFixed(1)} /{" "}
                    {scoreSummary.summary.max_total_score}
                  </strong>
                ) : null}
              </div>
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
                  <p className={styles.emptyText}>尚無成績分布資料。</p>
                )}
              </div>
            </DashboardBlock>
          ) : null}

          <DashboardBlock>
            <div className={styles.actionStack}>
              {renderPrimaryAction()}
              {canSubmitExam ? (
                <Button
                  kind="danger--tertiary"
                  renderIcon={Flag}
                  onClick={() => setShowEndConfirm(true)}
                >
                  交卷
                </Button>
              ) : null}
              {isAdmin && onOpenAdminPanel ? (
                <Button kind="ghost" renderIcon={Launch} onClick={onOpenAdminPanel}>
                  管理後台
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
        modalHeading="確認交卷"
        primaryButtonText="確認交卷"
        secondaryButtonText={tc("button.cancel")}
        danger
        onRequestSubmit={() => {
          setShowEndConfirm(false);
          onEndExam?.();
        }}
        onRequestClose={() => setShowEndConfirm(false)}
      >
        <p>交卷後將無法繼續修改答案。</p>
      </Modal>

      <Modal
        open={showReportModal}
        modalHeading={reportDownloadLabel}
        primaryButtonText={reportDownloading ? "準備中" : "下載"}
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
            labelText="報告語言"
            value={reportLanguage}
            onChange={(event) => setReportLanguage(event.target.value)}
          >
            <SelectItem value="zh-TW" text="繁體中文" />
            <SelectItem value="en" text="English" />
            <SelectItem value="ja" text="日本語" />
            <SelectItem value="ko" text="한국어" />
          </Select>
          {reportError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="下載失敗"
              subtitle={reportError}
            />
          ) : null}
        </div>
      </Modal>
    </DashboardPage>
  );
}
