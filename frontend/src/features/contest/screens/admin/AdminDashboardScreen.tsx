import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loading } from "@carbon/react";

import {
  ContestProvider,
  ContestAdminProvider,
  AdminPanelRefreshProvider,
  useContest,
} from "@/features/contest/contexts";
import ContestExportDialog from "@/features/contest/components/admin/ContestExportDialog";

import { getContestTypeModule } from "@/features/contest/modules/registry";
import { getAdminPanelRenderer } from "@/features/contest/modules/AdminPanelRendererRegistry";
import { ContestSettingsOverlay } from "@/features/contest/screens/admin/panels/AdminContestSettingsScreen";
// import { useWorkspacePanelMode } from "@/features/app/contexts/useWorkspacePanelMode";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import type { AdminPanelId, AdminPanelProps, ContestTypeModule } from "@/features/contest/modules/types";
import { useTabWithUrlParam } from "@/shared/hooks";
import styles from "./AdminDashboardScreen.module.scss";

/** Dynamic panel dispatch — registry pattern requires runtime lookup; state is stable because
 *  each panelId maps to a fixed component reference within a given contestModule. */
const AdminPanelSlot = ({
  panelId,
  contestModule,
  ...rest
}: AdminPanelProps & { panelId: AdminPanelId; contestModule: ContestTypeModule }) => {
  /* eslint-disable react-hooks/static-components */
  const Renderer = getAdminPanelRenderer(panelId, contestModule);
  return <Renderer {...rest} />;
  /* eslint-enable react-hooks/static-components */
};

const LEGACY_PANEL_ALIAS: Record<string, AdminPanelId> = {
  exam: "problem_editor",
  settings: "overview",
};

const AdminDashboardInner = () => {
  const { contestId, classroomId } = useParams<{ contestId: string; classroomId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { contest, loading } = useContest();
  const effectiveClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const hasManagementRole =
    contest?.currentUserRole !== undefined &&
    contest.currentUserRole !== "student";
  const canAccessAdminPanel =
    !!contest?.permissions?.canEditContest || hasManagementRole;

  // Redirect non-owner/co-owner users away from admin dashboard
  useEffect(() => {
    if (
      !loading &&
      contest &&
      !canAccessAdminPanel
    ) {
      const fallbackPath = effectiveClassroomId
        ? getClassroomContestDashboardPath(effectiveClassroomId, contestId || "")
        : "/dashboard";
      navigate(fallbackPath, { replace: true });
    }
  }, [loading, contest, canAccessAdminPanel, contestId, effectiveClassroomId, navigate]);
  const contestModule = useMemo(
    () => getContestTypeModule(contest?.contestType),
    [contest?.contestType],
  );

  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Keep mini view infrastructure available, but do not enable it for contest admin for now.
  // useWorkspacePanelMode("mini");
  const availablePanels = useMemo(
    () => contestModule.admin.getAvailablePanels(contest),
    [contestModule, contest],
  );
  const { activeKey: activePanel } = useTabWithUrlParam({
    param: "panel",
    keys: availablePanels,
    defaultKey: "overview",
    aliases: LEGACY_PANEL_ALIAS,
  });

  const panelParam = searchParams.get("panel");

  useEffect(() => {
    if (panelParam !== "settings") return;
    setSettingsOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("panel", "overview");
      return next;
    }, { replace: true });
  }, [panelParam, setSearchParams]);

  const handlePreview = () => {
    const previewPath = effectiveClassroomId
      ? `/classrooms/${effectiveClassroomId}/contest/${contestId}/exam-preview`
      : `/dashboard`;
    window.open(previewPath, "_blank");
  };

  if (loading && !contest) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Loading withOverlay={false} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.panelBody}>
        <AdminPanelSlot
          panelId={activePanel}
          contestModule={contestModule}
          contestId={contestId || ""}
          contest={contest}
          onExport={() => setExportOpen(true)}
          onPreview={handlePreview}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      {contest && contestId && (
        <ContestExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          contest={contest}
          contestId={contestId}
        />
      )}

      <ContestSettingsOverlay
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

const AdminDashboardScreen = () => {
  const { contestId } = useParams<{ contestId: string }>();

  return (
    <ContestProvider contestId={contestId}>
      <ContestAdminProvider contestId={contestId}>
        <AdminPanelRefreshProvider>
          <AdminDashboardInner />
        </AdminPanelRefreshProvider>
      </ContestAdminProvider>
    </ContestProvider>
  );
};

export default AdminDashboardScreen;
