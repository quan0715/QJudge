import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ClassroomDetail } from "@/core/entities/classroom.entity";
import { ClassroomSettingsModal } from "./ClassroomSettingsModal";

vi.mock("@/shared/ui/modal", () => ({
  SettingsModal: ({ open, renderPanel }: { open: boolean; renderPanel: (id: string) => ReactNode }) => (
    <div data-testid="settings-modal" data-open={String(open)}>{renderPanel("members")}</div>
  ),
}));

vi.mock("./ClassroomSettingsGeneralPanel", () => ({ ClassroomSettingsGeneralPanel: () => null }));
vi.mock("./ClassroomSettingsMembersPanel", () => ({
  ClassroomSettingsMembersPanel: ({ onOpenAddMembers }: { onOpenAddMembers: () => void }) => (
    <button type="button" onClick={onOpenAddMembers}>新增成員</button>
  ),
}));
vi.mock("./AddMembersModal", () => ({
  AddMembersModal: ({ open }: { open: boolean }) => (
    <div data-testid="add-members-modal" data-open={String(open)} />
  ),
}));
vi.mock("@carbon/react", () => ({ Modal: () => null }));

const classroom = {
  id: "classroom-1",
  name: "測試教室",
  ownerUsername: "teacher",
  admins: [],
} as unknown as ClassroomDetail;

describe("ClassroomSettingsModal", () => {
  it("closes the settings focus trap while the add-members modal is open", () => {
    render(
      <ClassroomSettingsModal
        open
        onClose={vi.fn()}
        classroom={classroom}
        onRefresh={vi.fn()}
        onDeleteClassroom={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新增成員" }));

    expect(screen.getByTestId("settings-modal")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("add-members-modal")).toHaveAttribute("data-open", "true");
  });
});
