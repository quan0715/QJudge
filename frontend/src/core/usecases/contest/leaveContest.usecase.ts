/**
 * Leave Contest Use Case
 *
 * Handles leaving/unregistering from a contest.
 */

import { leaveContest } from "@/infrastructure/api/repositories";

// ============================================================================
// Types
// ============================================================================

export interface LeaveContestInput {
  contestId: string;
}

export interface LeaveContestOutput {
  success: boolean;
  error?: string;
}

// ============================================================================
// Use Case Implementation
// ============================================================================

export async function leaveContestUseCase(
  input: LeaveContestInput
): Promise<LeaveContestOutput> {
  const { contestId } = input;

  try {
    await leaveContest(contestId);

    return {
      success: true,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to leave contest",
    };
  }
}

export default leaveContestUseCase;
