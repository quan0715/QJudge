import { Tile, Layer } from "@carbon/react";
import {
  CircleDash,
  InProgress,
  PauseFilled,
  CheckmarkFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ParticipantStatusKpi } from "@/features/contest/screens/admin/participantStatusKpi";
import styles from "./StudentStatusBreakdown.module.scss";

interface StudentStatusBreakdownProps {
  kpi: ParticipantStatusKpi;
}

const STATUS_DEFS = [
  { key: "notStartedCount" as const, statusKey: "not_started", icon: CircleDash, color: "var(--cds-text-secondary)" },
  { key: "inProgressCount" as const, statusKey: "in_progress", icon: InProgress, color: "var(--cds-support-info)" },
  { key: "pausedOrLockedCount" as const, statusKey: "paused_or_locked", icon: PauseFilled, color: "var(--cds-support-warning)" },
  { key: "submittedCount" as const, statusKey: "submitted", icon: CheckmarkFilled, color: "var(--cds-support-success)" },
];

export default function StudentStatusBreakdown({
  kpi,
}: StudentStatusBreakdownProps) {
  const { t } = useTranslation("contest");
  const total = kpi.totalParticipants || 1;
  const submittedPercent = Math.round((kpi.submittedCount / total) * 100);

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t("studentStatus.title", "學生狀態分佈")}</h3>
      </div>

      <div className={styles.grid}>
        {STATUS_DEFS.map(({ key, statusKey, icon: Icon, color }) => {
          const count = kpi[key];
          const percent = Math.round((count / total) * 100);
          return (
            <Layer key={key} level={2} className={styles.tileWrap}>
              <Tile className={styles.tile}>
                <div className={styles.tileBadge} style={{ color }}>
                  <Icon size={16} />
                  <span>
                    {statusKey === "paused_or_locked"
                      ? t("studentStatus.pausedLocked", "已暫停 / 已鎖定")
                      : t(`examStatus.${statusKey}`, statusKey)}
                  </span>
                </div>
                <span className={styles.tileCount}>
                  {t("studentStatus.personCount", { count })}
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
          {t("studentStatus.submittedProgress", { submitted: kpi.submittedCount, total: kpi.totalParticipants, percent: submittedPercent })}
        </span>
      </div>
    </div>
  );
}
