import type { PageContextSegment } from "@/core/types/chatbot.types";
import type {
  ContestProblemSummary,
  ExamPaperBlock,
} from "@/core/entities/contest.entity";

export function codingProblemPageContext(
  problem: ContestProblemSummary,
): PageContextSegment {
  return {
    type: "problem",
    label: `${problem.label}. ${problem.title}`,
    ids: { binding_id: problem.id, problem_id: problem.problemId },
  };
}

export function examBlockPageContext(
  block: ExamPaperBlock,
  index: number,
  groupFallback: string,
): PageContextSegment {
  const number = index + 1;
  if (block.kind === "group") {
    return {
      type: "problem",
      label: `${number}. ${block.group.title || groupFallback}`,
      ids: { group_id: block.group.id },
    };
  }
  const prompt = block.question.prompt.replace(/[#*_`>\n]/g, "").trim().slice(0, 40);
  return {
    type: "problem",
    label: `${number}. ${prompt || `Question ${number}`}`,
    ids: { question_id: block.question.id },
  };
}
