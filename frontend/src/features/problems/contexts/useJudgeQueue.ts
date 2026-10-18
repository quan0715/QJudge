import { useContext, useEffect, useMemo } from "react";
import { JudgeQueueContext, summarizeProblemStatuses, type JudgeQueueValue } from "./judgeQueueStore";

export function useJudgeQueue(): JudgeQueueValue {
  const value = useContext(JudgeQueueContext);
  if (!value) throw new Error("useJudgeQueue must be used within JudgeQueueProvider");
  return value;
}

/** Marks the problem whose result panel is showing its run, so its verdict needs no notification. */
export function useWatchProblem(problemId: string | undefined, watching: boolean) {
  const { setViewing } = useJudgeQueue();
  useEffect(() => {
    if (!problemId || !watching) return;
    setViewing(problemId);
    return () => setViewing(null);
  }, [problemId, watching, setViewing]);
}

/** Judging / accepted / rejected per CodingProblem.id for this session's submissions. */
export function useJudgeProblemStatuses() {
  const { runs } = useJudgeQueue();
  return useMemo(() => summarizeProblemStatuses(runs), [runs]);
}
