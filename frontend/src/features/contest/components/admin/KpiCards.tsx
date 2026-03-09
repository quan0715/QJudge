import { Tag } from "@carbon/react";
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
import { OverviewDataCards } from "@/shared/ui/dataCard";
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
          <OverviewDataCards
            items={[
              {
                key: "participants",
                icon: UserMultiple,
                label: "Participants",
                value: String(kpi.totalParticipants),
              },
              {
                key: "averageScore",
                icon: ChartBar,
                label: "Avg Score",
                value: kpi.averageScore.toFixed(1),
              },
              {
                key: "highestScore",
                icon: Trophy,
                label: "Highest Score",
                value: kpi.highestScore.toFixed(1),
              },
              {
                key: "violations",
                icon: WarningAlt,
                label: "Violations",
                value: String(kpi.totalViolations),
                tone: kpi.totalViolations > 0 ? "warning" : "default",
              },
            ]}
          />
        </div>
      </div>
      </div>
    </section>
  );
}
