import type {
  ExamQuestionType,
  OpenAnswerDocument,
} from "@/core/entities/contest.entity";
import type { ExistingGradesAction } from "@/infrastructure/api/repositories/examQuestions.repository";

export type { ExistingGradesAction };

export interface LockedQuestionComparableState {
  questionType: ExamQuestionType;
  score: string;
  singleAnswerIndex: string;
  multiAnswerIndexes: string[];
  essayReferenceAnswer: string;
  shortAnswer: string;
  referenceAnswerDocument: OpenAnswerDocument | null;
  explanation: string;
  explanationDocument: OpenAnswerDocument | null;
}

export type LockedSaveImpact =
  | { kind: "objective-regrade"; affectedCount: number }
  | { kind: "subjective-review"; affectedCount: number }
  | { kind: "display-only"; affectedCount: 0 }
  | { kind: "no-op"; affectedCount: 0 };

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const classifyLockedQuestionSave = (
  before: LockedQuestionComparableState,
  after: LockedQuestionComparableState,
  gradedAnswerCount: number,
): LockedSaveImpact => {
  const scoreChanged = before.score !== after.score;
  const explanationChanged =
    before.explanation !== after.explanation ||
    !same(before.explanationDocument, after.explanationDocument);
  const answerChanged =
    before.singleAnswerIndex !== after.singleAnswerIndex ||
    !same(before.multiAnswerIndexes, after.multiAnswerIndexes) ||
    before.essayReferenceAnswer !== after.essayReferenceAnswer ||
    before.shortAnswer !== after.shortAnswer ||
    !same(before.referenceAnswerDocument, after.referenceAnswerDocument);

  if (!scoreChanged && !answerChanged && !explanationChanged) {
    return { kind: "no-op", affectedCount: 0 };
  }

  const objective = ["true_false", "single_choice", "multiple_choice"].includes(
    after.questionType,
  );
  if (objective && (scoreChanged || answerChanged)) {
    return { kind: "objective-regrade", affectedCount: gradedAnswerCount };
  }
  if (!objective && (scoreChanged || answerChanged)) {
    return { kind: "subjective-review", affectedCount: gradedAnswerCount };
  }
  return { kind: "display-only", affectedCount: 0 };
};
