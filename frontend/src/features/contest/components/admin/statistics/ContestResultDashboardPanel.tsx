import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { LollipopChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import {
  Button,
  SkeletonPlaceholder,
  SkeletonText,
  Tag,
  Tile,
} from "@carbon/react";
import {
  Close,
  Download,
  Menu,
} from "@carbon/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  type QuestionDetailMock,
  type QuestionSummaryMock,
} from "./contestResultDashboard.mock";
import { useContestResultDashboard } from "./useContestResultDashboard";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import ExamQuestionPrompt from "@/features/contest/components/exam/ExamQuestionPrompt";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import {
  EXAM_QUESTION_TYPE_ICON,
} from "@/shared/ui/examQuestionTypeVisual";
import { resolveExamQuestionTypeFromRaw } from "@/shared/ui/questionVisual";
import { getQuestionTypeLabel } from "@/features/contest/constants/examLabels";
import { exportContestResults } from "@/infrastructure/api/repositories/contestExports.repository";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import styles from "./ContestResultDashboardPanel.module.scss";

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

export default function ContestResultDashboardPanel({
  contest,
}: AdminPanelProps) {
  const { t } = useTranslation("contest");
  const { theme } = useTheme();
  const [drawerQuestionId, setDrawerQuestionId] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!contest?.id || exporting) return;
    setExporting(true);
    try {
      await exportContestResults(contest.id);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [contest?.id, exporting]);

  const {
    data: dashboard,
    loading,
    error,
    loadQuestionDetail,
    detailLoadingIds,
    detailErrors,
  } = useContestResultDashboard(contest);

  const sortedQuestions = useMemo(
    () =>
      dashboard
        ? [...dashboard.questions].sort(
            (a, b) => a.scoreRate - b.scoreRate || a.order - b.order,
          )
        : [],
    [dashboard?.questions],
  );

  const drawerQuestion =
    sortedQuestions.find((q) => q.questionId === drawerQuestionId) ?? null;
  const drawerDetail =
    drawerQuestionId && dashboard
      ? dashboard.details[drawerQuestionId]
      : null;
  const drawerError = drawerQuestionId ? detailErrors[drawerQuestionId] ?? null : null;

  const closeDrawer = useCallback(() => setDrawerQuestionId(null), []);
  const openDrawer = useCallback((questionId: string) => setDrawerQuestionId(questionId), []);

  useEffect(() => {
    if (!drawerQuestionId || !drawerQuestion) return;
    void loadQuestionDetail(drawerQuestionId);
  }, [drawerQuestionId, drawerQuestion, loadQuestionDetail]);

  useEffect(() => {
    if (drawerQuestionId && dashboard && !drawerQuestion) {
      closeDrawer();
    }
  }, [closeDrawer, dashboard, drawerQuestion, drawerQuestionId]);

  useEffect(() => {
    if (!drawerQuestionId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeDrawer, drawerQuestionId]);

  const completionRate = dashboard
    ? Math.round(
        (dashboard.contest.completedCount /
          dashboard.contest.participantCount) *
          100,
      )
    : 0;

  const scoreDistributionChartData = useMemo(
    () =>
      dashboard
        ? dashboard.scoreDistribution.map((bucket) => ({
            group: bucket.rangeLabel,
            value: bucket.count,
          }))
        : [],
    [dashboard?.scoreDistribution],
  );

  const averageScoreRate =
    dashboard && dashboard.summary.maxTotalScore > 0
      ? (dashboard.summary.averageScore / dashboard.summary.maxTotalScore) * 100
      : 0;

  const chartTheme = resolveCarbonChartTheme(theme);

  const scoreDistributionChartOptions = useMemo(
    () => ({
      title: "",
      height: "260px",
      theme: chartTheme,
      toolbar: { enabled: false },
      legend: { enabled: false },
      axes: {
        left: {
          mapsTo: "group",
          scaleType: ScaleTypes.LABELS,
          title: t("statistics.scoreRange", "分數區間"),
        },
        bottom: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          title: t("statistics.studentCount", "人數"),
        },
      },
      color: {
        scale: (dashboard?.scoreDistribution ?? []).reduce<Record<string, string>>(
          (acc, bucket) => {
            acc[bucket.rangeLabel] = "var(--cds-link-primary)";
            return acc;
          },
          {},
        ),
      },
    }),
    [chartTheme, dashboard?.scoreDistribution, t],
  );


  const toolbarEl = (
    <PanelToolbar title={t("statistics.resultSummary", "結果摘要")} />
  );

  if (contest?.contestType === "coding") {
    return (
      <div className={styles.root}>
        {toolbarEl}
        <div className={styles.emptyGrid}>
          <p>{t("statistics.codingNotSupported", "目前不支援 Coding 考試的結果分析")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.root}>
        {toolbarEl}
        <DashboardSkeleton />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className={styles.root}>
        {toolbarEl}
        <div className={styles.emptyGrid}>
          <p>{error ?? t("statistics.noData", "無法載入資料")}</p>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className={styles.summaryColumn}>
      <h2 className={styles.sectionTitle}>
        {t("statistics.examOverview", "考試總覽")}
      </h2>

      <section
        className={styles.kpiGrid}
        aria-label={t("statistics.summaryArea", "總覽摘要")}
      >
        <KpiCard
          label={t("statistics.avgTotalScore", "平均總分")}
          value={`${dashboard.summary.averageScore.toFixed(1)} / ${dashboard.summary.maxTotalScore}`}
          caption={t("statistics.classAverage", "全班平均")}
        />
        <KpiCard
          label={t("statistics.medianScoreLabel", "中位數")}
          value={`${dashboard.summary.medianScore}`}
          caption={t("statistics.middlePoint", "成績中位點")}
        />
        <KpiCard
          label={t("statistics.completionRate", "完成率")}
          value={`${completionRate}%`}
          caption={t(
            "statistics.completedCount",
            "{{done}} / {{total}} 已完成",
            {
              done: dashboard.contest.completedCount,
              total: dashboard.contest.participantCount,
            },
          )}
        />
        <KpiCard
          label={t("statistics.participantCount", "應考人數")}
          value={`${dashboard.contest.participantCount}`}
          caption={t("statistics.totalParticipants", "本次作答母體")}
        />
      </section>

      <div className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>
            {t("statistics.scoreDistribution", "總分分布")}
          </h3>
          <span className={styles.chartLegend}>
            {t("statistics.averageReference", "平均")} {dashboard.summary.averageScore.toFixed(1)} / {dashboard.summary.maxTotalScore} ({Math.round(averageScoreRate)}%)
          </span>
        </div>
        <div className={styles.chartFrame}>
          <LollipopChart
            key={`${contest?.id ?? "contest"}-${chartTheme}`}
            data={scoreDistributionChartData}
            options={scoreDistributionChartOptions}
          />
        </div>
      </div>
    </div>
  );

  const rightPaneContent = drawerQuestion ? (
    <AnimatePresence mode="wait">
      <motion.div
        key={drawerQuestionId}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={styles.rightPaneInner}
      >
        <DrawerContent
          question={drawerQuestion}
          detail={drawerDetail}
          error={drawerError}
          loading={drawerQuestionId ? Boolean(detailLoadingIds[drawerQuestionId]) : false}
        />
      </motion.div>
    </AnimatePresence>
  ) : undefined;

  return (
    <AdminSplitLayout
      toolbar={
        <PanelToolbar
          leftActions={
            <Button
              kind="ghost"
              size="md"
              hasIconOnly
              renderIcon={sidebarExpanded ? Close : Menu}
              iconDescription={sidebarExpanded
                ? t("statistics.hideSummary", "隱藏考試總覽")
                : t("statistics.showSummary", "顯示考試總覽")}
              onClick={() => setSidebarExpanded((prev) => !prev)}
            />
          }
          title={t("statistics.resultSummary", "結果摘要")}
          status={
            <Tag
              type={dashboard.contest.resultsPublished ? "green" : "cool-gray"}
              size="sm"
            >
              {dashboard.contest.resultsPublished
                ? t("statistics.resultsPublished", "已發布")
                : t("statistics.resultsUnpublished", "未發布")}
            </Tag>
          }
          actions={
            <>
              <Button
                kind="ghost"
                size="md"
                hasIconOnly
                iconDescription={exporting
                  ? t("statistics.exporting", "匯出中…")
                  : t("statistics.exportResults", "匯出成績")}
                renderIcon={Download}
                onClick={handleExport}
                disabled={exporting}
              />
              {drawerQuestion && (
                <Button
                  kind="secondary"
                  size="md"
                  hasIconOnly
                  iconDescription={t("statistics.closeDetail", "關閉詳細")}
                  renderIcon={Close}
                  onClick={closeDrawer}
                />
              )}
            </>
          }
        />
      }
      sidebar={sidebarContent}
      sidebarHidden={!sidebarExpanded}
      sidebarWidth={420}
      rightPane={rightPaneContent}
      rightPaneWidth={480}
      contentClassName={styles.questionColumn}
    >
      <div className={styles.questionHeader}>
        <h2 className={styles.questionHeaderTitle}>
          {t("statistics.questionBoard", "題目分析")}
          <span className={styles.questionCount}>
            {t("statistics.questionCount", "{{count}} 題", {
              count: sortedQuestions.length,
            })}
          </span>
        </h2>
      </div>

      {sortedQuestions.length === 0 ? (
        <div className={styles.emptyGrid}>
          <p>{t("statistics.noQuestionData", "目前沒有題目資料")}</p>
        </div>
      ) : (
        <QuestionSection
          questions={sortedQuestions}
          activeQuestionId={drawerQuestionId}
          onOpen={openDrawer}
        />
      )}
    </AdminSplitLayout>
  );
}

/* ── KpiCard ── */

function KpiCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <Tile className={styles.kpiCard}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiCaption}>{caption}</div>
    </Tile>
  );
}

const QuestionPreviewCard = memo(function QuestionPreviewCard({
  question,
  isActive,
  onClick,
}: {
  question: QuestionSummaryMock;
  isActive: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("contest");
  const questionVisual = getQuestionVisual(question.kind);
  const attention = getQuestionAttention(question);

  return (
    <button
      type="button"
      className={`${styles.previewCard} ${isActive ? styles.previewCardActive : ""}`}
      onClick={onClick}
      aria-pressed={isActive}
    >
      <div className={styles.previewCardLeft}>
        <div className={styles.previewCardMeta}>
          <div className={styles.previewCardMetaLeft}>
            {questionVisual.Icon && <questionVisual.Icon size={14} />}
            <span>Q{question.order}</span>
            <span className={styles.questionTypeText}>{questionVisual.label}</span>
          </div>
        </div>
        <div className={styles.previewCardTitle}>{question.title}</div>
        <div className={styles.previewCardStats}>
          <span>
            {t("statistics.averagePreview", "平均 {{score}} / {{maxScore}}", {
              score: question.averageScore.toFixed(1),
              maxScore: question.maxScore,
            })}
          </span>
          <span>·</span>
          <span>
            {t("statistics.answeredCount", "{{count}} 人作答", {
              count: question.answerCount,
            })}
          </span>
        </div>
        <RateBar
          className={styles.previewProgress}
          label={t("statistics.scoreRate", "得分率")}
          value={question.scoreRate}
          tone={attention.tone}
        />
      </div>
    </button>
  );
});

function QuestionSection({
  questions,
  activeQuestionId,
  onOpen,
}: {
  questions: QuestionSummaryMock[];
  activeQuestionId: string | null;
  onOpen: (questionId: string) => void;
}) {
  if (questions.length === 0) return null;

  return (
    <section className={styles.questionSection}>
      <div className={styles.questionGrid}>
        {questions.map((question) => (
          <QuestionPreviewCard
            key={question.questionId}
            question={question}
            isActive={question.questionId === activeQuestionId}
            onClick={() => onOpen(question.questionId)}
          />
        ))}
      </div>
    </section>
  );
}

/* ── QuestionDetailDrawer ── */

function DrawerContent({
  question,
  detail,
  error,
  loading,
}: {
  question: QuestionSummaryMock;
  detail: QuestionDetailMock | null;
  error: string | null;
  loading: boolean;
}) {
  const { t } = useTranslation("contest");
  const questionVisual = getQuestionVisual(question.kind);
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");

  useEffect(() => {
    setScoreFilter("all");
    setObjectiveFilter("all");
  }, [question.questionId]);

  if (loading) {
    return (
      <>
        <div className={styles.drawerHeader}>
          <div>
            <h2 className={styles.drawerTitle}>
              {questionVisual.Icon && <questionVisual.Icon size={18} />}
              Q{question.order} · {questionVisual.label}
            </h2>
            <div className={styles.drawerPrompt}>
              <ExamQuestionPrompt
                content={question.title}
                emptyText={t("answering.question.promptEmpty")}
                compact
              />
            </div>
            <div className={styles.drawerMeta}>
              <span>
                {question.averageScore.toFixed(1)} / {question.maxScore}
              </span>
              <span>{t("statistics.answeredCount", "{{count}} 人作答", { count: question.answerCount })}</span>
              <span>{t("statistics.omittedCount", "{{count}} 人未作答", { count: question.missingCount })}</span>
            </div>
          </div>
        </div>
        <DrawerSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className={styles.drawerHeader}>
          <div>
            <h2 className={styles.drawerTitle}>
              {questionVisual.Icon && <questionVisual.Icon size={18} />}
              Q{question.order} · {questionVisual.label}
            </h2>
            <div className={styles.drawerPrompt}>
              <ExamQuestionPrompt
                content={question.title}
                emptyText={t("answering.question.promptEmpty")}
                compact
              />
            </div>
            <div className={styles.drawerMeta}>
              <span>
                {question.averageScore.toFixed(1)} / {question.maxScore}
              </span>
              <span>{t("statistics.answeredCount", "{{count}} 人作答", { count: question.answerCount })}</span>
              <span>{t("statistics.omittedCount", "{{count}} 人未作答", { count: question.missingCount })}</span>
            </div>
          </div>
        </div>
        <div className={styles.drawerError}>{error}</div>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <div className={styles.drawerHeader}>
          <div>
            <h2 className={styles.drawerTitle}>
              {questionVisual.Icon && <questionVisual.Icon size={18} />}
              Q{question.order} · {questionVisual.label}
            </h2>
          </div>
        </div>
        <DrawerSkeleton />
      </>
    );
  }

  const objectiveDetail = isObjectiveDetail(detail) ? detail : null;
  const subjectiveDetail = isSubjectiveDetail(detail) ? detail : null;
  const codingDetail = isCodingDetail(detail) ? detail : null;
  const objectiveParticipants = objectiveDetail
    ? buildObjectiveParticipantRows(objectiveDetail)
    : [];
  const objectiveFilterOptions = objectiveDetail
    ? buildObjectiveFilterOptions(objectiveDetail, objectiveParticipants, t)
    : [];
  const filteredObjectiveParticipants = objectiveDetail
    ? objectiveParticipants.filter((participant) =>
        objectiveFilter === "all"
          ? !participant.isOmitted
          : objectiveFilter === "omitted"
            ? participant.isOmitted
            : participant.selectedFilters.includes(objectiveFilter),
      )
    : [];
  const scoreFilterOptions = subjectiveDetail
    ? buildScoreFilterOptions(detail.responses, t)
    : [];
  const filteredResponses = subjectiveDetail
    ? detail.responses.filter((response) =>
        scoreFilter === "all"
          ? true
          : scoreFilter === "ungraded"
            ? response.score == null
            : formatScoreLabel(response.score) === scoreFilter,
      )
    : [];

  return (
    <>
      <div className={styles.drawerHeader}>
        <div>
          <h2 className={styles.drawerTitle}>
            {questionVisual.Icon && <questionVisual.Icon size={18} />}
            Q{question.order} · {questionVisual.label}
          </h2>
          <div className={styles.drawerPrompt}>
            <ExamQuestionPrompt
              content={question.title}
              emptyText={t("answering.question.promptEmpty")}
              compact
            />
          </div>
          <div className={styles.drawerMeta}>
            <span>
              {question.averageScore.toFixed(1)} / {question.maxScore}
            </span>
            <span>{t("statistics.answeredCount", "{{count}} 人作答", { count: question.answerCount })}</span>
            <span>{t("statistics.omittedCount", "{{count}} 人未作答", { count: question.missingCount })}</span>
          </div>
        </div>
      </div>

      {subjectiveDetail && (
        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHeader}>
            <h3 className={styles.drawerSectionTitle}>{t("statistics.gradingProgress", "批改進度")}</h3>
            <span className={styles.sectionMeta}>
              {subjectiveDetail.gradingProgress.graded} /{" "}
              {subjectiveDetail.gradingProgress.total}
            </span>
          </div>
          <RateBar
            label={t("statistics.gradingRate", "批改率")}
            value={
              subjectiveDetail.gradingProgress.total > 0
                ? (subjectiveDetail.gradingProgress.graded /
                    subjectiveDetail.gradingProgress.total) *
                  100
                : 0
            }
            tone={
              subjectiveDetail.gradingProgress.total > 0 &&
              subjectiveDetail.gradingProgress.graded <
                subjectiveDetail.gradingProgress.total
                ? "warning"
                : "success"
            }
          />
        </section>
      )}

      <section className={styles.drawerSection}>
        <h3 className={styles.drawerSectionTitle}>{t("statistics.scoreDistribution", "分數分布")}</h3>
        <MetricBarList
          rows={detail.scoreBands.map((item) => ({
            id: item.label,
            label: item.label,
            value: item.count,
            maxValue: Math.max(...detail.scoreBands.map((band) => band.count), 0),
            meta: `${item.count}`,
            tone: "default",
          }))}
          emptyText={t("statistics.noGradedScores", "目前沒有已批改分數")}
        />
      </section>

      {objectiveDetail && (
        <>
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>{t("statistics.optionDistribution", "選項分布")}
            </h3>
            <OptionDistributionList data={objectiveDetail.optionDistribution} />
          </section>
          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeader}>
              <h3 className={styles.drawerSectionTitle}>
                {t("statistics.allObjectiveResponses", "所有作答")}
              </h3>
              <span className={styles.sectionMeta}>
                {t("studentStatus.personCount", "{{count}} 人", {
                  count: filteredObjectiveParticipants.length,
                })}
              </span>
            </div>
            <ScoreFilterChips
              options={objectiveFilterOptions}
              activeValue={objectiveFilter}
              onChange={setObjectiveFilter}
            />
            <ObjectiveParticipantList
              participants={filteredObjectiveParticipants}
            />
          </section>
        </>
      )}

      {codingDetail && (
        <>
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>{t("statistics.statusDistribution", "Status 分布")}</h3>
            <MiniBarList
              data={codingDetail.statusDistribution.map((item) => ({
                label: item.status,
                count: item.count,
                tone: statusTone(item.status),
              }))}
            />
          </section>
          <section className={styles.drawerSection}>
            <div className={styles.detailMetricGrid}>
              <Tile className={styles.detailMetricCard}>
                <span className={styles.detailMetricLabel}>
                  {t("statistics.avgSubmissionCount", "平均提交次數")}
                </span>
                <strong>{codingDetail.avgSubmissions.toFixed(1)}</strong>
              </Tile>
              <Tile className={styles.detailMetricCard}>
                <span className={styles.detailMetricLabel}>
                  {t("statistics.medianFirstAc", "首 AC 中位數")}
                </span>
                <strong>
                  {codingDetail.medianFirstAcMinutes != null
                    ? `${codingDetail.medianFirstAcMinutes}m`
                    : "—"}
                </strong>
              </Tile>
            </div>
          </section>
          <section className={styles.drawerSection}>
            <div className={styles.drawerSectionHeader}>
              <h3 className={styles.drawerSectionTitle}>{t("statistics.commonFailureTypes", "常見失敗類型")}</h3>
              <Button kind="ghost" size="sm">
                {t("statistics.viewSubmissionSamples", "查看提交樣本")}
              </Button>
            </div>
            <MiniBarList
              data={codingDetail.commonFailures.map((item) => ({
                label: item.status,
                count: item.count,
                tone: statusTone(item.status),
              }))}
            />
          </section>
        </>
      )}

      {subjectiveDetail ? (
        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHeader}>
            <h3 className={styles.drawerSectionTitle}>{t("statistics.allResponses", "所有回答")}</h3>
            <span className={styles.sectionMeta}>{t("statistics.responseCount", "{{count}} 筆", { count: filteredResponses.length })}</span>
          </div>
          <ScoreFilterChips
            options={scoreFilterOptions}
            activeValue={scoreFilter}
            onChange={setScoreFilter}
          />
          <ResponseList
            questionKind={question.kind}
            responses={filteredResponses}
          />
        </section>
      ) : null}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className={styles.body} data-testid="dashboard-skeleton">
      <div className={styles.summaryColumn}>
        <SkeletonText heading width="8rem" />
        <div className={styles.kpiGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Tile key={index} className={styles.kpiCard}>
              <SkeletonText width="4rem" />
              <SkeletonText heading width="6rem" />
              <SkeletonText width="5rem" />
            </Tile>
          ))}
        </div>
        <div className={styles.chartSection}>
          <SkeletonText heading width="6rem" />
          <SkeletonPlaceholder className={styles.chartSkeleton} />
        </div>
      </div>
      <div className={styles.questionColumn}>
        <SkeletonText heading width="7rem" />
        <div className={styles.questionGrid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Tile key={index} className={styles.previewCardSkeleton}>
              <SkeletonText width="4rem" />
              <SkeletonText heading width="80%" />
              <SkeletonText width="50%" />
              <SkeletonPlaceholder className={styles.progressSkeleton} />
              <div className={styles.skeletonMetricRow}>
                <SkeletonPlaceholder className={styles.metricSkeleton} />
                <SkeletonPlaceholder className={styles.metricSkeleton} />
              </div>
            </Tile>
          ))}
        </div>
      </div>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className={styles.drawerSkeleton} data-testid="drawer-skeleton">
      <SkeletonText heading width="10rem" />
      <SkeletonText width="100%" />
      <SkeletonText width="60%" />
      <SkeletonText heading width="6rem" />
      <div className={styles.drawerSkeletonBars}>
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonPlaceholder key={index} className={styles.drawerBarSkeleton} />
        ))}
      </div>
    </div>
  );
}

function RateBar({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: number;
  tone: AttentionToneKey;
  className?: string;
}) {
  return (
    <div className={className}>
      <MetricBarList
        rows={[
          {
            id: label,
            label,
            value,
            maxValue: 100,
            meta: `${Math.round(value)}%`,
            tone:
              tone === "critical"
                ? "critical"
                : tone === "warning"
                  ? "warning"
                  : "success",
          },
        ]}
      />
    </div>
  );
}

/* ── MiniBarList ── */

function MiniBarList({
  data,
}: {
  data: Array<{
    label: string;
    count: number;
    suffix?: string;
    tone?: "default" | "success" | "warning";
  }>;
}) {
  const max = Math.max(...data.map((item) => item.count), 0);

  return (
    <div className={styles.miniBarList}>
      {data.map((item) => (
        <div key={item.label} className={styles.miniBarRow}>
          <div className={styles.miniBarLabel}>{item.label}</div>
          <div className={styles.miniBarTrack}>
            <div
              className={`${styles.miniBarFill} ${
                item.tone === "success"
                  ? styles.miniBarFillSuccess
                  : item.tone === "warning"
                    ? styles.miniBarFillWarning
                    : ""
              }`}
              style={{
                width: `${max > 0 ? (item.count / max) * 100 : 0}%`,
              }}
            />
          </div>
          <div className={styles.miniBarCount}>
            {item.count}
            {item.suffix ? ` · ${item.suffix}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function OptionDistributionList({
  data,
}: {
  data: Array<{
    label: string;
    count: number;
    percent: number;
    isCorrect: boolean;
    participants: Array<{
      participantId: number;
      username: string;
      nickname: string | null;
      displayName: string;
    }>;
  }>;
}) {
  const { t } = useTranslation("contest");
  if (data.length === 0) {
    return <div className={styles.drawerEmptyState}>{t("statistics.noOptionData", "目前沒有選項資料")}</div>;
  }

  const max = Math.max(...data.map((item) => item.count), 0);

  return (
    <div className={styles.optionList}>
      {data.map((item) => (
        <div key={item.label} className={styles.optionDistributionCard}>
          <MetricBarList
            rows={[
              {
                id: item.label,
                label: item.label,
                value: item.count,
                maxValue: max,
                meta: `${item.count} · ${item.percent}%`,
                submeta: item.isCorrect
                  ? t("statistics.correctAnswer", "正解")
                  : t("statistics.incorrectAnswer", "非正解"),
                tone: item.isCorrect ? "success" : "incorrect",
                longLabel: true,
              },
            ]}
          />
        </div>
      ))}
    </div>
  );
}

function ObjectiveParticipantList({
  participants,
}: {
  participants: ObjectiveParticipantRow[];
}) {
  const { t } = useTranslation("contest");
  if (participants.length === 0) {
    return (
      <div className={styles.drawerEmptyState}>
        {t("statistics.noFilteredParticipants", "目前沒有符合條件的學生")}
      </div>
    );
  }

  return (
    <div className={styles.objectiveResponseList}>
      {participants.map((participant) => (
        <Tile
          key={`participant-${participant.participantId}`}
          className={styles.objectiveResponseCard}
        >
          <div className={styles.objectiveResponseIdentity}>
            {participant.displayName}
          </div>
          <div className={styles.objectiveResponseTags}>
            {participant.isOmitted ? (
              <Tag type="cool-gray" size="sm">
                {t("statistics.omitted", "未作答")}
              </Tag>
            ) : (
              participant.selectedOptions.map((option) => (
                <Tag
                  key={`participant-${participant.participantId}-${option}`}
                  type="outline"
                  size="sm"
                >
                  {option}
                </Tag>
              ))
            )}
          </div>
        </Tile>
      ))}
    </div>
  );
}

function MetricBarList({
  rows,
  emptyText,
}: {
  rows: Array<{
    id: string;
    label: string;
    value: number;
    maxValue: number;
    meta?: string;
    submeta?: string;
    tone?: "default" | "success" | "warning" | "critical" | "incorrect";
    longLabel?: boolean;
  }>;
  emptyText?: string;
}) {
  const { t } = useTranslation("contest");
  if (rows.length === 0) {
    return <div className={styles.drawerEmptyState}>{emptyText ?? t("statistics.noMetricData", "目前沒有資料")}</div>;
  }

  return (
    <div className={styles.metricBarList}>
      {rows.map((row) => {
        const ratio = row.maxValue > 0 ? (row.value / row.maxValue) * 100 : 0;
        return (
          <div key={row.id} className={styles.metricBarRow}>
            <div className={styles.metricBarHeader}>
              <div
                className={`${styles.metricBarLabel} ${
                  row.longLabel ? styles.metricBarLabelLong : ""
                }`}
              >
                {row.label}
              </div>
              <div className={styles.metricBarMeta}>
                {row.submeta ? (
                  <span
                    className={
                      row.tone === "success"
                        ? styles.optionStateCorrect
                        : row.tone === "critical" || row.tone === "incorrect"
                          ? styles.metricStateCritical
                          : styles.optionStateIncorrect
                    }
                  >
                    {row.submeta}
                  </span>
                ) : null}
                {row.meta ? <span>{row.meta}</span> : null}
              </div>
            </div>
            <div className={styles.rateBarTrack}>
              <div
                className={`${styles.rateBarFill} ${
                  row.tone === "critical"
                    ? styles.rateBarFillCritical
                    : row.tone === "warning"
                      ? styles.rateBarFillWarning
                      : row.tone === "incorrect"
                        ? styles.rateBarFillIncorrect
                      : row.tone === "success"
                        ? styles.rateBarFillSuccess
                        : styles.rateBarFillDefault
                }`}
                style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreFilterChips({
  options,
  activeValue,
  onChange,
}: {
  options: Array<{ label: string; value: string; count: number }>;
  activeValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.scoreChipRow}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${styles.scoreChip} ${
            activeValue === option.value ? styles.scoreChipActive : ""
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label} {option.count}
        </button>
      ))}
    </div>
  );
}

function ResponseList({
  questionKind,
  responses,
}: {
  questionKind: QuestionSummaryMock["kind"];
  responses: QuestionDetailMock["responses"];
}) {
  const { t } = useTranslation("contest");
  if (responses.length === 0) {
    return <div className={styles.drawerEmptyState}>{t("statistics.noFilteredResponses", "目前沒有符合條件的回答")}</div>;
  }

  return (
    <div className={styles.responseList}>
      {responses.map((response) => (
        <Tile key={`${response.participantId}-${response.username}`} className={styles.responseCard}>
          <div className={styles.responseHeader}>
            <div className={styles.responseIdentity}>{response.displayName}</div>
            <div className={styles.responseScore}>
              {response.score == null
                ? t("statistics.ungraded", "未批改")
                : t("statistics.scoreLabel", "{{score}} 分", {
                    score: formatScoreLabel(response.score),
                  })}
            </div>
          </div>
          <div className={styles.responseBody}>
            <ResponseAnswerContent questionKind={questionKind} answer={response.answer} />
          </div>
          {response.feedback?.trim() ? (
            <div className={styles.responseFeedback}>
              <div className={styles.responseFeedbackLabel}>{t("statistics.feedback", "批改評語")}</div>
              <div className={styles.responseFeedbackBody}>
                <MarkdownRenderer enableMath enableHighlight>
                  {response.feedback}
                </MarkdownRenderer>
              </div>
            </div>
          ) : null}
        </Tile>
      ))}
    </div>
  );
}

function ResponseAnswerContent({
  questionKind,
  answer,
}: {
  questionKind: QuestionSummaryMock["kind"];
  answer: unknown;
}) {
  const { t } = useTranslation("contest");
  const text = formatAnswerContent(questionKind, answer, t);
  const isMarkdown =
    questionKind === "essay" || questionKind === "short_answer";

  if (isMarkdown) {
    return (
      <MarkdownRenderer enableMath enableHighlight>
        {text}
      </MarkdownRenderer>
    );
  }

  return <div className={styles.responsePlainText}>{text}</div>;
}

/* ── Helpers ── */

type AttentionToneKey = "critical" | "warning" | "success";

function getQuestionVisual(kind: QuestionSummaryMock["kind"]): {
  Icon: ComponentType<{ size?: number; className?: string }> | null;
  label: string;
} {
  const examType = resolveExamQuestionTypeFromRaw(kind);
  if (!examType) {
    return {
      Icon: null,
      label: kind,
    };
  }
  return {
    Icon: EXAM_QUESTION_TYPE_ICON[examType] ?? null,
    label: getQuestionTypeLabel(examType),
  };
}

function getQuestionAttention(question: QuestionSummaryMock): {
  tone: AttentionToneKey;
} {
  const isSubjective =
    question.kind === "short_answer" || question.kind === "essay";
  const gradingRate = question.subjectiveStats?.gradingRate ?? 100;
  let tone: AttentionToneKey = "success";

  if ((!isSubjective && question.scoreRate < 50) || question.zeroRate >= 30) {
    tone = "critical";
  } else if (
    (isSubjective && gradingRate < 100) ||
    question.scoreRate < 75 ||
    question.objectiveStats?.correctRate !== undefined && question.objectiveStats.correctRate < 70
  ) {
    tone = "warning";
  }

  return {
    tone,
  };
}

function isObjectiveDetail(
  detail: QuestionDetailMock,
): detail is Extract<QuestionDetailMock, { kind: "single_choice" | "multiple_choice" | "true_false" }> {
  return (
    detail.kind === "single_choice" ||
    detail.kind === "multiple_choice" ||
    detail.kind === "true_false"
  );
}

function isSubjectiveDetail(
  detail: QuestionDetailMock,
): detail is Extract<QuestionDetailMock, { kind: "short_answer" | "essay" }> {
  return detail.kind === "short_answer" || detail.kind === "essay";
}

function isCodingDetail(
  detail: QuestionDetailMock,
): detail is Extract<QuestionDetailMock, { kind: "coding" }> {
  return detail.kind === "coding";
}

function statusTone(status: string): "default" | "success" | "warning" {
  if (status === "AC") return "success";
  if (status === "Pending") return "warning";
  return "default";
}

function buildScoreFilterOptions(
  responses: QuestionDetailMock["responses"],
  t: ReturnType<typeof useTranslation<"contest">>["t"],
): Array<{ label: string; value: string; count: number }> {
  const counts = new Map<string, number>();
  let ungraded = 0;
  for (const response of responses) {
    if (response.score == null) {
      ungraded += 1;
      continue;
    }
    const label = formatScoreLabel(response.score);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const gradedOptions = [...counts.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([label, count]) => ({
      label: `${label} 分`,
      value: label,
      count,
    }));

  return [
    { label: t("statistics.all", "全部"), value: "all", count: responses.length },
    ...gradedOptions,
    ...(ungraded > 0
      ? [{ label: t("statistics.ungraded", "未批改"), value: "ungraded", count: ungraded }]
      : []),
  ];
}

function formatScoreLabel(score: number | null): string {
  if (score == null) return "";
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace(/\.0$/, "");
}

function formatAnswerContent(
  questionKind: QuestionSummaryMock["kind"],
  answer: unknown,
  t: ReturnType<typeof useTranslation<"contest">>["t"],
): string {
  if (answer == null) return t("statistics.noAnswerContent", "無作答內容");

  if (
    questionKind === "essay" ||
    questionKind === "short_answer"
  ) {
    if (typeof answer === "string") return answer;
    if (typeof answer === "object" && answer && "text" in answer) {
      const text = (answer as { text?: unknown }).text;
      return typeof text === "string" ? text : JSON.stringify(answer, null, 2);
    }
    return JSON.stringify(answer, null, 2);
  }

  if (typeof answer === "object" && answer && "selected" in answer) {
    const selected = (answer as { selected?: unknown }).selected;
    if (Array.isArray(selected)) {
      return selected.map(String).join(", ");
    }
    if (selected == null) {
      return t("statistics.notSelected", "未選擇");
    }
    return String(selected);
  }

  return typeof answer === "string" ? answer : JSON.stringify(answer, null, 2);
}

type ObjectiveParticipantRow = {
  participantId: number;
  username: string;
  nickname: string | null;
  displayName: string;
  isOmitted: boolean;
  selectedOptions: string[];
  selectedFilters: string[];
};

function buildObjectiveParticipantRows(
  detail: Extract<
    QuestionDetailMock,
    { kind: "single_choice" | "multiple_choice" | "true_false" }
  >,
): ObjectiveParticipantRow[] {
  const participants = new Map<number, ObjectiveParticipantRow>();

  for (const option of detail.optionDistribution) {
    const optionCode = getOptionFilterLabel(option.label);
    const optionFilter = buildObjectiveOptionFilterValue(option.label);
    for (const participant of option.participants) {
      const existing = participants.get(participant.participantId);
      if (existing) {
        if (!existing.selectedOptions.includes(optionCode)) {
          existing.selectedOptions.push(optionCode);
        }
        if (!existing.selectedFilters.includes(optionFilter)) {
          existing.selectedFilters.push(optionFilter);
        }
        continue;
      }
      participants.set(participant.participantId, {
        ...participant,
        isOmitted: false,
        selectedOptions: [optionCode],
        selectedFilters: [optionFilter],
      });
    }
  }

  for (const participant of detail.omittedParticipants ?? []) {
    if (participants.has(participant.participantId)) {
      continue;
    }
    participants.set(participant.participantId, {
      ...participant,
      isOmitted: true,
      selectedOptions: [],
      selectedFilters: [],
    });
  }

  return [...participants.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "zh-Hant"),
  );
}

function buildObjectiveFilterOptions(
  detail: Extract<
    QuestionDetailMock,
    { kind: "single_choice" | "multiple_choice" | "true_false" }
  >,
  participants: ObjectiveParticipantRow[],
  t: ReturnType<typeof useTranslation<"contest">>["t"],
): Array<{ label: string; value: string; count: number }> {
  const answeredCount = participants.filter(
    (participant) => !participant.isOmitted,
  ).length;

  return [
    {
      label: t("statistics.all", "全部"),
      value: "all",
      count: answeredCount,
    },
    ...detail.optionDistribution.map((option) => ({
      label: getOptionFilterLabel(option.label),
      value: buildObjectiveOptionFilterValue(option.label),
      count: option.participants.length,
    })),
    ...((detail.omittedParticipants?.length ?? 0) > 0
      ? [
          {
            label: t("statistics.omitted", "未作答"),
            value: "omitted",
            count: detail.omittedParticipants?.length ?? 0,
          },
        ]
      : []),
  ];
}

function buildObjectiveOptionFilterValue(label: string): string {
  return `option:${label}`;
}

function getOptionFilterLabel(label: string): string {
  const match = label.match(/^\s*([A-Z]+)\./);
  return match?.[1] ?? label;
}
