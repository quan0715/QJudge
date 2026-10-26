import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistantNavButton } from "./AiAssistantNavButton";

const activity = vi.hoisted(() => ({ state: { status: "ready" } }));
vi.mock("@copilot", () => ({ useCopilotRun: () => activity }));
vi.mock("@/features/chatbot/contexts/CopilotDemandContext", () => ({ useRequestCopilot: vi.fn() }));

const workspace = vi.hoisted(() => ({
  right: { isAllowed: true, isDisabled: false, isOpen: false, toggle: vi.fn() },
}));

vi.mock("@/features/app/contexts/WorkspaceContext", () => ({
  useWorkspace: () => workspace,
}));

describe("AiAssistantNavButton", () => {
  beforeEach(() => {
    activity.state = { status: "ready" };
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

  it.each(["submitted", "streaming"])("indicates activity for the selected session when %s", (status) => {
    activity.state = { status };
    render(<AiAssistantNavButton />);

    const button = screen.getByRole("button", { name: "AI 助教 · 處理中" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(workspace.right.toggle).toHaveBeenCalledTimes(1);
  });

  it.each(["ready", "awaiting-approval", "awaiting-answer", "error"])("shows the idle icon when %s", (status) => {
    activity.state = { status };
    render(<AiAssistantNavButton />);

    expect(screen.getByRole("button", { name: "AI 助教" })).toHaveAttribute("aria-busy", "false");
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
