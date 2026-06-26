import type {
  ExamPaperSection,
  ExamQuestionGroup,
} from "@/core/entities/contest.entity";
import type { ExamViewMode } from "../../types/exam.types";

export interface ExamQuestionPresentation {
  group?: ExamQuestionGroup;
  showGroupStem: boolean;
}

export function buildQuestionPresentationById(
  sections: ExamPaperSection[],
  mode: ExamViewMode,
): Map<string, ExamQuestionPresentation> {
  const presentationById = new Map<string, ExamQuestionPresentation>();

  for (const section of sections) {
    if (section.kind === "flat") {
      presentationById.set(section.item.id, {
        group: undefined,
        showGroupStem: false,
      });
      continue;
    }

    section.items.forEach((question, index) => {
      presentationById.set(question.id, {
        group: section.group,
        showGroupStem: mode === "single" || index === 0,
      });
    });
  }

  return presentationById;
}
