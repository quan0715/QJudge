import React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  SkeletonText,
  Pagination,
  InlineNotification,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { useContestSubmissions } from "@/features/contest/hooks/useContestSubmissions";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { SubmissionDetailModal, SubmissionTable, type SubmissionRow } from "@/features/submissions/components";
// Styles loaded via globals.scss (Sass Partials)

interface ContestProblemSubmissionsProps {
  contestId: string;
  // Expects CodingProblem.id (NOT ContestQuestionBinding.id) — the /submissions
  // list filter targets Submission.problem FK, which points at CodingProblem.
  codingProblemId: string;
  userId?: string;
}

/**
 * ContestProblemSubmissions - Shows user's submissions for a specific problem
 * within a contest context
 */
const ContestProblemSubmissions: React.FC<ContestProblemSubmissionsProps> = ({
  contestId,
  codingProblemId,
  userId,
}) => {
  const { t } = useTranslation("contest");
  const skeletonWidths = [
    "3.75rem",
    "2.5rem",
    "3.125rem",
    "3.75rem",
    "5rem",
  ];
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [selectedSubmissionId, setSelectedSubmissionId] = React.useState<string | null>(null);
  const { user: currentUser } = useAuth();

  // Fetch submissions for this problem, filtered by current user
  const { data, isLoading, isFetching, isError, error, refetch } = useContestSubmissions({
    contestId,
    page,
    pageSize,
    problemFilter: codingProblemId,
    userId: userId ?? currentUser?.id,
    enabled: !!(userId ?? currentUser?.id),
  });

  const submissions = data?.results || [];

  // Modal state
  const handleViewSubmission = (id: string) => {
    setSelectedSubmissionId(id);
  };

  const handleCloseModal = () => {
    setSelectedSubmissionId(null);
  };

  // Map submissions to SubmissionRow format for SubmissionTable
  const submissionRows: SubmissionRow[] = submissions.map((sub) => {
    const submission = sub as {
      id: string | number;
      status: string;
      language?: string | null;
      score?: number | null;
      execTime?: number | null;
      createdAt?: string | null;
    };
    return {
      id: submission.id.toString(),
      status: submission.status,
      language: submission.language || "",
      score: submission.score ?? 0,
      exec_time: submission.execTime ?? 0,
      created_at: submission.createdAt || "",
      canView: true,
    };
  });

  // Loading skeleton
  if (isLoading && submissions.length === 0) {
    return (
      <div className="contest-problem-submissions">
        <div className="contest-problem-submissions__header">
          <h3 className="contest-problem-submissions__title">{t("dashboard.submissionRecords", "提交紀錄")}</h3>
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
        <h3 className="contest-problem-submissions__title">{t("dashboard.submissionRecords", "提交紀錄")}</h3>
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

      {isError ? (
        <InlineNotification kind="error" title={t("dashboard.submissionsLoadFailed", "無法載入提交紀錄")} subtitle={error.message} hideCloseButton />
      ) : submissions.length === 0 ? (
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

      {(data?.count ?? 0) > 20 && <Pagination
        page={page} pageSize={pageSize} pageSizes={[20, 50, 100]} totalItems={data?.count ?? 0}
        onChange={({ page: nextPage, pageSize: nextSize }) => { setPage(nextPage); setPageSize(nextSize); }}
      />}
      <SubmissionDetailModal
        submissionId={selectedSubmissionId}
        isOpen={!!selectedSubmissionId}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default ContestProblemSubmissions;
