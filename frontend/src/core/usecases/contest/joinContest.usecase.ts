/**
 * Join Contest Use Case
 *
 * Handles registering for a contest:
 * 1. Validate registration state
 * 2. Call registerContest API
 * 3. Return success/error
 */

import { registerContest } from "@/infrastructure/api/repositories";
import type { ContestDetail } from "@/core/entities/contest.entity";

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
  input: JoinContestInput
): Promise<JoinContestOutput> {
  const { contestId } = input;

  try {
    await registerContest(contestId);

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

export default joinContestUseCase;
