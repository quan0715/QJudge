import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import { Modal, SkeletonText, Grid, Column, Tile } from "@carbon/react";

import { getSubmissions } from "@/services/submission";
import type { ScoreboardRow } from "@/core/entities/contest.entity";
import type { Submission } from "@/core/entities/submission.entity";
import { SubmissionDetailModal } from "@/domains/submission/components/SubmissionDetailModal";
import { useContest } from "@/domains/contest/contexts/ContestContext";

// Student Components
import { ContestOverview } from "@/domains/contest/components/ContestOverview";
import { ContestProblemList } from "@/domains/contest/components/ContestProblemList";
import ContestSubmissionListPage from "@/domains/contest/pages/ContestSubmissionListPage";
import ContestStandingsPage from "@/domains/contest/pages/ContestStandingsPage";
import ContestQAPage from "@/domains/contest/pages/ContestQAPage";

// Admin Components (rendered as tabs)
import ContestAdminSettingsPage from "@/domains/contest/pages/settings/ContestSettingsPage";
import ContestAdminParticipantsPage from "@/domains/contest/pages/settings/ContestParticipantsPage";
import ContestAdminLogsPage from "@/domains/contest/pages/settings/ContestLogsPage";
import ContestAdminsPage from "@/domains/contest/pages/settings/ContestAdminsPage";

const ContestDashboard = () => {
  const { t } = useTranslation('contest');
  const { t: tc } = useTranslation('common');
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Use contest and standings from context
  const { contest, loading, scoreboardData } = useContest();

  // Personal stats state
  const [myRank, setMyRank] = useState<ScoreboardRow | null>(null);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [lockModalOpen, setLockModalOpen] = useState(false);

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

  // Find my rank from context standings
  useEffect(() => {
    if (currentUser && scoreboardData?.rows?.length) {
      const myEntry = scoreboardData.rows.find(
        (s) => s.displayName === currentUser.username
      );
      setMyRank(myEntry || null);
    }
  }, [currentUser, scoreboardData]);

  // Load submissions separately (user-specific, can't be shared)
  useEffect(() => {
    if (contestId && currentUser) {
      loadMySubmissions();
    }
  }, [contestId, currentUser]);

  const loadMySubmissions = async () => {
    if (!contestId || !currentUser) return;
    try {
      const submissions = await getSubmissions({ contest: contestId });
      // @ts-ignore
      const submissionList = submissions.results || [];
      const mySubs = submissionList.filter(
        (s: Submission) =>
          s.username === currentUser.username ||
          s.userId === currentUser.id?.toString()
      );
      setMySubmissions(mySubs.slice(0, 5)); // Show top 5 recent
    } catch (error) {
      console.error("Failed to load submissions", error);
    }
  };

  const handleSubmissionClick = (submissionId: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("submissionId", submissionId);
      return newParams;
    });
  };

  const handleSubmissionClose = () => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete("submissionId");
      return newParams;
    });
  };

  const handleViewAllSubmissions = () => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("tab", "submissions");
      return newParams;
    });
  };

  // Get selected tab from URL (default to 'overview')
  const selectedTab = searchParams.get("tab") || "overview";
  const selectedSubmissionId = searchParams.get("submissionId");

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
  const renderTabContent = () => {
    switch (selectedTab) {
      case "overview":
        return (
          <ContestOverview
            contest={contest!}
            myRank={myRank}
            mySubmissions={mySubmissions}
            onSubmissionClick={handleSubmissionClick}
            onViewAllSubmissions={handleViewAllSubmissions}
            maxWidth="1056px"
          />
        );
      case "problems":
        return (
          <ContestProblemList
            contest={contest}
            problems={contest.problems || []}
            myRank={myRank}
            currentUser={currentUser}
            maxWidth="1056px"
          />
        );
      case "submissions":
        return <ContestSubmissionListPage maxWidth="1056px" />;
      case "standings":
        return <ContestStandingsPage maxWidth="1056px" />;
      case "clarifications":
        return <ContestQAPage maxWidth="1056px" />;
      // Admin tabs
      case "settings":
        return <ContestAdminSettingsPage />;
      case "participants":
        return <ContestAdminParticipantsPage />;
      case "logs":
        return <ContestAdminLogsPage />;
      case "admins":
        return <ContestAdminsPage />;
      default:
        return (
          <ContestOverview
            contest={contest!}
            myRank={myRank}
            mySubmissions={mySubmissions}
            onSubmissionClick={handleSubmissionClick}
            onViewAllSubmissions={handleViewAllSubmissions}
            maxWidth="1056px"
          />
        );
    }
  };

  return (
    <>
      {renderTabContent()}

      {/* Submission Detail Modal */}
      {selectedSubmissionId && (
        <SubmissionDetailModal
          isOpen={!!selectedSubmissionId}
          submissionId={selectedSubmissionId}
          onClose={handleSubmissionClose}
        />
      )}

      {/* Lock Modal */}
      <Modal
        open={lockModalOpen}
        modalHeading={t('exam.answerLocked')}
        primaryButtonText={tc('button.confirm')}
        onRequestClose={() => setLockModalOpen(false)}
        onRequestSubmit={() => setLockModalOpen(false)}
        size="sm"
      >
        <p>{t('exam.contactProctorToUnlock')}</p>
      </Modal>
    </>
  );
};

export default ContestDashboard;
