import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loading } from "@carbon/react";

import {
  ContestProvider,
  ContestAdminProvider,
  useContest,
} from "@/features/contest/contexts";
import AdminDashboardLayout from "@/features/contest/components/admin/layout/AdminDashboardLayout";
import ContestExportDialog from "@/features/contest/components/admin/ContestExportDialog";
import type { ExamEditorLayoutHandle } from "@/features/contest/components/admin/examEditor/ExamEditorLayout";

import { getContestTypeModule } from "@/features/contest/modules/registry";
import { getAdminPanelRenderer } from "@/features/contest/modules/AdminPanelRendererRegistry";
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
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { contest, loading } = useContest();
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
    navigate(`/contests/${contestId}`);
  };

  const handlePreview = () => {
    window.open(`/contests/${contestId}/exam-preview`, "_blank");
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
      contestName={contest?.name || "Loading..."}
      activePanel={activePanel}
      availablePanels={availablePanels}
      examMode={isExamMode}
      onPanelChange={handlePanelChange}
      onBack={handleBack}
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
        <AdminDashboardInner />
      </ContestAdminProvider>
    </ContestProvider>
  );
};

export default AdminDashboardScreen;
