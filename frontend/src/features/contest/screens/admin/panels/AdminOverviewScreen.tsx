import KpiCards from "@/features/contest/components/admin/KpiCards";
import StudentStatusBreakdown from "@/features/contest/components/admin/StudentStatusBreakdown";
import { useContestAdmin } from "@/features/contest/contexts";
import type { DashboardKpi } from "../mockData";
import type { ContestDetail } from "@/core/entities/contest.entity";
import styles from "./AdminOverviewPanel.module.scss";

interface AdminOverviewPanelProps {
  kpi: DashboardKpi;
  contest: ContestDetail;
}

export default function AdminOverviewPanel({
  kpi,
  contest,
}: AdminOverviewPanelProps) {
  const { refreshAdminData, isRefreshing } = useContestAdmin();

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
