import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import AdminOverviewCommandCenter from "@/features/contest/components/admin/AdminOverviewCommandCenter";
import KpiCards from "@/features/contest/components/admin/KpiCards";
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
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import { buildAdminOverviewDashboard } from "./adminOverviewDashboard.model";
import styles from "./AdminOverviewScreen.module.scss";

export default function AdminOverviewScreen({
  onOpenSettings,
}: AdminPanelProps) {
  const { contest, refreshContest } = useContest();
  const {
    participants,
    examEvents,
    overviewMetrics,
    initialLoading,
    refreshAllAdminData,
  } = useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  const [, setSearchParams] = useSearchParams();
  const { globalStats } = useGradingData({ participantsOverride: participants });

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

  useEffect(() => {
    return registerPanelRefresh("overview", async () => {
      await Promise.all([refreshAllAdminData(), refreshContest()]);
    });
  }, [refreshAllAdminData, refreshContest, registerPanelRefresh]);

  if (!contest) return null;

  return (
    <EntityOverviewFrame
      hero={
        <KpiCards
          contest={contest}
          loading={initialLoading}
          onOpenPanel={openPanel}
          onOpenSettings={openSettings}
        />
      }
      main={
        <div className={styles.mainColumn}>
          {dashboardData && (
            <AdminOverviewCommandCenter
              data={dashboardData}
              onOpenPanel={openPanel}
            />
          )}
        </div>
      }
    />
  );
}
