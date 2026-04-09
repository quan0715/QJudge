import { useCallback, useEffect, useMemo, useState } from "react";
import { SimpleBarChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import {
  Button,
  ProgressBar,
  Tag,
  Tile,
} from "@carbon/react";
import { Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import {
  createContestResultDashboardMock,
  dashboardTypeLabels,
  type QuestionDetailMock,
  type QuestionSummaryMock,
} from "./contestResultDashboard.mock";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import styles from "./ContestResultDashboardPanel.module.scss";

/* ── Constants ── */

const DONUT_RADIUS = 14;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/* ── Main Component ── */

export default function ContestResultDashboardPanel({
  contest,
}: AdminPanelProps) {
  const { t } = useTranslation("contest");
  const [drawerQuestionId, setDrawerQuestionId] = useState<string | null>(null);

  const dashboard = useMemo(
    () => createContestResultDashboardMock(contest),
    [contest],
  );

  const sortedQuestions = useMemo(
    () => [...dashboard.questions].sort((a, b) => a.order - b.order),
    [dashboard.questions],
  );

  const drawerQuestion =
    sortedQuestions.find((q) => q.questionId === drawerQuestionId) ?? null;
  const drawerDetail = drawerQuestionId
    ? dashboard.details[drawerQuestionId]
    : null;

  const closeDrawer = useCallback(() => setDrawerQuestionId(null), []);

  const completionRate = Math.round(
    (dashboard.contest.completedCount / dashboard.contest.participantCount) *
      100,
  );

  const isCodingSummaryOnly = dashboard.contest.contestType === "coding";

  const scoreDistributionChartData = useMemo(
    () =>
      dashboard.scoreDistribution.map((bucket) => ({
        group: bucket.rangeLabel,
        value: bucket.count,
      })),
    [dashboard.scoreDistribution],
  );

  const scoreDistributionChartOptions = useMemo(
    () => ({
      title: "",
      height: "220px",
      toolbar: { enabled: false },
      legend: { enabled: false },
      axes: {
        left: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          title: t("statistics.studentCount", "人數"),
        },
        bottom: {
          mapsTo: "group",
          scaleType: ScaleTypes.LABELS,
          title: t("statistics.scoreRange", "分數區間"),
        },
      },
      color: {
        scale: dashboard.scoreDistribution.reduce<Record<string, string>>(
          (acc, bucket) => {
            acc[bucket.rangeLabel] = "#4589ff";
            return acc;
          },
          {},
        ),
      },
    }),
    [dashboard.scoreDistribution, t],
  );

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
          <section
            className={styles.kpiGrid}
            aria-label={t("statistics.summaryArea", "總覽摘要")}
          >
            <KpiCard
              label={t("statistics.avgTotalScore", "平均總分")}
              value={`${dashboard.summary.averageScore.toFixed(1)} / 100`}
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

          <Tile className={styles.chartCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                {t("statistics.scoreDistribution", "總分分布")}
              </h2>
              <div className={styles.referenceBadges}>
                <span className={styles.referenceBadge}>
                  {t("statistics.avgLabel", "平均")}{" "}
                  {dashboard.summary.averageScore.toFixed(1)}
                </span>
                <span className={styles.referenceBadge}>
                  {t("statistics.medianLabel", "中位數")}{" "}
                  {dashboard.summary.medianScore}
                </span>
              </div>
            </div>
            <div className={styles.chartWrap}>
              <SimpleBarChart
                data={scoreDistributionChartData}
                options={scoreDistributionChartOptions}
              />
            </div>
          </Tile>
        </div>

        {/* Right: Question Grid */}
        <div className={styles.questionColumn}>
          {isCodingSummaryOnly ? (
            <Tile className={styles.basicInfoCard}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  {t(
                    "statistics.codingBasicOnly",
                    "Coding 結果先保留基本資訊",
                  )}
                </h2>
              </div>
              <p className={styles.basicInfoCopy}>
                {t(
                  "statistics.codingBasicOnlyDesc",
                  "目前只顯示整體分數分布與 KPI。每題深入分析、狀態分布與提交樣本先不在這個版本處理。",
                )}
              </p>
            </Tile>
          ) : (
            <>
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
                  <p>
                    {t("statistics.noQuestionData", "目前沒有題目資料")}
                  </p>
                </div>
              ) : (
                <div className={styles.questionGrid}>
                  {sortedQuestions.map((question) => (
                    <QuestionPreviewCard
                      key={question.questionId}
                      question={question}
                      isActive={question.questionId === drawerQuestionId}
                      onClick={() =>
                        setDrawerQuestionId(question.questionId)
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Drawer */}
      <QuestionDetailDrawer
        question={drawerQuestion}
        detail={drawerDetail}
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

/* ── DonutChart ── */

function donutColor(rate: number): string {
  if (rate >= 70) return "var(--cds-support-success, #42be65)";
  if (rate >= 40) return "var(--cds-support-warning, #f1c21b)";
  return "var(--cds-support-error, #da1e28)";
}

function DonutChart({
  rate,
  score,
  maxScore,
}: {
  rate: number;
  score: number;
  maxScore: number;
}) {
  const filled = (rate / 100) * DONUT_CIRCUMFERENCE;
  const gap = DONUT_CIRCUMFERENCE - filled;

  return (
    <div className={styles.donutGroup}>
      <div className={styles.donutWrap}>
        <svg viewBox="0 0 36 36" width="48" height="48" aria-hidden="true">
          <circle
            cx="18"
            cy="18"
            r={DONUT_RADIUS}
            fill="none"
            stroke="var(--cds-layer-02, #2a2a4a)"
            strokeWidth="3.5"
          />
          <circle
            cx="18"
            cy="18"
            r={DONUT_RADIUS}
            fill="none"
            stroke={donutColor(rate)}
            strokeWidth="3.5"
            strokeDasharray={`${filled} ${gap}`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
        </svg>
        <div className={styles.donutLabel}>{Math.round(rate)}%</div>
      </div>
      <div className={styles.donutScore}>
        <span className={styles.previewScore}>{score.toFixed(1)}</span>
        <span className={styles.previewScoreMax}>/ {maxScore}</span>
      </div>
    </div>
  );
}

/* ── QuestionPreviewCard ── */

function QuestionPreviewCard({
  question,
  isActive,
  onClick,
}: {
  question: QuestionSummaryMock;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.previewCard} ${isActive ? styles.previewCardActive : ""}`}
      onClick={onClick}
      aria-pressed={isActive}
    >
      <div className={styles.previewCardMeta}>
        Q{question.order} · {dashboardTypeLabels[question.kind]}
      </div>
      <div className={styles.previewCardTitle}>{question.title}</div>
      <DonutChart
        rate={question.scoreRate}
        score={question.averageScore}
        maxScore={question.maxScore}
      />
    </button>
  );
}

/* ── QuestionDetailDrawer ── */

function QuestionDetailDrawer({
  question,
  detail,
  onClose,
}: {
  question: QuestionSummaryMock | null;
  detail: QuestionDetailMock | null;
  onClose: () => void;
}) {
  const isOpen = question !== null && detail !== null;

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
        {question && detail && (
          <DrawerContent
            question={question}
            detail={detail}
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
  onClose,
}: {
  question: QuestionSummaryMock;
  detail: QuestionDetailMock;
  onClose: () => void;
}) {
  return (
    <>
      <div className={styles.drawerHeader}>
        <div>
          <h2 className={styles.drawerTitle}>
            Q{question.order} · {question.title}
          </h2>
          <div className={styles.drawerMeta}>
            <Tag type="blue" size="sm">
              {dashboardTypeLabels[question.kind]}
            </Tag>
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

      {(detail.kind === "single_choice" ||
        detail.kind === "multiple_choice" ||
        detail.kind === "true_false") && (
        <>
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>選項分布</h3>
            <MiniBarList
              data={detail.optionDistribution.map((item) => ({
                label: item.label,
                count: item.count,
                tone: item.isCorrect ? "success" : "default",
                suffix: `${item.percent}%`,
              }))}
            />
          </section>
          <div className={styles.infoCallout}>
            未作答 {detail.omittedCount} 人
          </div>
        </>
      )}

      {(detail.kind === "short_answer" || detail.kind === "essay") && (
        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHeader}>
            <h3 className={styles.drawerSectionTitle}>批改進度</h3>
            <span className={styles.sectionMeta}>
              {detail.gradingProgress.graded} /{" "}
              {detail.gradingProgress.total}
            </span>
          </div>
          <ProgressBar
            label="grading-progress"
            hideLabel
            size="small"
            value={
              (detail.gradingProgress.graded /
                detail.gradingProgress.total) *
              100
            }
          />
        </section>
      )}

      {detail.kind === "coding" && (
        <>
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>Status 分布</h3>
            <MiniBarList
              data={detail.statusDistribution.map((item) => ({
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
                <strong>{detail.avgSubmissions.toFixed(1)}</strong>
              </Tile>
              <Tile className={styles.detailMetricCard}>
                <span className={styles.detailMetricLabel}>
                  首 AC 中位數
                </span>
                <strong>
                  {detail.medianFirstAcMinutes != null
                    ? `${detail.medianFirstAcMinutes}m`
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
              data={detail.commonFailures.map((item) => ({
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

function statusTone(status: string): "default" | "success" | "warning" {
  if (status === "AC") return "success";
  if (status === "Pending") return "warning";
  return "default";
}
