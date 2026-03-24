/**
 * Enter Exam Use Case
 *
 * Handles the business logic for entering/starting an exam:
 * 1. Exam mode: navigate to precheck first (startExam happens in precheck).
 * 2. Non-exam mode: call startExam API directly.
 * 3. Return result with navigation path.
 */

import { startExam } from "@/infrastructure/api/repositories";
export { requestFullscreen } from "@/core/usecases/exam/fullscreen.usecase";

// ============================================================================
// Types
// ============================================================================

export interface EnterExamInput {
  contestId: string;
  cheatDetectionEnabled: boolean;
  answeringEntryPath: string;
}

export interface EnterExamOutput {
  success: boolean;
  status: "started" | "resumed" | "error";
  navigateTo?: string;
  error?: string;
}

export async function enterExamUseCase(
  input: EnterExamInput
): Promise<EnterExamOutput> {
  const { contestId, cheatDetectionEnabled, answeringEntryPath } = input;

  // Exam mode must always go through precheck before anti-cheat activation.
  if (cheatDetectionEnabled) {
    return {
      success: true,
      status: "started",
      navigateTo: `/contests/${contestId}/exam-precheck`,
    };
  }

  try {
    const response = await startExam(contestId);

    if (
      response &&
      (response.status === "started" || response.status === "resumed")
    ) {
      return {
        success: true,
        status: response.status,
        navigateTo: answeringEntryPath,
      };
    }

    return {
      success: false,
      status: "error",
      error: response?.error || "Failed to start exam",
    };
  } catch (error: unknown) {
    let message = "Failed to start exam";
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "object" && error !== null) {
      const rec = error as Record<string, unknown>;
      const resp = rec.response as Record<string, unknown> | undefined;
      const data = resp?.data as Record<string, unknown> | undefined;
      if (typeof data?.error === "string") {
        message = data.error;
      } else if (typeof rec.message === "string") {
        message = rec.message;
      }
    }
    return {
      success: false,
      status: "error" as const,
      error: message,
    };
  }
}

export default enterExamUseCase;
