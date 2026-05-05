import { useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { InlineLoading, Modal } from "@carbon/react";
import { useTranslation } from "react-i18next";

import { ContestProvider } from "@/features/contest/contexts/ContestContext";
import ExamSubmissionProgressModal from "@/features/contest/components/exam/ExamSubmissionProgressModal";
import { useContestExamActions } from "@/features/contest/hooks/useContestExamActions";
import { useContestLayoutState } from "@/features/contest/hooks/useContestLayoutState";
import {
  getClassroomContestPrecheckPath,
  getClassroomContestSolvePath,
  shouldRouteToPrecheck,
} from "@/features/contest/domain/contestRoutePolicy";
import { hasExamPrecheckPassed } from "@/features/contest/screens/paperExam/hooks";

const ContestWorkspaceLayout = () => {
  const { classroomId } = useParams<{ classroomId?: string }>();
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const {
    contestId,
    contest,
    contestLoading,
    contestNotFound,
    hasEnded,
    isAdmin,
    scoreboardData,
    refreshContest,
    navigate,
  } = useContestLayoutState();

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const boundClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const precheckPath =
    boundClassroomId && contestId
      ? getClassroomContestPrecheckPath(boundClassroomId, contestId)
      : "/dashboard";
  const answeringPath =
    boundClassroomId && contestId
      ? getClassroomContestSolvePath(boundClassroomId, contestId)
      : "/dashboard";
  const adminPath =
    boundClassroomId && contestId
      ? `/classrooms/${boundClassroomId}/contest/${contestId}/admin`
      : "/dashboard";

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const handleGoToAnswering = () => {
    if (!contestId || !contest) return;
    if (
      boundClassroomId &&
      shouldRouteToPrecheck({
        contest,
        precheckPassed: hasExamPrecheckPassed(contest.id),
      })
    ) {
      navigate(precheckPath);
      return;
    }
    navigate(answeringPath);
  };

  const {
    handleJoin,
    handleStartExam,
    handleEndExam,
    submissionProgress,
  } = useContestExamActions({
    contest,
    contestId,
    hasEnded,
    refreshContest,
    navigate,
    messages: {
      joinError: t("error.joinFailed"),
      startError: t("error.startExamFailed"),
      endError: t("error.endExamFailed"),
      exitError: t("error.exitFailed"),
    },
    onError: showError,
  });

  if (contestLoading) {
    return (
      <div style={{ padding: "2rem" }}>
        <InlineLoading description={tc("message.loading")} />
      </div>
    );
  }

  if (contestNotFound) {
    return null;
  }

  return (
    <ContestProvider
      initialContest={contest}
      initialScoreboardData={scoreboardData}
      onRefresh={refreshContest}
    >
      <Outlet
        context={{
          refreshContest,
          onJoin: handleJoin,
          onStartExam: handleStartExam,
          onEndExam: handleEndExam,
          onGoToAnswering: handleGoToAnswering,
          onOpenAdminPanel: isAdmin ? () => navigate(adminPath) : undefined,
          isAdmin,
        }}
      />

      <ExamSubmissionProgressModal
        state={submissionProgress.state}
        onRequestClose={submissionProgress.close}
      />

      <Modal
        open={errorModalOpen}
        modalHeading={tc("message.error")}
        passiveModal
        onRequestClose={() => setErrorModalOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
    </ContestProvider>
  );
};

export default ContestWorkspaceLayout;
