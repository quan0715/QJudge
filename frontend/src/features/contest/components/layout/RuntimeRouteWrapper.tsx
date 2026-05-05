import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '@carbon/react';
import { useTranslation } from 'react-i18next';

import { useDisablePanel } from '@/features/app/contexts/useDisablePanel';
import ExamModeWrapper from '@/features/contest/components/ExamModeWrapper';
import { ExamModeMonitorModal } from '@/features/contest/components/modals/ExamModeMonitorModal';
import ExamSubmissionProgressModal from '@/features/contest/components/exam/ExamSubmissionProgressModal';
import { useContestExamActions } from '@/features/contest/hooks/useContestExamActions';
import { useContestLayoutState } from '@/features/contest/hooks/useContestLayoutState';
import { ContestRuntimeProvider } from '@/features/contest/contexts/ContestRuntimeContext';

interface Props {
  children: ReactNode;
}

export const RuntimeRouteWrapper = ({ children }: Props) => {
  const { t } = useTranslation('contest');
  const { t: tc } = useTranslation('common');
  const {
    contestId,
    contest,
    contestLoading,
    contestNotFound,
    hasEnded,
    refreshContest,
    navigate,
  } = useContestLayoutState();

  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [monitoringOpen, setMonitoringOpen] = useState(false);

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

  const isContestParticipant = !!contest?.hasJoined;
  const examModeProps = {
    contestId: contestId || '',
    cheatDetectionEnabled: isContestParticipant && !!contest?.cheatDetectionEnabled,
    isExamMonitored: isContestParticipant && !!contest?.isExamMonitored,
    requiresFullscreen: isContestParticipant && !!contest?.requiresFullscreen,
    hasEnded,
    lockReason: contest?.lockReason,
    examStatus: contest?.examStatus,
    onRefresh: refreshContest,
  };

  // Guard: don't render ExamModeWrapper until contest is loaded.
  // Otherwise ExamModeWrapper renders with cheatDetectionEnabled=false,
  // triggering its cleanup effect which destroys the precheck screen-share handoff stream.
  if (contestLoading || (!contest && !contestNotFound)) return null;
  if (contestNotFound) return null;

  return (
    <ContestRuntimeProvider value={{ isRuntime: true, openMonitor: () => setMonitoringOpen(true) }}>
      <ExamModeWrapper {...examModeProps}>
        {children}
      </ExamModeWrapper>

      <ExamModeMonitorModal
        open={monitoringOpen}
        onRequestClose={() => setMonitoringOpen(false)}
      />

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
    </ContestRuntimeProvider>
  );
};

export default RuntimeRouteWrapper;
