import type { User } from "@/core/entities/auth.entity";

const TEACHER_ACTIVATION_TOKEN_KEY = "qjudge.teacher_activation_token";

export const hasCompletedOnboarding = (user: User | null | undefined): boolean =>
  Boolean(user?.profile?.onboarding_completed_at);

export const getPendingTeacherActivationToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TEACHER_ACTIVATION_TOKEN_KEY);
};

export const storePendingTeacherActivationToken = (token: string): void => {
  if (typeof window === "undefined") return;
  const normalized = token.trim();
  if (!normalized) return;
  window.sessionStorage.setItem(TEACHER_ACTIVATION_TOKEN_KEY, normalized);
};

export const clearPendingTeacherActivationToken = (): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TEACHER_ACTIVATION_TOKEN_KEY);
};

export const getAuthedLandingPath = (user: User | null | undefined): string => {
  const pendingToken = getPendingTeacherActivationToken();
  if (pendingToken) {
    return `/teacher-activation?token=${encodeURIComponent(pendingToken)}`;
  }
  return hasCompletedOnboarding(user) ? "/dashboard" : "/onboarding";
};
