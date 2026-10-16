import { describe, expect, it } from "vitest";

import type { ManagedUser } from "@/core/entities/auth.entity";
import { summarizeUsers } from "./userSummary";

const user = (overrides: Partial<ManagedUser>): ManagedUser => ({
  id: 1,
  username: "someone",
  email: "someone@example.test",
  role: "student",
  onboarding_completed_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

describe("summarizeUsers", () => {
  const admin = user({ id: 1, role: "admin" });
  const teacher = user({ id: 2, role: "teacher" });
  const pendingStudent = user({ id: 3, role: "student", onboarding_completed_at: null });

  it("summarizes users like the management screen", () => {
    expect(summarizeUsers([admin, teacher, pendingStudent])).toEqual({
      total: 3,
      teachers: 1,
      pendingOnboarding: 1,
    });
  });

  it("counts a user without an onboarding timestamp as pending, whatever the role", () => {
    const pendingAdmin = user({ id: 4, role: "admin", onboarding_completed_at: undefined });

    expect(summarizeUsers([pendingAdmin, pendingStudent]).pendingOnboarding).toBe(2);
  });

  it("returns zeros for no users", () => {
    expect(summarizeUsers([])).toEqual({ total: 0, teachers: 0, pendingOnboarding: 0 });
  });
});
