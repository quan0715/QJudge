import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Modal, SkeletonText, Grid, Column, Tile } from "@carbon/react";

import type { ScoreboardRow } from "@/core/entities/contest.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { SubmissionDetailModal } from "@/features/submissions/components";
import { useContest } from "@/features/contest/contexts/ContestContext";

// Student Components
import { ContestOverview } from "@/features/contest/components/ContestOverview";
import { ContestProblemList } from "@/features/contest/components/ContestProblemList";
import PaperExamResultsList from "@/features/contest/components/exam/PaperExamResultsList";
import ContestSubmissionListScreen from "@/features/contest/screens/ContestSubmissionListScreen";
import ContestStandingsScreen from "@/features/contest/screens/ContestStandingsScreen";
import ContestQAScreen from "@/features/contest/screens/ContestQAScreen";

import {
  getAvailableContestTabKeys,
  type ContestTabKey,
} from "@/features/contest/tabConfig";

const ContestDashboard = () => {
  const { t } = useTranslation('contest');
  const { t: tc } = useTranslation('common');
  const [searchParams, setSearchParams] = useSearchParams();

  // Use contest and standings from context
  const { contest, loading, scoreboardData } = useContest();
  const { user: currentUser } = useAuth();

  // Personal stats state
  const [myRank, setMyRank] = useState<ScoreboardRow | null>(null);
  const [lockModalOpen, setLockModalOpen] = useState(false);

  // Find my rank from context standings
  useEffect(() => {
    const timerId = setTimeout(() => {
      if (!currentUser) {
        setMyRank(null);
        return;
      }
      const myEntry = scoreboardData?.rows?.find(
        (s) => s.displayName === currentUser.username
      );
      setMyRank(myEntry || null);
    }, 0);
    return () => clearTimeout(timerId);
  }, [currentUser, scoreboardData]);

  const handleSubmissionClose = () => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete("submissionId");
      return newParams;
    });
  };

  const selectedTabParam = searchParams.get("tab") || "overview";
  const selectedSubmissionId = searchParams.get("submissionId");

  const availableTabKeys = useMemo(
    () => getAvailableContestTabKeys(contest),
    [contest]
  );

  const selectedTab = availableTabKeys.includes(selectedTabParam as ContestTabKey)
    ? selectedTabParam
    : availableTabKeys[0];

  useEffect(() => {
    if (!contest) return;
    if (selectedTabParam === selectedTab) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", selectedTab);
      return next;
    });
  }, [contest, selectedTab, selectedTabParam, setSearchParams]);

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
        if (contest.contestType === "paper_exam") {
          return (
            <PaperExamResultsList
              contest={contest}
              maxWidth="1056px"
            />
          );
        }
        return (
          <ContestProblemList
            contest={contest}
            problems={contest.problems || []}
            myRank={myRank}
            maxWidth="1056px"
          />
        );
      case "submissions":
        return <ContestSubmissionListScreen maxWidth="1056px" />;
      case "standings":
        return <ContestStandingsScreen maxWidth="1056px" />;
      case "clarifications":
        return <ContestQAScreen maxWidth="1056px" />;
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
