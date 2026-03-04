import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Modal, SkeletonText, Grid, Column, Tile } from "@carbon/react";

import type { ScoreboardRow } from "@/core/entities/contest.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { SubmissionDetailModal } from "@/features/submissions/components";
import { useContest } from "@/features/contest/contexts/ContestContext";

import {
  type ContestTabKey,
} from "@/features/contest/tabConfig";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import { resolveStudentTabRenderer } from "@/features/contest/modules/StudentTabRendererRegistry";

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
  const contestModule = useMemo(
    () => getContestTypeModule(contest?.contestType),
    [contest?.contestType],
  );
  const availableTabs = useMemo(
    () => contestModule.student.getTabs(contest),
    [contest, contestModule],
  );

  const availableTabKeys = useMemo(
    () => availableTabs.map((tab) => tab.key),
    [availableTabs]
  );

  const selectedTabKey = availableTabKeys.includes(selectedTabParam as ContestTabKey)
    ? selectedTabParam
    : availableTabKeys[0];
  const selectedTab = availableTabs.find((tab) => tab.key === selectedTabKey) ?? availableTabs[0];

  useEffect(() => {
    if (!contest) return;
    if (selectedTabParam === selectedTabKey) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", selectedTabKey);
      return next;
    });
  }, [contest, selectedTabKey, selectedTabParam, setSearchParams]);

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
  if (!selectedTab) return null;

  const renderTabContent = () => {
    const render = resolveStudentTabRenderer(
      contestModule,
      selectedTab.contentKind,
    );
    return render({
      contest,
      myRank,
      maxWidth: "1056px",
    });
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
