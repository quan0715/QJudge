import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '@carbon/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { isContestEnded } from '@/core/entities/contest.entity';
import { useDisablePanel } from '@/features/app/contexts/useDisablePanel';
import ExamSubmissionProgressModal from '@/features/contest/components/exam/ExamSubmissionProgressModal';
import { useContest } from '@/features/contest/contexts/ContestContext';
import { useContestExamActions } from '@/features/contest/hooks/useContestExamActions';
import { hasExamPrecheckPassed } from '@/features/contest/anticheat/examPrecheckGate';
import {
  getClassroomContestPrecheckPath,
  shouldRouteToPrecheck,
} from '@/features/contest/domain/contestRoutePolicy';

interface Props {
  children: ReactNode;
}

export const RuntimeRouteWrapper = ({ children }: Props) => {
  const { t } = useTranslation('contest');
  const { t: tc } = useTranslation('common');
  const { classroomId, contestId } = useParams<{
    classroomId?: string;
    contestId?: string;
  }>();
  const navigate = useNavigate();
  const { contest, loading, refreshContest } = useContest();
  const hasEnded = !!contest && isContestEnded(contest);
  const boundClassroomId = classroomId || contest?.boundClassroomId || undefined;

  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Closes right-side AI chat panel for the lifetime of this wrapper
  useDisablePanel('right');

  // Single owner of the precheck redirect for every contest type. This wrapper
  // covers both answering routes, so a new exam type inherits the gate without
  // reimplementing it in its own screen.
  useEffect(() => {
    if (!contestId || !contest || !boundClassroomId) return;
    if (
      !shouldRouteToPrecheck({
        contest,
        precheckPassed: hasExamPrecheckPassed(contestId),
      })
    ) {
      return;
    }
    navigate(getClassroomContestPrecheckPath(boundClassroomId, contestId), {
      replace: true,
    });
  }, [boundClassroomId, contest, contestId, navigate]);

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
