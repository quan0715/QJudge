/**
 * Join Contest Use Case
 *
 * Handles registering for a contest:
 * 1. Validate password if required
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
  password?: string;
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
  password?: string
): { valid: boolean; error?: string } {
  const requiresPassword = contest.requiresPassword ?? contest.visibility === "private";
  // Check if contest requires password
  if (requiresPassword && !password) {
    return {
      valid: false,
      error: "This contest requires a password",
    };
  }

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
  const { contestId, password } = input;

  try {
    await registerContest(contestId, { password });

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
