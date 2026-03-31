import type { User } from "@/core/entities/auth.entity";
import { hasCompletedOnboarding } from "../utils/onboarding";
import { PENDING_ACTIONS } from "./registry";
import { getPendingAction, storePendingAction } from "./storage";

/**
 * Determine the landing path after authentication.
 *
 * Resolution order:
 * 1. Pending actions with priority < 0 (before onboarding gate)
 * 2. Onboarding gate
 * 3. Pending actions with priority >= 0 (after onboarding gate)
 * 4. /dashboard (fallback)
 *
 * @param explicitTeacherToken - backwards-compatible: if passed, stored and
 *   treated as the teacher_activation pending action immediately.
 */
export const getAuthedLandingPath = (
  user: User | null | undefined,
  explicitTeacherToken?: string | null,
): string => {
  // Backwards compat: explicit teacher token takes immediate priority
  if (explicitTeacherToken?.trim()) {
    const ta = PENDING_ACTIONS.find((a) => a.key === "teacher_activation");
    if (ta) {
      storePendingAction(ta.storageKey, explicitTeacherToken.trim());
      return ta.getRedirectPath(explicitTeacherToken.trim());
    }
  }

  const sorted = [...PENDING_ACTIONS].sort((a, b) => a.priority - b.priority);

  // Phase 1: actions before onboarding gate (priority < 0)
  for (const action of sorted) {
    if (action.priority >= 0) break;
    const value = getPendingAction(action.storageKey);
    if (value) return action.getRedirectPath(value);
  }

  // Phase 2: onboarding gate
  if (!hasCompletedOnboarding(user)) {
    return "/onboarding";
  }

  // Phase 3: actions after onboarding gate (priority >= 0)
  for (const action of sorted) {
    if (action.priority < 0) continue;
    const value = getPendingAction(action.storageKey);
    if (value) return action.getRedirectPath(value);
  }

  return "/dashboard";
};
