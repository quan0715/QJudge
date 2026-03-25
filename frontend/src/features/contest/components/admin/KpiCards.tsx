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
import EntityHeroStatsSection from "@/shared/layout/EntityHeroStatsSection";
import { resolveOverviewSnapshot } from "./overviewMetrics.utils";

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
    <EntityHeroStatsSection
      title={<h1>{contest.name}</h1>}
      meta={
        <>
          <Tag type={getContestStateColor(state)} size="sm">
            {getContestStateLabel(state)}
          </Tag>
          <span>{startDate} → {endDate}</span>
        </>
      }
      description={contest.description ? <p>{contest.description}</p> : undefined}
      kpi={
        <>
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
        </>
      }
    />
  );
}
