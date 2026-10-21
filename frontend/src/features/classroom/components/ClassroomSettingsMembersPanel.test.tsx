import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ClassroomDetail, ClassroomScopeRole } from "@/core/entities/classroom.entity";
import { ClassroomSettingsMembersPanel } from "./ClassroomSettingsMembersPanel";

vi.mock("@/infrastructure/api/repositories/classroom.repository");
vi.mock("@/shared/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("./InviteCodeDisplay", () => ({ InviteCodeDisplay: () => null }));

const classroomFor = (currentUserRole: ClassroomScopeRole) =>
  ({
    id: "classroom-1",
    ownerUsername: "teacher",
    currentUserRole,
    inviteCode: "CODE1234",
    inviteCodeEnabled: true,
    members: [
      { userId: 2, username: "ta-two", email: "ta@example.com", role: "ta", joinedAt: "" },
      { userId: 3, username: "student-three", email: "s@example.com", role: "student", joinedAt: "" },
    ],
  }) as unknown as ClassroomDetail;

const renderPanel = (role: ClassroomScopeRole) =>
  render(
    <ClassroomSettingsMembersPanel classroom={classroomFor(role)} onRefresh={vi.fn()} onOpenAddMembers={vi.fn()} />,
  );

// Renders the full Carbon DataTable and modals, which is slow under CI coverage.
describe("ClassroomSettingsMembersPanel", { timeout: 20_000 }, () => {
  it("lets a TA remove students but not change roles or touch other TAs", () => {
    renderPanel("manager");

    const editButtons = screen.getAllByRole("button", { name: "edit" });
    expect(editButtons).toHaveLength(1);

    fireEvent.click(editButtons[0]);

    expect(document.getElementById("edit-member-role")).toBeNull();
    expect(screen.getAllByRole("button", { name: "removeMember" }).length).toBeGreaterThan(0);
  });

  it("lets the classroom owner change roles of every member", () => {
    renderPanel("owner");

    const editButtons = screen.getAllByRole("button", { name: "edit" });
    expect(editButtons).toHaveLength(2);

    fireEvent.click(editButtons[0]);

    expect(document.getElementById("edit-member-role")).not.toBeNull();
  });
});
