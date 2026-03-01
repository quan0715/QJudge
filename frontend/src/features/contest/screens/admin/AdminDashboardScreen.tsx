import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loading } from "@carbon/react";

import {
  ContestProvider,
  ContestAdminProvider,
  useContest,
  useContestAdmin,
} from "@/features/contest/contexts";
import AdminDashboardLayout from "@/features/contest/components/admin/layout/AdminDashboardLayout";
import KpiCards from "@/features/contest/components/admin/KpiCards";
import ExamEditorLayout from "@/features/contest/components/admin/examEditor/ExamEditorLayout";
import CodingTestEditorLayout from "@/features/contest/components/admin/examEditor/CodingTestEditorLayout";

import ContestParticipantsScreen from "@/features/contest/screens/settings/ContestParticipantsScreen";
import ContestLogsScreen from "@/features/contest/screens/settings/ContestLogsScreen";
import ContestExamGradingScreen from "@/features/contest/screens/settings/ContestExamGradingScreen";
import AdminContestSettingsPanel from "./panels/AdminContestSettingsPanel";
import AdminOverviewPanel from "./panels/AdminOverviewPanel";

import { computeMockKpi } from "./mockData";

type PanelId =
  | "overview"
  | "logs"
  | "participants"
  | "exam"
  | "grading"
  | "settings";

const PANEL_KEYS: readonly PanelId[] = [
  "overview",
  "logs",
  "participants",
  "exam",
  "grading",
  "settings",
];

const getActivePanel = (value: string | null): PanelId =>
  PANEL_KEYS.includes(value as PanelId) ? (value as PanelId) : "overview";

const AdminDashboardInner = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const activePanel = getActivePanel(searchParams.get("panel"));
  const { contest, loading } = useContest();
  const { participants } = useContestAdmin();

  const kpi = useMemo(() => computeMockKpi(participants), [participants]);

  const handleBack = () => {
    navigate(`/contests/${contestId}`);
  };

  const handlePanelChange = (panel: PanelId) => {
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
        const hasCodingProblems = contest.problems.length > 0;
        const useExamEditor = contest.examModeEnabled && !hasCodingProblems;
        return useExamEditor ? (
          <ExamEditorLayout contestId={contestId || ""} contest={contest} />
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
      examMode={!!contest?.examModeEnabled && (contest?.problems.length ?? 0) === 0}
      onPanelChange={handlePanelChange}
      onBack={handleBack}
    >
      {renderPanel()}
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
