import type { ReactNode } from "react";
import { Button, Tag } from "@carbon/react";
import { Education, Launch, Settings, UserMultiple } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  ContestDetail,
} from "@/core/entities/contest.entity";
import { KpiCard } from "@/shared/ui/dataCard";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import type { AdminPanelId } from "@/features/contest/modules/types";

interface KpiCardsProps {
  contest: ContestDetail;
  loading?: boolean;
  onOpenPanel: (panel: AdminPanelId) => void;
  onOpenSettings?: () => void;
}

export default function KpiCards({
  contest,
  loading = false,
  onOpenPanel,
  onOpenSettings,
}: KpiCardsProps) {
  const { t } = useTranslation("contest");
  const contestStatus = contest.status ?? "draft";
  const contestHomePath = contest.boundClassroomId
    ? `/classrooms/${contest.boundClassroomId}/contest/${contest.id}`
    : null;
  const statusLabel =
    contestStatus === "draft"
      ? t("common:status.draft", "草稿")
      : contestStatus === "published"
        ? t("common:status.published", "已發布")
        : t("common:status.archived", "已封存");
  const statusColor =
    contestStatus === "draft"
      ? "gray"
      : contestStatus === "published"
        ? "green"
        : "cool-gray";
  const participantCount = contest.participantCount ?? 0;
  const examTypeLabel = t(
    `adminOverview.examType.${contest.contestType}`,
    contest.contestType === "paper_exam" ? "考卷" : "Coding Test",
  );

  const heroActions: ReactNode = (
    <>
      <Button
        kind="secondary"
        size="md"
        renderIcon={Settings}
        onClick={() => {
          if (onOpenSettings) {
            onOpenSettings();
            return;
          }
          onOpenPanel("settings");
        }}
      >
        {t("adminOverview.actions.editSettings", "設定")}
      </Button>
      <Button
        kind="primary"
        size="md"
        renderIcon={Launch}
        disabled={!contestHomePath}
        onClick={() => {
          if (!contestHomePath) return;
          window.open(contestHomePath, "_blank", "noopener,noreferrer");
        }}
      >
        {t("adminOverview.actions.openContestHomepage", "開啟競賽主頁")}
      </Button>
    </>
  );

  return (
    <QJudgeHeroWidget
      loading={loading}
      title={contest.name}
      badges={
        <Tag type={statusColor} size="sm">
          {statusLabel}
        </Tag>
      }
      description={contest.description}
      actions={heroActions}
      kpiCards={
        <>
          <KpiCard
            icon={UserMultiple}
            value={participantCount}
            unit={t("adminOverview.kpi.personUnit", "人")}
            label={t("adminOverview.kpi.participantCount", "參賽者")}
            showBorder={false}
          />
          <KpiCard
            icon={Education}
            value={examTypeLabel}
            label={t("adminOverview.kpi.examMode", "考試類型")}
            showBorder={false}
          />
        </>
      }
    />
  );
}
