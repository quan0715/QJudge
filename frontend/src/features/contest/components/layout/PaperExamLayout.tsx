import React from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { PaperExamProvider, usePaperExam } from "@/features/contest/contexts/PaperExamContext";
import ExamModeWrapper from "@/features/contest/components/ExamModeWrapper";

const PaperExamLayoutContent: React.FC = () => {
  const location = useLocation();
  const { contestId } = useParams<{ contestId: string }>();
  const { contest, refreshContest } = usePaperExam();

  const isPrecheckPath = location.pathname.endsWith("/paper-exam/precheck");

  if (isPrecheckPath) {
    return <Outlet />;
  }

  return (
    <ExamModeWrapper
      contestId={contestId || ""}
      cheatDetectionEnabled={!!contest?.cheatDetectionEnabled}
      isActive={contest?.examStatus === "in_progress"}
      isLocked={contest?.examStatus === "locked"}
      lockReason={contest?.lockReason}
      examStatus={contest?.examStatus}
      onRefresh={refreshContest}
    >
      <Outlet />
    </ExamModeWrapper>
  );
};

/**
 * Lightweight wrapper for paper-exam screens.
 * Provides PaperExamContext (contest only, no standings/participants/events).
 * Renders as a standalone full-page experience.
 */
const PaperExamLayout: React.FC = () => (
  <PaperExamProvider>
    <PaperExamLayoutContent />
  </PaperExamProvider>
);

export default PaperExamLayout;
