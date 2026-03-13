import { Tag } from "@carbon/react";
import {
  UserMultiple,
  ChartBar,
  Education,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  ContestDetail,
  ContestOverviewMetrics,
} from "@/core/entities/contest.entity";
import {
  getContestState,
  getContestStateLabel,
  getContestStateColor,
} from "@/core/entities/contest.entity";
import { KpiCard } from "@/shared/ui/dataCard";
import { resolveOverviewSnapshot } from "./overviewMetrics.utils";
import styles from "./KpiCards.module.scss";

interface KpiCardsProps {
  contest: ContestDetail;
  overviewMetrics: ContestOverviewMetrics | null;
}

export default function KpiCards({ contest, overviewMetrics }: KpiCardsProps) {
  const { t } = useTranslation("contest");
  const state = getContestState(contest);
  const startDate = new Date(contest.startTime).toLocaleDateString();
  const endDate = new Date(contest.endTime).toLocaleDateString();
  const snapshot = resolveOverviewSnapshot(contest, overviewMetrics);

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
              value={String(snapshot.onlineNow)}
              label={t("adminOverview.kpi.onlineNow", "Online Now")}
              showBorder={false}
            />
            <KpiCard
              icon={ChartBar}
              value={t(`adminOverview.examStatus.${snapshot.examStatus}`)}
              label={t("adminOverview.kpi.exams", "Exams")}
              showBorder={false}
            />
            <KpiCard
              icon={Education}
              value={t(`adminOverview.examType.${snapshot.examType}`)}
              label={t("adminOverview.kpi.examMode", "Exam Mode")}
              showBorder={false}
            />
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
