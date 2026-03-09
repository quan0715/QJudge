/**
 * Record Violation Use Case
 *
 * Handles recording exam violations:
 * 1. Send violation event to API with priority-based capture strategy
 * 2. Return updated violation state
 */
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import { recordExamEvent } from "@/infrastructure/api/repositories";
import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";

// ============================================================================
// Types
// ============================================================================

export type ViolationEventType =
  | "tab_hidden"
  | "window_blur"
  | "exit_fullscreen"
  | "forbidden_focus_event"
  | "forbidden_action"
  | "multiple_displays"
  | "warning_timeout"
  | "force_submit_locked";

export interface RecordViolationInput {
  contestId: string;
  eventType: ViolationEventType;
  reason?: string;
}

export interface RecordViolationOutput {
  success: boolean;
  violationCount: number;
  maxWarnings: number;
  autoUnlockAt?: string;
  isLocked: boolean;
  bypass: boolean;
  error?: string;
}

// ============================================================================
// Use Case Implementation
// ============================================================================

export async function recordViolationUseCase(
  input: RecordViolationInput
): Promise<RecordViolationOutput> {
  const { contestId, eventType, reason } = input;

  try {
    const priority = getEventPriority(eventType);

    let response;
    if (priority <= 1) {
      // P0 + P1: record with forced capture (cooldown handled in capture hook)
      response = await recordExamEventWithForcedCapture(
        contestId,
        eventType,
        {
          reason: reason || eventType,
          source: "recordViolation.usecase",
          forceCaptureReason: `${eventType}:${reason || eventType}`,
          captureOptions: { eventType },
        }
      );
    } else {
      // P2 + P3: record without forced capture
      response = await recordExamEvent(contestId, eventType, {
        reason: reason || eventType,
        source: "recordViolation.usecase",
      });
    }

    if (response && typeof response === "object") {
      const {
        violation_count = 0,
        max_cheat_warnings = 0,
        auto_unlock_at,
        bypass = false,
        locked = false,
      } = response;

      return {
        success: true,
        violationCount: violation_count,
        maxWarnings: max_cheat_warnings,
        autoUnlockAt: auto_unlock_at,
        isLocked: locked,
        bypass,
      };
    }

    return {
      success: true,
      violationCount: 0,
      maxWarnings: 0,
      isLocked: false,
      bypass: false,
    };
  } catch (error: any) {
    return {
      success: false,
      violationCount: 0,
      maxWarnings: 0,
      isLocked: false,
      bypass: false,
      error: error?.message || "Failed to record violation",
    };
  }
}

export default recordViolationUseCase;
