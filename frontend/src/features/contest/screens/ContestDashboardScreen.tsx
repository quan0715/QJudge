import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Modal, SkeletonText, Grid, Column, Tile } from "@carbon/react";

import type { ScoreboardRow } from "@/core/entities/contest.entity";
import { SubmissionDetailModal } from "@/features/submissions/components";
import { useContest } from "@/features/contest/contexts/ContestContext";

// Student Components
import { ContestOverview } from "@/features/contest/components/ContestOverview";
import { ContestProblemList } from "@/features/contest/components/ContestProblemList";
import ContestSubmissionListScreen from "@/features/contest/screens/ContestSubmissionListScreen";
import ContestStandingsScreen from "@/features/contest/screens/ContestStandingsScreen";
import ContestQAScreen from "@/features/contest/screens/ContestQAScreen";

// Admin Components (rendered as tabs)
import ContestSettingsScreen from "@/features/contest/screens/settings/ContestSettingsScreen";
import ContestParticipantsScreen from "@/features/contest/screens/settings/ContestParticipantsScreen";
import ContestLogsScreen from "@/features/contest/screens/settings/ContestLogsScreen";
import ContestAdminsScreen from "@/features/contest/screens/settings/ContestAdminsScreen";

const ContestDashboard = () => {
  const { t } = useTranslation('contest');
  const { t: tc } = useTranslation('common');
  const [searchParams, setSearchParams] = useSearchParams();

  // Use contest and standings from context
  const { contest, loading, scoreboardData } = useContest();

  // Personal stats state
  const [myRank, setMyRank] = useState<ScoreboardRow | null>(null);
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

  const handleSubmissionClose = () => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete("submissionId");
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
        return <ContestSubmissionListScreen maxWidth="1056px" />;
      case "standings":
        return <ContestStandingsScreen maxWidth="1056px" />;
      case "clarifications":
        return <ContestQAScreen maxWidth="1056px" />;
      // Admin tabs
      case "settings":
        return <ContestSettingsScreen />;
      case "participants":
        return <ContestParticipantsScreen />;
      case "logs":
        return <ContestLogsScreen />;
      case "admins":
        return <ContestAdminsScreen />;
      default:
        return (
          <ContestOverview
            contest={contest!}
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
