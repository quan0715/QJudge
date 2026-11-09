import type { ContestType } from "@/core/entities/contest.entity";

/** Keep retired page bookmarks on the current workbench without running any actions. */
export function resolveRetiredAdminQuery(
  params: URLSearchParams,
  contestType: ContestType,
): URLSearchParams | null {
  const panel = params.get("panel");
  if (panel !== "problem_editor" && panel !== "grading" && panel !== "ai-grading") return null;
  if (contestType === "coding" && panel !== "problem_editor") return null;
  const next = new URLSearchParams(params);
  next.set("panel", "grading-workbench");
  next.set("workbench_mode", panel === "problem_editor" ? "edit" : "grade");
  if (panel === "problem_editor") {
    next.delete("grading_question");
    next.delete("grading_student");
  } else if (panel === "ai-grading") {
    const question = next.get("ai_grading_question");
    if (question) next.set("grading_question", question);
    next.delete("ai_grading_question");
  } else if (next.get("grading_view") === "matrix") {
    next.set("panel", "overview");
    next.set("tab", "standings");
    next.delete("workbench_mode");
  }
  return next;
}
