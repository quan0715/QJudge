import { useEffect } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import { SkeletonText, Grid, Column, Tile } from "@carbon/react";

import { SubmissionDetailModal } from "@/features/submissions/components";
import { useContest } from "@/features/contest/contexts/ContestContext";

import StudentContestDashboard from "@/features/contest/components/studentDashboard/StudentContestDashboardView";

interface ContestDashboardOutletContext {
  refreshContest?: () => Promise<void>;
  onJoin?: (data?: { password?: string }) => void;
  onStartExam?: () => void;
  onEndExam?: () => void;
  onGoToAnswering?: () => void;
  onOpenAdminPanel?: () => void;
  isAdmin?: boolean;
}

const ContestDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const outletContext = useOutletContext<ContestDashboardOutletContext | null>();

  // Use contest from context; student dashboard intentionally avoids standings.
  const { contest, loading } = useContest();

  const handleSubmissionClose = () => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete("submissionId");
      return newParams;
    });
  };

  const selectedSubmissionId = searchParams.get("submissionId");

  useEffect(() => {
    if (!contest) return;
    if (!searchParams.has("tab")) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("tab");
      return next;
    });
  }, [contest, searchParams, setSearchParams]);

  // Skeleton loading component
  const renderSkeleton = () => (
    <div style={{ padding: "2rem", maxWidth: "1056px", margin: "0 auto" }}>
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <Tile style={{ marginBottom: "1rem" }}>
            <div style={{ marginBottom: "1rem" }}>
              <SkeletonText heading width="40%" />
            </div>
            <SkeletonText paragraph lineCount={3} />
          </Tile>
        </Column>
        <Column lg={8} md={4} sm={4}>
          <Tile style={{ marginBottom: "1rem" }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <SkeletonText heading width="30%" />
            </div>
            <SkeletonText paragraph lineCount={4} />
          </Tile>
        </Column>
        <Column lg={8} md={4} sm={4}>
          <Tile style={{ marginBottom: "1rem" }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <SkeletonText heading width="30%" />
            </div>
            <SkeletonText paragraph lineCount={4} />
          </Tile>
        </Column>
      </Grid>
    </div>
  );

  // Show skeleton on initial load
  if (loading && !contest) return renderSkeleton();

  // Guard against null contest
  if (!contest) return renderSkeleton();

  return (
    <>
      <StudentContestDashboard
        contest={contest}
        onJoin={outletContext?.onJoin}
        onStartExam={outletContext?.onStartExam}
        onEndExam={outletContext?.onEndExam}
        onGoToAnswering={outletContext?.onGoToAnswering}
        onOpenAdminPanel={outletContext?.onOpenAdminPanel}
        onRefreshContest={outletContext?.refreshContest}
        isAdmin={outletContext?.isAdmin}
      />

      {/* Submission Detail Modal */}
      {selectedSubmissionId && (
        <SubmissionDetailModal
          isOpen={!!selectedSubmissionId}
          submissionId={selectedSubmissionId}
          onClose={handleSubmissionClose}
        />
      )}
    </>
  );
};

export default ContestDashboard;
