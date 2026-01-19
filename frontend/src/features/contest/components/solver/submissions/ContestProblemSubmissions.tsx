import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  SkeletonText,
  InlineNotification,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { useContestSubmissions } from "@/features/contest/hooks/useContestSubmissions";
import { SubmissionDetailModal, SubmissionTable, type SubmissionRow } from "@/features/submissions/components";
// Styles loaded via globals.scss (Sass Partials)

interface ContestProblemSubmissionsProps {
  contestId: string;
  problemId: string;
}

/**
 * ContestProblemSubmissions - Shows user's submissions for a specific problem
 * within a contest context
 */
const ContestProblemSubmissions: React.FC<ContestProblemSubmissionsProps> = ({
  contestId,
  problemId,
}) => {
  const skeletonWidths = [
    "calc(var(--cds-spacing-07) + var(--cds-spacing-06) + var(--cds-spacing-02))",
    "var(--cds-spacing-08)",
    "calc(var(--cds-spacing-07) + var(--cds-spacing-05) + var(--cds-spacing-01))",
    "calc(var(--cds-spacing-07) + var(--cds-spacing-06) + var(--cds-spacing-02))",
    "calc(var(--cds-spacing-09) + var(--cds-spacing-07))",
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Get current user from localStorage
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error("Failed to parse user", e);
      }
    }
  }, []);

  // Fetch submissions for this problem, filtered by current user
  const { data, isLoading, isFetching, refetch } = useContestSubmissions({
    contestId,
    page: 1,
    pageSize: 20,
    problemFilter: problemId,
    userId: currentUser?.id,
  });

  const submissions = data?.results || [];

  // Modal state
  const submissionIdFromUrl = searchParams.get("submission_id");
  const isModalOpen = !!submissionIdFromUrl;

  const handleViewSubmission = (id: string) => {
    setSearchParams({ submission_id: id });
  };

  const handleCloseModal = () => {
    setSearchParams({});
  };

  // Map submissions to SubmissionRow format for SubmissionTable
  const submissionRows: SubmissionRow[] = submissions.map((sub: any) => ({
    id: sub.id.toString(),
    status: sub.status,
    language: sub.language || "",
    score: sub.score ?? 0,
    exec_time: sub.execTime ?? 0,
    created_at: sub.createdAt || "",
    canView: true, // User's own submissions
  }));

  // Loading skeleton
  if (isLoading && submissions.length === 0) {
    return (
      <div className="contest-problem-submissions">
        <div className="contest-problem-submissions__header">
          <h3 className="contest-problem-submissions__title">我的繳交記錄</h3>
        </div>
        <div className="contest-problem-submissions__skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="contest-problem-submissions__skeleton-row">
              <SkeletonText width={skeletonWidths[0]} />
              <SkeletonText width={skeletonWidths[1]} />
              <SkeletonText width={skeletonWidths[2]} />
              <SkeletonText width={skeletonWidths[3]} />
              <SkeletonText width={skeletonWidths[4]} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="contest-problem-submissions">
      <div className="contest-problem-submissions__header">
        <h3 className="contest-problem-submissions__title">我的繳交記錄</h3>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          iconDescription="重新整理"
          renderIcon={Renew}
          onClick={() => refetch()}
          disabled={isFetching}
        />
      </div>

      {submissions.length === 0 ? (
        <InlineNotification
          kind="info"
          title="尚無繳交記錄"
          subtitle="提交答案後，記錄將顯示在此處"
          lowContrast
          hideCloseButton
        />
      ) : (
        <SubmissionTable
          submissions={submissionRows}
          onViewDetails={handleViewSubmission}
          showProblem={false}
          showUser={false}
          showScore={true}
          showId={false}
          showActions={false}
        />
      )}

      <SubmissionDetailModal
        submissionId={submissionIdFromUrl}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        contestId={contestId}
      />
    </div>
  );
};

export default ContestProblemSubmissions;

