import { useMemo } from "react";
import { LollipopChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import { SkeletonPlaceholder, SkeletonText } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { useContestResultDashboard } from "./useContestResultDashboard";
import styles from "./AdminExamResultOverview.module.scss";

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

const PASSING_SCORE_THRESHOLD_PERCENT = 60;

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

interface AdminExamResultOverviewProps {
  contest: ContestDetail | null | undefined;
  refreshKey?: number;
}

export default function AdminExamResultOverview({
  contest,
  refreshKey = 0,
}: AdminExamResultOverviewProps) {
  const { t } = useTranslation("contest");
  const { theme } = useTheme();
  const {
    data: dashboard,
    loading,
    error,
  } = useContestResultDashboard(contest, refreshKey);

  const chartData = useMemo(
    () =>
      dashboard
        ? dashboard.scoreDistribution.map((bucket) => ({
            group: bucket.rangeLabel,
            value: bucket.count,
          }))
        : [],
    [dashboard],
  );

  const chartTheme = resolveCarbonChartTheme(theme);
  const chartOptions = useMemo(
    () => ({
      title: "",
      height: "220px",
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
        scale: (dashboard?.scoreDistribution ?? []).reduce<
          Record<string, string>
        >((acc, bucket) => {
          acc[bucket.rangeLabel] = isFailingScoreBucket(bucket.rangeLabel)
            ? "var(--cds-support-error)"
            : "var(--cds-link-primary)";
          return acc;
        }, {}),
      },
    }),
    [chartTheme, dashboard?.scoreDistribution],
  );

  if (contest?.contestType === "coding") {
    return null;
  }

  if (loading) {
    return (
      <section className={styles.root} aria-label="考試結果總覽">
        <div className={styles.contentGrid}>
          <div className={styles.chartColumn}>
            <SkeletonText heading width="7rem" />
            <SkeletonPlaceholder className={styles.chartSkeleton} />
          </div>
          <div className={styles.metricGrid}>
            {Array.from({ length: 2 }).map((_, index) => (
              <div className={styles.metricCell} key={index}>
                <SkeletonText width="5rem" />
                <SkeletonText heading width="7rem" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !dashboard) {
    return (
      <section className={styles.root} aria-label="考試結果總覽">
        <div className={styles.emptyState}>
          {error ?? t("statistics.noData", "無法載入資料")}
        </div>
      </section>
    );
  }

  const completionRate =
    dashboard.contest.participantCount > 0
      ? Math.round(
          (dashboard.contest.completedCount /
            dashboard.contest.participantCount) *
            100,
        )
      : 0;
  const averageScoreRate =
    dashboard.summary.maxTotalScore > 0
      ? Math.round(
          (dashboard.summary.averageScore / dashboard.summary.maxTotalScore) *
            100,
        )
      : 0;
  const metrics = [
    {
      key: "average",
      label: t("statistics.avgTotalScore", "平均總分"),
      value: `${dashboard.summary.averageScore.toFixed(1)} / ${dashboard.summary.maxTotalScore}`,
      caption: `${averageScoreRate}%`,
    },
    {
      key: "completion",
      label: t("statistics.completionRate", "完成率"),
      value: `${completionRate}%`,
      caption: `${dashboard.contest.completedCount} / ${dashboard.contest.participantCount}`,
    },
  ];

  return (
    <section className={styles.root} aria-label="考試結果總覽">
      <div className={styles.contentGrid}>
        <div className={styles.chartColumn}>
          <div>
            <h3>{t("statistics.scoreDistribution", "分數分布")}</h3>
            <p>
              {t("statistics.averageReference", "平均")}{" "}
              {dashboard.summary.averageScore.toFixed(1)} · {"< "}
              {PASSING_SCORE_THRESHOLD_PERCENT}% 顯示紅色
            </p>
          </div>
          <div className={styles.chartFrame}>
            <LollipopChart data={chartData} options={chartOptions} />
          </div>
        </div>
        <div className={styles.metricGrid}>
          {metrics.map((metric) => (
            <div className={styles.metricCell} key={metric.key}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.caption}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
