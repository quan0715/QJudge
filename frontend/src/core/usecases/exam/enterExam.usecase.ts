/**
 * Enter Exam Use Case
 *
 * Handles the business logic for entering/starting an exam:
 * 1. Exam mode: navigate to precheck first (startExam happens in precheck).
 * 2. Non-exam mode: call startExam API directly.
 * 3. Return result with navigation path.
 */

import { startExam } from "@/infrastructure/api/repositories";

// ============================================================================
// Types
// ============================================================================

export interface EnterExamInput {
  contestId: string;
  cheatDetectionEnabled: boolean;
}

export interface EnterExamOutput {
  success: boolean;
  status: "started" | "resumed" | "error";
  navigateTo?: string;
  error?: string;
}

// ============================================================================
// Fullscreen Utilities
// ============================================================================

export const requestFullscreen = async (): Promise<boolean> => {
  try {
    const elem = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
      msRequestFullscreen?: () => Promise<void>;
    };

    if (elem.requestFullscreen) {
      await elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      await elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      await elem.msRequestFullscreen();
    }
    return true;
  } catch {
    return false;
  }
};

// ============================================================================
// Use Case Implementation
// ============================================================================

export async function enterExamUseCase(
  input: EnterExamInput
): Promise<EnterExamOutput> {
  const { contestId, cheatDetectionEnabled } = input;

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
        navigateTo: `/contests/${contestId}/problems`,
      };
    }

    return {
      success: false,
      status: "error",
      error: (response as any)?.error || "Failed to start exam",
    };
  } catch (error: any) {
    return {
      success: false,
      status: "error",
      error:
        error?.response?.data?.error || error?.message || "Failed to start exam",
    };
  }
}

export default enterExamUseCase;
