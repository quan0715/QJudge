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
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
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
    <QJudgeHeroWidget
      title={contest.name}
      badges={
        <Tag type={getContestStateColor(state)} size="sm">
          {getContestStateLabel(state)}
        </Tag>
      }
      metadata={
        <div>
          <span>{t("adminOverview.kpi.period", "競賽期間")}</span>
          <span>{startDate} → {endDate}</span>
        </div>
      }
      description={contest.description}
      kpiCards={
        <>
          <KpiCard
            icon={UserMultiple}
            value={String(snapshot.onlineNow)}
            label={t("adminOverview.kpi.onlineNow", "即時在線")}
            showBorder={false}
          />
          <KpiCard
            icon={ChartBar}
            value={t(`adminOverview.examStatus.${snapshot.examStatus}`)}
            label={t("adminOverview.kpi.exams", "考試進度")}
            showBorder={false}
          />
          <KpiCard
            icon={Education}
            value={t(`adminOverview.examType.${snapshot.examType}`)}
            label={t("adminOverview.kpi.examMode", "考試模式")}
            showBorder={false}
          />
        </>
      }
    />
  );
}
