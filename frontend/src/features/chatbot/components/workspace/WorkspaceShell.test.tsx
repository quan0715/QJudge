import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";
vi.mock("@/features/app/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ isMobile: false, left: { isOpen: false, close: vi.fn(), toggle: vi.fn() }, right: { isOpen: true, close: vi.fn() } }) }));
vi.mock("@/features/app/components/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/features/app/components/workspace/WorkspaceTopNav", () => ({ WorkspaceTopNav: () => null }));
vi.mock("../chat-ui/QJudgeChatPanel", () => ({ QJudgeChatPanel: () => <div>Chat</div> }));
describe("WorkspaceShell resizing", () => {
  it("supports keyboard limits and click resizing, and persists the width", () => {
    render(<MemoryRouter><WorkspaceShell>Content</WorkspaceShell></MemoryRouter>);
    const handle = screen.getByRole("separator", {name: "調整面板寬度"});
    handle.focus();
    fireEvent.keyDown(handle, {key: "ArrowLeft"});
    expect(handle).toHaveAttribute("aria-valuenow", "416");
    fireEvent.keyDown(handle, {key: "Home"});
    expect(handle).toHaveAttribute("aria-valuenow", "320");
    fireEvent.keyDown(handle, {key: "ArrowRight"});
    expect(handle).toHaveAttribute("aria-valuenow", "320");
    fireEvent.keyDown(handle, {key: "End"});
    expect(handle).toHaveAttribute("aria-valuenow", "700");
    fireEvent.click(screen.getByRole("button", {name: "縮小聊天面板"}));
    expect(handle).toHaveAttribute("aria-valuenow", "684");
    expect(localStorage.setItem).toHaveBeenLastCalledWith("workspace_panel_width", "684");
  });
  it("keeps pointer resizing bounded and cleans up document drag styles", () => {
    const {unmount} = render(<MemoryRouter><WorkspaceShell>Content</WorkspaceShell></MemoryRouter>);
    const handle = screen.getByRole("separator", {name: "調整面板寬度"});
    vi.spyOn(handle.parentElement!.parentElement!, "getBoundingClientRect").mockReturnValue({right: 1000} as DOMRect);
    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(document, {clientX: 500});
    expect(handle).toHaveAttribute("aria-valuenow", "500");
    fireEvent.mouseMove(document, {clientX: 0});
    expect(handle).toHaveAttribute("aria-valuenow", "700");
    unmount();
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

});
