import { useCallback, type ReactNode } from "react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { JudgeQueueProvider } from "@/features/problems/contexts/JudgeQueueProvider";
import type { JudgedEvent } from "@/features/problems/contexts/judgeQueueStore";
import { useOptionalContest } from "./useOptionalContest";

/** Exam-wide judge queue: what happens when a submission gets its verdict. */
export function ContestJudgeQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const refreshStandings = useOptionalContest()?.refreshStandings;

  const handleJudged = useCallback(({ run }: JudgedEvent) => {
    if (run.result?.type === "submit" && run.result.status === "AC") void refreshStandings?.();
  }, [refreshStandings]);

  return (
    <JudgeQueueProvider userId={String(user?.id ?? "")} onJudged={handleJudged}>
      {children}
    </JudgeQueueProvider>
  );
}

export default ContestJudgeQueueProvider;
