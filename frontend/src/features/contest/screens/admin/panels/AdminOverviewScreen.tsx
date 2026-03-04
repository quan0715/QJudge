import { useMemo } from "react";
import KpiCards from "@/features/contest/components/admin/KpiCards";
import StudentStatusBreakdown from "@/features/contest/components/admin/StudentStatusBreakdown";
import { useContest, useContestAdmin } from "@/features/contest/contexts";
import { computeMockKpi } from "../mockData";
import styles from "./AdminOverviewPanel.module.scss";

export default function AdminOverviewScreen() {
  const { contest } = useContest();
  const { participants, refreshAdminData, isRefreshing } = useContestAdmin();
  
  const kpi = useMemo(() => computeMockKpi(participants), [participants]);

  if (!contest) return null;

  return (
    <div className={styles.root}>
      {/* Hero KPI */}
      <KpiCards kpi={kpi} contest={contest} />

      {/* Student Status Breakdown */}
      <div className={styles.section}>
        <div className={styles.sectionInner}>
          <StudentStatusBreakdown
            kpi={kpi}
            onRefresh={refreshAdminData}
            isRefreshing={isRefreshing}
          />
        </div>
      </div>
    </div>
  );
}
