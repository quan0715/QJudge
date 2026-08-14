/**
 * Join Contest Use Case
 *
 * Handles registering for a contest:
 * 1. Validate registration state
 * 2. Call registerContest API
 * 3. Return success/error
 */

import type { ContestDetail } from "@/core/entities/contest.entity";
import type { IContestRepository } from "@/core/ports/contest.repository";

// ============================================================================
// Types
// ============================================================================

export interface JoinContestInput {
  contestId: string;
}

export interface JoinContestOutput {
  success: boolean;
  error?: string;
}

export type JoinContestDependencies = Pick<IContestRepository, "registerContest">;

// ============================================================================
// Validation
// ============================================================================

export function validateJoinContest(
  contest: ContestDetail,
): { valid: boolean; error?: string } {
  // Check if already registered
  if (contest.hasJoined) {
    return {
      valid: false,
      error: "Already registered for this contest",
    };
  }

  return { valid: true };
}

// ============================================================================
// Use Case Implementation
// ============================================================================

export async function joinContestUseCase(
  input: JoinContestInput,
  dependencies: JoinContestDependencies,
): Promise<JoinContestOutput> {
  const { contestId } = input;

  try {
    await dependencies.registerContest(contestId);

    return {
      success: true,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to join contest",
    };
  }
}
