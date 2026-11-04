import type { ContestDetail } from "@/core/entities/contest.entity";

export const isContestInExamWindow = (
  contest: Pick<ContestDetail, "startTime" | "endTime"> | null | undefined,
  nowMs: number,
) => {
  const start = Date.parse(contest?.startTime ?? "");
  const end = Date.parse(contest?.endTime ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return nowMs >= start && nowMs <= end;
};
