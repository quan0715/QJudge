import { Tag } from "@carbon/react";
import {
  UserMultiple,
  ChartBar,
  WarningAlt,
} from "@carbon/icons-react";
import type { DashboardKpi } from "@/features/contest/screens/admin/mockData";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  getContestState,
  getContestStateLabel,
  getContestStateColor,
} from "@/core/entities/contest.entity";
import { KpiCard } from "@/shared/ui/dataCard";
import styles from "./KpiCards.module.scss";

interface KpiCardsProps {
  kpi: DashboardKpi;
  contest: ContestDetail;
}

export default function KpiCards({ kpi, contest }: KpiCardsProps) {
  const state = getContestState(contest);
  const startDate = new Date(contest.startTime).toLocaleDateString();
  const endDate = new Date(contest.endTime).toLocaleDateString();

  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
      <div className={styles.topRow}>
        {/* Left Column — Contest Info */}
        <div className={styles.infoCol}>
          <h1 className={styles.title}>{contest.name}</h1>

          <div className={styles.metaRow}>
            <Tag type={getContestStateColor(state)} size="sm">
              {getContestStateLabel(state)}
            </Tag>
            <span className={styles.timeRange}>
              {startDate} → {endDate}
            </span>
          </div>

          {contest.description && (
            <p className={styles.description}>{contest.description}</p>
          )}
        </div>

        {/* Right Column — Hero-style KPI strip */}
        <div className={styles.kpiGrid}>
          <div className={styles.kpiStrip}>
            <KpiCard
              icon={UserMultiple}
              value={String(kpi.totalParticipants)}
              label="Participants"
            />
            <KpiCard
              icon={ChartBar}
              value={kpi.averageScore.toFixed(1)}
              label="Avg Score"
            />
            <KpiCard
              icon={WarningAlt}
              value={
                kpi.totalViolations > 0 ? (
                  <span className={styles.warningValue}>{kpi.totalViolations}</span>
                ) : (
                  String(kpi.totalViolations)
                )
              }
              label="Violations"
            />
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
