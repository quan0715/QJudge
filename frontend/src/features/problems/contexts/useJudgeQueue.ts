import { useContext, useMemo } from "react";
import { JudgeQueueContext, summarizeProblemStatuses, type JudgeQueueValue } from "./judgeQueueStore";

export function useJudgeQueue(): JudgeQueueValue {
  const value = useContext(JudgeQueueContext);
  if (!value) throw new Error("useJudgeQueue must be used within JudgeQueueProvider");
  return value;
}

/** Judging / accepted / rejected per CodingProblem.id for this session's submissions. */
export function useJudgeProblemStatuses() {
  const { runs } = useJudgeQueue();
  return useMemo(() => summarizeProblemStatuses(runs), [runs]);
}
