import type { User } from "@/core/entities/auth.entity";

export const hasCompletedOnboarding = (user: User | null | undefined): boolean =>
  Boolean(user?.profile?.onboarding_completed_at);

export { getAuthedLandingPath } from "../pending-actions/landingPath";
