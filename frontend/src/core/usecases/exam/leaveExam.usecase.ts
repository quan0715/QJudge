/**
 * Leave Exam Use Case
 *
 * Handles the business logic for leaving/ending an exam:
 * 1. End exam if still in progress
 * 2. Exit fullscreen
 * 3. Return navigation path
 */

import type { IExamSessionRepository } from "@/core/ports/examSession.repository";

// ============================================================================
// Types
// ============================================================================

export interface LeaveExamInput {
  contestId: string;
  shouldEndExam: boolean;
  uploadSessionId?: string;
  sourceModule?: "screen_share" | "webcam";
  navigateTo?: string;
}

export interface LeaveExamOutput {
  success: boolean;
  navigateTo: string;
  error?: string;
}

export interface LeaveExamDependencies
  extends Pick<IExamSessionRepository, "endExam"> {
  exitFullscreen(): Promise<boolean>;
}

export async function leaveExamUseCase(
  input: LeaveExamInput,
  dependencies: LeaveExamDependencies,
): Promise<LeaveExamOutput> {
  const {
    contestId,
    shouldEndExam,
    uploadSessionId,
    sourceModule,
    navigateTo = "/dashboard",
  } = input;

  try {
    // End exam if needed
    if (shouldEndExam) {
      const payload: { upload_session_id?: string; source_module?: "screen_share" | "webcam" } = {};
      if (uploadSessionId) payload.upload_session_id = uploadSessionId;
      if (sourceModule) payload.source_module = sourceModule;
      await dependencies.endExam(
        contestId,
        Object.keys(payload).length > 0 ? payload : undefined,
      );
    }

    // Exit fullscreen
    await dependencies.exitFullscreen();

    return {
      success: true,
      navigateTo,
    };
  } catch (error: unknown) {
    // Still navigate even if there's an error
    await dependencies.exitFullscreen();

    return {
      success: false,
      navigateTo,
      error: error instanceof Error ? error.message : "Failed to end exam",
    };
  }
}
