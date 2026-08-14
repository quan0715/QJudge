import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  DashboardTabBar,
  DashboardTabPanel,
  DashboardTabs,
  DashboardToolbar,
} from "./index";

function renderTabs(active: string, onChange = vi.fn()) {
  render(
    <DashboardTabs activeId={active} onChange={onChange}>
      <DashboardTabBar
        tabs={[
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ]}
        toolbar={
          <DashboardToolbar>
            <DashboardToolbar.Search
              value=""
              onChange={() => undefined}
              placeholder="search"
            />
          </DashboardToolbar>
        }
      />
      <DashboardTabPanel tabId="a">PANEL_A</DashboardTabPanel>
      <DashboardTabPanel tabId="b">PANEL_B</DashboardTabPanel>
    </DashboardTabs>,
  );
  return { onChange };
}

describe("Dashboard tabs", () => {
  it("hides inactive panel", () => {
    renderTabs("a");
    const panelA = screen.getByText("PANEL_A");
    const panelB = screen.getByText("PANEL_B");
    expect(panelA.closest('[role="tabpanel"]')).not.toHaveAttribute("hidden");
    expect(panelB.closest('[role="tabpanel"]')).toHaveAttribute("hidden");
  });

  it("renders toolbar slot", () => {
    renderTabs("a");
    expect(screen.getByPlaceholderText("search")).toBeInTheDocument();
  });

  it("fires onChange when clicking another tab", () => {
    const { onChange } = renderTabs("a");
    fireEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("switches active panel when active id changes", () => {
    renderTabs("b");
    const panelA = screen.getByText("PANEL_A");
    const panelB = screen.getByText("PANEL_B");
    expect(panelA.closest('[role="tabpanel"]')).toHaveAttribute("hidden");
    expect(panelB.closest('[role="tabpanel"]')).not.toHaveAttribute("hidden");
  });
});
