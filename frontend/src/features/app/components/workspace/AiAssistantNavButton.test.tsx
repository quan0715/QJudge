import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistantNavButton } from "./AiAssistantNavButton";

const workspace = vi.hoisted(() => ({
  right: { isAllowed: true, isDisabled: false, isOpen: false, toggle: vi.fn() },
}));

vi.mock("@/features/app/contexts/WorkspaceContext", () => ({
  useWorkspace: () => workspace,
}));

describe("AiAssistantNavButton", () => {
  beforeEach(() => {
    workspace.right = {
      isAllowed: true,
      isDisabled: false,
      isOpen: false,
      toggle: vi.fn(),
    };
  });

  it("toggles the AI panel", () => {
    render(<AiAssistantNavButton />);

    const button = screen.getByRole("button", { name: "AI 助教" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(workspace.right.toggle).toHaveBeenCalledTimes(1);
  });

  it("shows the pressed state while the panel is open", () => {
    workspace.right.isOpen = true;
    render(<AiAssistantNavButton />);

    expect(screen.getByRole("button", { name: "AI 助教" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it.each([
    ["not allowed for this role", { isAllowed: false }],
    ["disabled on this page", { isDisabled: true }],
  ])("is hidden when %s", (_case, override) => {
    Object.assign(workspace.right, override);
    render(<AiAssistantNavButton />);

    expect(screen.queryByRole("button", { name: "AI 助教" })).not.toBeInTheDocument();
  });
});
