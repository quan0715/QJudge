import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionBadges } from "../chat-ui/SessionBadges";
import { WorkspaceShell } from "./WorkspaceShell";
const mobile = vi.hoisted(() => ({ enabled: false, close: vi.fn() }));
beforeEach(() => { mobile.enabled = false; mobile.close.mockClear(); });
vi.mock("@/features/app/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ isMobile: mobile.enabled, left: { isOpen: false, close: vi.fn(), toggle: vi.fn() }, right: { isOpen: true, close: mobile.close } }) }));
vi.mock("@/features/app/components/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/features/app/components/workspace/WorkspaceTopNav", () => ({ WorkspaceTopNav: () => null }));
vi.mock("../chat-ui/QJudgeChatPanel", () => ({ QJudgeChatPanel: () => <SessionBadges messages={[{id:"todo",role:"assistant",createdAt:new Date(),parts:[{type:"data-todo-items",data:[{id:"one",label:"檢查題目",status:"pending"}]}]}]} /> }));
describe("WorkspaceShell resizing", () => {
  it("supports keyboard limits, and persists the width", () => {
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
    expect(screen.queryByRole("button", {name: /縮小聊天面板|放大聊天面板/})).not.toBeInTheDocument();
    fireEvent.keyDown(handle, {key: "ArrowRight"});
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


describe("Mobile chat Escape handling", () => {
  it("dismisses the inner list before allowing Escape to close the sheet", () => {
    mobile.enabled = true;
    render(<MemoryRouter><WorkspaceShell omitAppSidebar>Content</WorkspaceShell></MemoryRouter>);
    const trigger = screen.getByRole("button", {name:/任務列表/});
    fireEvent.click(trigger);
    fireEvent.keyDown(document, {key:"Escape"});
    expect(screen.queryByRole("region", {name:/任務列表/})).not.toBeInTheDocument();
    expect(mobile.close).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(document, {key:"Escape"});
    expect(mobile.close).toHaveBeenCalledOnce();
  });
});
