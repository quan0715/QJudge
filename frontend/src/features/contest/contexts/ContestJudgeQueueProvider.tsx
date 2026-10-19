import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isContestEnded } from "@/core/entities/contest.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { getClassroomContestSolvePath } from "@/features/contest/domain/contestRoutePolicy";
import { JudgeQueueProvider } from "@/features/problems/contexts/JudgeQueueProvider";
import type { JudgedEvent } from "@/features/problems/contexts/judgeQueueStore";
import { useToast } from "@/shared/contexts/ToastContext";
import { useContestRuntimeNavigator } from "./useContestRuntimeNavigator";
import { useOptionalContest } from "./useOptionalContest";

/** Exam-wide judge queue: what happens when a submission gets its verdict. */
export function ContestJudgeQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const contestValue = useOptionalContest();
  const navigator = useContestRuntimeNavigator();
  // A toast outlives the screen that was open at the verdict; 查看 goes through the one open when clicked.
  const navigatorRef = useRef(navigator);
  useEffect(() => { navigatorRef.current = navigator; }, [navigator]);
  const navigate = useNavigate();
  const { classroomId, contestId } = useParams<{ classroomId?: string; contestId?: string }>();
  const { showToast } = useToast();
  const contest = contestValue?.contest;
  const refreshStandings = contestValue?.refreshStandings;

  const handleJudged = useCallback(({ run, onScreen, show }: JudgedEvent) => {
    const verdict = run.result?.type === "submit" ? run.result.status : "";
    if (verdict === "AC") void refreshStandings?.();
    if (onScreen) return;

    const summary = contest?.problems?.find((problem) => problem.problemId === run.problemId);
    const answering = !!contest && !isContestEnded(contest) && contest.examStatus !== "submitted";
    const openProblem = () => {
      show();
      const current = navigatorRef.current;
      const index = current?.items.findIndex((item) => item.kind === "coding" && item.data.problemId === run.problemId) ?? -1;
      if (current && index >= 0) current.onSelect(index);
      else {
        const classroom = classroomId || contest?.boundClassroomId;
        if (classroom && contest && summary) navigate(getClassroomContestSolvePath(classroom, contest.id, summary.id));
      }
    };
    showToast({
      kind: verdict === "AC" ? "success" : "error",
      title: `${summary?.label ?? ""} 題判完：${verdict}`,
      timeout: 8000,
      action: answering ? { label: "查看", onClick: openProblem } : undefined,
    });
  }, [classroomId, contest, navigate, refreshStandings, showToast]);

  return (
    // A new exam starts an empty queue; the layout survives moving between exams.
    <JudgeQueueProvider key={contestId} userId={String(user?.id ?? "")} onJudged={handleJudged}>
      {children}
    </JudgeQueueProvider>
  );
}

export default ContestJudgeQueueProvider;
