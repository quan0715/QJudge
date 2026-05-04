import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Tag } from "@carbon/react";
import {
  Download,
  Launch,
  Renew,
  Settings,
  UserFollow,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import AdminOverviewCommandCenter from "@/features/contest/components/admin/AdminOverviewCommandCenter";
import AdminExamResultOverview from "@/features/contest/components/admin/statistics/AdminExamResultOverview";
import AdminQuestionStatsGallery from "@/features/contest/components/admin/statistics/AdminQuestionStatsGallery";
import { AddParticipantModal } from "@/features/contest/components/modals/AddParticipantModal";
import {
  useAdminPanelRefresh,
  useContest,
  useContestAdmin,
} from "@/features/contest/contexts";
import type {
  AdminPanelId,
  AdminPanelProps,
} from "@/features/contest/modules/types";
import { useGradingData } from "@/features/contest/screens/settings/grading";
import { addContestParticipant } from "@/infrastructure/api/repositories";
import { exportContestResults } from "@/infrastructure/api/repositories/contestExports.repository";
import { useToast } from "@/shared/contexts/ToastContext";
import {
  buildAdminOverviewDashboard,
  buildAdminPreparationDashboard,
} from "./adminOverviewDashboard.model";
import styles from "./AdminOverviewScreen.module.scss";

type ContestStatusDisplay = {
  label: string;
  type: "gray" | "cool-gray" | "green";
};

const useContestStatusDisplay = () => {
  const { t } = useTranslation("contest");
  return useCallback(
    (status: string): ContestStatusDisplay => {
      if (status === "draft")
        return {
          label: t("adminOverview.screen.contestStatus.draft", "草稿"),
          type: "gray",
        };
      if (status === "archived")
        return {
          label: t("adminOverview.screen.contestStatus.archived", "已封存"),
          type: "cool-gray",
        };
      return {
        label: t("adminOverview.screen.contestStatus.published", "已發布"),
        type: "green",
      };
    },
    [t],
  );
};

export default function AdminOverviewScreen({
  onOpenSettings,
}: AdminPanelProps) {
  const { t } = useTranslation("contest");
  const { showToast } = useToast();
  const contestStatusDisplay = useContestStatusDisplay();
  const { contest, refreshContest } = useContest();
  const {
    participants,
    examEvents,
    overviewMetrics,
    initialLoading: adminInitialLoading,
    refreshAllAdminData,
  } = useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const [, setSearchParams] = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resultRefreshKey, setResultRefreshKey] = useState(0);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const classroomBound = Boolean(contest?.isClassroomBound);
  const handleAddParticipant = useCallback(
    async (username: string) => {
      if (!contest?.id) return;
      try {
        await addContestParticipant(contest.id, username);
        await refreshAllAdminData();
        showToast({
          kind: "success",
          title: t("common.success", "成功"),
          subtitle: t("participants.added", "參賽者已新增"),
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("participants.addFailed", "新增參賽者失敗");
        showToast({
          kind: "error",
          title: t("common.error", "錯誤"),
          subtitle: message,
        });
        throw error;
      }
    },
    [contest?.id, refreshAllAdminData, showToast, t],
  );
  const { globalStats, loading: gradingLoading } = useGradingData({
    participantsOverride: participants,
  });

  const dashboardData = useMemo(() => {
    if (!contest) return null;
    return buildAdminOverviewDashboard({
      contest,
      participants,
      examEvents,
      overviewMetrics,
      gradingStats: globalStats,
    });
  }, [contest, participants, examEvents, overviewMetrics, globalStats]);

  const preparationData = useMemo(() => {
    if (!contest) return null;
    return buildAdminPreparationDashboard({
      contest,
      participants,
      gradingStats: globalStats,
    });
  }, [contest, participants, globalStats]);

  const openPanel = useCallback(
    (panel: AdminPanelId) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("panel", panel);
        return next;
      });
    },
    [setSearchParams],
  );

  const openSettings = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("panel", "settings");
      return next;
    });
  }, [onOpenSettings, setSearchParams]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([refreshAllAdminData(), refreshContest()]);
      setResultRefreshKey((current) => current + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refreshAllAdminData, refreshContest, refreshing]);

  const handleExport = useCallback(async () => {
    if (!contest?.id || exporting) return;
    setExporting(true);
    try {
      await exportContestResults(contest.id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("adminOverview.screen.exportFailed", "匯出失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    } finally {
      setExporting(false);
    }
  }, [contest?.id, exporting, showToast, t]);

  useEffect(() => {
    return registerPanelRefresh("overview", handleRefresh);
  }, [handleRefresh, registerPanelRefresh]);

  if (!contest) return null;

  const status = contestStatusDisplay(contest.status ?? "draft");
  const contestHomePath = contest.boundClassroomId
    ? `/classrooms/${contest.boundClassroomId}/contest/${contest.id}`
    : null;
  const contestTypeLabel =
    contest.contestType === "paper_exam"
      ? t("adminOverview.screen.contestType.paperExam", "考卷")
      : t("adminOverview.screen.contestType.coding", "Coding Test");
  const renderContestHeader = () => (
    <section
      className={styles.contestHeader}
      aria-label={t("adminOverview.screen.contestInfoLabel", "競賽資訊")}
    >
      <div className={styles.dashboardTitleBlock}>
        <div className={styles.dashboardTitleRow}>
          <h2>{contest.name}</h2>
          <Tag type={status.type} size="sm">
            {status.label}
          </Tag>
          <Tag type="cool-gray" size="sm">
            {contestTypeLabel}
          </Tag>
        </div>
        {contest.description ? (
          <p className={styles.dashboardDescription}>{contest.description}</p>
        ) : null}
      </div>
      <div className={styles.headerActions}>
        <Button
          kind="ghost"
          hasIconOnly
          renderIcon={Settings}
          iconDescription={t(
            "adminOverview.screen.actions.settings",
            "競賽設定",
          )}
          onClick={openSettings}
        />
        <Button
          kind="ghost"
          hasIconOnly
          renderIcon={Launch}
          iconDescription={t(
            "adminOverview.screen.actions.contestHome",
            "競賽主頁",
          )}
          disabled={!contestHomePath}
          onClick={() => {
            if (!contestHomePath) return;
            window.open(contestHomePath, "_blank", "noopener,noreferrer");
          }}
        />
        {classroomBound ? null : (
          <Button
            kind="ghost"
            hasIconOnly
            renderIcon={UserFollow}
            iconDescription={t(
              "adminOverview.screen.actions.addParticipant",
              "新增參賽者",
            )}
            onClick={() => setAddParticipantOpen(true)}
          />
        )}
        <Button
          kind="ghost"
          hasIconOnly
          renderIcon={Renew}
          iconDescription={
            refreshing
              ? t("adminOverview.screen.actions.refreshing", "重新整理中")
              : t("adminOverview.screen.actions.refresh", "重新整理")
          }
          disabled={refreshing}
          onClick={() => void handleRefresh()}
        />
        <Button
          kind="ghost"
          hasIconOnly
          renderIcon={Download}
          iconDescription={
            exporting
              ? t("adminOverview.screen.actions.exporting", "匯出中")
              : t("adminOverview.screen.actions.export", "匯出成績")
          }
          disabled={exporting || !contest.id}
          onClick={() => void handleExport()}
        />
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {dashboardData && preparationData && (
          <AdminOverviewCommandCenter
            header={renderContestHeader()}
            data={dashboardData}
            preparationData={preparationData}
            adminLoading={adminInitialLoading}
            gradingLoading={gradingLoading}
            contestId={contest.id}
            antiCheatEnabled={contest.cheatDetectionEnabled}
            classroomBound={classroomBound}
            onOpenPanel={openPanel}
            participants={participants}
            primary={null}
            resultOverview={
              <AdminExamResultOverview
                contest={contest}
                refreshKey={resultRefreshKey}
              />
            }
            questionStatsGallery={
              <AdminQuestionStatsGallery
                contest={contest}
                refreshKey={resultRefreshKey}
              />
            }
          />
        )}
      </div>
      {classroomBound ? null : (
        <AddParticipantModal
          isOpen={addParticipantOpen}
          onClose={() => setAddParticipantOpen(false)}
          onSubmit={async (username) => {
            await handleAddParticipant(username);
            setAddParticipantOpen(false);
          }}
        />
      )}
    </div>
  );
}
