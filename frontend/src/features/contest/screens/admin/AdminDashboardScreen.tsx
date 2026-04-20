import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, IconButton, Loading } from "@carbon/react";
import { Renew, Settings } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import {
  ContestProvider,
  ContestAdminProvider,
  AdminPanelRefreshProvider,
  useContest,
  useContestAdmin,
  useAdminPanelRefresh,
} from "@/features/contest/contexts";
import ContestExportDialog from "@/features/contest/components/admin/ContestExportDialog";
import { WorkspaceToolBar } from "@/features/app/components/WorkspaceToolBar";

import { getContestTypeModule } from "@/features/contest/modules/registry";
import { getAdminPanelRenderer } from "@/features/contest/modules/AdminPanelRendererRegistry";
import { ContestSettingsOverlay } from "@/features/contest/screens/admin/panels/AdminContestSettingsScreen";
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
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const { contestId, classroomId } = useParams<{ contestId: string; classroomId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { contest, loading, refreshContest } = useContest();
  const { refreshAllAdminData, refreshAdminData } = useContestAdmin();
  const { triggerPanelRefresh } = useAdminPanelRefresh();
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

  const handleNavbarRefresh = () => {
    const run = async () => {
      const handled = await triggerPanelRefresh(activePanel);
      if (handled) return;

      switch (activePanel) {
        case "overview":
          await Promise.all([refreshAllAdminData(), refreshContest()]);
          return;
        case "participants":
        case "logs":
          await refreshAdminData();
          return;
        case "clarifications":
        case "grading":
        case "settings":
        case "problem_editor":
        case "statistics":
        default:
          await refreshContest();
      }
    };
    void run();
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
      <WorkspaceToolBar
        className={styles.toolbar}
        title={(
          <div className={styles.toolbarTitle}>
            <Link to="/dashboard" className={styles.brandLink}>
              {tc("header.prefix", "QJudge")}
            </Link>
            <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
              <BreadcrumbItem>
                <Link to="/dashboard">{tc("nav.dashboard")}</Link>
              </BreadcrumbItem>
              {effectiveClassroomId && (
                <BreadcrumbItem>
                  <Link to={`/classrooms/${effectiveClassroomId}`}>
                    {tc("nav.classrooms", "教室")}
                  </Link>
                </BreadcrumbItem>
              )}
              <BreadcrumbItem>
                {contest?.name || "Loading..."}
              </BreadcrumbItem>
              <BreadcrumbItem isCurrentPage>
                {t("adminLayout.title", "管理")}
              </BreadcrumbItem>
            </Breadcrumb>
          </div>
        )}
        actions={(
          <>
            <IconButton
              kind="ghost"
              size="md"
              align="bottom"
              label={tc("actions.refresh", "Refresh")}
              onClick={handleNavbarRefresh}
            >
              <Renew size={20} />
            </IconButton>
            <IconButton
              kind="ghost"
              size="md"
              align="bottom"
              label={t("adminLayout.nav.settings")}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={20} />
            </IconButton>
          </>
        )}
      />

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
