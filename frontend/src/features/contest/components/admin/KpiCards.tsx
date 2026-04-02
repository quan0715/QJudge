import type { ReactNode } from "react";
import { Button, Tag } from "@carbon/react";
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
import { KpiCard } from "@/shared/ui/dataCard";
import { QJudgeHeroWidget } from "@/shared/layout/QJudgeHeroWidget";
import type { AdminPanelId } from "@/features/contest/modules/types";
import { resolveOverviewSnapshot } from "./overviewMetrics.utils";

interface KpiCardsProps {
  contest: ContestDetail;
  overviewMetrics: ContestOverviewMetrics | null;
  loading?: boolean;
  onOpenPanel: (panel: AdminPanelId) => void;
  onPublishContest: () => Promise<void>;
  onPublishResults: () => Promise<void>;
  onRevokeResults: () => Promise<void>;
}

export default function KpiCards({
  contest,
  overviewMetrics,
  loading = false,
  onOpenPanel,
  onPublishContest,
  onPublishResults,
  onRevokeResults,
}: KpiCardsProps) {
  const { t } = useTranslation("contest");
  const contestStatus = contest.status ?? "draft";
  const startDate = new Date(contest.startTime).toLocaleDateString();
  const endDate = new Date(contest.endTime).toLocaleDateString();
  const snapshot = resolveOverviewSnapshot(contest, overviewMetrics);
  const isEnded = snapshot.timeProgress.isEnded;
  const isDraft = contestStatus === "draft";
  const isPublished = contestStatus === "published";
  const isArchived = contestStatus === "archived";
  const canToggleStatus = contest.permissions?.canToggleStatus !== false;
  const canEditContest = contest.permissions?.canEditContest !== false;
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

  const heroActions: ReactNode = (() => {
    if (isArchived) {
      return null;
    }

    if (isDraft) {
      return (
        <>
          <Button
            kind="primary"
            size="md"
            disabled={!canToggleStatus}
            onClick={() => {
              void onPublishContest();
            }}
          >
            {t("adminOverview.actions.publishContest", "發布競賽")}
          </Button>
          <Button
            kind="secondary"
            size="md"
            onClick={() => onOpenPanel("problem_editor")}
          >
            {t("adminOverview.actions.manageProblems", "前往題目")}
          </Button>
        </>
      );
    }

    if (isPublished && !isEnded) {
      return (
        <>
          <Button
            kind="primary"
            size="md"
            onClick={() => onOpenPanel("problem_editor")}
          >
            {t("adminOverview.actions.manageProblems", "前往題目")}
          </Button>
          <Button
            kind="secondary"
            size="md"
            onClick={() => onOpenPanel("settings")}
          >
            {t("adminOverview.actions.editSettings", "編輯設定")}
          </Button>
        </>
      );
    }

    if (isPublished && isEnded && !contest.resultsPublished) {
      return (
        <>
          <Button
            kind="primary"
            size="md"
            disabled={!canEditContest}
            onClick={() => {
              void onPublishResults();
            }}
          >
            {t("adminOverview.actions.publishResults", "發布成績")}
          </Button>
          <Button
            kind="secondary"
            size="md"
            onClick={() => onOpenPanel("grading")}
          >
            {t("adminOverview.actions.viewGrading", "前往批改")}
          </Button>
        </>
      );
    }

    if (isPublished && contest.resultsPublished) {
      return (
        <>
          <Button
            kind="primary"
            size="md"
            onClick={() => onOpenPanel("grading")}
          >
            {t("adminOverview.actions.viewGrading", "查看批改")}
          </Button>
          <Button
            kind="danger--tertiary"
            size="md"
            disabled={!canEditContest}
            onClick={() => {
              void onRevokeResults();
            }}
          >
            {t("adminOverview.actions.revokeResults", "撤回發布")}
          </Button>
        </>
      );
    }

    return (
      <>
        <Button
          kind="primary"
          size="md"
          onClick={() => onOpenPanel("problem_editor")}
        >
          {t("adminOverview.actions.manageProblems", "前往題目")}
        </Button>
        <Button
          kind="secondary"
          size="md"
          onClick={() => onOpenPanel("settings")}
        >
          {t("adminOverview.actions.editSettings", "編輯設定")}
        </Button>
      </>
    );
  })();

  return (
    <QJudgeHeroWidget
      loading={loading}
      title={contest.name}
      badges={
        <Tag type={statusColor} size="sm">
          {statusLabel}
        </Tag>
      }
      metadata={
        <div>
          <span>{t("adminOverview.kpi.period", "競賽期間")}</span>
          <span>{startDate} → {endDate}</span>
        </div>
      }
      description={contest.description}
      actions={heroActions}
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
