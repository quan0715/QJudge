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
  nickname?: string;
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
  // Check if contest requires password
  if (contest.visibility === "private" && !password) {
    return {
      valid: false,
      error: "This contest requires a password",
    };
  }

  // Check if already registered
  if (contest.isRegistered) {
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
  const { contestId, password, nickname } = input;

  try {
    await registerContest(contestId, { password, nickname });

    return {
      success: true,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to join contest",
    };
  }
}

export default joinContestUseCase;
