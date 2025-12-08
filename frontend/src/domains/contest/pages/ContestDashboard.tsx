import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useOutletContext } from 'react-router-dom';
import { Loading, Modal } from '@carbon/react';

import { getScoreboard, recordExamEvent, registerContest } from '@/services/contest';
import { getSubmissions } from '@/services/submission';
import type { ScoreboardRow } from '@/core/entities/contest.entity';
import type { Submission } from '@/core/entities/submission.entity';
import { SubmissionDetailModal } from '@/domains/submission/components/SubmissionDetailModal';
import { useContest } from '@/domains/contest/contexts/ContestContext';

// Student Components
import { ContestOverview } from '@/domains/contest/components/ContestOverview';
import { ContestProblemList } from '@/domains/contest/components/ContestProblemList';
import ContestSubmissionListPage from '@/domains/contest/pages/ContestSubmissionListPage';
import ContestStandingsPage from '@/domains/contest/pages/ContestStandingsPage';
import ContestQAPage from '@/domains/contest/pages/ContestQAPage';

// Admin Components (rendered as tabs)
import ContestAdminSettingsPage from '@/domains/contest/pages/settings/ContestSettingsPage';

import ContestAdminParticipantsPage from '@/domains/contest/pages/settings/ContestParticipantsPage';
import ContestAdminLogsPage from '@/domains/contest/pages/settings/ContestLogsPage';

const ContestDashboard = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { handleJoin } = useOutletContext<{ refreshContest: () => void, handleJoin: () => void }>();
  
  // Use contest from context instead of local state
  const { contest, loading, refreshContest } = useContest();
  
  // Personal stats state
  const [myRank, setMyRank] = useState<ScoreboardRow | null>(null);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [lockModalOpen, setLockModalOpen] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Failed to parse user', e);
      }
    }
  }, []);

  useEffect(() => {
    if (contestId && currentUser) {
      loadPersonalStats();
    }
  }, [contestId, currentUser]);

  const loadPersonalStats = async () => {
    if (!contestId || !currentUser) return;
    try {
      // Load standings to find rank
      const standingsData = await getScoreboard(contestId);
      if (standingsData && standingsData.rows && Array.isArray(standingsData.rows)) {
        const myEntry = standingsData.rows.find((s: ScoreboardRow) => s.displayName === currentUser.username); 
        setMyRank(myEntry || null);
      }

      // Load submissions
      const submissions = await getSubmissions({ contest: contestId });
      // @ts-ignore
      const submissionList = submissions.results || [];
      const mySubs = submissionList.filter((s: Submission) => s.username === currentUser.username || s.userId === currentUser.id?.toString());
      setMySubmissions(mySubs.slice(0, 5)); // Show top 5 recent
    } catch (error) {
      console.error('Failed to load personal stats', error);
    }
  };

  useEffect(() => {
    // Anti-Cheat Logic
    if (!contest || !contest.examModeEnabled || !contest.hasStarted || contest.examStatus === 'submitted' || contest.examStatus === 'locked') {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logEvent('tab_hidden', { reason: 'visibility_hidden' });
      }
    };

    const handleBlur = () => {
      logEvent('window_blur', { reason: 'window_blur' });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [contest]);

  const logEvent = async (type: string, metadata: any) => {
    if (!contestId) return;
    try {
      const res = await recordExamEvent(contestId, type, metadata);
      if (res && res.locked) {
        refreshContest();
        setLockModalOpen(true);
      }
    } catch (error) {
      console.error('Failed to log event', error);
    }
  };

  const handleSubmissionClick = (submissionId: string) => {
    setSearchParams(prev => {
      prev.set('submission_id', submissionId);
      return prev;
    });
  };

  const handleCloseModal = () => {
    setSearchParams(prev => {
      prev.delete('submission_id');
      return prev;
    });
  };

  const currentTab = searchParams.get('tab') || 'overview';
  const contentMaxWidth = '1056px';

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  const renderContent = () => {
    switch (currentTab) {
      case 'problems':
        return (
          <ContestProblemList 
            contest={contest}
            problems={contest.problems}
            myRank={myRank}
            currentUser={currentUser}
            maxWidth={contentMaxWidth}
            onReload={refreshContest}
          />
        );
      case 'submissions':
        return <ContestSubmissionListPage maxWidth={contentMaxWidth} />;
      case 'standings':
        return <ContestStandingsPage maxWidth={contentMaxWidth} />;
      case 'clarifications':
        return <ContestQAPage maxWidth={contentMaxWidth} />;
      
      // Admin Tabs
      case 'settings':
        return <ContestAdminSettingsPage />;
      case 'participants':
        return <ContestAdminParticipantsPage />;
      case 'logs':
        return <ContestAdminLogsPage />;
        
      case 'overview':
      default:
        return (
          <ContestOverview 
            contest={contest}
            myRank={myRank}
            mySubmissions={mySubmissions}
            onSubmissionClick={handleSubmissionClick}
            onViewAllSubmissions={() => setSearchParams({ tab: 'submissions' })}
            onRegister={async () => {
              if (handleJoin) {
                handleJoin();
              } else {
                 await registerContest(contestId!);
                 await refreshContest();
              }
            }}
            maxWidth={contentMaxWidth}
          />
        );
    }
  };

  return (
    <>
      {renderContent()}
      
      <SubmissionDetailModal
        submissionId={searchParams.get('submission_id')}
        isOpen={!!searchParams.get('submission_id')}
        onClose={handleCloseModal}
        contestId={contestId}
      />

      <Modal
        open={lockModalOpen}
        modalHeading="考試鎖定通知"
        passiveModal
        onRequestClose={() => setLockModalOpen(false)}
      >
        <p style={{ fontSize: '1rem', color: 'var(--cds-text-error)' }}>
          您因多次違規已被鎖定，無法繼續考試。
        </p>
      </Modal>
    </>
  );
};

export default ContestDashboard;
