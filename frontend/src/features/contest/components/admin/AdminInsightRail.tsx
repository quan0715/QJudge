import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScaleTypes } from "@carbon/charts";
import {
  LineChart as CarbonLineChart,
  MeterChart,
} from "@carbon/charts-react";
import "@carbon/charts-react/styles.css";
import { Button, ProgressBar, SkeletonPlaceholder, SkeletonText } from "@carbon/react";
import type {
  DashboardChartSeries,
  DashboardInsightCard,
  DistributionItem,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import {
  DashboardContainer,
  KPIBlock,
} from "@/shared/components/dashboard";
import styles from "./AdminInsightRail.module.scss";

interface AdminInsightRailProps {
  cards: DashboardInsightCard[];
  distribution?: DistributionItem[];
  /** 僅在總覽右欄第一區塊設為 true，避免多個 rail 重複顯示考生分佈卡片。 */
  showDistribution?: boolean;
  loadingCardKeys?: string[];
  distributionLoading?: boolean;
  gradingAction?: InsightCardAction;
}

export interface InsightCardAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  kind?: "primary" | "secondary" | "tertiary" | "danger--tertiary";
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
  const progressValue = Math.round(progress);
  return (
    <ProgressBar
      label={card.title}
      hideLabel
      size="small"
      value={progressValue}
      status={progressValue >= 100 ? "finished" : "active"}
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
  return series.flatMap((item) =>
    item.values.map((point) => ({
      group: normalizePrioritySeriesGroup(item),
      label: point.label,
      value: point.value,
    })),
  );
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
  const { t } = useTranslation("contest");
  const title = t(
    "adminOverview.widgets.studentDistribution",
    "考生分佈總覽",
  );
  const visibleDistribution = distribution.filter(
    (item) => item.key !== "offline",
  );
  const hasDistributionData = visibleDistribution.some((item) => item.value > 0);
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
  if (loading) {
    return (
      <section
        className={`${styles.card} ${styles.distributionCard}`}
        aria-busy
        aria-label={title}
      >
        <div className={styles.distributionList}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={styles.distributionItem}>
              <SkeletonText width="75%" />
              <SkeletonText width="100%" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <KPIBlock title={title} value={`${total} 人`} ariaLabel={title}>
      {hasDistributionData ? (
        <div className={styles.distributionChartFrame}>
          <MeterChart
            data={distributionChartData}
            options={{
              title: "",
              height: "108px",
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
              color: {
                scale: chartColorScale,
              },
              legend: {
                enabled: false,
              },
              toolbar: { enabled: false },
            }}
          />
        </div>
      ) : (
        <div className={styles.emptyState}>尚無考生分佈資料</div>
      )}
    </KPIBlock>
  );
};

export default function AdminInsightRail({
  cards,
  distribution = [],
  showDistribution = false,
  loadingCardKeys = [],
  distributionLoading = false,
  gradingAction,
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
    <DashboardContainer layout="stack" dividers="auto">
      {primaryCards.map((card) => (
        <InsightCard
          key={card.key}
          card={card}
          chartTheme={chartTheme}
          loading={loadingKeys.has(card.key)}
        />
      ))}
      {showDistribution ? (
        <DistributionOverview
          distribution={distribution}
          loading={distributionLoading}
          theme={chartTheme}
        />
      ) : null}
      {gradingCards.map((card) => (
        <InsightCard
          key={card.key}
          card={card}
          chartTheme={chartTheme}
          loading={loadingKeys.has(card.key)}
          action={gradingAction}
        />
      ))}
    </DashboardContainer>
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
  action,
}: {
  card: DashboardInsightCard;
  chartTheme: "white" | "g10" | "g90" | "g100";
  loading: boolean;
  action?: InsightCardAction;
}) {
  const isGradingCard = card.key === "grading_progress";
  const hasPriorityEventData =
    card.kind !== "line" ||
    (card.series ?? []).some((group) =>
      group.values.some((point) => point.value > 0),
    );
  return (
    <KPIBlock
      title={card.title}
      value={
        loading ? <SkeletonText heading width="5rem" /> : card.value
      }
      ariaLabel={card.title}
    >
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
        hasPriorityEventData ? (
          <PriorityLineChart series={card.series ?? []} theme={chartTheme} />
        ) : (
          <div className={styles.emptyState}>尚無違規事件資料</div>
        )
      ) : (
        <ProgressChart card={card} />
      )}
      {isGradingCard && action ? (
        <Button
          kind={action.kind ?? "primary"}
          onClick={action.onClick}
          disabled={loading || action.disabled || action.loading}
          className={styles.cardActionButton}
        >
          {action.loading ? action.loadingLabel ?? action.label : action.label}
        </Button>
      ) : null}
    </KPIBlock>
  );
}
