import { memo, useCallback, useEffect, useMemo } from "react";
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
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  type QuestionDetailMock,
  type QuestionSummaryMock,
} from "./contestResultDashboard.mock";
import { useContestResultDashboard } from "./useContestResultDashboard";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import {
  EXAM_QUESTION_TYPE_ICON,
} from "@/shared/ui/examQuestionTypeVisual";
import { resolveExamQuestionTypeFromRaw } from "@/shared/ui/questionVisual";
import { getQuestionTypeLabel } from "@/features/contest/constants/examLabels";
import styles from "./ContestResultDashboardPanel.module.scss";

export default function ContestResultDashboardPanel({
  contest,
}: AdminPanelProps) {
  const { t } = useTranslation("contest");
  const [searchParams, setSearchParams] = useSearchParams();
  const drawerQuestionId = searchParams.get("question");

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

  const closeDrawer = useCallback(() => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("question");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const openDrawer = useCallback((questionId: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("question", questionId);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!drawerQuestionId || !drawerQuestion) return;
    void loadQuestionDetail(drawerQuestionId);
  }, [drawerQuestionId, drawerQuestion, loadQuestionDetail]);

  useEffect(() => {
    if (drawerQuestionId && dashboard && !drawerQuestion) {
      closeDrawer();
    }
  }, [closeDrawer, dashboard, drawerQuestion, drawerQuestionId]);

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

  const scoreDistributionChartOptions = useMemo(
    () => ({
      title: "",
      height: "260px",
      theme: "g90" as const,
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
            acc[bucket.rangeLabel] = "#4589ff";
            return acc;
          },
          {},
        ),
      },
    }),
    [dashboard?.scoreDistribution, t],
  );

  if (contest?.contestType === "coding") {
    return (
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <div className={styles.titleMeta}>
            <span className={styles.panelTitle}>
              {t("statistics.resultSummary", "結果摘要")}
            </span>
          </div>
        </div>
        <div className={styles.emptyGrid}>
          <p>{t("statistics.codingNotSupported", "目前不支援 Coding 考試的結果分析")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <div className={styles.titleMeta}>
            <span className={styles.panelTitle}>
              {t("statistics.resultSummary", "結果摘要")}
            </span>
          </div>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <div className={styles.titleMeta}>
            <span className={styles.panelTitle}>
              {t("statistics.resultSummary", "結果摘要")}
            </span>
          </div>
        </div>
        <div className={styles.emptyGrid}>
          <p>{error ?? t("statistics.noData", "無法載入資料")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.titleMeta}>
          <span className={styles.panelTitle}>
            {t("statistics.resultSummary", "結果摘要")}
          </span>
          <Tag
            type={
              dashboard.contest.resultsPublished ? "green" : "cool-gray"
            }
            size="sm"
          >
            {dashboard.contest.resultsPublished
              ? t("statistics.resultsPublished", "已發布")
              : t("statistics.resultsUnpublished", "未發布")}
          </Tag>
        </div>
      </div>

      {/* Two-column body */}
      <div className={styles.body}>
        {/* Left: Summary */}
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
                data={scoreDistributionChartData}
                options={scoreDistributionChartOptions}
              />
            </div>
          </div>
        </div>

        {/* Right: Question Grid */}
        <div className={styles.questionColumn}>
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
        </div>
      </div>

      {/* Drawer */}
      <QuestionDetailDrawer
        question={drawerQuestion}
        detail={drawerDetail}
        error={drawerError}
        loading={drawerQuestionId ? Boolean(detailLoadingIds[drawerQuestionId]) : false}
        onClose={closeDrawer}
      />
    </div>
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
  const totalParticipants = question.answerCount + question.missingCount;
  const answerRate = totalParticipants > 0
    ? Math.round((question.answerCount / totalParticipants) * 100)
    : 0;
  const isObjective =
    question.kind === "single_choice" ||
    question.kind === "multiple_choice" ||
    question.kind === "true_false";
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
          <span>平均 {question.averageScore.toFixed(1)} / {question.maxScore}</span>
          <span>·</span>
          <span>{question.answerCount} 人作答</span>
        </div>
        <RateBar
          className={styles.previewProgress}
          label="得分率"
          value={question.scoreRate}
          tone={attention.tone}
        />
        <div className={styles.previewMetrics}>
          {isObjective ? (
            <>
              <MetricPill
                label="正答率"
                value={`${question.objectiveStats?.correctRate ?? 0}%`}
              />
              <MetricPill label="作答率" value={`${answerRate}%`} />
            </>
          ) : (
            <>
              <MetricPill
                label="已批改"
                value={`${question.subjectiveStats?.gradedCount ?? 0} / ${question.answerCount}`}
              />
              <MetricPill
                label="批改率"
                value={`${question.subjectiveStats?.gradingRate ?? 0}%`}
              />
            </>
          )}
        </div>
      </div>
    </button>
  );
});

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.metricPill}>
      <span className={styles.metricPillLabel}>{label}</span>
      <span className={styles.metricPillValue}>{value}</span>
    </span>
  );
}

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

function QuestionDetailDrawer({
  question,
  detail,
  error,
  loading,
  onClose,
}: {
  question: QuestionSummaryMock | null;
  detail: QuestionDetailMock | null | undefined;
  error: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const isOpen = question !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  return (
    <>
      <div
        className={`${styles.drawerBackdrop} ${isOpen ? styles.drawerBackdropVisible : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`}
        aria-label="Question detail"
      >
        {question && (
          <DrawerContent
            question={question}
            detail={detail ?? null}
            error={error}
            loading={loading}
            onClose={onClose}
          />
        )}
      </aside>
    </>
  );
}

function DrawerContent({
  question,
  detail,
  error,
  loading,
  onClose,
}: {
  question: QuestionSummaryMock;
  detail: QuestionDetailMock | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const questionVisual = getQuestionVisual(question.kind);

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
              <MarkdownRenderer enableMath enableHighlight>
                {question.title}
              </MarkdownRenderer>
            </div>
            <div className={styles.drawerMeta}>
              <span>
                {question.averageScore.toFixed(1)} / {question.maxScore}
              </span>
              <span>{question.answerCount} 人作答</span>
              <span>{question.missingCount} 人未作答</span>
            </div>
          </div>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            iconDescription="Close"
            renderIcon={Close}
            onClick={onClose}
          />
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
              <MarkdownRenderer enableMath enableHighlight>
                {question.title}
              </MarkdownRenderer>
            </div>
            <div className={styles.drawerMeta}>
              <span>
                {question.averageScore.toFixed(1)} / {question.maxScore}
              </span>
              <span>{question.answerCount} 人作答</span>
              <span>{question.missingCount} 人未作答</span>
            </div>
          </div>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            iconDescription="Close"
            renderIcon={Close}
            onClick={onClose}
          />
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
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            iconDescription="Close"
            renderIcon={Close}
            onClick={onClose}
          />
        </div>
        <DrawerSkeleton />
      </>
    );
  }

  const objectiveDetail = isObjectiveDetail(detail) ? detail : null;
  const subjectiveDetail = isSubjectiveDetail(detail) ? detail : null;
  const codingDetail = isCodingDetail(detail) ? detail : null;

  return (
    <>
      <div className={styles.drawerHeader}>
        <div>
          <h2 className={styles.drawerTitle}>
            {questionVisual.Icon && <questionVisual.Icon size={18} />}
            Q{question.order} · {questionVisual.label}
          </h2>
          <div className={styles.drawerPrompt}>
            <MarkdownRenderer enableMath enableHighlight>
              {question.title}
            </MarkdownRenderer>
          </div>
          <div className={styles.drawerMeta}>
            <span>
              {question.averageScore.toFixed(1)} / {question.maxScore}
            </span>
            <span>{question.answerCount} 人作答</span>
            <span>{question.missingCount} 人未作答</span>
          </div>
        </div>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          iconDescription="Close"
          renderIcon={Close}
          onClick={onClose}
        />
      </div>

      <section className={styles.drawerSection}>
        <h3 className={styles.drawerSectionTitle}>分數分布</h3>
        <MiniBarList data={detail.scoreBands} />
      </section>

      {objectiveDetail && (
        <>
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>選項分布</h3>
            <MiniBarList
              data={objectiveDetail.optionDistribution.map((item) => ({
                label: item.label,
                count: item.count,
                tone: item.isCorrect ? "success" : "default",
                suffix: `${item.percent}%`,
              }))}
            />
          </section>
          <div className={styles.infoCallout}>
            未作答 {objectiveDetail.omittedCount} 人
          </div>
        </>
      )}

      {subjectiveDetail && (
        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHeader}>
            <h3 className={styles.drawerSectionTitle}>批改進度</h3>
            <span className={styles.sectionMeta}>
              {subjectiveDetail.gradingProgress.graded} /{" "}
              {subjectiveDetail.gradingProgress.total}
            </span>
          </div>
          <RateBar
            label="批改率"
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

      {codingDetail && (
        <>
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>Status 分布</h3>
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
                  平均提交次數
                </span>
                <strong>{codingDetail.avgSubmissions.toFixed(1)}</strong>
              </Tile>
              <Tile className={styles.detailMetricCard}>
                <span className={styles.detailMetricLabel}>
                  首 AC 中位數
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
              <h3 className={styles.drawerSectionTitle}>常見失敗類型</h3>
              <Button kind="ghost" size="sm">
                查看提交樣本
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
    <div className={`${styles.rateBar} ${className ?? ""}`}>
      <div className={styles.rateBarHeader}>
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className={styles.rateBarTrack}>
        <div
          className={`${styles.rateBarFill} ${
            tone === "critical"
              ? styles.rateBarFillCritical
              : tone === "warning"
                ? styles.rateBarFillWarning
                : styles.rateBarFillSuccess
          }`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
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
