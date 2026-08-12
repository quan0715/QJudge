import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";

import {
  ContestProvider,
  ContestAdminProvider,
  AdminPanelRefreshProvider,
  useContest,
} from "@/features/contest/contexts";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import { getAdminPanelRenderer } from "@/features/contest/modules/AdminPanelRendererRegistry";
// import { useWorkspacePanelMode } from "@/features/app/contexts/useWorkspacePanelMode";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import type { AdminPanelId, AdminPanelProps, ContestTypeModule } from "@/features/contest/modules/types";
import { isContestManagerScopeRole } from "@/core/entities/contest.entity";
import { useTabWithUrlParam } from "@/shared/hooks";
import styles from "./AdminDashboardScreen.module.scss";

const ContestExportDialog = lazy(
  () => import("@/features/contest/components/admin/ContestExportDialog"),
);
const ContestSettingsOverlay = lazy(() =>
  import("@/features/contest/screens/admin/panels/AdminContestSettingsScreen").then(
    ({ ContestSettingsOverlay: Overlay }) => ({ default: Overlay }),
  ),
);

/** Dynamic panel dispatch — registry pattern requires runtime lookup; state is stable because
 *  each panelId maps to a fixed component reference within a given contestModule. */
const AdminPanelSlot = ({
  panelId,
  contestModule,
  ...rest
}: AdminPanelProps & { panelId: AdminPanelId; contestModule: ContestTypeModule }) => {
  const { t } = useTranslation("common");
  /* eslint-disable react-hooks/static-components */
  const Renderer = getAdminPanelRenderer(panelId, contestModule);
  return (
    <Suspense
      fallback={(
        <div className={styles.loadingState}>
          <Loading
            small
            withOverlay={false}
            description={t("message.loading")}
          />
        </div>
      )}
    >
      <Renderer {...rest} />
    </Suspense>
  );
  /* eslint-enable react-hooks/static-components */
};

const AdminDashboardInner = () => {
  const { t } = useTranslation("common");
  const { contestId, classroomId } = useParams<{ contestId: string; classroomId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { contest, loading } = useContest();
  const effectiveClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const hasManagementRole = isContestManagerScopeRole(contest?.currentUserRole);
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
  const routablePanels = useMemo(
    () => availablePanels.includes("settings")
      ? availablePanels
      : [...availablePanels, "settings" as const],
    [availablePanels],
  );
  const { activeKey: activePanel } = useTabWithUrlParam({
    param: "panel",
    keys: routablePanels,
    defaultKey: "overview",
  });

  const panelParam = searchParams.get("panel");
  const settingsRequestedByUrl = panelParam === "settings";
  const isSettingsOpen = settingsOpen || settingsRequestedByUrl;
  const closeSettings = () => {
    setSettingsOpen(false);
    if (!settingsRequestedByUrl) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("panel", "overview");
      return next;
    }, { replace: true });
  };

  const handlePreview = () => {
    const previewPath = effectiveClassroomId
      ? `/classrooms/${effectiveClassroomId}/contest/${contestId}/exam-preview`
      : `/dashboard`;
    window.open(previewPath, "_blank");
  };

  if (loading && !contest) {
    return (
      <div className={styles.loadingState}>
        <Loading
          withOverlay={false}
          description="載入競賽管理資料"
        />
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

      {exportOpen && contest && contestId && (
        <Suspense fallback={<Loading description={t("message.loading")} />}>
          <ContestExportDialog
            open
            onClose={() => setExportOpen(false)}
            contest={contest}
            contestId={contestId}
          />
        </Suspense>
      )}

      {isSettingsOpen && (
        <Suspense fallback={<Loading description={t("message.loading")} />}>
          <ContestSettingsOverlay
            open
            onClose={closeSettings}
          />
        </Suspense>
      )}
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
