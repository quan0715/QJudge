import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '@carbon/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { isContestEnded } from '@/core/entities/contest.entity';
import { useDisablePanel } from '@/features/app/contexts/useDisablePanel';
import ExamSubmissionProgressModal from '@/features/contest/components/exam/ExamSubmissionProgressModal';
import { useContest } from '@/features/contest/contexts/ContestContext';
import { useContestExamActions } from '@/features/contest/hooks/useContestExamActions';

interface Props {
  children: ReactNode;
}

export const RuntimeRouteWrapper = ({ children }: Props) => {
  const { t } = useTranslation('contest');
  const { t: tc } = useTranslation('common');
  const { contestId } = useParams<{ contestId?: string }>();
  const navigate = useNavigate();
  const { contest, loading, refreshContest } = useContest();
  const hasEnded = !!contest && isContestEnded(contest);

  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Closes right-side AI chat panel for the lifetime of this wrapper
  useDisablePanel('right');

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorOpen(true);
  };

  const examActions = useContestExamActions({
    contest,
    contestId,
    hasEnded,
    refreshContest,
    navigate,
    messages: {
      joinError: t('error.joinFailed'),
      startError: t('error.startExamFailed'),
      endError: t('error.endExamFailed'),
      exitError: t('error.exitFailed'),
    },
    onError: showError,
  });

  // Guard: don't render runtime content until contest is loaded. The contest
  // surface wrapper owns ExamModeWrapper so dashboard and solve share one
  // monitoring lifecycle.
  if (loading || !contest) return null;

  return (
    <>
      {children}

      <ExamSubmissionProgressModal
        state={examActions.submissionProgress.state}
        onRequestClose={examActions.submissionProgress.close}
      />

      <Modal
        open={errorOpen}
        modalHeading={tc('message.error')}
        passiveModal
        onRequestClose={() => setErrorOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
    </>
  );
};

export default RuntimeRouteWrapper;
