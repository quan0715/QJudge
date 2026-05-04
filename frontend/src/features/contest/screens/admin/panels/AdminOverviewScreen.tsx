import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Tag } from "@carbon/react";
import { Download, Launch, Renew, Settings } from "@carbon/icons-react";
import { useSearchParams } from "react-router-dom";

import AdminOverviewCommandCenter from "@/features/contest/components/admin/AdminOverviewCommandCenter";
import AdminExamResultOverview from "@/features/contest/components/admin/statistics/AdminExamResultOverview";
import AdminQuestionStatsGallery from "@/features/contest/components/admin/statistics/AdminQuestionStatsGallery";
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
import { exportContestResults } from "@/infrastructure/api/repositories/contestExports.repository";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";
import {
  buildAdminOverviewDashboard,
  buildAdminPreparationDashboard,
} from "./adminOverviewDashboard.model";
import styles from "./AdminOverviewScreen.module.scss";

const contestStatusDisplay = (status: string) => {
  if (status === "draft") return { label: "草稿", type: "gray" as const };
  if (status === "archived")
    return { label: "已封存", type: "cool-gray" as const };
  return { label: "已發布", type: "green" as const };
};

export default function AdminOverviewScreen({
  onOpenSettings,
}: AdminPanelProps) {
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
      console.error("Export contest results failed:", error);
    } finally {
      setExporting(false);
    }
  }, [contest?.id, exporting]);

  useEffect(() => {
    return registerPanelRefresh("overview", handleRefresh);
  }, [handleRefresh, registerPanelRefresh]);

  if (!contest) return null;

  const status = contestStatusDisplay(contest.status ?? "draft");
  const contestHomePath = contest.boundClassroomId
    ? `/classrooms/${contest.boundClassroomId}/contest/${contest.id}`
    : null;
  const renderContestInfo = () => (
    <div className={styles.primaryStack}>
      <section className={styles.contestInfo} aria-label="競賽資訊">
        <div className={styles.dashboardTitleBlock}>
          <div className={styles.dashboardTitleRow}>
            <h2>{contest.name}</h2>
            <Tag type={status.type} size="sm">
              {status.label}
            </Tag>
            <Tag type="cool-gray" size="sm">
              {contest.contestType === "paper_exam" ? "考卷" : "Coding Test"}
            </Tag>
          </div>
          {contest.description ? (
            <p className={styles.dashboardDescription}>{contest.description}</p>
          ) : null}
        </div>
      </section>
    </div>
  );

  return (
    <div className={styles.page}>
      <PanelToolbar
        title="管理總覽"
        status={
          <Tag type={status.type} size="sm">
            {status.label}
          </Tag>
        }
        actions={
          <>
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Settings}
              iconDescription="競賽設定"
              onClick={openSettings}
            />
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Launch}
              iconDescription="競賽主頁"
              disabled={!contestHomePath}
              onClick={() => {
                if (!contestHomePath) return;
                window.open(contestHomePath, "_blank", "noopener,noreferrer");
              }}
            />
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Renew}
              iconDescription={refreshing ? "重新整理中" : "重新整理"}
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            />
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Download}
              iconDescription={exporting ? "匯出中" : "匯出成績"}
              disabled={exporting || !contest.id}
              onClick={() => void handleExport()}
            />
          </>
        }
      />
      <div className={styles.content}>
        {dashboardData && preparationData && (
          <AdminOverviewCommandCenter
            data={dashboardData}
            preparationData={preparationData}
            adminLoading={adminInitialLoading}
            gradingLoading={gradingLoading}
            contestId={contest.id}
            antiCheatEnabled={contest.cheatDetectionEnabled}
            onOpenPanel={openPanel}
            participants={participants}
            primary={renderContestInfo()}
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
    </div>
  );
}
