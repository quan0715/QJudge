import { Outlet } from "react-router-dom";
import { ContestProvider } from "@/features/contest/contexts/ContestContext";
import { ExamWorkspaceShell } from "@/features/contest/components/layout/ExamWorkspaceShell";
import { ContestRuntimeNavigatorProvider } from "@/features/contest/contexts/ContestRuntimeNavigatorContext";
import { ContestJudgeQueueProvider } from "@/features/contest/contexts/ContestJudgeQueueProvider";

export default function ExamPreviewLayout() {
  return (
    <ContestProvider enableRuntimePolling={false} enableLiveMonitoring={false}>
      <ContestRuntimeNavigatorProvider>
        <ContestJudgeQueueProvider>
          <ExamWorkspaceShell preview><Outlet /></ExamWorkspaceShell>
        </ContestJudgeQueueProvider>
      </ContestRuntimeNavigatorProvider>
    </ContestProvider>
  );
}
