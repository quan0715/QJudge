import { useEffect, useMemo } from "react";
import KpiCards from "@/features/contest/components/admin/KpiCards";
import OverviewEventSummaryPanel from "@/features/contest/components/admin/OverviewEventSummaryPanel";
import OverviewInsightsPanel from "@/features/contest/components/admin/OverviewInsightsPanel";
import StudentStatusBreakdown from "@/features/contest/components/admin/StudentStatusBreakdown";
import {
  useContest,
  useContestAdmin,
  useAdminPanelRefresh,
} from "@/features/contest/contexts";
import { computeParticipantStatusKpi } from "../participantStatusKpi";
import styles from "./AdminOverviewPanel.module.scss";

export default function AdminOverviewScreen() {
  const { contest, refreshContest } = useContest();
  const { participants, examEvents, overviewMetrics, refreshAllAdminData } =
    useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();
  
  const kpi = useMemo(
    () => computeParticipantStatusKpi(participants),
    [participants],
  );

  useEffect(() => {
    return registerPanelRefresh("overview", async () => {
      await Promise.all([refreshAllAdminData(), refreshContest()]);
    });
  }, [refreshAllAdminData, refreshContest, registerPanelRefresh]);

  if (!contest) return null;

  return (
    <div className={styles.root}>
      {/* Hero KPI */}
      <KpiCards contest={contest} overviewMetrics={overviewMetrics} />

      {/* Student Status Breakdown */}
      <div className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.bodyGrid}>
            <div className={styles.mainCol}>
              <StudentStatusBreakdown kpi={kpi} />
              <OverviewEventSummaryPanel examEvents={examEvents} />
            </div>
            <div className={styles.sideCol}>
              <OverviewInsightsPanel contest={contest} overviewMetrics={overviewMetrics} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
