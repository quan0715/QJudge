import { Tag, Tile } from "@carbon/react";
import {
  UserMultiple,
  Task,
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
  isMockData?: boolean;
}

export default function KpiCards({
  kpi,
  contest,
  isMockData = false,
}: KpiCardsProps) {
  const state = getContestState(contest);
  const startDate = new Date(contest.startTime).toLocaleDateString();
  const endDate = new Date(contest.endTime).toLocaleDateString();

  return (
    <section className={styles.hero}>
      <div className={styles.topRow}>
        {/* Left Column — Contest Info */}
        <div className={styles.infoCol}>
          <h1 className={styles.title}>{contest.name}</h1>

          <div className={styles.metaRow}>
            <Tag type={getContestStateColor(state)} size="sm">
              {getContestStateLabel(state)}
            </Tag>
            {isMockData ? (
              <Tag type="magenta" size="sm">
                Mock
              </Tag>
            ) : null}
            <span className={styles.timeRange}>
              {startDate} → {endDate}
            </span>
          </div>

          {isMockData ? (
            <p className={styles.mockNote}>
              KPI 含前端模擬資料，僅供介面展示。
            </p>
          ) : null}

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
            <Task size={20} className={styles.icon} />
            <span className={styles.miniLabel}>Submissions</span>
            <span className={styles.miniValue}>{kpi.totalSubmissions}</span>
          </Tile>

          <Tile className={styles.miniCard}>
            <ChartBar size={20} className={styles.icon} />
            <span className={styles.miniLabel}>Avg Score</span>
            <span className={styles.miniValue}>
              {kpi.averageScore.toFixed(1)}
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

      {/* Bottom Row — Stat Badges */}
      <div className={styles.badgeRow}>
        <Tag type="green" size="sm">{kpi.submittedCount} submitted</Tag>
        <Tag type="blue" size="sm">{kpi.inProgressCount} in progress</Tag>
        <Tag type={kpi.lockedCount > 0 ? "red" : "gray"} size="sm">
          {kpi.lockedCount} locked
        </Tag>
        <Tag type="teal" size="sm">Accept Rate {kpi.acceptRate.toFixed(1)}%</Tag>
        <Tag type="teal" size="sm">Highest Score {kpi.highestScore.toFixed(1)}</Tag>
      </div>
    </section>
  );
}
