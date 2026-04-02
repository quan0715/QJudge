import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loading } from "@carbon/react";
import { useClassroomName } from "@/features/classroom/hooks/useClassroomName";

import {
  ContestProvider,
  ContestAdminProvider,
  AdminPanelRefreshProvider,
  useContest,
  useContestAdmin,
  useAdminPanelRefresh,
} from "@/features/contest/contexts";
import AdminDashboardLayout from "@/features/contest/components/admin/layout/AdminDashboardLayout";
import ContestExportDialog from "@/features/contest/components/admin/ContestExportDialog";
import type { ExamEditorLayoutHandle } from "@/features/contest/components/admin/examEditor/ExamEditorLayout";

import { getContestTypeModule } from "@/features/contest/modules/registry";
import { getAdminPanelRenderer } from "@/features/contest/modules/AdminPanelRendererRegistry";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import type { AdminPanelId, AdminPanelProps, ContestTypeModule } from "@/features/contest/modules/types";
import { useTabWithUrlParam } from "@/shared/hooks";

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
};

const AdminDashboardInner = () => {
  const { contestId, classroomId } = useParams<{ contestId: string; classroomId?: string }>();
  const navigate = useNavigate();

  const { contest, loading, refreshContest } = useContest();
  const { refreshAllAdminData, refreshAdminData } = useContestAdmin();
  const { triggerPanelRefresh } = useAdminPanelRefresh();
  const effectiveClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const classroomName = useClassroomName(effectiveClassroomId);
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
  const examEditorRef = useRef<ExamEditorLayoutHandle | null>(null);
  const contestModule = useMemo(
    () => getContestTypeModule(contest?.contestType),
    [contest?.contestType],
  );

  const [exportOpen, setExportOpen] = useState(false);
  const availablePanels = useMemo(
    () => contestModule.admin.getAvailablePanels(contest),
    [contestModule, contest],
  );
  const { activeKey: activePanel, setActiveKey: handlePanelChange } = useTabWithUrlParam({
    param: "panel",
    keys: availablePanels,
    defaultKey: "overview",
    aliases: LEGACY_PANEL_ALIAS,
  });

  const isExamMode = contestModule.admin.editorKind === "paper_exam";

  const handleBack = () => {
    navigate(
      effectiveClassroomId
        ? `/classrooms/${effectiveClassroomId}/contest/${contestId}`
        : "/dashboard",
    );
  };

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
    <AdminDashboardLayout
      contestId={contestId || ""}
      contestName={contest?.name || "Loading..."}
      classroomId={effectiveClassroomId}
      classroomName={classroomName}
      activePanel={activePanel}
      availablePanels={availablePanels}
      examMode={isExamMode}
      onPanelChange={handlePanelChange}
      onBack={handleBack}
      onRefresh={handleNavbarRefresh}
    >
      <AdminPanelSlot
        panelId={activePanel}
        contestModule={contestModule}
        contestId={contestId || ""}
        contest={contest}
        panelRef={examEditorRef}
        onExport={() => setExportOpen(true)}
        onPreview={handlePreview}
      />

      {contest && contestId && (
        <ContestExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          contest={contest}
          contestId={contestId}
        />
      )}
    </AdminDashboardLayout>
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
