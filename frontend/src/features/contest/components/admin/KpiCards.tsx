import { Tag, Tile } from "@carbon/react";
import {
  UserMultiple,
  Trophy,
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

        {/* Right Column — 2×2 KPI Grid */}
        <div className={styles.kpiGrid}>
          <Tile className={styles.miniCard}>
            <UserMultiple size={20} className={styles.icon} />
            <span className={styles.miniLabel}>Participants</span>
            <span className={styles.miniValue}>{kpi.totalParticipants}</span>
          </Tile>

          <Tile className={styles.miniCard}>
            <ChartBar size={20} className={styles.icon} />
            <span className={styles.miniLabel}>Avg Score</span>
            <span className={styles.miniValue}>
              {kpi.averageScore.toFixed(1)}
            </span>
          </Tile>

          <Tile className={styles.miniCard}>
            <Trophy size={20} className={styles.icon} />
            <span className={styles.miniLabel}>Highest Score</span>
            <span className={styles.miniValue}>
              {kpi.highestScore.toFixed(1)}
            </span>
          </Tile>

          <Tile className={styles.miniCard}>
            <WarningAlt size={20} className={styles.icon} />
            <span className={styles.miniLabel}>Violations</span>
            <span
              className={`${styles.miniValue} ${kpi.totalViolations > 0 ? styles.warningValue : ""}`}
            >
              {kpi.totalViolations}
            </span>
          </Tile>
        </div>
      </div>
      </div>
    </section>
  );
}
