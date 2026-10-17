import type { ManagedUser } from "@/core/entities/auth.entity";

export interface UserSummary {
  total: number;
  teachers: number;
  pendingOnboarding: number;
}

export const summarizeUsers = (users: ManagedUser[]): UserSummary => ({
  total: users.length,
  teachers: users.filter((user) => user.role === "teacher").length,
  pendingOnboarding: users.filter((user) => !user.onboarding_completed_at).length,
});
