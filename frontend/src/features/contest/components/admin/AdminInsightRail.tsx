import { useMemo } from "react";
import { ScaleTypes } from "@carbon/charts";
import {
  LineChart as CarbonLineChart,
  MeterChart,
} from "@carbon/charts-react";
import "@carbon/charts-react/styles.css";
import { ProgressBar, SkeletonPlaceholder, SkeletonText } from "@carbon/react";
import type {
  DashboardChartSeries,
  DashboardInsightCard,
  DistributionItem,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import styles from "./AdminInsightRail.module.scss";

interface AdminInsightRailProps {
  cards: DashboardInsightCard[];
  distribution?: DistributionItem[];
  loadingCardKeys?: string[];
  distributionLoading?: boolean;
}

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

const ProgressChart = ({ card }: { card: DashboardInsightCard }) => {
  const progress = Math.max(0, Math.min(100, card.progressPercent ?? 0));
  return (
    <ProgressBar
      label={card.title}
      hideLabel
      size="small"
      value={Math.round(progress)}
      className={styles.rightPanelProgressBar}
    />
  );
};

const DISTRIBUTION_TONE_COLOR: Record<DistributionItem["key"], string> = {
  in_progress: "var(--cds-support-info)",
  not_started: "var(--cds-text-placeholder)",
  submitted: "var(--cds-support-success)",
  locked: "var(--cds-support-error)",
  offline: "var(--cds-icon-disabled)",
};

const normalizePrioritySeriesGroup = (series: DashboardChartSeries) =>
  (series.key || series.label || "P2").toUpperCase();

const toLineChartData = (series: DashboardChartSeries[]) => {
  const data = series.flatMap((item) =>
    item.values.map((point) => ({
      group: normalizePrioritySeriesGroup(item),
      label: point.label,
      value: point.value,
    })),
  );

  if (data.length > 0) return data;
  return [
    { group: "P0", label: "目前", value: 0 },
    { group: "P1", label: "目前", value: 0 },
    { group: "P2", label: "目前", value: 0 },
  ];
};

const PriorityLineChart = ({
  series,
  theme,
}: {
  series: DashboardChartSeries[];
  theme: "white" | "g10" | "g90" | "g100";
}) => {
  const data = useMemo(() => toLineChartData(series), [series]);
  const options = useMemo(
    () => ({
      title: "",
      height: "112px",
      theme,
      toolbar: { enabled: false },
      legend: { enabled: false },
      axes: {
        bottom: {
          mapsTo: "label",
          scaleType: ScaleTypes.LABELS,
          visible: false,
        },
        left: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          visible: false,
        },
      },
      grid: {
        x: {
          enabled: false,
        },
        y: {
          enabled: false,
        },
      },
      color: {
        scale: {
          P0: "#da1e28",
          P1: "#ff832b",
          P2: "#a56eff",
        },
      },
      curve: "curveMonotoneX",
      data: {
        groupMapsTo: "group",
      },
      tooltip: {
        enabled: true,
      },
    }),
    [theme],
  );

  return (
    <div className={styles.chartFrame} aria-label="違規事件時間變化">
      <CarbonLineChart data={data} options={options} />
    </div>
  );
};

const DistributionOverview = ({
  distribution,
  loading = false,
  theme,
}: {
  distribution: DistributionItem[];
  loading?: boolean;
  theme: "white" | "g10" | "g90" | "g100";
}) => {
  const visibleDistribution = distribution.filter(
    (item) => item.key !== "offline",
  );
  const total = visibleDistribution.reduce((sum, item) => sum + item.value, 0);
  const segments = visibleDistribution;
  const distributionChartData = segments.map((item) => ({
    group: item.label,
    value: item.value,
  }));
  const submittedCount =
    visibleDistribution.find((item) => item.key === "submitted")?.value ?? 0;
  const completionPercent =
    total > 0 ? Math.round((submittedCount / total) * 100) : 0;
  const chartColorScale = segments.reduce<Record<string, string>>((scale, item) => {
    scale[item.label] = DISTRIBUTION_TONE_COLOR[item.key];
    return scale;
  }, {});
  if (visibleDistribution.length === 0 && !loading) return null;

  return (
    <section
      className={styles.card}
      aria-busy={loading}
      aria-label="考生分佈總覽"
    >
      {loading ? (
        <div className={styles.distributionList}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={styles.distributionItem}>
              <SkeletonText width="75%" />
              <SkeletonText width="100%" />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.distributionChartFrame}>
          <MeterChart
            data={distributionChartData}
            options={{
              title: "考生分佈總覽",
              height: "180px",
              resizable: true,
              theme,
              meter: {
                height: 8,
                proportional: {
                  unit: "人",
                  breakdownFormatter: () =>
                    `已交卷 ${submittedCount} / ${total} 人（完成率 ${completionPercent}%）`,
                  totalFormatter: (value) => `考生總數 ${value} 人`,
                },
              },
              legend: {
                enabled: true,
                position: "bottom",
              },
              color: {
                scale: chartColorScale,
              },
              toolbar: { enabled: false },
            }}
          />
        </div>
      )}
    </section>
  );
};

export default function AdminInsightRail({
  cards,
  distribution = [],
  loadingCardKeys = [],
  distributionLoading = false,
}: AdminInsightRailProps) {
  const { theme } = useTheme();
  const chartTheme = resolveCarbonChartTheme(theme);
  const loadingKeys = useMemo(
    () => new Set(loadingCardKeys),
    [loadingCardKeys],
  );
  const primaryCards = cards.filter(
    (card) => card.key !== "grading_progress" && card.key !== "priority_events",
  );
  const gradingCards = cards.filter((card) => card.key === "grading_progress");

  return (
    <div className={styles.root}>
      {primaryCards.map((card) => (
        <InsightCard
          key={card.key}
          card={card}
          chartTheme={chartTheme}
          loading={loadingKeys.has(card.key)}
        />
      ))}
      <DistributionOverview
        distribution={distribution}
        loading={distributionLoading}
        theme={chartTheme}
      />
      {gradingCards.map((card) => (
        <InsightCard
          key={card.key}
          card={card}
          chartTheme={chartTheme}
          loading={loadingKeys.has(card.key)}
        />
      ))}
    </div>
  );
}

export function PriorityEventsInsightCard({
  card,
  loading = false,
}: {
  card?: DashboardInsightCard;
  loading?: boolean;
}) {
  const { theme } = useTheme();
  const chartTheme = resolveCarbonChartTheme(theme);
  if (!card && !loading) return null;
  return (
    <InsightCard
      card={
        card ?? {
          key: "priority_events",
          title: "違規事件",
          value: "0",
          kind: "line",
          series: [],
        }
      }
      chartTheme={chartTheme}
      loading={loading}
    />
  );
}

function InsightCard({
  card,
  chartTheme,
  loading,
}: {
  card: DashboardInsightCard;
  chartTheme: "white" | "g10" | "g90" | "g100";
  loading: boolean;
}) {
  const isGradingCard = card.key === "grading_progress";
  return (
    <section className={styles.card} aria-busy={loading}>
      <div className={styles.cardHeader}>
        <span>{card.title}</span>
        {loading ? (
          <SkeletonText heading width="5rem" />
        ) : (
          <strong>{card.value}</strong>
        )}
      </div>
      {loading ? (
        card.kind === "line" ? (
          <SkeletonPlaceholder className={styles.chartSkeleton} />
        ) : isGradingCard ? (
          <div className={styles.gradingSkeleton} aria-label="批改資料載入中">
            <SkeletonText width="100%" />
            <SkeletonText width="60%" />
            <SkeletonText width="72%" />
          </div>
        ) : (
          <SkeletonText width="100%" />
        )
      ) : card.kind === "line" ? (
        <PriorityLineChart series={card.series ?? []} theme={chartTheme} />
      ) : (
        <ProgressChart card={card} />
      )}
    </section>
  );
}
