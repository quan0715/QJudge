/**
 * Leave Exam Use Case
 *
 * Handles the business logic for leaving/ending an exam:
 * 1. End exam if still in progress
 * 2. Exit fullscreen
 * 3. Return navigation path
 */

import { endExam } from "@/infrastructure/api/repositories";
import { exitFullscreen } from "@/core/usecases/exam/fullscreen.usecase";
import { getExamCaptureSessionId } from "@/features/contest/screens/paperExam/hooks/examCaptureSession";
export { exitFullscreen } from "@/core/usecases/exam/fullscreen.usecase";

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

export async function leaveExamUseCase(
  input: LeaveExamInput
): Promise<LeaveExamOutput> {
  const { contestId, shouldEndExam } = input;

  try {
    // End exam if needed
    if (shouldEndExam) {
      await endExam(contestId, {
        upload_session_id: getExamCaptureSessionId(contestId) || undefined,
      });
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
