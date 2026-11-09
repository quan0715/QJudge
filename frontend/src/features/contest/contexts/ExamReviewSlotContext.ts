import { createContext, useContext } from "react";

/**
 * Lets the formal overview render its answer records inside the workspace's
 * review page while keeping record state (grades, appeals) in the overview.
 */
export interface ExamReviewSlot {
  /** Element on the review page to portal records into; null while that page is closed. */
  target: HTMLElement | null;
  /** Report download action, aligned with the review title. */
  actionsTarget: HTMLElement | null;
  setHasRecords: (hasRecords: boolean) => void;
  /** Opens the review page, where each question's answer, grade and appeals live. */
  openReview: () => void;
}

export const ExamReviewSlotContext = createContext<ExamReviewSlot | null>(null);

export function useExamReviewSlot() {
  return useContext(ExamReviewSlotContext);
}
