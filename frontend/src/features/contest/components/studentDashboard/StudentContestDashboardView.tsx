import { useEffect, useMemo, useState } from "react";
import {
  Button,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
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
  ContestDetail,
  ExamQuestion,
} from "@/core/entities/contest.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import { downloadMyReport } from "@/infrastructure/api/repositories";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import {
  getExamResults,
  getMyExamAnswers,
  type ExamAnswer,
  type ExamAnswerDetail,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { formatDate } from "@/shared/utils/format";
import { useInterval } from "@/shared/hooks/useInterval";
import PaperQuestionOverviewTable, {
  type PaperQuestionOverviewRow,
} from "@/features/contest/components/exam/PaperQuestionOverviewTable";
import { ContestRegistrationModal } from "@/features/contest/components/modals/ContestRegistrationModal";
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

const getPhaseCopy = (
  phase: StudentContestPhase,
  resultsPublished: boolean,
): { title: string; description: string } => {
  if (phase === "before") {
    return {
      title: "考試前",
      description: "確認報名狀態、規則與監控設定，等待考試開始。",
    };
  }
  if (phase === "during") {
    return {
      title: "考試中",
      description: "追蹤作答進度與剩餘時間，必要時回到作答畫面。",
    };
  }
  return {
    title: "考試後",
    description: resultsPublished
      ? "成績已發布，可查看作答紀錄與成績。"
      : "作答已結束，成績尚未發布。",
  };
};

const getExamStatusLabel = (contest: ContestDetail): string => {
  switch (contest.examStatus) {
    case "in_progress":
      return "作答中";
    case "paused":
      return "待恢復";
    case "locked":
      return "已鎖定";
    case "submitted":
      return "已交卷";
    case "not_started":
    default:
      return isParticipant(contest) ? "尚未開始" : "尚未加入";
  }
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLanguage, setReportLanguage] = useState("zh-TW");
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [paperData, setPaperData] =
    useState<PaperExamDashboardData>(EMPTY_PAPER_DATA);
  const [paperReloadKey, setPaperReloadKey] = useState(0);

  const phase = resolveStudentContestPhase(contest, nowMs);
  const phaseCopy = getPhaseCopy(phase, contest.resultsPublished);
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
      return;
    }

    let cancelled = false;
    setPaperData((previous) => ({ ...previous, loading: true, error: null }));
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
    if (contest.examStatus === "submitted") {
      return (
        <Button
          kind="tertiary"
          renderIcon={Document}
          onClick={() => setShowReportModal(true)}
        >
          下載作答報告
        </Button>
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
    const rows: PaperQuestionOverviewRow[] = paperData.questions.map(
      (question, index) => {
        const result = resultMap.get(String(question.id));
        const answer = answerMap.get(String(question.id));
        const answered = !!result || !!answer;
        const questionType =
          result?.questionType ??
          result?.questionSnapshot?.questionType ??
          question.questionType;
        const maxScore =
          question.score ?? result?.maxScore ?? result?.questionSnapshot?.score ?? 0;
        const status =
          !answered
            ? { label: "未作答", tone: "warm-gray" as const }
            : !contest.resultsPublished
              ? { label: "已作答", tone: "cool-gray" as const }
            : result?.isCorrect === true
                ? { label: "正確", tone: "green" as const }
                : result?.isCorrect === false
                  ? (result?.score ?? 0) > 0
                    ? { label: "部分得分", tone: "cyan" as const }
                    : { label: "未得分", tone: "red" as const }
                  : { label: result?.gradedAt ? "已批改" : "待批改", tone: "warm-gray" as const };

        return {
          id: String(question.id),
          index: index + 1,
          prompt:
            result?.questionPrompt ??
            result?.questionSnapshot?.prompt ??
            question.prompt,
          typeLabel: t(
            `common:questionType.label.${questionType}`,
            QUESTION_TYPE_LABEL[questionType] ?? questionType,
          ),
          maxScore,
          scoreDisplay: contest.resultsPublished
            ? String(result?.score ?? 0)
            : result
              ? "已作答"
              : "-",
          statusLabel: status.label,
          statusTone: status.tone,
        };
      },
    );

    return (
      <PaperQuestionOverviewTable
        rows={rows}
        showScore={contest.resultsPublished}
        showFeedback={false}
      />
    );
  };

  return (
    <main className={styles.root} aria-label="學生競賽首頁">
      <div className={styles.dashboard}>
        <section className={styles.summaryPanel} aria-label="競賽狀態">
          <div className={styles.summaryMain}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{contest.name}</h1>
              <Tag type={getContestStateColor(contestState)}>
                {getContestStateLabel(contestState)}
              </Tag>
              <Tag type={participant ? "green" : "gray"}>
                {participant ? "已加入" : "未加入"}
              </Tag>
              {contest.cheatDetectionEnabled ? (
                <Tag type="red">監控中</Tag>
              ) : null}
            </div>
            <p className={styles.phaseTitle}>{phaseCopy.title}</p>
            <p className={styles.phaseDescription}>{phaseCopy.description}</p>
            {contest.description ? (
              <div className={styles.markdown}>
                <MarkdownRenderer>{contest.description}</MarkdownRenderer>
              </div>
            ) : null}
          </div>
          <aside className={styles.actionPanel} aria-label="主要操作">
            <div>
              <p className={styles.metricLabel}>{primaryStatus.label}</p>
              <p className={styles.timerValue}>{primaryStatus.value}</p>
            </div>
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
          </aside>
        </section>

        <section className={styles.infoGrid} aria-label="考試資訊">
          <div className={styles.infoCell}>
            <p className={styles.metricLabel}>開始時間</p>
            <p className={styles.metricValue}>
              {formatDate(contest.startTime, { includeSeconds: false })}
            </p>
          </div>
          <div className={styles.infoCell}>
            <p className={styles.metricLabel}>結束時間</p>
            <p className={styles.metricValue}>
              {formatDate(contest.endTime, { includeSeconds: false })}
            </p>
          </div>
          <div className={styles.infoCell}>
            <p className={styles.metricLabel}>作答狀態</p>
            <p className={styles.metricValue}>{getExamStatusLabel(contest)}</p>
          </div>
          <div className={styles.infoCell}>
            <p className={styles.metricLabel}>題目數</p>
            <p className={styles.metricValue}>
              {contest.contestType === "paper_exam"
                ? paperData.questions.length || contest.examQuestionsCount
                : progressSummary.totalItems}
            </p>
          </div>
        </section>

        <section className={styles.progressGrid} aria-label="作答狀況">
          <div className={styles.progressPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>
                  作答狀況
                </h2>
                <p className={styles.sectionDescription}>
                  {phase === "before"
                    ? "開始後會在這裡顯示作答進度。"
                    : contest.resultsPublished
                      ? "依已發布成績與題目資料計算。"
                      : "依自動儲存答案與題目資料計算。"}
                </p>
              </div>
              <Tag type="cool-gray">{progressPercent}%</Tag>
            </div>
            <div className={styles.progressTrack} aria-hidden="true">
              <div
                className={styles.progressFill}
                style={{ inlineSize: `${progressPercent}%` }}
              />
            </div>
            <div className={styles.statGrid}>
              <div>
                <p className={styles.metricLabel}>已完成</p>
                <p className={styles.metricValue}>
                  {progressSummary.completedItems} / {progressSummary.totalItems}
                </p>
              </div>
              <div>
                <p className={styles.metricLabel}>已嘗試</p>
                <p className={styles.metricValue}>
                  {progressSummary.attemptedItems}
                </p>
              </div>
              <div>
                <p className={styles.metricLabel}>目前分數</p>
                <p className={styles.metricValue}>
                  {progressSummary.totalScore === null
                    ? scoreDisplay
                    : `${progressSummary.totalScore} / ${progressSummary.maxScore}`}
                </p>
              </div>
            </div>
            <div className={styles.inlineRecordsPanel} aria-label="作答紀錄">
              <div className={styles.inlineRecordsHeader}>
                <div>
                  <h3 className={styles.inlineRecordsTitle}>
                    {phase === "during"
                      ? "目前作答狀況"
                      : phase === "after" && contest.resultsPublished
                        ? "作答紀錄與成績"
                        : "作答紀錄"}
                  </h3>
                  <p className={styles.sectionDescription}>
                    {contest.resultsPublished
                      ? "成績已發布，以下顯示目前可見的分數資料。"
                      : phase === "during"
                        ? "依自動儲存答案顯示，尚未代表已交卷。"
                        : "成績尚未發布時，只顯示目前可見的作答狀態。"}
                  </p>
                </div>
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
              </div>
              {contest.contestType === "paper_exam"
                ? renderPaperRecords()
                : renderCodingRecords()}
            </div>
          </div>
          <div className={styles.rulesPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>規則與監控</h2>
                <p className={styles.sectionDescription}>
                  {requiresPassword ? "此競賽需要密碼。" : "此競賽不需要密碼。"}
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
            {contest.rules ? (
              <div className={styles.rulesContent}>
                <MarkdownRenderer>{contest.rules}</MarkdownRenderer>
              </div>
            ) : (
              <p className={styles.emptyText}>沒有額外規則。</p>
            )}
          </div>
        </section>
      </div>

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
        modalHeading="下載作答報告"
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
    </main>
  );
}
