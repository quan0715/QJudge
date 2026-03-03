import { useMemo, useRef, useState } from "react";
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

const PANEL_KEYS: readonly AdminPanelId[] = [
  "overview",
  "logs",
  "participants",
  "exam",
  "grading",
  "settings",
];

const getActivePanel = (value: string | null): AdminPanelId =>
  PANEL_KEYS.includes(value as AdminPanelId) ? (value as AdminPanelId) : "overview";

const AdminDashboardInner = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const activePanel = getActivePanel(searchParams.get("panel"));
  const { contest, loading } = useContest();
  const { participants } = useContestAdmin();
  const examEditorRef = useRef<ExamEditorLayoutHandle | null>(null);
  const contestModule = useMemo(
    () => getContestTypeModule(contest?.contestType),
    [contest?.contestType],
  );

  const kpi = useMemo(() => computeMockKpi(participants), [participants]);
  const [exportOpen, setExportOpen] = useState(false);

  const isExamMode = contestModule.admin.examEditorKind === "paper_exam";
  const showExamJsonActions = contestModule.admin.shouldShowExamJsonActions(activePanel);

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
      case "exam": {
        if (!contest) return null;
        const useExamEditor = contestModule.admin.examEditorKind === "paper_exam";
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
