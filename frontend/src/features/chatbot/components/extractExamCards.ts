import type { ExamQuestionType } from "@/core/entities/contest.entity";
import type { AIExamQuestionCardProps } from "./AIExamQuestionCard";

/**
 * Extract card props from a qjudge_exam tool result.
 * Handles both single create (result has `id`) and batch_create (result has `created` array).
 */
export function extractExamCards(
  result: Record<string, unknown>,
  action?: string,
): AIExamQuestionCardProps[] {
  // Single create — result is the question object itself
  if (action === "create" && result.id && result.question_type) {
    return [mapOne(result)];
  }

  // batch_create — result has { created: [...] }
  if (action === "batch_create" && Array.isArray(result.created)) {
    return (result.created as Record<string, unknown>[])
      .filter((item) => item && typeof item === "object" && item.id)
      .map(mapOne);
  }

  // Fallback: if action is unknown but result looks like a single question
  if (result.id && result.question_type) {
    return [mapOne(result)];
  }

  return [];
}

function mapOne(item: Record<string, unknown>): AIExamQuestionCardProps {
  const options = Array.isArray(item.options) ? item.options : [];
  return {
    questionType: (item.question_type as ExamQuestionType) || "single_choice",
    prompt: typeof item.prompt === "string" ? item.prompt : "",
    score: typeof item.score === "number" ? item.score : undefined,
    optionCount: options.length > 0 ? options.length : undefined,
  };
}
