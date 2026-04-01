import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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

const normalizePanelParam = (value: string | null): string | null =>
  value ? (LEGACY_PANEL_ALIAS[value] ?? value) : value;

const resolveActivePanel = (
  value: string | null,
  availablePanels: AdminPanelId[],
): AdminPanelId => {
  const normalized = normalizePanelParam(value);
  return availablePanels.includes(normalized as AdminPanelId)
    ? (normalized as AdminPanelId)
    : "overview";
};

const AdminDashboardInner = () => {
  const { contestId, classroomId } = useParams<{ contestId: string; classroomId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { contest, loading, refreshContest } = useContest();
  const { refreshAllAdminData, refreshAdminData } = useContestAdmin();
  const { triggerPanelRefresh } = useAdminPanelRefresh();
  const effectiveClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const classroomName = useClassroomName(effectiveClassroomId);

  // Redirect non-owner/co-owner users away from admin dashboard
  useEffect(() => {
    if (
      !loading &&
      contest &&
      contest.permissions &&
      !contest.permissions.canEditContest
    ) {
      const fallbackPath = effectiveClassroomId
        ? getClassroomContestDashboardPath(effectiveClassroomId, contestId || "")
        : "/dashboard";
      navigate(fallbackPath, { replace: true });
    }
  }, [loading, contest, contestId, effectiveClassroomId, navigate]);
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
  const panelParam = searchParams.get("panel");
  const activePanel = useMemo(
    () => resolveActivePanel(panelParam, availablePanels),
    [panelParam, availablePanels],
  );

  const isExamMode = contestModule.admin.editorKind === "paper_exam";
  const showExamJsonActions = contestModule.admin.shouldShowJsonActions(activePanel);

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

  const handlePanelChange = (panel: AdminPanelId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (panel === "overview") {
        next.delete("panel");
      } else {
        next.set("panel", panel);
      }
      return next;
    });
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

  useEffect(() => {
    const normalized = normalizePanelParam(panelParam);
    if (
      (panelParam === null && activePanel === "overview") ||
      panelParam === activePanel
    ) {
      return;
    }
    if (normalized === activePanel && panelParam === normalized) {
      return;
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (activePanel === "overview") {
        next.delete("panel");
      } else {
        next.set("panel", activePanel);
      }
      return next;
    });
  }, [activePanel, panelParam, setSearchParams]);

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
      showExamJsonActions={showExamJsonActions}
      onImportExamJson={() => examEditorRef.current?.openJsonImportModal()}
      onPreview={handlePreview}
      onExport={() => setExportOpen(true)}
    >
      <AdminPanelSlot
        panelId={activePanel}
        contestModule={contestModule}
        contestId={contestId || ""}
        contest={contest}
        panelRef={examEditorRef}
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
