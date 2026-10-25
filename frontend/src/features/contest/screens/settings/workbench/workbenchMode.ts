import type { ContestDetail } from "@/core/entities/contest.entity";
export type WorkbenchMode = "edit" | "grade";
export function resolveWorkbenchMode(params: URLSearchParams, contest: Pick<ContestDetail, "status">): WorkbenchMode {
  if (params.has("grading_question") || params.has("grading_student")) return "grade";
  const requested = params.get("workbench_mode");
  return requested === "edit" || requested === "grade" ? requested : contest.status === "draft" ? "edit" : "grade";
}
export function canGrade(contest: Pick<ContestDetail, "status">): boolean { return contest.status !== "draft"; }
