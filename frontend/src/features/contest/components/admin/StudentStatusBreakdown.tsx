import { Tile, Button, Layer } from "@carbon/react";
import {
  Renew,
  CircleDash,
  InProgress,
  PauseFilled,
  Locked,
  CheckmarkFilled,
} from "@carbon/icons-react";
import type { DashboardKpi } from "@/features/contest/screens/admin/mockData";
import styles from "./StudentStatusBreakdown.module.scss";

interface StudentStatusBreakdownProps {
  kpi: DashboardKpi;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

const statusDefs = [
  {
    key: "notStartedCount",
    label: "未開始",
    icon: CircleDash,
    color: "var(--cds-text-secondary)",
  },
  {
    key: "inProgressCount",
    label: "進行中",
    icon: InProgress,
    color: "var(--cds-support-info)",
  },
  {
    key: "pausedCount",
    label: "已暫停",
    icon: PauseFilled,
    color: "var(--cds-text-secondary)",
  },
  {
    key: "lockedCount",
    label: "已鎖定",
    icon: Locked,
    color: "var(--cds-support-error)",
  },
  {
    key: "submittedCount",
    label: "已交卷",
    icon: CheckmarkFilled,
    color: "var(--cds-support-success)",
  },
] as const;

export default function StudentStatusBreakdown({
  kpi,
  onRefresh,
  isRefreshing = false,
}: StudentStatusBreakdownProps) {
  const total = kpi.totalParticipants || 1;
  const submittedPercent = Math.round((kpi.submittedCount / total) * 100);

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>學生狀態分佈</h3>
        <Button
          kind="ghost"
          renderIcon={Renew}
          hasIconOnly
          iconDescription="重新整理"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
        />
      </div>

      <div className={styles.grid}>
        {statusDefs.map(({ key, label, icon: Icon, color }) => {
          const count = kpi[key];
          const percent = Math.round((count / total) * 100);
          return (
            <Layer key={key} level={2}>
              <Tile className={styles.tile}>
                <div className={styles.tileBadge} style={{ color }}>
                  <Icon size={16} />
                  <span>{label}</span>
                </div>
                <span className={styles.tileCount}>
                  {count}
                  <span className={styles.tileUnit}> 人</span>
                </span>
                <span className={styles.tilePercent}>{percent}%</span>
              </Tile>
            </Layer>
          );
        })}
      </div>

      <div className={styles.progressFooter}>
        <div className={styles.progressWrap}>
          <div
            className={styles.progressFill}
            style={{ width: `${submittedPercent}%` }}
          />
        </div>
        <span className={styles.progressLabel}>
          已交卷 {kpi.submittedCount}/{kpi.totalParticipants}（{submittedPercent}%）
        </span>
      </div>
    </div>
  );
}
