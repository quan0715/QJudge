import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useContestNavigationGuard } from "@/features/contest/hooks/useContestNavigationGuard";
import { Loading, Button } from "@carbon/react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { isContestEnded } from "@/core/entities/contest.entity";
import { useContestProblemSelection } from "@/features/contest/hooks/useContestProblemSelection";

// Components
import { ProblemMenu } from "@/shared/ui/solver/menu/ProblemMenu";
import { ProblemFullPageSolve } from "@/features/problems/components/solve/editorview/ProblemFullPageSolve";
import ContestProblemSubmissions from "@/features/contest/components/solver/submissions/ContestProblemSubmissions";
import {
  getClassroomContestDashboardPath,
  getClassroomContestSolvePath,
} from "@/features/contest/domain/contestRoutePolicy";
import "./ContestProblemScreen.scss";

const ContestProblemScreen = () => {
  const { t } = useTranslation("contest");
  const { contestId, classroomId, problemId } = useParams<{
    contestId?: string;
    classroomId?: string;
    problemId: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { contest, scoreboardData, loading: contestLoading } = useContest();
  const effectiveClassroomId = classroomId || contest?.boundClassroomId || undefined;
  const classroomContestContext = useMemo(
    () => (classroomId && contestId ? { classroomId, contestId } : null),
    [classroomId, contestId],
  );
  const fallbackLobbyPath = classroomContestContext
    ? getClassroomContestDashboardPath(
        classroomContestContext.classroomId!,
        classroomContestContext.contestId!,
      )
    : effectiveClassroomId && contestId
      ? getClassroomContestDashboardPath(effectiveClassroomId, contestId)
      : "/dashboard";

  const hasEnded = !!contest && isContestEnded(contest);
  useContestNavigationGuard(
    contestId,
    contest?.status === "published" && !hasEnded,
  );

  // Find current user's rank data for solved status
  const myRank = useMemo(() => {
    if (!scoreboardData?.rows || !user) return null;
    const userId = user.id?.toString();
    const byId = userId
      ? scoreboardData.rows.find((row) => row.userId === userId)
      : null;
    if (byId) return byId;
    return (
      scoreboardData.rows.find((row) => row.displayName === user.username) ||
      null
    );
  }, [scoreboardData, user]);

  // Use the contest problem selection hook
  const problemSelection = useContestProblemSelection({
    contest,
    myRank,
    initialProblemId: problemId,
  });

  useEffect(() => {
    if (!contestId || contest?.contestType !== "coding") return;
    if (problemId) return;

    if (problemSelection.selectedProblemId) {
      const nextPath = classroomContestContext
        ? getClassroomContestSolvePath(
            classroomContestContext.classroomId!,
            classroomContestContext.contestId!,
            problemSelection.selectedProblemId,
          )
        : effectiveClassroomId
          ? getClassroomContestSolvePath(
              effectiveClassroomId,
              contestId,
              problemSelection.selectedProblemId,
            )
          : "/dashboard";
      navigate(nextPath, { replace: true });
      return;
    }

    if ((contest.problems?.length ?? 0) === 0) {
      navigate(
        fallbackLobbyPath,
        { replace: true },
      );
    }
  }, [
    classroomId,
    classroomContestContext,
    contest?.contestType,
    contest?.problems,
    fallbackLobbyPath,
    navigate,
    contestId,
    problemId,
    problemSelection.selectedProblemId,
    effectiveClassroomId,
  ]);

  // Check view permissions
  const canView =
    ((contest?.status === "published" || contest?.status === "archived") &&
      contest?.hasStarted &&
      contest?.examStatus !== "locked");

  const isSubmissionDisabled =
    contest?.status !== "published" || hasEnded;

  // Loading state
  if (contestLoading) {
    return (
      <div className="contest-problem-page contest-problem-page--loading">
        <Loading />
      </div>
    );
  }

  // Permission check
  if (!canView) {
    return (
      <div className="contest-problem-page contest-problem-page--error">
        <h3>{t("error.cannotViewProblem")}</h3>
        <p>{t("error.problemAccessDenied")}</p>
        <Button
          kind="secondary"
          onClick={() => navigate(fallbackLobbyPath)}
        >
          {t("button.backToLobby")}
        </Button>
      </div>
    );
  }

  // Problem loading state
  if (problemSelection.isProblemLoading || !problemSelection.selectedProblem) {
    return (
      <div className="contest-problem-page contest-problem-page--loading">
        <Loading />
      </div>
    );
  }

  // Error state
  if (problemSelection.error) {
    return (
      <div className="contest-problem-page contest-problem-page--error">
        <h3>{t("error.loadProblemFailed")}</h3>
        <p>{problemSelection.error}</p>
        <Button
          kind="secondary"
          onClick={() => navigate(fallbackLobbyPath)}
        >
          {t("button.backToLobby")}
        </Button>
      </div>
    );
  }

  return (
    <div className="contest-problem-page">
      <ProblemFullPageSolve
        key={problemSelection.selectedProblemId} // Reset state when problem changes
        problem={problemSelection.selectedProblem}
        problemLabel={problemSelection.selectedProblemLabel}
        contestId={contestId}
        menuPanel={
          <ProblemMenu
            problems={problemSelection.problems}
            selectedProblemId={problemSelection.selectedProblemId}
            onSelect={problemSelection.selectProblem}
          />
        }
        disableCopy={contest?.cheatDetectionEnabled}
        submissionDisabled={isSubmissionDisabled}
        renderSubmissions={() => (
          <ContestProblemSubmissions
            contestId={contestId!}
            codingProblemId={problemSelection.selectedCodingProblemId || ""}
          />
        )}
      />
    </div>
  );
};

export default ContestProblemScreen;
