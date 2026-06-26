import { useMemo } from "react";
import { Modal, Button } from "@carbon/react";
import { LollipopChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import type { ExamQuestionScorePolicy } from "@/core/entities/contest.entity";
import type { ScoreImpactResult } from "../scorePolicyImpact.utils";
import styles from "./ScorePolicyImpactDialog.module.scss";

const POLICY_LABEL: Record<ExamQuestionScorePolicy, string> = {
  normal: "正常計分",
  full_marks: "送分",
  excluded: "不計分",
  redistribute: "重新分配",
};

interface ScorePolicyImpactDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onBackToTargetSelection?: () => void;
  newPolicy: ExamQuestionScorePolicy;
  /** null = loading / data not available */
  impactResult: ScoreImpactResult | null;
  /** Whether the API call is in-flight */
  submitting?: boolean;
}

export default function ScorePolicyImpactDialog({
  open,
  onClose,
  onConfirm,
  onBackToTargetSelection,
  newPolicy,
  impactResult,
  submitting,
}: ScorePolicyImpactDialogProps) {
  const { theme } = useTheme();
  const chartTheme = useMemo(() => {
    if (theme === "g10" || theme === "g90" || theme === "g100") return theme;
    return "white" as const;
  }, [theme]);

  const isDanger = newPolicy === "excluded";
  const hasData = impactResult !== null && impactResult.beforeScores.length > 0;

  const makeChartData = (buckets: ScoreImpactResult["beforeDistribution"]) =>
    buckets.map((b) => ({ group: b.rangeLabel, value: b.count }));

  const makeChartOptions = (buckets: ScoreImpactResult["beforeDistribution"]) => ({
    title: "",
    height: "200px",
    theme: chartTheme,
    toolbar: { enabled: false },
    legend: { enabled: false },
    axes: {
      left: { mapsTo: "group", scaleType: ScaleTypes.LABELS, visible: true },
      bottom: { mapsTo: "value", scaleType: ScaleTypes.LINEAR, visible: true },
    },
    grid: { x: { enabled: false }, y: { enabled: false } },
    color: {
      scale: Object.fromEntries(
        buckets.map((b) => [b.rangeLabel, "var(--cds-link-primary)"]),
      ),
    },
  });

  const fmt = (n: number) => n.toFixed(2);

  return (
    <Modal
      open={open}
      modalHeading={`調整配分政策：${POLICY_LABEL[newPolicy]}`}
      primaryButtonText="確認套用"
      secondaryButtonText="取消"
      onRequestSubmit={onConfirm}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      primaryButtonDisabled={submitting}
      danger={isDanger}
      size="md"
    >
      <p style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
        以下顯示套用後全班成績分佈的預估變化，確認後才會正式儲存。
      </p>

      {!hasData ? (
        <div className={styles.noData}>尚無學生作答資料，仍可繼續調整</div>
      ) : (
        <div className={styles.grid}>
          {/* Before column */}
          <div className={styles.column}>
            <span className={styles.columnLabel}>調整前</span>
            <span className={styles.avgLine}>
              平均&nbsp;{fmt(impactResult!.beforeAvg)}&nbsp;
              <span className={styles.maxPart}>/ {fmt(impactResult!.beforeMax)} 分</span>
            </span>
            <div className={styles.chartFrame}>
              <LollipopChart
                data={makeChartData(impactResult!.beforeDistribution)}
                options={makeChartOptions(impactResult!.beforeDistribution)}
              />
            </div>
          </div>

          {/* After column */}
          <div className={styles.column}>
            <span className={styles.columnLabel}>調整後</span>
            <span className={styles.avgLine}>
              平均&nbsp;{fmt(impactResult!.afterAvg)}&nbsp;
              <span className={styles.maxPart}>/ {fmt(impactResult!.afterMax)} 分</span>
            </span>
            <div className={styles.chartFrame}>
              <LollipopChart
                data={makeChartData(impactResult!.afterDistribution)}
                options={makeChartOptions(impactResult!.afterDistribution)}
              />
            </div>
          </div>
        </div>
      )}

      {onBackToTargetSelection && (
        <>
          <hr className={styles.divider} />
          <div className={styles.backLink}>
            <Button kind="ghost" size="sm" onClick={onBackToTargetSelection}>
              ↩ 重選目標題目
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
