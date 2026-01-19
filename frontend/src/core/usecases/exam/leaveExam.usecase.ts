/**
 * Leave Exam Use Case
 *
 * Handles the business logic for leaving/ending an exam:
 * 1. End exam if still in progress
 * 2. Exit fullscreen
 * 3. Return navigation path
 */

import { endExam } from "@/infrastructure/api/repositories";

// ============================================================================
// Types
// ============================================================================

export interface LeaveExamInput {
  contestId: string;
  shouldEndExam: boolean;
}

export interface LeaveExamOutput {
  success: boolean;
  navigateTo: string;
  error?: string;
}

// ============================================================================
// Fullscreen Utilities
// ============================================================================

export const exitFullscreen = async (): Promise<boolean> => {
  try {
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      msExitFullscreen?: () => Promise<void>;
    };

    if (document.fullscreenElement) {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }
    }
    return true;
  } catch {
    return false;
  }
};

// ============================================================================
// Use Case Implementation
// ============================================================================

export async function leaveExamUseCase(
  input: LeaveExamInput
): Promise<LeaveExamOutput> {
  const { contestId, shouldEndExam } = input;

  try {
    // End exam if needed
    if (shouldEndExam) {
      await endExam(contestId);
    }

    // Exit fullscreen
    await exitFullscreen();

    return {
      success: true,
      navigateTo: "/contests",
    };
  } catch (error: any) {
    // Still navigate even if there's an error
    await exitFullscreen();

    return {
      success: false,
      navigateTo: "/contests",
      error: error?.message || "Failed to end exam",
    };
  }
}

export default leaveExamUseCase;
