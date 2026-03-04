import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loading } from "@carbon/react";

import {
  ContestProvider,
  ContestAdminProvider,
  useContest,
  useContestAdmin,
} from "@/features/contest/contexts";
import AdminDashboardLayout from "@/features/contest/components/admin/layout/AdminDashboardLayout";
import ContestExportDialog from "@/features/contest/components/admin/ContestExportDialog";
import ExamEditorLayout, {
  type ExamEditorLayoutHandle,
} from "@/features/contest/components/admin/examEditor/ExamEditorLayout";
import CodingTestEditorLayout from "@/features/contest/components/admin/examEditor/CodingTestEditorLayout";

import ContestParticipantsScreen from "@/features/contest/screens/settings/ContestParticipantsScreen";
import ContestLogsScreen from "@/features/contest/screens/settings/ContestLogsScreen";
import ContestExamGradingScreen from "@/features/contest/screens/settings/ContestExamGradingScreen";
import AdminContestSettingsPanel from "./panels/AdminContestSettingsScreen";
import AdminOverviewPanel from "./panels/AdminOverviewScreen";

import { computeMockKpi } from "./mockData";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import type { AdminPanelId } from "@/features/contest/modules/types";

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
  const { participants } = useContestAdmin();
  const examEditorRef = useRef<ExamEditorLayoutHandle | null>(null);
  const contestModule = useMemo(
    () => getContestTypeModule(contest?.contestType),
    [contest?.contestType],
  );

  const kpi = useMemo(() => computeMockKpi(participants), [participants]);
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
  const isFullBleed = contestModule.admin.isFullBleedPanel(activePanel);

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

  const renderPanel = () => {
    switch (activePanel) {
      case "overview":
        return contest ? (
          <AdminOverviewPanel kpi={kpi} contest={contest} />
        ) : null;
      case "logs":
        return <ContestLogsScreen />;
      case "participants":
        return <ContestParticipantsScreen />;
      case "problem_editor": {
        if (!contest) return null;
        const useExamEditor = contestModule.admin.editorKind === "paper_exam";
        return useExamEditor ? (
          <ExamEditorLayout
            ref={examEditorRef}
            contestId={contestId || ""}
            contest={contest}
          />
        ) : (
          <CodingTestEditorLayout contestId={contestId || ""} contest={contest} />
        );
      }
      case "grading":
        return <ContestExamGradingScreen />;
      case "settings":
        return <AdminContestSettingsPanel />;
      default:
        return contest ? (
          <AdminOverviewPanel kpi={kpi} contest={contest} />
        ) : null;
    }
  };

  return (
    <AdminDashboardLayout
      contestName={contest?.name || "Loading..."}
      activePanel={activePanel}
      availablePanels={availablePanels}
      fullBleed={isFullBleed}
      examMode={isExamMode}
      onPanelChange={handlePanelChange}
      onBack={handleBack}
      showExamJsonActions={showExamJsonActions}
      onImportExamJson={() => examEditorRef.current?.openJsonImportModal()}
      onPreview={handlePreview}
      onExport={() => setExportOpen(true)}
    >
      {renderPanel()}

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
